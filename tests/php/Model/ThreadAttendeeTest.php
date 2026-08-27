<?php

declare(strict_types=1);

namespace OCA\Talk\Tests\php\Model;

use OCA\Talk\Model\ThreadAttendee;
use Test\TestCase;

class ThreadAttendeeTest extends TestCase {
	public function testJsonSerializeIncludesReadMarkerFields(): void {
		$attendee = new ThreadAttendee();
		$attendee->setNotificationLevel(1);
		$attendee->setLastReadMessage(42);
		$attendee->setUnreadMessages(3);

		$this->assertSame([
			'notificationLevel' => 1,
			'lastReadMessage' => 42,
			'unreadMessages' => 3,
		], $attendee->jsonSerialize());
	}

	public function testJsonSerializeDefaultsToZero(): void {
		$attendee = new ThreadAttendee();
		$this->assertSame([
			'notificationLevel' => 0,
			'lastReadMessage' => 0,
			'unreadMessages' => 0,
		], $attendee->jsonSerialize());
	}

	public function testCreateFromRowReadsLastReadMessage(): void {
		$attendee = ThreadAttendee::createFromRow([
			'room_id' => '1', 'thread_id' => '5', 'attendee_id' => '7',
			'notification_level' => '0', 'actor_type' => 'users', 'actor_id' => 'admin',
			'last_read_message' => '9',
		]);
		$this->assertSame(9, $attendee->getLastReadMessage());
	}
}
