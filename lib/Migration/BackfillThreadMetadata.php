<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Migration;

use OCA\Talk\Model\Message;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * acorns: スレッド所属の権威を metadata に移したことに伴うバックフィル。
 *
 * thread_id metadata の書き込みは v24.0.0 で入ったが、スレッド機能自体は
 * v22.0.0 からある。さらに v24 の時点でも addSystemMessage()(ファイル共有等)は
 * metadata を書かない。したがって既存のスレッド member には metadata が無いものが
 * 混ざっており、権威を metadata に移すとスレッドビューから消える。
 *
 * talk_threads の各行について topmost_parent_id = thread.id の oc_comments 行に
 * thread_id を JSON マージする。
 *
 * 対象は「既に talk_threads に行があるスレッドの member」だけなので、
 * チャンネルに見えている引用返信(talk_threads に行が無い)は触らない。
 */
class BackfillThreadMetadata implements IRepairStep {
	public function __construct(
		protected IDBConnection $connection,
	) {
	}

	#[\Override]
	public function getName(): string {
		return 'Backfill thread_id metadata for messages in existing threads (acorns)';
	}

	#[\Override]
	public function run(IOutput $output): void {
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
				$metaData = json_decode((string)$comment['meta_data'], true);
				if (!is_array($metaData)) {
					$metaData = [];
				}
				if (isset($metaData[Message::METADATA_THREAD_ID])) {
					continue;  // 既に入っている
				}
				$metaData[Message::METADATA_THREAD_ID] = $threadId;

				$update = $this->connection->getQueryBuilder();
				$update->update('comments')
					->set('meta_data', $update->createNamedParameter(json_encode($metaData)))
					->where($update->expr()->eq('id', $update->createNamedParameter($comment['id'])));
				$update->executeStatement();
				$updated++;
			}
			$comments->closeCursor();
		}
		$result->closeCursor();

		$output->info(sprintf(
			'acorns: %d スレッドを走査し、%d 件のメッセージに thread_id metadata を書き込みました',
			$threadCount, $updated
		));
	}
}
