/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { isEventForThread } from '../threadEvent.ts'

describe('isEventForThread', () => {
	it('threadId 未指定なら誰でも反応する(既存の発火元との互換)', () => {
		expect(isEventForThread(undefined, 0)).toBe(true)
		expect(isEventForThread(undefined, 138)).toBe(true)
	})

	it('一致すれば反応', () => {
		expect(isEventForThread(0, 0)).toBe(true)
		expect(isEventForThread(138, 138)).toBe(true)
	})

	it('不一致なら無視(メイン宛をペインが拾わない・逆も)', () => {
		expect(isEventForThread(0, 138)).toBe(false)
		expect(isEventForThread(138, 0)).toBe(false)
	})
})
