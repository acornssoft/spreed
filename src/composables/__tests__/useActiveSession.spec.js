/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createStore } from 'vuex'
import router from '../../__mocks__/router.js'
import { EventBus } from '../../services/EventBus.ts'
import { setSessionState } from '../../services/participantsService.js'
import SessionStorage from '../../services/SessionStorage.js'
import { useActiveSession } from '../useActiveSession.js'

vi.mock('../../services/participantsService.js', () => ({
	setSessionState: vi.fn(() => Promise.reject({ response: { status: 404 } })),
}))
vi.mock('../../services/CapabilitiesManager.ts', async (importOriginal) => ({
	...(await importOriginal()),
	hasTalkFeature: vi.fn(() => true),
}))

/**
 * @param {string[]} inCallTokens 通話中として扱う token
 */
function mountWithStore(inCallTokens) {
	const joinConversation = vi.fn()
	const store = createStore({
		getters: {
			isInCall: () => (token) => inCallTokens.includes(token),
		},
		actions: { joinConversation },
	})
	const Probe = defineComponent({
		setup() {
			useActiveSession()
			return () => h('div')
		},
	})
	mount(Probe, { global: { plugins: [router, store] } })
	return { joinConversation }
}

describe('useActiveSession (acorns: 通話中に別の会話を表示)', () => {
	beforeEach(async () => {
		vi.useFakeTimers()
		setActivePinia(createPinia())
		vi.mocked(setSessionState).mockClear()
		SessionStorage.setItem('joined_conversation', 'X')
		EventBus.emit('joined-conversation', { token: 'X' })
		await router.push({ name: 'conversation', params: { token: 'Y' } })
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('X で通話中に Y を表示していると、非アクティブ化も自動入室もしない', async () => {
		const { joinConversation } = mountWithStore(['X'])
		window.dispatchEvent(new Event('blur'))
		await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 10)
		expect(setSessionState).not.toHaveBeenCalled()
		expect(joinConversation).not.toHaveBeenCalled()
	})

	it('通話していなければ従来どおり 404 で入室し直す', async () => {
		// acorns: 404 は意図的に起こすエラー経路。test-setup が console.error を throw に変えるため抑制する
		// (repo の既存テスト conversationTags.spec.js / actor.spec.js と同じやり方)
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const { joinConversation } = mountWithStore([])
		window.dispatchEvent(new Event('blur'))
		await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 10)
		expect(setSessionState).toHaveBeenCalledWith('Y', expect.anything())
		expect(joinConversation).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})
})
