<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\Types;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;
use Override;

/**
 * acorns: スレッド単位の既読位置。
 *
 * upstream は同名の列を Version22000Date20250623142327 で作り、
 * Version22000Date20250710124258 で「現時点では維持できない」として落としている。
 * 再導入されたときに衝突しないよう hasColumn で守る。
 *
 * <version> を凍結しているので自動では走らない。デプロイ手順で
 * `occ migrations:migrate spreed` を明示的に実行する。
 */
class Version24000Date20260827120000 extends SimpleMigrationStep {
	public function __construct(
		protected IDBConnection $connection,
	) {
	}

	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	#[Override]
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		$table = $schema->getTable('talk_thread_attendees');
		if (!$table->hasColumn('last_read_message')) {
			$table->addColumn('last_read_message', Types::BIGINT, [
				'notnull' => true,
				'default' => 0,
				'unsigned' => true,
			]);
			return $schema;
		}

		return null;
	}

	/**
	 * 既存行は「自分の返信までは読んでいる」前提で thread.last_message_id を入れる。
	 * 0(全部未読)に倒すとデプロイ直後にスレッド一覧が未読で埋まる。
	 *
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	#[Override]
	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
		$select = $this->connection->getQueryBuilder();
		$select->select('id', 'last_message_id')->from('talk_threads');
		$result = $select->executeQuery();

		$updated = 0;
		while ($thread = $result->fetch()) {
			$update = $this->connection->getQueryBuilder();
			$update->update('talk_thread_attendees')
				->set('last_read_message', $update->createNamedParameter((int)$thread['last_message_id'], IQueryBuilder::PARAM_INT))
				->where($update->expr()->eq('thread_id', $update->createNamedParameter((int)$thread['id'], IQueryBuilder::PARAM_INT)))
				->andWhere($update->expr()->eq('last_read_message', $update->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
			$updated += $update->executeStatement();
		}
		$result->closeCursor();

		$output->info(sprintf('acorns: %d 件のスレッド購読行に既読位置を初期化しました', $updated));
	}
}
