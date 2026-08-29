<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Tests\php\Model;

use OCA\Talk\Model\Reminder;
use OCA\Talk\Model\ReminderMapper;
use OCP\IDBConnection;
use PHPUnit\Framework\Attributes\Group;
use Test\TestCase;

/**
 * acorns: 無期限リマインダー(NO_DUE_DATE_TIMESTAMP)の並びと limit=0
 */
#[Group('DB')]
class ReminderMapperTest extends TestCase {
	protected ?ReminderMapper $reminderMapper = null;
	protected string $userId = 'reminder-mapper-test-user';

	public function setUp(): void {
		parent::setUp();
		$this->reminderMapper = new ReminderMapper(\OCP\Server::get(IDBConnection::class));
		$this->reminderMapper->deleteAllRemindersForUser($this->userId, null);
	}

	public function tearDown(): void {
		$this->reminderMapper->deleteAllRemindersForUser($this->userId, null);
		parent::tearDown();
	}

	protected function insert(int $messageId, int $timestamp): Reminder {
		$reminder = new Reminder();
		$reminder->setUserId($this->userId);
		$reminder->setToken('token123');
		$reminder->setMessageId($messageId);
		$reminder->setDateTime(new \DateTime('@' . $timestamp));
		return $this->reminderMapper->insert($reminder);
	}

	public function testFindForUserOrdersTimedFirstThenNoDueDateNewestFirst(): void {
		$now = time();
		$noDue1 = $this->insert(1, Reminder::NO_DUE_DATE_TIMESTAMP);
		$timedLater = $this->insert(2, $now + 7200);
		$noDue2 = $this->insert(3, Reminder::NO_DUE_DATE_TIMESTAMP);
		$timedSoon = $this->insert(4, $now + 3600);

		$result = $this->reminderMapper->findForUser($this->userId, 0);

		$this->assertSame(
			[$timedSoon->getMessageId(), $timedLater->getMessageId(), $noDue2->getMessageId(), $noDue1->getMessageId()],
			array_map(static fn (Reminder $r): int => $r->getMessageId(), $result),
		);
	}

	public function testFindForUserLimitZeroReturnsAll(): void {
		for ($i = 1; $i <= 12; $i++) {
			$this->insert($i, Reminder::NO_DUE_DATE_TIMESTAMP);
		}
		$this->assertCount(12, $this->reminderMapper->findForUser($this->userId, 0));
		$this->assertCount(10, $this->reminderMapper->findForUser($this->userId, 10));
		$this->assertCount(1, $this->reminderMapper->findForUser($this->userId, 1));
	}

	public function testNoDueDateIsFarFuture(): void {
		$this->assertSame(4102444800, Reminder::NO_DUE_DATE_TIMESTAMP);
		$this->assertSame('2100-01-01T00:00:00+00:00', (new \DateTime('@' . Reminder::NO_DUE_DATE_TIMESTAMP))->format(\DateTimeInterface::ATOM));
	}
}
