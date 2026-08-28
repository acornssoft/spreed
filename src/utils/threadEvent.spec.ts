/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, test } from 'vitest'
import { isEventForThread, isUploadForThread } from './threadEvent.ts'

describe('threadEvent', () => {
	describe('isEventForThread', () => {
		test('broadcasts when payload has no threadId', () => {
			expect(isEventForThread(undefined, 0)).toBe(true)
			expect(isEventForThread(undefined, 138)).toBe(true)
		})

		test('matches only the same threadId', () => {
			expect(isEventForThread(138, 138)).toBe(true)
			expect(isEventForThread(138, 0)).toBe(false)
		})
	})

	describe('isUploadForThread', () => {
		test('channel upload (undefined) belongs to the channel instance (0)', () => {
			expect(isUploadForThread(undefined, 0)).toBe(true)
		})

		test('thread upload belongs to the same thread instance', () => {
			expect(isUploadForThread(285, 285)).toBe(true)
		})

		test('thread upload does not belong to the channel instance', () => {
			expect(isUploadForThread(285, 0)).toBe(false)
		})
	})
})
