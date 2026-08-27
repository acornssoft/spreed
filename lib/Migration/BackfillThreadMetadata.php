<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Migration;

use OCA\Talk\Chat\ChatManager;
use OCA\Talk\Model\Message;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IAppConfig;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * acorns: スレッド所属の権威を metadata に移したことに伴うバックフィル。2 段構成。
 *
 * ## 第 1 段: 既存スレッドの member(一度だけ)
 *
 * thread_id metadata の書き込みは v24.0.0 で入ったが、スレッド機能自体は
 * v22.0.0 からある。さらに v24 の時点でも addSystemMessage()(ファイル共有等)は
 * metadata を書かない。したがって既存のスレッド member には metadata が無いものが
 * 混ざっており、権威を metadata に移すとスレッドビューから消える。
 *
 * talk_threads の各行について topmost_parent_id = thread.id の oc_comments 行に
 * thread_id を JSON マージする。
 *
 * **この段は一度しか走らせてはいけない。** フォーク稼働後に書かれた
 * チャンネル残留の引用返信(threadId=-2)は「topmost がスレッド起点で metadata 無し」で、
 * 移行前のスレッド返信と DB 上は区別できない。再実行するとそれらがスレッドに畳まれる。
 * 完了は app config `thread_metadata_backfill_done` で記録し、以後は飛ばす。
 * 既にこの段を実行済みの環境(本番)では、repair を回す前に手動で
 * `occ config:app:set spreed thread_metadata_backfill_done --value=1 --type=boolean` を入れること
 * (`--type` を省くと string で保存され、getValueBool() が型不一致で例外を投げる)。
 *
 * ## 第 2 段: リアクションの継承(毎回・冪等)
 *
 * ReactionManager が metadata を継承するようになる前に付いたリアクションは
 * thread_id を持たない。親が thread_id を持つのに自分が持たないリアクション行へ
 * 親の値をコピーする。判定は親の metadata なので引用返信のリアクションは触らない。
 */
class BackfillThreadMetadata implements IRepairStep {
	public const CONFIG_LEGACY_DONE = 'thread_metadata_backfill_done';

	public function __construct(
		protected IDBConnection $connection,
		protected IAppConfig $appConfig,
	) {
	}

	#[\Override]
	public function getName(): string {
		return 'Backfill thread_id metadata for messages in existing threads (acorns)';
	}

	#[\Override]
	public function run(IOutput $output): void {
		if ($this->appConfig->getValueBool('spreed', self::CONFIG_LEGACY_DONE)) {
			$output->info('acorns: 既存スレッド member のバックフィルは実行済みのため飛ばします');
		} else {
			$this->backfillThreadMembers($output);
			$this->appConfig->setValueBool('spreed', self::CONFIG_LEGACY_DONE, true);
		}

		$this->backfillReactions($output);
	}

	/**
	 * 第 1 段: talk_threads にあるスレッドの member へ thread_id を付ける
	 */
	protected function backfillThreadMembers(IOutput $output): void {
		$threads = $this->connection->getQueryBuilder();
		$threads->select('id', 'room_id')->from('talk_threads');
		$result = $threads->executeQuery();

		$threadCount = 0;
		$updated = 0;

		while ($thread = $result->fetch()) {
			$threadCount++;
			$threadId = (int)$thread['id'];

			// このスレッドに属し得るコメント(起点自身 + topmost が起点のもの)
			$select = $this->connection->getQueryBuilder();
			$select->select('id', 'meta_data')
				->from('comments')
				->where($select->expr()->orX(
					$select->expr()->eq('id', $select->createNamedParameter((string)$threadId)),
					$select->expr()->eq('topmost_parent_id', $select->createNamedParameter((string)$threadId)),
				));
			$comments = $select->executeQuery();

			while ($comment = $comments->fetch()) {
				if ($this->writeThreadId((string)$comment['id'], (string)$comment['meta_data'], $threadId)) {
					$updated++;
				}
			}
			$comments->closeCursor();
		}
		$result->closeCursor();

		$output->info(sprintf(
			'acorns: %d スレッドを走査し、%d 件のメッセージに thread_id metadata を書き込みました',
			$threadCount, $updated
		));
	}

	/**
	 * 第 2 段: 親が thread_id を持つリアクションへ親の値をコピーする
	 */
	protected function backfillReactions(IOutput $output): void {
		$select = $this->connection->getQueryBuilder();
		$select->select('c.id', 'c.meta_data', 'p.meta_data AS parent_meta_data')
			->from('comments', 'c')
			->innerJoin('c', 'comments', 'p', $select->expr()->eq('p.id', 'c.parent_id'))
			->where($select->expr()->in('c.verb', $select->createNamedParameter(
				[ChatManager::VERB_REACTION, ChatManager::VERB_REACTION_DELETED],
				IQueryBuilder::PARAM_STR_ARRAY
			)))
			->andWhere($select->expr()->neq('c.parent_id', $select->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
			->andWhere($select->expr()->like('p.meta_data', $select->createNamedParameter('%"' . Message::METADATA_THREAD_ID . '"%')));
		$comments = $select->executeQuery();

		$scanned = 0;
		$updated = 0;
		while ($comment = $comments->fetch()) {
			$scanned++;
			$parentMetaData = json_decode((string)$comment['parent_meta_data'], true);
			if (!is_array($parentMetaData) || !isset($parentMetaData[Message::METADATA_THREAD_ID])) {
				continue;
			}
			$threadId = (int)$parentMetaData[Message::METADATA_THREAD_ID];
			if ($this->writeThreadId((string)$comment['id'], (string)$comment['meta_data'], $threadId)) {
				$updated++;
			}
		}
		$comments->closeCursor();

		$output->info(sprintf(
			'acorns: スレッド内メッセージへのリアクション %d 件を走査し、%d 件に thread_id metadata を継承しました',
			$scanned, $updated
		));
	}

	/**
	 * thread_id が未設定なら JSON マージして保存する。書き込んだら true
	 */
	protected function writeThreadId(string $commentId, string $rawMetaData, int $threadId): bool {
		$metaData = json_decode($rawMetaData, true);
		if (!is_array($metaData)) {
			$metaData = [];
		}
		if (isset($metaData[Message::METADATA_THREAD_ID])) {
			return false;  // 既に入っている
		}
		$metaData[Message::METADATA_THREAD_ID] = $threadId;

		$update = $this->connection->getQueryBuilder();
		$update->update('comments')
			->set('meta_data', $update->createNamedParameter(json_encode($metaData)))
			->where($update->expr()->eq('id', $update->createNamedParameter($commentId)));
		$update->executeStatement();
		return true;
	}
}
