/*
 * SPDX-FileCopyrightText: 2021 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { cloneDeep } from 'es-toolkit'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { createStore, useStore } from 'vuex'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import LoadingPlaceholder from '../UIShared/LoadingPlaceholder.vue'
import MessagesGroup from './MessagesGroup/MessagesGroup.vue'
import MessagesSystemGroup from './MessagesGroup/MessagesSystemGroup.vue'
import MessagesList from './MessagesList.vue'
import router from '../../__mocks__/router.js'
import { THREAD_ID_INJECTION_KEY } from '../../composables/useGetThreadId.ts'
import { ATTENDEE, MESSAGE } from '../../constants.ts'
import storeConfig from '../../store/storeConfig.js'
import { useChatStore } from '../../stores/chat.ts'

vi.mock('vuex', async () => {
	const vuex = await vi.importActual('vuex')
	return {
		...vuex,
		useStore: vi.fn(),
	}
})

const contextMessageId = ref(0)
const loadingOldMessages = ref(0)
const loadingNewMessages = ref(0)
const isInitialisingMessages = ref(true)
const isChatBeginningReached = ref(0)
const isChatEndReached = ref(0)

vi.mock('../../composables/useGetMessages.ts', async () => {
	// acorns: shouldHandleRouteChange などの純関数は実物を使い、useGetMessages だけモックにする
	const actual = await vi.importActual('../../composables/useGetMessages.ts')
	return {
		...actual,
		useGetMessages: vi.fn(() => ({
			contextMessageId,
			loadingOldMessages,
			loadingNewMessages,
			isInitialisingMessages,
			isChatBeginningReached,
			isChatEndReached,

			getOldMessages: vi.fn(),
			getNewMessages: vi.fn(),
		})),
	}
})

const fakeTimestamp = (value) => new Date(value).getTime() / 1000

describe('MessagesList.vue', () => {
	const TOKEN = 'XXTOKENXX'
	let store
	let chatStore
	let testStoreConfig
	const getVisualLastReadMessageIdMock = vi.fn()

	// acorns: wrapper は使い捨てにする。マウント済み wrapper が残っていると、共有 ref
	// (isInitialisingMessages 等)の変化で後続テストの実行中に watcher が発火し、
	// scrollToFocusedMessage → focusMessage の console.warn が unhandled error になる
	enableAutoUnmount(afterEach)

	beforeEach(() => {
		setActivePinia(createPinia())
		testStoreConfig = cloneDeep(storeConfig)
		testStoreConfig.modules.messagesStore.getters.getVisualLastReadMessageId
			= vi.fn().mockReturnValue(getVisualLastReadMessageIdMock)
		store = createStore(testStoreConfig)
		useStore.mockReturnValue(store)

		chatStore = useChatStore()

		// scrollTo / scrollIntoView isn't implemented in JSDOM
		Element.prototype.scrollTo = () => {}
		Element.prototype.scrollIntoView = () => {}
	})

	afterEach(() => {
		vi.clearAllMocks()

		contextMessageId.value = 0
		loadingOldMessages.value = 0
		loadingNewMessages.value = 0
		isInitialisingMessages.value = true
		isChatBeginningReached.value = 0
		isChatEndReached.value = 0
	})

	const messagesGroup1 = [{
		id: 100,
		token: TOKEN,
		actorId: 'alice',
		actorDisplayName: 'Alice',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'hello',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:05:00'),
		isReplyable: true,
		reactions: {},
	}, {
		id: 110,
		token: TOKEN,
		actorId: 'alice',
		actorDisplayName: 'Alice',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'how are you ?',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:06:00'),
		isReplyable: true,
		reactions: {},
	}]

	const messagesGroup1OldMessage = {
		id: 90,
		token: TOKEN,
		actorId: 'alice',
		actorDisplayName: 'Alice',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'old hello',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:04:00'),
		isReplyable: true,
		reactions: {},
	}
	const messagesGroup1WithOld = [messagesGroup1OldMessage].concat(messagesGroup1)

	const messagesGroup2 = [{
		id: 200,
		token: TOKEN,
		actorId: 'bob',
		actorDisplayName: 'Bob',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'hello!',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:30:00'),
		isReplyable: true,
		reactions: {},
	}, {
		id: 210,
		token: TOKEN,
		actorId: 'bob',
		actorDisplayName: 'Bob',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'fine... how about you ?',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:31:00'),
		isReplyable: true,
		reactions: {},
	}]

	const messagesGroup2NewMessage = {
		id: 220,
		token: TOKEN,
		actorId: 'bob',
		actorDisplayName: 'Bob',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'hello?',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: fakeTimestamp('2024-05-01T12:32:00'),
		isReplyable: true,
		reactions: {},
	}
	const messagesGroup2WithNew = messagesGroup2.concat([messagesGroup2NewMessage])

	const messagesGroup3 = [{
		id: 'temp-300',
		token: TOKEN,
		actorId: 'alice',
		actorDisplayName: 'Alice',
		actorType: ATTENDEE.ACTOR_TYPE.USERS,
		message: 'fine as well, thanks!',
		messageType: MESSAGE.TYPE.COMMENT,
		messageParameters: [],
		systemMessage: '',
		timestamp: 0, // temporary
		isReplyable: true,
		reactions: {},
	}]

	function mountMessagesList() {
		return mount(MessagesList, {
			global: {
				plugins: [router, store],
			},
			props: {
				token: TOKEN,
				isChatScrolledToBottom: true,
			},
		})
	}

	describe('message grouping', () => {
		/**
		 * @param {Array} messagesGroups List of messages that should be grouped
		 */
		function testGrouped(...messagesGroups) {
			store.commit('addConversation', {
				token: TOKEN,
				hasCall: false,
			})
			messagesGroups.flat().forEach((message) => store.commit('addMessage', { token: TOKEN, message }))
			chatStore.processChatBlocks(TOKEN, messagesGroups.flat())
			isInitialisingMessages.value = false

			const wrapper = mountMessagesList()

			const groups = wrapper.findAllComponents('li.wrapper')
			groups.forEach((group, index) => {
				expect(group.props('messages')).toStrictEqual(messagesGroups[index])
			})

			return { wrapper, groups }
		}

		/**
		 * @param {Array} messages List of messages that should not be grouped
		 */
		function testNotGrouped(messages) {
			store.commit('addConversation', {
				token: TOKEN,
				hasCall: false,
			})
			messages.forEach((message) => store.commit('addMessage', { token: TOKEN, message }))
			chatStore.processChatBlocks(TOKEN, messages)
			isInitialisingMessages.value = false

			const wrapper = mountMessagesList()

			const groups = wrapper.findAll('.messages-group')
			groups.forEach((group, index) => {
				expect(group.props('messages')).toStrictEqual([messages[index]])
			})

			return { wrapper, groups }
		}

		test('groups consecutive messages by author', () => {
			const { groups } = testGrouped(messagesGroup1, messagesGroup2, messagesGroup3)

			expect(groups.at(0).props('previousMessageId')).toBe(0)
			expect(groups.at(0).props('nextMessageId')).toBe(200)

			expect(groups.at(1).props('previousMessageId')).toBe(110)
			expect(groups.at(1).props('nextMessageId')).toBe('temp-300')

			expect(groups.at(2).props('previousMessageId')).toBe(210)
			expect(groups.at(2).props('nextMessageId')).toBe(0)
		})

		test('displays a date separator between days', () => {
			vi.useFakeTimers().setSystemTime(new Date('2020-05-11T13:00:00'))

			const { wrapper } = testNotGrouped([{
				id: 100,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'hello',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2019-09-14T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'no one here ?',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2020-05-10T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 'temp-120',
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'seems no one is there...',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: 0, // temporary, matches current date
				isReplyable: true,
				reactions: {},
			}])

			const dateSeparators = wrapper.findAll('.messages-date')
			expect(dateSeparators).toHaveLength(3)
			expect(dateSeparators.at(0).text()).toBe('September 14, 2019')
			expect(dateSeparators.at(1).text()).toBe('yesterday, May 10')
			expect(dateSeparators.at(2).text()).toBe('today, May 11')
		})

		test('groups system messages with each other', () => {
			testGrouped([{
				id: 100,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'Alice has entered the call',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: 'call_started',
				timestamp: fakeTimestamp('2020-05-09T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'Alice has exited the call',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: 'call_ended',
				timestamp: fakeTimestamp('2020-05-09T13:02:00'),
				isReplyable: true,
				reactions: {},
			}])
		})

		test('does not group system messages with regular messages from the same author', () => {
			testNotGrouped([{
				id: 100,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'Alice has entered the call',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: 'call_started',
				timestamp: fakeTimestamp('2020-05-09T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'hello',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2020-05-09T13:02:00'),
				isReplyable: true,
				reactions: {},
			}])
		})

		test('groups messages of changelog bot', () => {
			testGrouped([{
				id: 100,
				token: TOKEN,
				actorId: ATTENDEE.CHANGELOG_BOT_ID,
				actorDisplayName: 'Talk updates \u2705',
				actorType: ATTENDEE.ACTOR_TYPE.BOTS,
				message: 'New in Talk 16',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2020-05-09T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: ATTENDEE.CHANGELOG_BOT_ID,
				actorDisplayName: 'Talk updates \u2705',
				actorType: ATTENDEE.ACTOR_TYPE.BOTS,
				message: '- Calls can now be recorded',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2020-05-09T13:02:00'),
				isReplyable: true,
				reactions: {},
			}])
		})

		test('does not group messages with different actor types', () => {
			testNotGrouped([{
				id: 100,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'Alice has entered the call',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: 'call_started',
				timestamp: fakeTimestamp('2020-05-09T13:00:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.GUESTS,
				message: 'hello',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2020-05-09T13:02:00'),
				isReplyable: true,
				reactions: {},
			}])
		})

		test('does not group edited messages', () => {
			testNotGrouped([{
				id: 100,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: 'hello',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2024-05-01T12:05:00'),
				isReplyable: true,
				reactions: {},
			}, {
				id: 110,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				lastEditActorType: ATTENDEE.ACTOR_TYPE.USERS,
				lastEditActorId: 'alice',
				lastEditActorDisplayName: 'Alice',
				lastEditTimestamp: fakeTimestamp('2024-05-01T12:07:00'),
				message: 'how are you doing?',
				messageType: MESSAGE.TYPE.COMMENT,
				messageParameters: [],
				systemMessage: '',
				timestamp: fakeTimestamp('2024-05-01T12:06:00'),
				isReplyable: true,
				reactions: {},
			}])
		})
	})

	describe('message rendering', () => {
		vi.useFakeTimers().setSystemTime(new Date('2024-05-01T17:00:00'))
		/**
		 *
		 * @param {Array} messagesGroups initial messages groups
		 */
		function renderMessagesList(...messagesGroups) {
			store.commit('addConversation', {
				token: TOKEN,
				hasCall: false,
			})
			messagesGroups.flat().forEach((message) => store.commit('addMessage', { token: TOKEN, message }))
			chatStore.processChatBlocks(TOKEN, messagesGroups.flat())
			isInitialisingMessages.value = false
			return mountMessagesList()
		}

		test('renders a placeholder while loading', () => {
			const wrapper = mountMessagesList()

			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups).toHaveLength(0)

			const placeholder = wrapper.findComponent(LoadingPlaceholder)
			expect(placeholder.exists()).toBe(true)
		})

		test('renders an empty content after loading', () => {
			store.commit('loadedMessagesOfConversation', { token: TOKEN })
			isInitialisingMessages.value = false

			const wrapper = mountMessagesList()

			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups).toHaveLength(0)

			const placeholder = wrapper.findComponent(NcEmptyContent)
			expect(placeholder.exists()).toBe(true)
		})

		test('renders initial group of messages', () => {
			// Act
			const wrapper = renderMessagesList(messagesGroup1)
			const groups = wrapper.findAllComponents(MessagesGroup)

			// Assert: groups are rendered
			expect(groups.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup1,
				previousMessageId: 0,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (add new group)', async () => {
			// Arrange
			const wrapper = renderMessagesList(messagesGroup1)

			// Act: add new group to the store
			messagesGroup2.forEach((message) => store.commit('addMessage', { token: TOKEN, message }))
			chatStore.processChatBlocks(TOKEN, messagesGroup2, { mergeBy: 100 })
			isInitialisingMessages.value = false
			await wrapper.vm.$nextTick()

			// Assert: old group nextMessageId is updated, new group is added
			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup1,
				previousMessageId: 0,
				nextMessageId: 200,
			})

			expect(groups.at(1).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup2,
				previousMessageId: 110,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (add messages to existing groups)', async () => {
			// Arrange
			const wrapper = renderMessagesList(messagesGroup1, messagesGroup2)

			// Act: add new messages to the store
			store.commit('addMessage', { token: TOKEN, message: messagesGroup1OldMessage })
			store.commit('addMessage', { token: TOKEN, message: messagesGroup2NewMessage })
			chatStore.processChatBlocks(TOKEN, [messagesGroup1OldMessage], { mergeBy: 100 })
			chatStore.processChatBlocks(TOKEN, [messagesGroup2NewMessage], { mergeBy: 100 })
			isInitialisingMessages.value = false
			await wrapper.vm.$nextTick()

			// Assert: both groups are updated
			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups.length).toBe(2)
			expect(groups.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup1WithOld,
				previousMessageId: 0,
				nextMessageId: 200,
			})

			expect(groups.at(1).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup2WithNew,
				previousMessageId: 110,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (replace temporary message in separate group)', async () => {
			// Arrange
			const wrapper = renderMessagesList(messagesGroup1, messagesGroup3)

			// Act: replace temporary message with returned from server
			const message = {
				...messagesGroup3[0],
				id: 300,
				timestamp: fakeTimestamp('2024-05-01T13:00:00'),
			}
			store.commit('deleteMessage', { token: TOKEN, id: messagesGroup3[0].id })
			store.commit('addMessage', { token: TOKEN, message })
			chatStore.processChatBlocks(TOKEN, [message], { mergeBy: 100 })
			await wrapper.vm.$nextTick()

			// Assert: old group nextMessageId is updated, new group is added
			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups.length).toBe(2)
			expect(groups.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup1,
				previousMessageId: 0,
				nextMessageId: 300,
			})

			expect(groups.at(1).props()).toMatchObject({
				token: TOKEN,
				messages: [message],
				previousMessageId: 110,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (replace temporary message in same group)', async () => {
			// Arrange
			const messagesGroup2WithTemp = [messagesGroup2[0], {
				...messagesGroup2[1],
				id: 'temp-210',
				timestamp: 0, // temporary
			}]
			const wrapper = renderMessagesList(messagesGroup1, messagesGroup2WithTemp)

			// Act: replace temporary message with returned from server
			store.commit('deleteMessage', { token: TOKEN, id: 'temp-210' })
			store.commit('addMessage', { token: TOKEN, message: messagesGroup2[1] })
			chatStore.processChatBlocks(TOKEN, [messagesGroup2[1]], { mergeBy: 100 })

			await wrapper.vm.$nextTick()

			// Assert: old group nextMessageId is updated, new group is added
			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups.length).toBe(2)

			expect(groups.at(1).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup2,
				previousMessageId: 110,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (clear history)', async () => {
			// Arrange
			const wrapper = renderMessagesList(messagesGroup1, messagesGroup2)

			// Act: imitate clearing of history
			const message = {
				id: 400,
				token: TOKEN,
				actorId: 'alice',
				actorDisplayName: 'Alice',
				actorType: ATTENDEE.ACTOR_TYPE.USERS,
				message: '{actor} cleared the history of the conversation',
				messageType: MESSAGE.TYPE.SYSTEM,
				messageParameters: [],
				systemMessage: 'history_cleared',
				timestamp: fakeTimestamp('2024-05-01T13:00:00'),
				isReplyable: false,
				reactions: {},
			}
			store.commit('purgeMessagesStore', TOKEN)
			store.commit('addMessage', { token: TOKEN, message })
			chatStore.processChatBlocks(TOKEN, [message], { mergeBy: 100 })

			await wrapper.vm.$nextTick()

			// Assert: old messages are removed, system message is added
			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups).toHaveLength(0)
			const groupsSystem = wrapper.findAllComponents(MessagesSystemGroup)
			expect(groupsSystem.length).toBe(1)
			expect(groupsSystem.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: [message],
				previousMessageId: 0,
				nextMessageId: 0,
			})
		})

		test('updates rendered list of messages (remove messages from existing groups)', async () => {
			// Arrange
			const wrapper = renderMessagesList(messagesGroup1WithOld, messagesGroup2WithNew)

			// Act: remove some messages from the store
			store.commit('deleteMessage', { token: TOKEN, id: messagesGroup1OldMessage.id })
			store.commit('deleteMessage', { token: TOKEN, id: messagesGroup2NewMessage.id })
			await wrapper.vm.$nextTick()

			const groups = wrapper.findAllComponents(MessagesGroup)
			expect(groups.length).toBe(2)
			expect(groups.at(0).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup1,
				previousMessageId: 0,
				nextMessageId: 200,
			})

			expect(groups.at(1).props()).toMatchObject({
				token: TOKEN,
				messages: messagesGroup2,
				previousMessageId: 110,
				nextMessageId: 0,
			})
		})
	})

	describe('scrollToFocusedMessage', () => {
		beforeEach(async () => {
			// スレッド表示(?threadId=138)を再現
			await router.push({ path: '/call/' + TOKEN, query: { threadId: '138' } })
			// フォールバック位置は常に 105 が見つかるものとする
			testStoreConfig.modules.messagesStore.getters.getFirstDisplayableMessageIdBeforeReadMarker
				= vi.fn().mockReturnValue(() => 105)
			store = createStore(testStoreConfig)
			useStore.mockReturnValue(store)
			store.commit('addConversation', { token: TOKEN, hasCall: false })
		})

		afterEach(async () => {
			await router.push({ path: '/call/' + TOKEN })
		})

		test('does not write fallback position as visual read marker when it is not determined yet (thread view)', async () => {
			// スレッド情報の GET 未着で視覚既読が null
			getVisualLastReadMessageIdMock.mockReturnValue(null)
			const wrapper = mountMessagesList()
			const dispatchSpy = vi.spyOn(store, 'dispatch')
			// フォールバック位置へのフォーカス自体は成功したとする
			wrapper.vm.focusMessage = vi.fn().mockReturnValue(true)

			wrapper.vm.scrollToFocusedMessage()

			// 視覚既読が未確定のとき、フォールバック位置を既読位置として書き込まない
			expect(dispatchSpy).not.toHaveBeenCalledWith('setVisualLastReadMessageId', expect.anything())
		})

		test('writes fallback position as visual read marker when it is already set (existing behavior)', async () => {
			getVisualLastReadMessageIdMock.mockReturnValue(100)
			const wrapper = mountMessagesList()
			const dispatchSpy = vi.spyOn(store, 'dispatch')
			// 既読位置のメッセージは見つからず、フォールバック位置へのフォーカスは成功
			wrapper.vm.focusMessage = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)

			wrapper.vm.scrollToFocusedMessage()

			expect(dispatchSpy).toHaveBeenCalledWith('setVisualLastReadMessageId', {
				token: TOKEN,
				threadId: 138,
				id: 105,
			})
		})
	})

	describe('getMessageElement', () => {
		test('finds only elements inside own scroller even when the same id exists outside', () => {
			store.commit('addConversation', {
				token: TOKEN,
				hasCall: false,
			})
			messagesGroup1.forEach((message) => store.commit('addMessage', { token: TOKEN, message }))
			chatStore.processChatBlocks(TOKEN, messagesGroup1)
			isInitialisingMessages.value = false
			const wrapper = mountMessagesList()

			// acorns: メイン一覧に同じ id の要素がある状況(ペインからのグローバル検索で誤爆しないこと)
			const outsideElement = document.createElement('div')
			outsideElement.id = 'message_100'
			document.body.appendChild(outsideElement)

			try {
				const innerElement = wrapper.vm.$refs.scroller.querySelector('#message_100')
				expect(innerElement).not.toBeNull()
				expect(wrapper.vm.getMessageElement(100)).toBe(innerElement)
				// scroller 内に存在しない id は、外側にあっても拾わない
				const outsideOnly = document.createElement('div')
				outsideOnly.id = 'message_999'
				document.body.appendChild(outsideOnly)
				expect(wrapper.vm.getMessageElement(999)).toBeNull()
				document.body.removeChild(outsideOnly)
			} finally {
				document.body.removeChild(outsideElement)
			}
		})
	})

	describe('getMessageIdFromHash', () => {
		afterEach(async () => {
			await router.push({ path: '/call/' + TOKEN })
		})

		/**
		 * Mount as a given instance (0 = channel main list, >0 = thread pane)
		 *
		 * @param {number} threadId threadId of this MessagesList instance
		 */
		function mountMessagesListAs(threadId) {
			return mount(MessagesList, {
				global: {
					plugins: [router, store],
					provide: {
						[THREAD_ID_INJECTION_KEY]: ref(threadId),
					},
				},
				props: {
					token: TOKEN,
					isChatScrolledToBottom: true,
				},
			})
		}

		test('reads #message_M from hash only when URL threadId matches own threadId', async () => {
			// acorns: 通知リンク ?threadId=285#message_303 の hash はペインのもの。
			// メイン(threadId=0)が読むと、チャンネルに存在しない id を探してフォールバック無しで終わる
			await router.push({ path: '/call/' + TOKEN, query: { threadId: '285' }, hash: '#message_303' })
			let wrapper = mountMessagesListAs(0)
			expect(wrapper.vm.getMessageIdFromHash()).toBeNull()
			wrapper.unmount()

			// threadId 無し + hash ならメインが読む
			await router.push({ path: '/call/' + TOKEN, hash: '#message_303' })
			wrapper = mountMessagesListAs(0)
			expect(wrapper.vm.getMessageIdFromHash()).toBe(303)
			wrapper.unmount()

			// ペイン(285)は自分宛の hash を読む
			await router.push({ path: '/call/' + TOKEN, query: { threadId: '285' }, hash: '#message_303' })
			wrapper = mountMessagesListAs(285)
			expect(wrapper.vm.getMessageIdFromHash()).toBe(303)
		})
	})
})
