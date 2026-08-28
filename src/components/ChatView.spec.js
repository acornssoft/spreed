/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { createStore } from 'vuex'
import ChatView from './ChatView.vue'
import { useGetMessagesProvider } from '../composables/useGetMessages.ts'

vi.mock('../composables/useGetMessages.ts', () => ({
	useGetMessagesProvider: vi.fn(),
}))

vi.mock('../composables/useGetToken.ts', () => ({
	useGetToken: vi.fn(() => ref('XXTOKENXX')),
}))

vi.mock('../composables/useGetThreadId.ts', () => ({
	useGetThreadId: vi.fn(() => ref(0)),
}))

vi.mock('../services/CapabilitiesManager.ts', () => ({
	getTalkConfig: vi.fn(() => false),
	hasTalkFeature: vi.fn(() => false),
}))

describe('ChatView.vue (acorns)', () => {
	const TOKEN = 'XXTOKENXX'
	let store

	beforeEach(() => {
		setActivePinia(createPinia())
		vi.clearAllMocks()

		store = createStore({
			getters: {
				conversation: () => () => ({
					token: TOKEN,
					permissions: 0,
					readOnly: 0,
					hasCall: false,
					objectType: '',
					remoteServer: '',
				}),
				isMessagesListPopulated: () => () => true,
			},
		})
	})

	// acorns: provide('chatView:isSidebar') は同一 setup 内の inject から見えないため、
	// isSidebar は props から引数で渡す必要がある(回帰防止)
	test.each([[false], [true]])('passes isSidebar=%s to useGetMessagesProvider', (isSidebar) => {
		shallowMount(ChatView, {
			props: { isSidebar },
			global: { plugins: [store] },
		})

		expect(useGetMessagesProvider).toHaveBeenCalledWith({ isSidebar })
	})
})
