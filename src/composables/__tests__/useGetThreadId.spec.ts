/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed, defineComponent, h, provide, ref } from 'vue'
import router from '../../__mocks__/router.js'
import { THREAD_ID_INJECTION_KEY, useGetThreadId, useRouteThreadId } from '../useGetThreadId.ts'

/**
 * useGetThreadId() を setup で呼ぶ子と、provide する親を組んで mount する
 *
 * @param provided provide する値(undefined なら provide しない)
 */
function mountWithProvider(provided?: unknown) {
	const captured: { threadId?: ReturnType<typeof useGetThreadId> } = {}
	const Child = defineComponent({
		setup() {
			captured.threadId = useGetThreadId()
			return () => h('div')
		},
	})
	const Parent = defineComponent({
		setup() {
			if (provided !== undefined) {
				provide(THREAD_ID_INJECTION_KEY, provided)
			}
			return () => h(Child)
		},
	})
	const wrapper = mount(Parent, { global: { plugins: [router] } })
	return { wrapper, captured }
}

describe('useGetThreadId', () => {
	it('provide が無ければ URL クエリの threadId を返す', async () => {
		await router.push({ name: 'conversation', params: { token: 'TOKEN' }, query: { threadId: '138' } })
		const { captured } = mountWithProvider()
		expect(captured.threadId!.value).toBe(138)
	})

	it('provide があればそれを返す(URL に threadId があっても)', async () => {
		await router.push({ name: 'conversation', params: { token: 'TOKEN' }, query: { threadId: '138' } })
		const { captured } = mountWithProvider(ref(0))
		expect(captured.threadId!.value).toBe(0)
	})

	it('provide された computed への代入が URL に流れる(MainView の使い方)', async () => {
		await router.push({ name: 'conversation', params: { token: 'TOKEN' } })
		const routeThreadId = useRouteThreadId()
		const mainThreadId = computed<number>({
			get: () => 0,
			set: (value) => {
				routeThreadId.value = value
			},
		})
		const { captured } = mountWithProvider(mainThreadId)

		captured.threadId!.value = 285
		await router.isReady()
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(router.currentRoute.value.query.threadId).toBe('285')
		expect(captured.threadId!.value).toBe(0) // メイン領域は常に 0 を読む
	})
})
