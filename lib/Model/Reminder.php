<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Model;

use OCA\Talk\ResponseDefinitions;
use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * @method void setUserId(string $userId)
 * @method string getUserId()
 * @method void setToken(string $token)
 * @method string getToken()
 * @method void setMessageId(int $messageId)
 * @method int getMessageId()
 * @method void setDateTime(\DateTime $dateTime)
 * @method \DateTime getDateTime()
 *
 * @psalm-import-type TalkChatReminder from ResponseDefinitions
 */
class Reminder extends Entity implements \JsonSerializable {
	public const NUM_UPCOMING_REMINDERS = 10;
	/**
	 * acorns: 無期限(ブックマーク)リマインダーの date_time。2100-01-01 00:00:00 UTC。
	 * 通知ジョブは `date_time < now` を見るので、この値のリマインダーは通知・削除されず残る。
	 */
	public const NO_DUE_DATE_TIMESTAMP = 4102444800;

	protected string $userId = '';
	protected string $token = '';
	protected int $messageId = 0;
	protected ?\DateTime $dateTime = null;

	public function __construct() {
		$this->addType('userId', Types::STRING);
		$this->addType('token', Types::STRING);
		$this->addType('messageId', Types::BIGINT);
		$this->addType('dateTime', Types::DATETIME);
	}

	/**
	 * @return TalkChatReminder
	 */
	#[\Override]
	public function jsonSerialize(): array {
		return [
			'userId' => $this->getUserId(),
			'token' => $this->getToken(),
			'messageId' => $this->getMessageId(),
			'timestamp' => $this->getDateTime()->getTimestamp(),
		];
	}
}
