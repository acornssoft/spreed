/*
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, useStore } from 'vuex'
import BrowserStorage from '../../services/BrowserStorage.js'
import { hasTalkFeature } from '../../services/CapabilitiesManager.ts'
import { EventBus } from '../../services/EventBus.ts'
import {
	getSingleThreadForConversation,
	setThreadReadMarker,
} from '../../services/messagesService.ts'
import storeConfig from '../../store/storeConfig.js'
import { generateOCSResponse } from '../../test-helpers.js'
import { useChatExtrasStore } from '../chatExtras.ts'

vi.mock('vuex', async () => {
	const vuex = await vi.importActual('vuex')
	return {
		...vuex,
		useStore: vi.fn(),
	}
})

vi.mock('../../services/CapabilitiesManager.ts', async (importOriginal) => ({
	...await importOriginal(),
	hasTalkFeature: vi.fn(() => true),
}))

vi.mock('../../services/messagesService.ts', async (importOriginal) => ({
	...await importOriginal(),
	setThreadReadMarker: vi.fn(),
	getSingleThreadForConversation: vi.fn(),
}))

describe('chatExtrasStore', () => {
	const token = 'TOKEN'
	let chatExtrasStore
	let vuexStore

	beforeEach(async () => {
		vuexStore = createStore(storeConfig)
		useStore.mockReturnValue(vuexStore)
		setActivePinia(createPinia())
		chatExtrasStore = useChatExtrasStore()
	})

	afterEach(async () => {
		vi.clearAllMocks()
	})

	describe('reply message', () => {
		it('adds reply message id to the store', () => {
			// Act
			chatExtrasStore.setParentIdToReply({ token, id: 101 })

			// Assert
			expect(chatExtrasStore.getParentIdToReply(token)).toBe(101)
		})

		it('clears reply message', () => {
			// Arrange
			chatExtrasStore.setParentIdToReply({ token, id: 101 })

			// Act
			chatExtrasStore.removeParentIdToReply(token)

			// Assert
			expect(chatExtrasStore.getParentIdToReply(token)).not.toBeDefined()
		})
	})

	describe('current input message', () => {
		it('sets current input message', () => {
			// Act
			chatExtrasStore.setChatInput({ token: 'token-1', text: 'message-1' })

			// Assert
			expect(chatExtrasStore.getChatInput('token-1')).toStrictEqual('message-1')
			expect(BrowserStorage.getItem('chatInput_token-1')).toBe('message-1')
		})

		it('clears current input message', () => {
			// Arrange
			chatExtrasStore.setChatInput({ token: 'token-1', text: 'message-1' })

			// Act
			chatExtrasStore.removeChatInput('token-1')

			// Assert
			expect(chatExtrasStore.chatInput['token-1']).not.toBeDefined()
			expect(chatExtrasStore.getChatInput('token-1')).toBe('')
			expect(BrowserStorage.getItem('chatInput_token-1')).toBe(null)
		})

		it('restores chat input from the browser storage if any', () => {
			// Arrange
			BrowserStorage.setItem('chatInput_token-1', 'message draft')

			// Act
			chatExtrasStore.restoreChatInput('token-1')

			// Assert
			expect(chatExtrasStore.getChatInput('token-1')).toStrictEqual('message draft')

			// Arrange 2 - no chat input in the browser storage
			chatExtrasStore.removeChatInput('token-1')
			// Act
			chatExtrasStore.restoreChatInput('token-1')
			// Assert
			expect(chatExtrasStore.getChatInput('token-1')).toBe('')
		})
	})

	describe('current edit input message', () => {
		it('sets current edit input message', () => {
			// Act
			chatExtrasStore.setChatEditInput({ token: 'token-1', text: 'This is an edited message' })
			chatExtrasStore.setMessageIdToEdit('token-1', 'id-1')

			// Assert
			expect(chatExtrasStore.getChatEditInput('token-1')).toStrictEqual('This is an edited message')
			expect(chatExtrasStore.getMessageIdToEdit('id-1')).toBe(undefined)
		})

		it('clears current edit input message', () => {
			// Arrange
			chatExtrasStore.setChatEditInput({ token: 'token-1', text: 'This is an edited message' })
			chatExtrasStore.setMessageIdToEdit('token-1', 'id-1')

			// Act
			chatExtrasStore.removeMessageIdToEdit('token-1')

			// Assert
			expect(chatExtrasStore.chatEditInput['token-1']).not.toBeDefined()
			expect(chatExtrasStore.getChatEditInput('token-1')).toBe('')
		})
	})

	describe('purge store', () => {
		it('clears store for provided token', async () => {
			// Arrange
			chatExtrasStore.setParentIdToReply({ token: 'token-1', id: 101 })
			chatExtrasStore.setChatInput({ token: 'token-1', text: 'message-1' })

			// Act
			chatExtrasStore.purgeChatExtras('token-1')

			// Assert
			expect(chatExtrasStore.parentToReply['token-1']).not.toBeDefined()
			expect(chatExtrasStore.chatInput['token-1']).not.toBeDefined()
		})
	})

	describe('text parsing', () => {
		it('should render mentions properly when editing message', () => {
			// Arrange
			const parameters = {
				'mention-call1': { type: 'call', name: 'Conversation101', 'mention-id': 'all' },
				'mention-user1': { type: 'user', name: 'Alice Joel', id: 'alice', 'mention-id': 'alice' },
			}
			// Act
			chatExtrasStore.setChatEditInput({
				token: 'token-1',
				text: 'Hello {mention-call1} and {mention-user1}',
				parameters,
			})
			// Assert
			expect(chatExtrasStore.getChatEditInput('token-1')).toBe('Hello @"all" and @"alice"')
		})

		it('should store chat input without escaping special symbols', () => {
			// Arrange
			const message = 'These are special symbols &amp; &lt; &gt; &sect;'
			// Act
			chatExtrasStore.setChatInput({ token: 'token-1', text: message })
			// Assert
			expect(chatExtrasStore.getChatInput('token-1')).toBe('These are special symbols & < > §')
		})
		it('should remove leading/trailing whitespaces', () => {
			// Arrange
			const message = '   Many whitespaces   '
			// Act
			chatExtrasStore.setChatInput({ token: 'token-1', text: message })
			// Assert
			expect(chatExtrasStore.getChatInput('token-1')).toBe('Many whitespaces')
		})
	})

	describe('initiateEditingMessage', () => {
		it('should set the message ID to edit, set the chat edit input, and emit an event', () => {
			// Arrange
			const payload = {
				token: 'token-1',
				id: 'id-1',
				message: 'Hello, world!',
				messageParameters: {},
			}
			const emitSpy = vi.spyOn(EventBus, 'emit')

			// Act
			chatExtrasStore.initiateEditingMessage(payload)

			// Assert
			expect(chatExtrasStore.getMessageIdToEdit('token-1')).toBe('id-1')
			expect(chatExtrasStore.getChatEditInput('token-1')).toEqual('Hello, world!')
			expect(emitSpy).toHaveBeenCalledWith('editing-message')
		})

		it('should set the chat edit input text to empty if the message is a file share only', () => {
			// Arrange
			const payload = {
				token: 'token-1',
				id: 'id-1',
				message: '{file}',
				messageParameters: { file0: 'file-path' },
			}

			// Act
			chatExtrasStore.initiateEditingMessage(payload)

			// Assert
			expect(chatExtrasStore.getChatEditInput('token-1')).toEqual('')
		})
	})

	describe('thread read marker', () => {
		const threadInfo = (attendee) => ({
			thread: { id: 138, roomToken: token, title: 't', lastMessageId: 200, numReplies: 3, lastActivity: 1 },
			attendee: { notificationLevel: 0, lastReadMessage: 150, unreadMessages: 2, ...attendee },
			first: null,
			last: null,
		})

		beforeEach(() => {
			hasTalkFeature.mockReturnValue(true) // 'acorns-thread-read-marker'
		})

		it('updates read marker optimistically and from the response', async () => {
			chatExtrasStore.addThread(token, threadInfo())
			setThreadReadMarker.mockResolvedValue(generateOCSResponse({ payload: threadInfo({ lastReadMessage: 200, unreadMessages: 0 }) }))

			await chatExtrasStore.updateThreadReadMarker(token, 138)

			expect(setThreadReadMarker).toHaveBeenCalledWith(token, 138, undefined)
			expect(chatExtrasStore.getThread(token, 138).attendee).toMatchObject({ lastReadMessage: 200, unreadMessages: 0 })
		})

		it('does nothing without the capability', async () => {
			hasTalkFeature.mockReturnValue(false)
			chatExtrasStore.addThread(token, threadInfo())

			await chatExtrasStore.updateThreadReadMarker(token, 138)

			expect(setThreadReadMarker).not.toHaveBeenCalled()
		})

		it('bumps unread only for tracked threads', () => {
			chatExtrasStore.addThread(token, threadInfo())
			chatExtrasStore.addThread(token, { ...threadInfo({ lastReadMessage: 0, unreadMessages: 0 }), thread: { ...threadInfo().thread, id: 139 } })

			chatExtrasStore.bumpThreadUnread(token, 138)
			chatExtrasStore.bumpThreadUnread(token, 139)

			expect(chatExtrasStore.getThread(token, 138).attendee.unreadMessages).toBe(3)
			expect(chatExtrasStore.getThread(token, 139).attendee.unreadMessages).toBe(0)
			expect(chatExtrasStore.getUnreadThreadsCount(token)).toBe(1)
		})

		it('pins the visual read marker to the value before the optimistic update', async () => {
			chatExtrasStore.addThread(token, threadInfo()) // lastReadMessage: 150, lastMessageId: 200
			setThreadReadMarker.mockResolvedValue(generateOCSResponse({ payload: threadInfo({ lastReadMessage: 200, unreadMessages: 0 }) }))

			await chatExtrasStore.updateThreadReadMarker(token, 138)

			// 視覚既読は楽観更新前の値(150)で確定し、既読が 200 まで進んでも動かない
			expect(vuexStore.getters.getVisualLastReadMessageId(token, 138)).toBe(150)

			// 設定済みなら上書きしない
			await chatExtrasStore.updateThreadReadMarker(token, 138, 199)
			expect(vuexStore.getters.getVisualLastReadMessageId(token, 138)).toBe(150)
		})

		it('waits for the same pending request when fetching a thread twice', async () => {
			let resolveRequest
			getSingleThreadForConversation.mockReturnValue(new Promise((resolve) => {
				resolveRequest = resolve
			}))

			const first = chatExtrasStore.fetchSingleThread(token, 138)
			const second = chatExtrasStore.fetchSingleThread(token, 138)

			// 2 回目は進行中の要求を待つ(API 応答前には解決しない)
			let secondResolved = false
			second.then(() => {
				secondResolved = true
			})
			await flushPromises()
			expect(secondResolved).toBe(false)

			resolveRequest(generateOCSResponse({ payload: threadInfo() }))
			await second

			expect(secondResolved).toBe(true)
			expect(getSingleThreadForConversation).toHaveBeenCalledTimes(1)
			// 2 回目の await の解決後は getThread() が入っている
			expect(chatExtrasStore.getThread(token, 138)).toBeDefined()

			await first
		})

		it('fetches an unknown thread first and pins the visual marker before the optimistic update', async () => {
			getSingleThreadForConversation.mockResolvedValue(generateOCSResponse({ payload: threadInfo() })) // lastReadMessage: 150
			setThreadReadMarker.mockResolvedValue(generateOCSResponse({ payload: threadInfo({ lastReadMessage: 200, unreadMessages: 0 }) }))

			await chatExtrasStore.updateThreadReadMarker(token, 138)

			expect(getSingleThreadForConversation).toHaveBeenCalledWith(token, 138)
			// 視覚既読は取得した(楽観更新前の)値で pin される
			expect(vuexStore.getters.getVisualLastReadMessageId(token, 138)).toBe(150)
			expect(chatExtrasStore.getThread(token, 138).attendee).toMatchObject({ lastReadMessage: 200, unreadMessages: 0 })
		})
	})
})
