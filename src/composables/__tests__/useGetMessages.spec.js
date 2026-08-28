/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest'
import { pinThreadVisualLastReadMessageId, shouldHandleRouteChange, shouldIgnoreThreadPaneToggle } from '../useGetMessages.ts'

describe('pinThreadVisualLastReadMessageId', () => {
	/**
	 * Creates a minimal vuex store double with a fixed visual marker value
	 *
	 * @param {number|null} existingValue value returned by getVisualLastReadMessageId
	 * @return {object} store double
	 */
	function createStoreDouble(existingValue) {
		return {
			getters: { getVisualLastReadMessageId: vi.fn(() => existingValue) },
			dispatch: vi.fn(),
		}
	}

	it('sets the visual marker when unset and returns the value', () => {
		const store = createStoreDouble(null)

		expect(pinThreadVisualLastReadMessageId(store, 'TOKEN', 138, 239)).toBe(239)
		expect(store.dispatch).toHaveBeenCalledWith('setVisualLastReadMessageId', { token: 'TOKEN', threadId: 138, id: 239 })
	})

	it('does not overwrite when already set and returns the existing value', () => {
		const store = createStoreDouble(239)

		// 楽観更新後の attendee(240)ではなく、開いた時点に pin された値(239)を使う
		expect(pinThreadVisualLastReadMessageId(store, 'TOKEN', 138, 240)).toBe(239)
		expect(store.dispatch).not.toHaveBeenCalled()
	})

	it('does not set 0 (untracked or not fetched)', () => {
		const store = createStoreDouble(null)

		expect(pinThreadVisualLastReadMessageId(store, 'TOKEN', 138, 0)).toBe(0)
		expect(store.dispatch).not.toHaveBeenCalled()
	})
})

describe('shouldHandleRouteChange', () => {
	it('URL に threadId が無ければメイン(0)が担当', () => {
		expect(shouldHandleRouteChange(0, 0)).toBe(true)
	})

	it('URL に threadId があればメイン(0)は担当しない', () => {
		expect(shouldHandleRouteChange(0, 138)).toBe(false)
	})

	it('URL の threadId と一致するペインが担当', () => {
		expect(shouldHandleRouteChange(138, 138)).toBe(true)
	})

	it('URL の threadId と違うペイン(切替前の値)は担当しない', () => {
		expect(shouldHandleRouteChange(138, 285)).toBe(false)
	})

	// acorns: 閉じる途中のペインの contextThreadId は URL 共有 ref なので 0 に既になっている。
	// つまり担当判定は通ってしまう = nextTick/unmount ガードが必要、という前提を固定する
	it('閉じる途中のペインは own も 0 になるので担当判定は通る(= nextTick/unmount ガードが必要)', () => {
		expect(shouldHandleRouteChange(0, 0)).toBe(true)
	})
})

describe('shouldIgnoreThreadPaneToggle (acorns)', () => {
	it('メイン(サイドバーでない)はペインのオープン(0→138)を無視する', () => {
		expect(shouldIgnoreThreadPaneToggle(false, 0, 138)).toBe(true)
	})

	it('メイン(サイドバーでない)はペインのクローズ(138→0)を無視する', () => {
		expect(shouldIgnoreThreadPaneToggle(false, 138, 0)).toBe(true)
	})

	it('メインは hash だけの変化(0→0)を無視しない', () => {
		expect(shouldIgnoreThreadPaneToggle(false, 0, 0)).toBe(false)
	})

	it('サイドバー(通話中タブ/スレッドペイン)は threadId の変化(138→0)を無視しない', () => {
		expect(shouldIgnoreThreadPaneToggle(true, 138, 0)).toBe(false)
	})
})
