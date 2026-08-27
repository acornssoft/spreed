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
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * acorns: スレッド所属の権威を metadata に移したことに伴うバックフィル(冪等)。
 *
 * ReactionManager が metadata を継承するようになる前(fef9f87c3a より前)に付いた
 * リアクションは thread_id を持たない。親が thread_id を持つのに自分が持たない
 * リアクション行へ親の値をコピーする。判定は親の metadata なので、
 * チャンネルに残した引用返信(threadId=-2)へのリアクションは触らない。
 *
 * ## 削除した第 1 段について
 *
 * 以前はここに「talk_threads の各スレッドについて topmost_parent_id = thread.id の
 * コメントへ thread_id を付ける」段があった(upstream 時代のスレッドデータを
 * フォークへ初めて載せるときに一度だけ必要)。本番・ローカルとも 2026-08-27 に
 * 実行済みで、**再実行するとフォーク稼働後の引用返信がスレッドに畳まれる**
 * (topmost がスレッド起点で metadata 無し、という点で移行前の返信と区別できない)。
 * 事故の芽なので削除した。upstream のデータを新しく取り込む必要が出たら
 * `fef9f87c3a` の backfillThreadMembers() を一度だけ手で流すこと。
 */
class BackfillThreadMetadata implements IRepairStep {
	public function __construct(
		protected IDBConnection $connection,
	) {
	}

	#[\Override]
	public function getName(): string {
		return 'Inherit thread_id metadata to reactions on thread messages (acorns)';
	}

	#[\Override]
	public function run(IOutput $output): void {
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
