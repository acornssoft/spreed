/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createStore } from 'vuex'
import SessionStorage from '../../services/SessionStorage.js'
import { useTokenStore } from '../../stores/token.ts'
import { callSwitchInProgress } from '../useCallToken.ts'
import { useJoinCall } from '../useJoinCall.ts'

vi.mock('@nextcloud/vue/functions/dialog', () => ({
	spawnDialog: vi.fn<() => Promise<unknown>>(),
}))

// acorns: spawnDialog の型は ConfirmDialog の close ペイロードを never に推論するので、
// テストでは解決値を unknown として扱えるようにする
const spawnDialogMock = spawnDialog as unknown as ReturnType<typeof vi.fn<() => Promise<unknown>>>

/**
 * @param inCall 通話中として扱う token
 */
function setup(inCall: string[]) {
	const calls: string[] = []
	const store = createStore({
		getters: {
			isInCall: () => (token: string) => inCall.includes(token),
			conversation: () => (token: string) => ({ token, displayName: token === 'X' ? 'Sales' : 'Dev' }),
		},
		actions: {
			leaveConversation: (_, { token }) => {
				calls.push('leave:' + token)
				inCall.splice(0)
			},
			joinConversation: (_, { token }) => {
				calls.push('join:' + token)
				useTokenStore().updateLastJoinedConversationToken(token)
			},
		},
	})
	let api: ReturnType<typeof useJoinCall>
	const Probe = defineComponent({
		setup() {
			api = useJoinCall()
			return () => h('div')
		},
	})
	mount(Probe, { global: { plugins: [store] } })
	return { api: api!, calls }
}

describe('useJoinCall.ensureNoOtherCall', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.mocked(spawnDialogMock).mockReset()
		callSwitchInProgress.value = false
		SessionStorage.setItem('joined_conversation', 'X')
	})

	it('通話していなければ確認せず続行', async () => {
		const { api, calls } = setup([])
		expect(await api.ensureNoOtherCall('Y')).toBe(true)
		expect(spawnDialog).not.toHaveBeenCalled()
		expect(calls).toEqual([])
	})

	it('同じ会話の通話なら確認せず続行', async () => {
		const { api } = setup(['X'])
		expect(await api.ensureNoOtherCall('X')).toBe(true)
		expect(spawnDialog).not.toHaveBeenCalled()
	})

	it('別の会話で通話中なら確認し、取り消したら何もしない', async () => {
		spawnDialogMock.mockResolvedValue(undefined)
		const { api, calls } = setup(['X'])
		expect(await api.ensureNoOtherCall('Y')).toBe(false)
		expect(calls).toEqual([])
	})

	it('了承したら X を出て Y に入り、シグナリングが Y に移るのを待ってから続行', async () => {
		spawnDialogMock.mockResolvedValue(true)
		const { api, calls } = setup(['X'])
		expect(await api.ensureNoOtherCall('Y')).toBe(true)
		expect(calls).toEqual(['leave:X', 'join:Y'])
		expect(callSwitchInProgress.value).toBe(false)
	})
})
