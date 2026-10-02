/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createStore } from 'vuex'
import router from '../../__mocks__/router.js'
import { CONVERSATION } from '../../constants.ts'
import { EventBus } from '../../services/EventBus.ts'
import SessionStorage from '../../services/SessionStorage.js'
import { useActorStore } from '../../stores/actor.ts'
import { getOngoingCallToken, useCallToken, useCanBrowseDuringCall, useIsCallMinimized } from '../useCallToken.ts'

/**
 * @param inCallTokens 通話中として扱う token
 * @param conversations token -> 会話オブジェクト
 */
function makeStore(inCallTokens: string[], conversations: Record<string, object> = {}) {
	return createStore({
		getters: {
			isInCall: () => (token: string) => inCallTokens.includes(token),
			conversation: () => (token: string) => conversations[token],
		},
	})
}

/**
 * @param store vuex store
 */
function mountProbe(store: ReturnType<typeof makeStore>) {
	const captured: Record<string, { value: unknown }> = {}
	const Probe = defineComponent({
		setup() {
			captured.callToken = useCallToken()
			captured.canBrowse = useCanBrowseDuringCall()
			captured.isMinimized = useIsCallMinimized()
			return () => h('div')
		},
	})
	mount(Probe, { global: { plugins: [router, store] } })
	return captured
}

describe('useCallToken / useIsCallMinimized', () => {
	beforeEach(async () => {
		setActivePinia(createPinia())
		useActorStore().userId = 'alice'
		SessionStorage.setItem('joined_conversation', 'X')
		EventBus.emit('joined-conversation', { token: 'X' })
		await router.push({ name: 'conversation', params: { token: 'Y' } })
	})

	it('入室中の会話で通話していれば、その token を返す', () => {
		const captured = mountProbe(makeStore(['X'], { X: { attributes: 0 } }))
		expect(captured.callToken.value).toBe('X')
	})

	it('入室中の会話で通話していなければ空', () => {
		const captured = mountProbe(makeStore([], { X: { attributes: 0 } }))
		expect(captured.callToken.value).toBe('')
		expect(captured.isMinimized.value).toBe(false)
	})

	it('通話中に別の会話を表示していれば小窓', () => {
		const captured = mountProbe(makeStore(['X'], { X: { attributes: 0 } }))
		expect(captured.canBrowse.value).toBe(true)
		expect(captured.isMinimized.value).toBe(true)
	})

	it('通話の会話を表示していれば小窓でない', async () => {
		await router.push({ name: 'conversation', params: { token: 'X' } })
		const captured = mountProbe(makeStore(['X'], { X: { attributes: 0 } }))
		await nextTick()
		expect(captured.isMinimized.value).toBe(false)
	})

	it('会話以外のルートでも小窓', async () => {
		await router.push({ name: 'root' })
		const captured = mountProbe(makeStore(['X'], { X: { attributes: 0 } }))
		await nextTick()
		expect(captured.isMinimized.value).toBe(true)
	})

	it('ボイスルームの通話は見て回れない', () => {
		const captured = mountProbe(makeStore(['X'], { X: { attributes: CONVERSATION.ATTRIBUTE.VOICE_ROOM } }))
		expect(captured.canBrowse.value).toBe(false)
		expect(captured.isMinimized.value).toBe(false)
	})

	it('ゲストは見て回れない', () => {
		useActorStore().userId = null
		const captured = mountProbe(makeStore(['X'], { X: { attributes: 0 } }))
		expect(captured.canBrowse.value).toBe(false)
	})

	it('getOngoingCallToken はコンポーネント外でも同じ判定', () => {
		expect(getOngoingCallToken(makeStore(['X']))).toBe('X')
		expect(getOngoingCallToken(makeStore([]))).toBe('')
	})
})
