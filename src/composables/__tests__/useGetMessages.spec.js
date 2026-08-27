/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest'
import { pinThreadVisualLastReadMessageId } from '../useGetMessages.ts'

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
