/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { createStore } from 'vuex'
import router from '../../__mocks__/router.js'
import { PARTICIPANT, WEBINAR } from '../../constants.ts'
import { EventBus } from '../../services/EventBus.ts'
import SessionStorage from '../../services/SessionStorage.js'
import { useActorStore } from '../../stores/actor.ts'
import { callSwitchInProgress } from '../useCallToken.ts'
import { useMinimizedCallLifecycle } from '../useMinimizedCallLifecycle.ts'

/**
 * 通話状態を外から切り替えられる store で mount する
 */
function setup() {
	const state = reactive({ inCall: ['X'] as string[] })
	const conversations = reactive<Record<string, Record<string, number>>>({
		X: { lobbyState: WEBINAR.LOBBY.NONE, participantType: PARTICIPANT.TYPE.USER, permissions: 0, attributes: 0 },
	})
	const leaveConversation = vi.fn()
	const joinConversation = vi.fn()
	const leaveCall = vi.fn()
	const store = createStore({
		getters: {
			isInCall: () => (token: string) => state.inCall.includes(token),
			conversation: () => (token: string) => conversations[token],
		},
		actions: { leaveConversation, joinConversation, leaveCall },
	})
	const Probe = defineComponent({
		setup() {
			useMinimizedCallLifecycle()
			return () => h('div')
		},
	})
	mount(Probe, { global: { plugins: [router, store] } })
	return { state, conversations, leaveConversation, joinConversation, leaveCall }
}

describe('useMinimizedCallLifecycle', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		useActorStore().userId = 'alice'
		callSwitchInProgress.value = false
		SessionStorage.setItem('joined_conversation', 'X')
		EventBus.emit('joined-conversation', { token: 'X' })
	})

	it('Y を表示中に X の通話が終わったら、X から退出して Y に入る', async () => {
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		const { state, leaveConversation, joinConversation } = setup()
		state.inCall = []
		await nextTick()
		await nextTick()
		expect(leaveConversation).toHaveBeenCalledWith(expect.anything(), { token: 'X' })
		expect(joinConversation).toHaveBeenCalledWith(expect.anything(), { token: 'Y' })
	})

	it('X を表示中に通話が終わったら何もしない(従来どおり X に残る)', async () => {
		await router.push({ name: 'conversation', params: { token: 'X' } })
		const { state, leaveConversation, joinConversation } = setup()
		state.inCall = []
		await nextTick()
		expect(leaveConversation).not.toHaveBeenCalled()
		expect(joinConversation).not.toHaveBeenCalled()
	})

	it('会話以外のルートで通話が終わったら、X から退出するだけ', async () => {
		await router.push({ name: 'root' })
		const { state, leaveConversation, joinConversation } = setup()
		state.inCall = []
		await nextTick()
		await nextTick()
		expect(leaveConversation).toHaveBeenCalledWith(expect.anything(), { token: 'X' })
		expect(joinConversation).not.toHaveBeenCalled()
	})

	it('Y を表示中に X がロビー化したら(自分はモデレーターでない)、X の通話から抜ける', async () => {
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		const { conversations, leaveCall } = setup()
		conversations.X.lobbyState = WEBINAR.LOBBY.NON_MODERATORS
		await nextTick()
		expect(leaveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: 'X' }))
	})

	it('X がロビー化しても自分がモデレーターなら抜けない', async () => {
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		const { conversations, leaveCall } = setup()
		conversations.X.participantType = PARTICIPANT.TYPE.MODERATOR
		conversations.X.lobbyState = WEBINAR.LOBBY.NON_MODERATORS
		await nextTick()
		expect(leaveCall).not.toHaveBeenCalled()
	})

	it('通話の移し替え中は何もしない(移し替えの処理が自分で入室する)', async () => {
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		const { state, leaveConversation } = setup()
		callSwitchInProgress.value = true
		state.inCall = []
		await nextTick()
		expect(leaveConversation).not.toHaveBeenCalled()
	})
})
