/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { flushPromises, shallowMount } from '@vue/test-utils'
import { cloneDeep } from 'es-toolkit'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createStore } from 'vuex'
import RightSidebar from './RightSidebar.vue'
import router from '../../__mocks__/router.js'
import storeConfig from '../../store/storeConfig.js'
import { useSidebarStore } from '../../stores/sidebar.ts'

describe('RightSidebar.vue (thread pane state)', () => {
	const TOKEN = 'XXTOKENXX'
	let store
	let sidebarStore

	beforeEach(async () => {
		setActivePinia(createPinia())
		store = createStore(cloneDeep(storeConfig))
		sidebarStore = useSidebarStore()
		sidebarStore.show = false
		await router.push({ path: '/call/' + TOKEN })
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		await router.push({ path: '/call/' + TOKEN })
	})

	/**
	 * Shared function to mount component
	 */
	function mountRightSidebar() {
		return shallowMount(RightSidebar, {
			global: {
				plugins: [router, store],
			},
			props: {
				isInCall: false,
			},
		})
	}

	test('enters thread state and opens the sidebar without cache when route threadId appears', async () => {
		const wrapper = mountRightSidebar()
		const showSidebarSpy = vi.spyOn(sidebarStore, 'showSidebar')

		// acorns: routeThreadId 0 -> 138 (設計書 §4.3)。showSidebar はユーザーの「サイドバー閉」設定を
		// 上書きしないよう cache: false で呼ばれる
		await router.push({ path: '/call/' + TOKEN, query: { threadId: '138' } })
		await flushPromises()

		expect(showSidebarSpy).toHaveBeenCalledWith({ cache: false })
		expect(wrapper.vm.contentState).toBe('thread')
	})

	test('closing the sidebar removes threadId from the URL', async () => {
		await router.push({ path: '/call/' + TOKEN, query: { threadId: '138' } })
		const wrapper = mountRightSidebar()
		await flushPromises()
		const replaceSpy = vi.spyOn(router, 'replace').mockImplementation(() => Promise.resolve())

		wrapper.vm.handleUpdateOpen(false)

		// acorns: × で閉じたらスレッドも閉じる。hash はスレッド内メッセージを指すので一緒に消す(D6)
		expect(replaceSpy).toHaveBeenCalledWith({ query: { threadId: undefined }, hash: '' })
	})

	test('leaving thread state delegates to the route watcher instead of changing contentState directly', async () => {
		await router.push({ path: '/call/' + TOKEN, query: { threadId: '138' } })
		const wrapper = mountRightSidebar()
		await flushPromises()
		expect(wrapper.vm.contentState).toBe('thread')
		const replaceSpy = vi.spyOn(router, 'replace').mockImplementation(() => Promise.resolve())

		wrapper.vm.handleUpdateState('default')

		expect(replaceSpy).toHaveBeenCalledWith({ query: { threadId: undefined }, hash: '' })
		// acorns: contentState は URL 側の routeThreadId watcher に委ねるのでここでは変えない
		expect(wrapper.vm.contentState).toBe('thread')
	})
})
