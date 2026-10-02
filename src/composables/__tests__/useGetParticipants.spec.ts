/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { StandaloneSignalingUpdateSession } from '../../types/index.ts'

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createStore } from 'vuex'
import router from '../../__mocks__/router.js'
import { EventBus } from '../../services/EventBus.ts'
import { useSessionStore } from '../../stores/session.ts'
import { useTokenStore } from '../../stores/token.ts'
import { useGetParticipants } from '../useGetParticipants.ts'

describe('useGetParticipants (acorns: 通話中に別の会話を表示)', () => {
	let fetchParticipants: ReturnType<typeof vi.fn>
	// acorns: useGetParticipants は createSharedComposable で包まれているので、
	// 各テストで Probe を unmount して購読者を 0 にし、次のテストで作り直させる
	let wrapper: ReturnType<typeof mount>

	beforeEach(async () => {
		setActivePinia(createPinia())
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		const tokenStore = useTokenStore()
		tokenStore.updateToken('Y')
		tokenStore.updateLastJoinedConversationToken('X')
		fetchParticipants = vi.fn()
		const store = createStore({
			getters: {
				conversation: () => () => ({ type: 2, permissions: 0, hasCall: true }),
				isInLobby: () => false,
				isModeratorOrUser: () => true,
				getParticipant: () => () => undefined,
				isInCall: () => () => false,
			},
			actions: { fetchParticipants: fetchParticipants as (...args: unknown[]) => unknown },
		})
		const Probe = defineComponent({
			setup() {
				useGetParticipants()
				return () => h('div')
			},
		})
		wrapper = mount(Probe, { global: { plugins: [router, store] } })
	})

	afterEach(() => {
		wrapper.unmount()
	})

	it('シグナリングの退出イベントは通話の会話 X に書く', () => {
		const sessionStore = useSessionStore()
		const spy = vi.spyOn(sessionStore, 'updateSessionsLeft')
		EventBus.emit('signaling-users-left', [['s1']])
		expect(spy).toHaveBeenCalledWith('X', ['s1'])
	})

	it('シグナリングの参加・変更イベントは通話の会話 X に書く', () => {
		const sessionStore = useSessionStore()
		const spy = vi.spyOn(sessionStore, 'updateSessions').mockReturnValue(false)
		EventBus.emit('signaling-users-changed', [[{ sessionId: 's1' }] as unknown as StandaloneSignalingUpdateSession[]])
		expect(spy).toHaveBeenCalledWith('X', [{ sessionId: 's1' }])
	})
})
