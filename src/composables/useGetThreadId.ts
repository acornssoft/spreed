/*
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Ref } from 'vue'
import type { RouteParamValueRaw } from 'vue-router'

import { createSharedComposable } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
import { inject } from 'vue'

/**
 * acorns: 「このサブツリーが表示しているスレッド id」を差し込むための injection key。
 * MainView は「読むと 0、書くと URL」の computed を、RightSidebar は URL 連動の ref を provide する。
 * 既存の 'chatView:isSidebar' と同じ文字列キー方式
 */
export const THREAD_ID_INJECTION_KEY = 'chatView:threadId'

/**
 * Shared composable to get threadId of current thread in conversation (bound to the URL query)
 */
export const useRouteThreadId = createSharedComposable(function() {
	return useRouteQuery<RouteParamValueRaw, number>('threadId', '0', {
		transform: {
			get: (value: RouteParamValueRaw | undefined) => value ? Number(value) : 0,
			set: (value: number) => value !== 0 ? String(value) : undefined,
		},
	})
})

/**
 * acorns: threadId of the thread this component is rendering.
 * Returns the provided ref when inside a provider (MainView / RightSidebar), otherwise the URL query.
 * Must be called in setup context (all 13 consumers do).
 */
export function useGetThreadId(): Ref<number> {
	return inject<Ref<number> | null>(THREAD_ID_INJECTION_KEY, null) ?? useRouteThreadId()
}
