<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2021 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Chat;

use OCA\Talk\Events\BeforeReactionAddedEvent;
use OCA\Talk\Events\BeforeReactionRemovedEvent;
use OCA\Talk\Events\ReactionAddedEvent;
use OCA\Talk\Events\ReactionRemovedEvent;
use OCA\Talk\Exceptions\ReactionAlreadyExistsException;
use OCA\Talk\Exceptions\ReactionNotSupportedException;
use OCA\Talk\Exceptions\ReactionOutOfContextException;
use OCA\Talk\Model\Message;
use OCA\Talk\Participant;
use OCA\Talk\ResponseDefinitions;
use OCA\Talk\Room;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Comments\IComment;
use OCP\Comments\NotFoundException;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IL10N;
use OCP\PreConditionNotMetException;

/**
 * @psalm-import-type TalkReaction from ResponseDefinitions
 */
class ReactionManager {

	public function __construct(
		private readonly ChatManager $chatManager,
		private readonly CommentsManager $commentsManager,
		private readonly IL10N $l,
		private readonly MessageParser $messageParser,
		private readonly Notifier $notifier,
		private readonly IEventDispatcher $dispatcher,
		private readonly ITimeFactory $timeFactory,
	) {
	}

	/**
	 * Add reaction
	 *
	 * @throws NotFoundException
	 * @throws ReactionAlreadyExistsException
	 * @throws ReactionNotSupportedException
	 * @throws ReactionOutOfContextException
	 */
	public function addReactionMessage(Room $chat, string $actorType, string $actorId, string $actorDisplayName, int $messageId, string $reaction): IComment {
		$parentMessage = $this->getCommentToReact($chat, (string)$messageId);
		try {
			// Check if the user already reacted with the same reaction
			$this->commentsManager->getReactionComment(
				(int)$parentMessage->getId(),
				$actorType,
				$actorId,
				$reaction
			);
			throw new ReactionAlreadyExistsException();
		} catch (NotFoundException) {
		}

		/** @var IComment $comment */
		$comment = $this->commentsManager->create(
			$actorType,
			$actorId,
			'chat',
			(string)$chat->getId()
		);
		$comment->setParentId($parentMessage->getId());
		$comment->setMessage($reaction);
		$comment->setVerb(ChatManager::VERB_REACTION);
		$comment->setExpireDate($parentMessage->getExpireDate());

		// acorns: スレッド所属の権威は metadata の thread_id。リアクションは sendMessage も
		// addSystemMessage も通らないので、ここで親から継承しないとスレッド外扱いになり、
		// 親メッセージ(parent)がチャンネルに現れ、スレッド表示にリアクションが届かなくなる。
		// getThreadIdFromComment() は使わない。親がチャンネルの引用返信(thread_id 無し)なら
		// フォールバックで親自身の id が返り、誤ってスレッド扱いになるため
		$parentMetaData = $parentMessage->getMetaData() ?? [];
		if (isset($parentMetaData[Message::METADATA_THREAD_ID])) {
			$comment->setMetaData([Message::METADATA_THREAD_ID => (int)$parentMetaData[Message::METADATA_THREAD_ID]]);
		}

		$event = new BeforeReactionAddedEvent($chat, $parentMessage, $actorType, $actorId, $actorDisplayName, $reaction);
		$this->dispatcher->dispatchTyped($event);

		$this->commentsManager->save($comment);

		$event = new ReactionAddedEvent($chat, $parentMessage, $actorType, $actorId, $actorDisplayName, $reaction, $comment);
		$this->dispatcher->dispatchTyped($event);

		$this->notifier->notifyReacted($chat, $parentMessage, $comment);
		return $comment;
	}

	/**
	 * Delete reaction
	 *
	 * @param Room $chat
	 * @param string $actorType
	 * @param string $actorId
	 * @param integer $messageId
	 * @param string $reaction
	 * @return IComment
	 * @throws NotFoundException
	 * @throws ReactionNotSupportedException
	 * @throws ReactionOutOfContextException
	 */
	public function deleteReactionMessage(Room $chat, string $actorType, string $actorId, string $actorDisplayName, int $messageId, string $reaction): IComment {
		// Just to verify that messageId is part of the room and throw error if not.
		$parentComment = $this->getCommentToReact($chat, (string)$messageId);

		$event = new BeforeReactionRemovedEvent($chat, $parentComment, $actorType, $actorId, $actorDisplayName, $reaction);
		$this->dispatcher->dispatchTyped($event);

		$comment = $this->commentsManager->getReactionComment(
			$messageId,
			$actorType,
			$actorId,
			$reaction
		);
		$comment->setMessage(
			json_encode([
				'deleted_by_type' => $actorType,
				'deleted_by_id' => $actorId,
				'deleted_on' => $this->timeFactory->getDateTime()->getTimestamp(),
			])
		);
		$comment->setVerb(ChatManager::VERB_REACTION_DELETED);
		$this->commentsManager->save($comment);

		$revokedComment = $this->chatManager->addSystemMessage(
			$chat,
			null,
			$actorType,
			$actorId,
			json_encode(['message' => 'reaction_revoked', 'parameters' => ['message' => (int)$comment->getId()]]),
			$this->timeFactory->getDateTime(),
			false,
			null,
			$parentComment,
			true
		);

		$event = new ReactionRemovedEvent($chat, $parentComment, $actorType, $actorId, $actorDisplayName, $reaction, $revokedComment);
		$this->dispatcher->dispatchTyped($event);

		return $comment;
	}

	/**
	 * @return array<string, list<TalkReaction>>
	 * @throws PreConditionNotMetException
	 */
	public function retrieveReactionMessages(Room $chat, Participant $participant, int $messageId, ?string $reaction = null): array {
		if ($reaction) {
			$comments = $this->commentsManager->retrieveAllReactionsWithSpecificReaction($messageId, $reaction);
		} else {
			$comments = $this->commentsManager->retrieveAllReactions($messageId);
		}

		$reactions = [];
		foreach ($comments as $comment) {
			$message = $this->messageParser->createMessage($chat, $participant, $comment, $this->l);
			$this->messageParser->parseMessage($message);

			$reactions[$comment->getMessage()][] = [
				'actorType' => $comment->getActorType(),
				'actorId' => $comment->getActorId(),
				'actorDisplayName' => $message->getActorDisplayName(),
				'timestamp' => $comment->getCreationDateTime()->getTimestamp(),
			];
		}
		return $reactions;
	}

	/**
	 * @param Participant $participant
	 * @param array $messageIds
	 * @return array[]
	 * @psalm-return array<int, string[]>
	 */
	public function getReactionsByActorForMessages(Participant $participant, array $messageIds): array {
		return $this->commentsManager->retrieveReactionsByActor(
			$participant->getAttendee()->getActorType(),
			$participant->getAttendee()->getActorId(),
			$messageIds
		);
	}

	/**
	 * @param Room $chat
	 * @param string $messageId
	 * @return IComment
	 * @throws NotFoundException
	 * @throws ReactionNotSupportedException
	 * @throws ReactionOutOfContextException
	 */
	public function getCommentToReact(Room $chat, string $messageId): IComment {
		if (!$this->commentsManager->supportReactions()) {
			throw new ReactionNotSupportedException();
		}
		$comment = $this->commentsManager->get($messageId);

		if ($comment->getObjectType() !== 'chat'
			|| $comment->getObjectId() !== (string)$chat->getId()
			|| !in_array($comment->getVerb(), [
				ChatManager::VERB_MESSAGE,
				ChatManager::VERB_OBJECT_SHARED,
			], true)) {
			throw new ReactionOutOfContextException();
		}

		return $comment;
	}
}
