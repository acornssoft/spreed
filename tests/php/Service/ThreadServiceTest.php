<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Tests\php\Service;

use OCA\Talk\Model\Attendee;
use OCA\Talk\Model\ThreadAttendee;
use OCA\Talk\Model\ThreadAttendeeMapper;
use OCA\Talk\Model\ThreadMapper;
use OCA\Talk\Service\ThreadService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IDBConnection;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

class ThreadServiceTest extends TestCase {
	protected ThreadMapper&MockObject $threadMapper;
	protected ThreadAttendeeMapper&MockObject $threadAttendeeMapper;
	protected ThreadService $service;

	public function setUp(): void {
		parent::setUp();

		$this->threadMapper = $this->createMock(ThreadMapper::class);
		$this->threadAttendeeMapper = $this->createMock(ThreadAttendeeMapper::class);
		$cache = $this->createMock(ICache::class);
		$cacheFactory = $this->createMock(ICacheFactory::class);
		$cacheFactory->method('createDistributed')
			->willReturn($cache);

		$this->service = new ThreadService(
			$this->createMock(IDBConnection::class),
			$this->threadMapper,
			$this->threadAttendeeMapper,
			$this->createMock(ITimeFactory::class),
			$cacheFactory,
		);
	}

	public function testSetLastReadMessageReturnsNullWithoutRow(): void {
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')
			->willThrowException(new DoesNotExistException(''));
		$this->threadAttendeeMapper->expects($this->never())->method('update');

		$this->assertNull($this->service->setLastReadMessage($this->attendee(), 138, 200));
	}

	public function testSetLastReadMessageRejectsGoingBackwards(): void {
		$row = new ThreadAttendee();
		$row->setLastReadMessage(200);
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')->willReturn($row);

		$this->expectException(\InvalidArgumentException::class);
		$this->service->setLastReadMessage($this->attendee(), 138, 150);
	}

	public function testSetLastReadMessageAdvances(): void {
		$row = new ThreadAttendee();
		$row->setLastReadMessage(200);
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')->willReturn($row);
		$this->threadAttendeeMapper->expects($this->once())->method('update')
			->with($this->callback(static fn (ThreadAttendee $a) => $a->getLastReadMessage() === 250))
			->willReturnArgument(0);

		$result = $this->service->setLastReadMessage($this->attendee(), 138, 250);
		$this->assertSame(250, $result->getLastReadMessage());
	}

	public function testEnsureIsThreadAttendeeInitialisesWithOwnMessage(): void {
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')
			->willThrowException(new DoesNotExistException(''));
		$this->threadAttendeeMapper->expects($this->once())->method('insert')
			->with($this->callback(static fn (ThreadAttendee $a) => $a->getLastReadMessage() === 300))
			->willReturnArgument(0);

		$this->service->ensureIsThreadAttendee($this->attendee(), 138, 300);
	}

	public function testEnsureIsThreadAttendeeAdvancesExistingRow(): void {
		$row = new ThreadAttendee();
		$row->setLastReadMessage(200);
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')->willReturn($row);
		$this->threadAttendeeMapper->expects($this->once())->method('update')
			->with($this->callback(static fn (ThreadAttendee $a) => $a->getLastReadMessage() === 300))
			->willReturnArgument(0);

		$this->service->ensureIsThreadAttendee($this->attendee(), 138, 300);
	}

	public function testEnsureThreadAttendeeForMentionCreatesRowJustBeforeMessage(): void {
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')
			->willThrowException(new DoesNotExistException(''));
		$this->threadAttendeeMapper->expects($this->once())->method('insert')
			->with($this->callback(static fn (ThreadAttendee $a) => $a->getLastReadMessage() === 299))
			->willReturnArgument(0);

		$this->service->ensureThreadAttendeeForMention($this->attendee(), 138, 300);
	}

	public function testEnsureThreadAttendeeForMentionKeepsExistingRow(): void {
		$row = new ThreadAttendee();
		$row->setLastReadMessage(100);
		$this->threadAttendeeMapper->method('findAttendeeByThreadId')->willReturn($row);
		$this->threadAttendeeMapper->expects($this->never())->method('insert');
		$this->threadAttendeeMapper->expects($this->never())->method('update');

		$this->service->ensureThreadAttendeeForMention($this->attendee(), 138, 300);
	}

	/**
	 * acorns: 既存メッセージをスレッド化するときのスレッド名
	 */
	public static function dataGenerateTitleFromText(): array {
		return [
			'short text is kept' => ['なんか妙に重くね？', 'なんか妙に重くね？'],
			'50 characters are kept' => [str_repeat('あ', 50), str_repeat('あ', 50)],
			'51 characters are cut to 50 and marked' => [str_repeat('あ', 50) . 'い', str_repeat('あ', 50) . '…'],
			'long ASCII text is cut to 50 and marked' => [str_repeat('a', 120), str_repeat('a', 50) . '…'],
			'characters outside the BMP count as one' => [str_repeat('😀', 51), str_repeat('😀', 50) . '…'],
			'line breaks become one space' => ["お疲れ様です。\r\n\r\n本日の定例ですが", 'お疲れ様です。 本日の定例ですが'],
			'tabs become one space' => ["a\t\tb", 'a b'],
			'spaces around line breaks are dropped' => ["first  \n   second", 'first second'],
			'other spaces are kept' => ['a  b　c', 'a  b　c'],
			'surrounding whitespace is trimmed' => ["  \n hello \n ", 'hello'],
			'no space is left before the mark' => [str_repeat('a', 49) . ' ' . str_repeat('b', 10), str_repeat('a', 49) . '…'],
			'line breaks are joined before cutting' => [str_repeat('a', 30) . "\n" . str_repeat('b', 30), str_repeat('a', 30) . ' ' . str_repeat('b', 19) . '…'],
			'empty text' => ['', ''],
			'only whitespace' => [" \n\t ", ''],
		];
	}

	#[DataProvider('dataGenerateTitleFromText')]
	public function testGenerateTitleFromText(string $text, string $expected): void {
		$this->assertSame($expected, $this->service->generateTitleFromText($text));
	}

	protected function attendee(): Attendee {
		$attendee = new Attendee();
		$attendee->setId(7);
		$attendee->setRoomId(1);
		$attendee->setActorType(Attendee::ACTOR_USERS);
		$attendee->setActorId('admin');
		return $attendee;
	}
}
