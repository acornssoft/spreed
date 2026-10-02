/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTokenStore } from '../token.ts'

describe('tokenStore.signalingToken', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('シグナリングの部屋があればそれを返す(表示中の会話と違っても)', () => {
		const tokenStore = useTokenStore()
		tokenStore.updateToken('Y')
		tokenStore.updateLastJoinedConversationToken('X')
		expect(tokenStore.signalingToken).toBe('X')
	})

	it('シグナリングの部屋が無ければ表示中の会話を返す', () => {
		const tokenStore = useTokenStore()
		tokenStore.updateToken('Y')
		tokenStore.updateLastJoinedConversationToken('')
		expect(tokenStore.signalingToken).toBe('Y')
	})
})
