/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
	BigIntChatMessage,
	ChatMessage,
	ChatTask,
	editScheduledMessageParams,
	ScheduledMessage,
	scheduleMessageParams,
	ThreadInfo,
} from '../types/index.ts'

import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import ConfirmDialog from '../components/UIShared/ConfirmDialog.vue'
import { PARTICIPANT } from '../constants.ts'
import BrowserStorage from '../services/BrowserStorage.js'
import { hasTalkFeature } from '../services/CapabilitiesManager.ts'
import { EventBus } from '../services/EventBus.ts'
import {
	deleteScheduledMessage as deleteScheduledMessageApi,
	editScheduledMessage as editScheduledMessageApi,
	getRecentThreadsForConversation,
	getScheduledMessages as getScheduledMessagesApi,
	getSingleThreadForConversation,
	getSubscribedThreads,
	renameThread as renameThreadApi,
	scheduleMessage as scheduleMessageApi,
	setThreadNotificationLevel as setThreadNotificationLevelApi,
	setThreadReadMarker as setThreadReadMarkerApi,
	summarizeChat,
} from '../services/messagesService.ts'
import { parseMentions, parseSpecialSymbols } from '../utils/textParse.ts'
import { useActorStore } from './actor.ts'

type InitiateEditingMessagePayload = {
	token: string
	id: number | string
	message: string
	messageParameters: ChatMessage['messageParameters']
	threadId?: number // acorns: 編集を始めたペインの threadId(メインは 0)
}

const FOLLOWED_THREADS_FETCH_LIMIT = 100
const pendingFetchSingleThreadRequests = new Map<number, Promise<void>>()

/**
 * Store for conversation extra chat features apart from messages
 */
export const useChatExtrasStore = defineStore('chatExtras', () => {
	const threads = ref<Record<string, Record<number, ThreadInfo>>>({})
	const followedThreads = ref<Set<number>>(new Set())
	const followedThreadsInitialised = ref(false)
	const allFollowedThreadsReceived = ref(false)
	const threadTitle = ref<Record<string, string>>({})
	const parentToReply = ref<Record<string, number>>({})
	const privateReply = ref<Record<string, string>>({})
	const chatInput = ref<Record<string, string>>({})
	const messageIdToEdit = ref<Record<string, number | string>>({})
	const chatEditInput = ref<Record<string, string>>({})
	const tasksCount = ref(0)
	const tasksDoneCount = ref(0)
	const chatSummary = ref<Record<string, Record<number, ChatTask>>>({})
	const scheduledMessages = ref<Record<string, Record<string, ScheduledMessage>>>({})
	const scheduleMessageTime = ref<number | null>(null)
	const showScheduledMessages = ref(false)

	const actorStore = useActorStore()
	const vuexStore = useStore()

	/**
	 * acorns: 入力欄の状態(下書き・引用返信・編集・スレッドタイトル)のキー。
	 * メイン(threadId 0)は従来どおり token、スレッドペインは `token:threadId`。
	 * 右ペインでメインとペインの NewMessage が同じ token を持つため、token だけでは
	 * 2 つの入力欄が同期してしまう(設計書 2026-09-02 D1)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function inputKey(token: string, threadId: number = 0): string {
		return threadId > 0 ? `${token}:${threadId}` : token
	}

	/**
	 * acorns: token 自身と `token:*` のキーを Record から消す(purge 用)
	 *
	 * @param record - store record to clean up
	 * @param token - conversation token
	 */
	function deleteKeysOfToken(record: Record<string, unknown>, token: string) {
		for (const key of Object.keys(record)) {
			if (key === token || key.startsWith(token + ':')) {
				delete record[key]
			}
		}
	}

	/**
	 * Returns whether to show pinned message banner in chat
	 *
	 * @param token - conversation token
	 */
	function hasPinnedMessageShown(token: string) {
		const conversation = vuexStore.getters.conversation(token)
		return conversation?.lastPinnedId && conversation.lastPinnedId !== conversation.hiddenPinnedId
	}

	/**
	 * Returns known thread information from the store
	 *
	 * @param token - conversation token
	 * @param threadId - thread id
	 */
	function getThread(token: string, threadId: number) {
		if (threads.value[token]?.[threadId]) {
			return threads.value[token][threadId]
		}
	}

	/**
	 * Returns array of all known threads
	 *
	 * @param token - conversation token
	 */
	function getThreadsList(token: string): ThreadInfo[] {
		if (threads.value[token]) {
			return Object.values(threads.value[token]).sort((a, b) => b.thread.lastActivity - a.thread.lastActivity)
		} else {
			return []
		}
	}

	const followedThreadsList = computed<ThreadInfo[]>(() => {
		if (!followedThreadsInitialised.value) {
			return []
		}

		return Object.keys(threads.value)
			.flatMap((token) => Object.values(threads.value[token] ?? {}))
			.filter((threadInfo) => followedThreads.value.has(threadInfo.thread.id))
			.sort((a, b) => b.thread.lastActivity - a.thread.lastActivity)
	})

	/**
	 * Returns a title for thread to be created
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function getThreadTitle(token: string, threadId: number = 0) {
		return threadTitle.value[inputKey(token, threadId)]
	}

	/**
	 * Returns a message id of parent to be replied to
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function getParentIdToReply(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		if (parentToReply.value[key]) {
			return parentToReply.value[key]
		}
	}

	/**
	 * Returns edited message text for given conversation
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function getChatEditInput(token: string, threadId: number = 0) {
		return chatEditInput.value[inputKey(token, threadId)] ?? ''
	}

	/**
	 * Returns edited message id for given conversation
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function getMessageIdToEdit(token: string, threadId: number = 0): number | string | undefined {
		return messageIdToEdit.value[inputKey(token, threadId)]
	}

	/**
	 * Returns chat summary task queue for given conversation
	 *
	 * @param token - conversation token
	 */
	function getChatSummaryTaskQueue(token: string) {
		return Object.values(chatSummary.value[token] ?? {})
	}

	/**
	 * Returns whether chat summary task has been requested for given conversation
	 *
	 * @param token - conversation token
	 */
	function hasChatSummaryTaskRequested(token: string) {
		return chatSummary.value[token] !== undefined
	}

	/**
	 * Returns generated chat summary for given conversation
	 *
	 * @param token - conversation token
	 */
	function getChatSummary(token: string) {
		return Object.values(chatSummary.value[token] ?? {}).map((task) => task.summary).join('\n\n')
			|| t('spreed', 'Error occurred during a summary generation')
	}

	/**
	 * Returns list of scheduled messages (sorted by sendAt, prepared for chat)
	 *
	 * @param token - conversation token
	 */
	function getScheduledMessagesList(token: string) {
		return Object.values(scheduledMessages.value[token] ?? {})
			.sort((a, b) => a.sendAt - b.sendAt)
			.map((message) => parseScheduledToChatMessage(token, message))
	}

	/**
	 * Returns scheduled message by id (prepared for chat)
	 *
	 * @param token - conversation token
	 * @param messageId
	 */
	function getScheduledMessage(token: string, messageId: string): BigIntChatMessage | undefined {
		if (scheduledMessages.value[token]?.[messageId]) {
			return parseScheduledToChatMessage(token, scheduledMessages.value[token][messageId])
		}
	}

	/**
	 * Sets current timestamp when message will be scheduled to sent
	 *
	 * @param value new value
	 */
	function setScheduleMessageTime(value: number | null) {
		scheduleMessageTime.value = value
	}

	/**
	 * Sets whether scheduled messages should be shown in chat
	 *
	 * @param value new value
	 */
	function setShowScheduledMessages(value: boolean) {
		showScheduledMessages.value = value
	}

	/**
	 * Add a thread to the store for given conversation
	 *
	 * @param token - conversation token
	 * @param thread - thread information
	 */
	function addThread(token: string, thread: ThreadInfo) {
		if (!threads.value[token]) {
			threads.value[token] = {}
		}

		threads.value[token][thread.thread.id] = thread
	}

	/**
	 * Fetch a thread from server in given conversation
	 * If a request for the same thread is already pending, returns the same promise
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to fetch
	 */
	function fetchSingleThread(token: string, threadId: number): Promise<void> {
		const pendingRequest = pendingFetchSingleThreadRequests.get(threadId)
		if (pendingRequest) {
			// A request for this thread is already pending, wait for it
			return pendingRequest
		}

		const request = (async () => {
			try {
				const response = await getSingleThreadForConversation(token, threadId)
				addThread(token, response.data.ocs.data)
				// FIXME: to be removed when chat relay provides thread data in original message
				if (response.data.ocs.data.first) {
					vuexStore.commit('addMessage', { token, message: response.data.ocs.data.first })
				}
			} catch (error) {
				console.error('Error fetching thread:', error)
			} finally {
				pendingFetchSingleThreadRequests.delete(threadId)
			}
		})()
		pendingFetchSingleThreadRequests.set(threadId, request)
		return request
	}

	/**
	 * Fetch list of recent threads from server in given conversation
	 *
	 * @param token - conversation token
	 */
	async function fetchRecentThreadsList(token: string) {
		try {
			const response = await getRecentThreadsForConversation({ token })
			response.data.ocs.data.forEach((threadInfo) => {
				addThread(token, threadInfo)
			})
		} catch (error) {
			console.error('Error fetching threads:', error)
		}
	}

	/**
	 * Fetch list of subscribed threads from server
	 *
	 * @param offset thread offset to start fetch with
	 */
	async function fetchFollowedThreadsList(offset?: number) {
		try {
			const response = await getSubscribedThreads({ limit: FOLLOWED_THREADS_FETCH_LIMIT, offset })

			if (!offset) {
				// Reset the list if no offset is given
				followedThreads.value.clear()
				allFollowedThreadsReceived.value = false
			}

			response.data.ocs.data.forEach((threadInfo) => {
				followedThreads.value.add(threadInfo.thread.id)
				addThread(threadInfo.thread.roomToken, threadInfo)
			})
			followedThreadsInitialised.value = true

			if (response.data.ocs.data.length < FOLLOWED_THREADS_FETCH_LIMIT) {
				allFollowedThreadsReceived.value = true
			}
		} catch (error) {
			console.error('Error fetching threads:', error)
		}
	}

	/**
	 * Create a thread from a reply chain in given conversation
	 * If thread already exists, subscribe to it
	 *
	 * @param token - conversation token
	 * @param messageId - message id of any reply in the chain
	 * @param level - new level of notification for thread
	 */
	async function setThreadNotificationLevel(token: string, messageId: number, level: number) {
		try {
			const response = await setThreadNotificationLevelApi(token, messageId, level)
			// When unsubscribe from the thread, remove it from list of followed, add otherwise
			if (response.data.ocs.data.attendee.notificationLevel === PARTICIPANT.NOTIFY.NEVER) {
				followedThreads.value.delete(response.data.ocs.data.thread.id)
			} else {
				followedThreads.value.add(response.data.ocs.data.thread.id)
			}
			addThread(token, response.data.ocs.data)
		} catch (error) {
			console.error('Error updating thread notification level:', error)
		}
	}

	/**
	 * acorns: スレッドの既読位置を進める。会話の既読は触らない(spec §5.6)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to update
	 * @param lastReadMessage - message id to mark as read; omit for the last message of the thread
	 */
	async function updateThreadReadMarker(token: string, threadId: number, lastReadMessage?: number) {
		if (!hasTalkFeature(token, 'acorns-thread-read-marker')) {
			return
		}
		let current = threads.value[token]?.[threadId]
		if (!current) {
			// acorns: store に無ければ先に取得して attendee を確定させる
			await fetchSingleThread(token, threadId)
			current = threads.value[token]?.[threadId]
		}
		if (current && current.attendee.lastReadMessage === 0) {
			// 追跡対象でない(行が無い)。サーバも無視するので投げない
			return
		}
		if (current) {
			// acorns: 楽観更新の前に視覚既読を「その時点」の値で確定する(区切り線は開いた時点の位置で固定)
			if (vuexStore.getters.getVisualLastReadMessageId(token, threadId) === null) {
				vuexStore.dispatch('setVisualLastReadMessageId', { token, threadId, id: current.attendee.lastReadMessage })
			}
			// 楽観更新
			current.attendee.lastReadMessage = lastReadMessage ?? current.thread.lastMessageId
			current.attendee.unreadMessages = 0
			// acorns: スレッド未読の変化を会話の unreadThreads に即時反映する(spec §6.5)
			if (vuexStore.getters.conversation(token)) {
				vuexStore.commit('updateUnreadMessages', { token, unreadThreads: getUnreadThreadsCount(token) })
			}
		}
		try {
			const response = await setThreadReadMarkerApi(token, threadId, lastReadMessage)
			addThread(token, response.data.ocs.data)
		} catch (error) {
			console.error('Error updating thread read marker:', error)
		}
	}

	/**
	 * acorns: 新着スレッド返信でローカルの未読数を 1 増やす(次の一覧ポーリングまでのつなぎ)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to bump
	 */
	function bumpThreadUnread(token: string, threadId: number) {
		const current = threads.value[token]?.[threadId]
		if (!current || current.attendee.lastReadMessage === 0) {
			return
		}
		current.attendee.unreadMessages += 1
	}

	/**
	 * acorns: store 内で未読のあるスレッド数
	 *
	 * @param token - conversation token
	 */
	function getUnreadThreadsCount(token: string): number {
		return Object.values(threads.value[token] ?? {}).filter((info) => info.attendee.unreadMessages > 0).length
	}

	/**
	 * Update a thread from a known information
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to update
	 * @param payload - updated information
	 */
	async function updateThread(token: string, threadId: number, payload: Partial<ThreadInfo>) {
		try {
			if (!threads.value[token] || !threads.value[token][threadId]) {
				// Thread is not known yet, try to fetch actual data from server
				await fetchSingleThread(token, threadId)
				return
			}

			threads.value[token][threadId] = {
				thread: payload.thread ?? threads.value[token][threadId].thread,
				attendee: payload.attendee ?? threads.value[token][threadId].attendee,
				first: payload.first ?? threads.value[token][threadId].first,
				last: payload.last ?? threads.value[token][threadId].last,
			}
		} catch (error) {
			console.error('Error updating thread:', error)
		}
	}

	/**
	 * Update a thread name from a known information
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to update
	 * @param threadTitle - thread title to set
	 */
	async function updateThreadTitle(token: string, threadId: number, threadTitle: string) {
		if (!threads.value[token] || !threads.value[token][threadId]) {
			return
		}

		threads.value[token][threadId].thread.title = threadTitle
	}

	/**
	 * Rename a thread on a server and update store
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to update
	 */
	async function renameThread(token: string, threadId: number) {
		const newThreadTitle = await spawnDialog(ConfirmDialog, {
			name: t('spreed', 'Edit thread details'),
			isForm: true,
			inputProps: {
				value: threads.value[token][threadId].thread.title,
				label: t('spreed', 'Thread title'),
			},
			buttons: [
				{
					label: t('spreed', 'Dismiss'),
					callback: () => undefined,
				},
				{
					label: t('spreed', 'Save'),
					variant: 'primary',
					callback: () => true,
				},
			],
		})

		if (newThreadTitle && typeof newThreadTitle === 'string') {
			try {
				const response = await renameThreadApi(token, threadId, newThreadTitle)
				addThread(token, response.data.ocs.data)
			} catch (e) {
				showError(t('spreed', 'Failed to rename the thread'))
				console.error(e)
			}
		}
	}

	/**
	 * Remove a thread from the store
	 *
	 * @param token - conversation token
	 * @param messageId - message id to remove all preceding threads (remove all, if omitted)
	 */
	function clearThreads(token: string, messageId?: number) {
		if (messageId) {
			// Clear threads that are older than the given messageId
			for (const threadId of Object.keys(threads.value[token] ?? {})) {
				if (+threadId < messageId) {
					delete threads.value[token][+threadId]
				}
			}
		} else {
			// Clear all threads for the conversation
			delete threads.value[token]
		}
	}

	/**
	 * Remove a message from a thread object
	 *
	 * @param token - conversation token
	 * @param threadId - thread id to remove message from
	 * @param messageId - message id to remove
	 */
	function removeMessageFromThread(token: string, threadId: number, messageId: number) {
		if (!threads.value[token]?.[threadId]) {
			return
		}

		const thread = threads.value[token][threadId]
		if (thread.first?.id === messageId) {
			thread.first = null
		} else {
			threads.value[token][threadId].thread.numReplies -= 1
			if (thread.last?.id === messageId) {
				// Last message was removed but there might be older messages in the thread
				// that don't have expiration timestamp
				fetchSingleThread(token, threadId)
			}
		}
	}

	/**
	 * Get chat input for current conversation (from store or BrowserStorage)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 * @return The input text
	 */
	function getChatInput(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		if (!chatInput.value[key]) {
			restoreChatInput(token, threadId)
		}
		return chatInput.value[key] ?? ''
	}

	/**
	 * Add a thread title to the store
	 *
	 * @param token - conversation token
	 * @param title - title from input
	 * @param threadId - thread id (0 = main channel)
	 */
	function setThreadTitle(token: string, title: string, threadId: number = 0) {
		threadTitle.value[inputKey(token, threadId)] = title
	}

	/**
	 * Removes a thread title id from the store
	 * (after posting message or dismissing the operation)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function removeThreadTitle(token: string, threadId: number = 0) {
		delete threadTitle.value[inputKey(token, threadId)]
	}

	/**
	 * Add a reply message id to the store
	 *
	 * @param payload action payload
	 * @param payload.token - conversation token
	 * @param payload.id The id of message
	 * @param payload.threadId - thread id (0 = main channel)
	 */
	function setParentIdToReply({ token, id, threadId = 0 }: { token: string, id: number, threadId?: number }) {
		parentToReply.value[inputKey(token, threadId)] = id
	}

	/**
	 * Add a private reply parent conversation token to the store
	 *
	 * @param payload - Payload containing token and parent token
	 * @param payload.token - private conversation token (where message would be replied to)
	 * @param payload.parentToken - group conversation token (where message would be replied from)
	 */
	function setPrivateReplyParentToken({ token, parentToken }: { token: string, parentToken: string }) {
		privateReply.value[token] = parentToken
	}

	/**
	 * Method to delete the parentToken that is set
	 *
	 * @param token - Parent Token to reset private reply
	 */
	function removePrivateReplyParentToken(token: string) {
		delete privateReply.value[token]
	}

	/**
	 * Removes a reply message id from the store
	 * (after posting message or dismissing the operation)
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function removeParentIdToReply(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		delete parentToReply.value[key]
		delete privateReply.value[key]
	}

	/**
	 * Restore chat input from the browser storage and save to store
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function restoreChatInput(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		const storedChatInput = BrowserStorage.getItem('chatInput_' + key)
		if (storedChatInput) {
			chatInput.value[key] = storedChatInput
		}
	}

	/**
	 * Add a current input value to the store for a given conversation token
	 *
	 * @param payload action payload
	 * @param payload.token - conversation token
	 * @param payload.text The string to store
	 * @param payload.threadId - thread id (0 = main channel)
	 */
	function setChatInput({ token, text, threadId = 0 }: { token: string, text: string, threadId?: number }) {
		const key = inputKey(token, threadId)
		const parsedText = parseSpecialSymbols(text)
		BrowserStorage.setItem('chatInput_' + key, parsedText)
		chatInput.value[key] = parsedText
	}

	/**
	 * Add a message text that is being edited to the store for a given conversation token
	 *
	 * @param payload action payload
	 * @param payload.token - conversation token
	 * @param payload.text The string to store
	 * @param payload.parameters message parameters
	 * @param payload.threadId - thread id (0 = main channel)
	 */
	function setChatEditInput({ token, text, parameters = {}, threadId = 0 }: { token: string, text: string, parameters?: ChatMessage['messageParameters'], threadId?: number }) {
		let parsedText = text

		// Handle mentions and special symbols
		parsedText = parseMentions(parsedText, parameters)
		parsedText = parseSpecialSymbols(parsedText)

		chatEditInput.value[inputKey(token, threadId)] = parsedText
	}

	/**
	 * Add a message id that is being edited to the store
	 *
	 * @param token - conversation token
	 * @param id The id of message
	 * @param threadId - thread id (0 = main channel)
	 */
	function setMessageIdToEdit(token: string, id: number | string, threadId: number = 0) {
		messageIdToEdit.value[inputKey(token, threadId)] = id
	}

	/**
	 * Remove a message id that is being edited to the store
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function removeMessageIdToEdit(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		delete chatEditInput.value[key]
		delete messageIdToEdit.value[key]
	}

	/**
	 * Remove a current input value from the store for a given conversation token
	 *
	 * @param token - conversation token
	 * @param threadId - thread id (0 = main channel)
	 */
	function removeChatInput(token: string, threadId: number = 0) {
		const key = inputKey(token, threadId)
		BrowserStorage.removeItem('chatInput_' + key)
		delete chatInput.value[key]
	}

	/**
	 * Initiate editing UI for a given message
	 *
	 * @param payload - action payload
	 * @param payload.token - conversation token
	 * @param payload.id - message id
	 * @param payload.message - message text
	 * @param payload.messageParameters - message parameters
	 * @param payload.threadId - thread id (0 = main channel)
	 */
	function initiateEditingMessage({ token, id, message, messageParameters, threadId = 0 }: InitiateEditingMessagePayload) {
		setMessageIdToEdit(token, id, threadId)
		const isFileShareOnly = Object.keys(messageParameters ?? {}).some((key) => key.startsWith('file'))
			&& message === '{file}'
		if (isFileShareOnly) {
			setChatEditInput({ token, text: '', threadId })
		} else {
			setChatEditInput({
				token,
				text: message,
				parameters: messageParameters,
				threadId,
			})
		}
		if (scheduledMessages.value[token]?.[id] && scheduledMessages.value[token][id].threadId === -1) {
			setThreadTitle(token, scheduledMessages.value[token][id].threadTitle!, threadId)
		}
		EventBus.emit('editing-message')
		EventBus.emit('focus-chat-input')
	}

	/**
	 * Clears store for a deleted conversation
	 *
	 * @param token the token of the conversation to be deleted
	 */
	function purgeChatExtras(token: string) {
		// acorns: スレッドペイン分(`token:*`)も消す
		for (const key of Object.keys(chatInput.value)) {
			if (key === token || key.startsWith(token + ':')) {
				BrowserStorage.removeItem('chatInput_' + key)
			}
		}
		deleteKeysOfToken(chatInput.value, token)
		deleteKeysOfToken(parentToReply.value, token)
		deleteKeysOfToken(privateReply.value, token)
		deleteKeysOfToken(chatEditInput.value, token)
		deleteKeysOfToken(messageIdToEdit.value, token)
		deleteKeysOfToken(threadTitle.value, token)
		clearThreads(token)
	}

	/**
	 * Update tasks counters in the store
	 *
	 * @param payload - action payload
	 * @param payload.tasksCount - total tasks count
	 * @param payload.tasksDoneCount - done tasks count
	 */
	function setTasksCounters(payload: { tasksCount: number, tasksDoneCount: number }) {
		tasksCount.value = payload.tasksCount
		tasksDoneCount.value = payload.tasksDoneCount
	}

	/**
	 * Request chat summary from server for given conversation and last read message id
	 *
	 * @param token - conversation token
	 * @param fromMessageId
	 */
	async function requestChatSummary(token: string, fromMessageId: number) {
		try {
			const response = await summarizeChat(token, fromMessageId)
			if (!response.data) {
				console.warn('No messages found to summarize:', { token, fromMessageId })
				return
			}
			const task = response.data.ocs.data

			if (!chatSummary.value[token]) {
				chatSummary.value[token] = {}
			}
			chatSummary.value[token][fromMessageId] = {
				...task,
				fromMessageId,
			}
			if (task.nextOffset && task.nextOffset !== fromMessageId) {
				await requestChatSummary(token, task.nextOffset)
			}
		} catch (error) {
			console.error('Error while requesting a summary:', error)
		}
	}

	/**
	 * Store generated chat summary for given conversation
	 *
	 * @param token - conversation token
	 * @param fromMessageId
	 * @param summary
	 */
	function storeChatSummary(token: string, fromMessageId: number, summary: string) {
		if (chatSummary.value[token]?.[fromMessageId]) {
			chatSummary.value[token][fromMessageId].summary = summary
		}
	}

	/**
	 * Clean up chat summary data for given conversation
	 *
	 * @param token - conversation token
	 */
	function dismissChatSummary(token: string) {
		if (hasChatSummaryTaskRequested(token)) {
			delete chatSummary.value[token]
		}
	}

	/**
	 * Converts ScheduledMessage to BigIntChatMessage format (to render in chat)
	 *
	 * @param token - conversation token
	 * @param message - scheduled message object
	 */
	function parseScheduledToChatMessage(token: string, message: ScheduledMessage): BigIntChatMessage {
		return {
			token,
			id: message.id,
			actorId: message.actorId,
			actorType: message.actorType,
			actorDisplayName: actorStore.displayName,
			message: message.message,
			messageType: message.messageType,
			referenceId: 'scheduled-' + message.id,
			systemMessage: '',
			isReplyable: false,
			markdown: true,
			messageParameters: {},
			parent: message.parent,
			reactions: {},
			timestamp: message.sendAt,
			expirationTimestamp: 0,
			threadId: message.threadId,
			threadTitle: message.threadTitle,
			isThread: !!message.threadId,
			silent: message.silent,
		}
	}

	/**
	 * Fetch scheduled messages for given conversation
	 *
	 * @param token - conversation token
	 */
	async function fetchScheduledMessages(token: string) {
		try {
			const response = await getScheduledMessagesApi(token)
			if (!scheduledMessages.value[token]) {
				scheduledMessages.value[token] = {}
			}

			response.data.ocs.data.forEach((message) => {
				scheduledMessages.value[token][message.id] = message
			})
		} catch (e) {
			console.error('Error while fetching scheduled messages:', e)
		}
	}

	/**
	 * Schedule a message to be posted with given payload
	 *
	 * @param token - conversation token
	 * @param payload - action payload
	 */
	async function scheduleMessage(token: string, payload: scheduleMessageParams) {
		try {
			const response = await scheduleMessageApi({ token, ...payload })
			if (!scheduledMessages.value[token]) {
				scheduledMessages.value[token] = {}
			}
			scheduledMessages.value[token][response.data.ocs.data.id] = response.data.ocs.data

			await vuexStore.dispatch('setConversationProperties', {
				token,
				properties: {
					hasScheduledMessages: Object.keys(scheduledMessages.value[token]).length,
				},
			})
		} catch (e) {
			console.error('Error while scheduling message:', e)
			throw e
		}
	}

	/**
	 * Edit already scheduled message with given payload
	 *
	 * @param token - conversation token
	 * @param messageId - id of message to edit
	 * @param payload - action payload
	 */
	async function editScheduledMessage(token: string, messageId: string, payload: editScheduledMessageParams) {
		try {
			const response = await editScheduledMessageApi({ token, messageId, ...payload })
			scheduledMessages.value[token][messageId] = response.data.ocs.data
		} catch (error) {
			console.error('Error while editing scheduled message:', error)
			throw error
		}
	}

	/**
	 * Delete already scheduled message
	 *
	 * @param token - conversation token
	 * @param messageId - id of message to delete
	 */
	async function deleteScheduledMessage(token: string, messageId: string) {
		try {
			await deleteScheduledMessageApi(token, messageId)

			delete scheduledMessages.value[token][messageId]

			const hasScheduledMessages = Object.keys(scheduledMessages.value[token] ?? {}).length
			await vuexStore.dispatch('setConversationProperties', {
				token,
				properties: {
					hasScheduledMessages,
				},
			})
			// Check if there are any scheduled messages left
			if (hasScheduledMessages === 0) {
				setShowScheduledMessages(false)
			}
		} catch (e) {
			console.error('Error while deleting scheduled message:', e)
		}
	}

	return {
		threads,
		followedThreads,
		followedThreadsInitialised,
		allFollowedThreadsReceived,
		threadTitle,
		parentToReply,
		chatInput,
		messageIdToEdit,
		chatEditInput,
		privateReply,
		tasksCount,
		tasksDoneCount,
		chatSummary,
		scheduledMessages,
		scheduleMessageTime,
		showScheduledMessages,
		hasPinnedMessageShown,

		followedThreadsList,

		getThread,
		getThreadsList,
		getThreadTitle,
		getParentIdToReply,
		getChatEditInput,
		getMessageIdToEdit,
		getChatSummaryTaskQueue,
		hasChatSummaryTaskRequested,
		getChatSummary,
		getScheduledMessagesList,
		getScheduledMessage,

		addThread,
		fetchSingleThread,
		fetchRecentThreadsList,
		fetchFollowedThreadsList,
		setThreadNotificationLevel,
		updateThreadReadMarker,
		bumpThreadUnread,
		getUnreadThreadsCount,
		updateThread,
		updateThreadTitle,
		renameThread,
		clearThreads,
		removeMessageFromThread,
		getChatInput,
		setThreadTitle,
		removeThreadTitle,
		setParentIdToReply,
		setPrivateReplyParentToken,
		removePrivateReplyParentToken,
		removeParentIdToReply,
		restoreChatInput,
		setChatInput,
		setChatEditInput,
		setMessageIdToEdit,
		removeMessageIdToEdit,
		removeChatInput,
		initiateEditingMessage,
		purgeChatExtras,
		setTasksCounters,
		requestChatSummary,
		storeChatSummary,
		dismissChatSummary,
		fetchScheduledMessages,
		scheduleMessage,
		editScheduledMessage,
		deleteScheduledMessage,
		setScheduleMessageTime,
		setShowScheduledMessages,
	}
})
