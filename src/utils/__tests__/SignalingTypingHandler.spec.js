/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useActorStore } from '../../stores/actor.ts'
import piniaInstance from '../../stores/pinia.ts'
import { useTokenStore } from '../../stores/token.ts'
import SignalingTypingHandler from '../SignalingTypingHandler.js'

const participants = [
	{ nextcloudSessionId: 'my-session', signalingSessionId: 'sig-me' },
	{ nextcloudSessionId: 'other-session', signalingSessionId: 'sig-other' },
]

vi.mock('../SignalingParticipantList.js', () => ({
	default: vi.fn(function() {
		this.on = vi.fn()
		this.off = vi.fn()
		this.setSignaling = vi.fn()
		this.destroy = vi.fn()
		this.getParticipants = vi.fn(() => participants)
	}),
}))

describe('SignalingTypingHandler (acorns thread-aware)', () => {
	const TOKEN = 'XXTOKENXX'
	let store
	let signaling
	let handler

	beforeEach(() => {
		setActivePinia(createPinia())
		// acorns: SignalingTypingHandler は module singleton の pinia(../../stores/pinia.ts)
		// から actor / token store を読むので、そちらを設定する
		const actorStore = useActorStore(piniaInstance)
		actorStore.sessionId = 'my-session'
		const tokenStore = useTokenStore(piniaInstance)
		tokenStore.token = TOKEN
		// currentConversationIsJoined を true にする(現物の token.ts では
		// token !== '' かつ lastJoinedConversationToken === token のとき true)
		tokenStore.lastJoinedConversationToken = TOKEN

		store = { dispatch: vi.fn(), getters: { actorIsTyping: false, actorTypingThreadId: 0 } }
		signaling = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
		handler = new SignalingTypingHandler(store)
		handler.setSignaling(signaling)
	})

	test('sends threadId with startedTyping and stores own state with it', () => {
		handler.setTyping(true, 5)

		expect(signaling.emit).toHaveBeenCalledTimes(1)
		expect(signaling.emit).toHaveBeenCalledWith('message', { type: 'startedTyping', to: 'sig-other', threadId: 5 })
		expect(store.dispatch).toHaveBeenCalledWith('setTyping', { token: TOKEN, sessionId: 'my-session', typing: true, threadId: 5 })
	})

	test('defaults threadId to 0 when omitted', () => {
		handler.setTyping(true)
		expect(signaling.emit).toHaveBeenCalledWith('message', { type: 'startedTyping', to: 'sig-other', threadId: 0 })
	})

	test('received signal without threadId is treated as channel (0)', () => {
		handler._handleMessage({ type: 'startedTyping', from: 'sig-other' })
		expect(store.dispatch).toHaveBeenCalledWith('setTyping', { token: TOKEN, sessionId: 'other-session', typing: true, threadId: 0 })
	})

	test('received signal with threadId keeps it', () => {
		handler._handleMessage({ type: 'startedTyping', from: 'sig-other', threadId: 7 })
		expect(store.dispatch).toHaveBeenCalledWith('setTyping', { token: TOKEN, sessionId: 'other-session', typing: true, threadId: 7 })
	})

	test('re-sends startedTyping with own threadId to participants who joined', () => {
		store.getters.actorIsTyping = true
		store.getters.actorTypingThreadId = 5
		handler._handleParticipantsJoined(null, [{ nextcloudSessionId: 'new-session', signalingSessionId: 'sig-new' }])
		expect(signaling.emit).toHaveBeenCalledWith('message', { type: 'startedTyping', to: 'sig-new', threadId: 5 })
	})
})
