/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { REMINDER } from '../../constants.ts'
import { getReminderRoute, isNoDueDateReminder } from '../reminder.ts'

describe('isNoDueDateReminder', () => {
	it('is true only for the fixed far-future timestamp', () => {
		expect(isNoDueDateReminder(REMINDER.NO_DUE_DATE_TIMESTAMP)).toBe(true)
		expect(isNoDueDateReminder(4102444800)).toBe(true)
		expect(isNoDueDateReminder(4102444801)).toBe(false)
		expect(isNoDueDateReminder(Math.floor(Date.now() / 1000) + 3600)).toBe(false)
		expect(isNoDueDateReminder(0)).toBe(false)
	})
})

describe('getReminderRoute', () => {
	const base = { roomToken: 'token', messageId: 298 }

	it('opens the thread pane for a thread reply (threadId differs from messageId)', () => {
		expect(getReminderRoute({ ...base, threadId: 294 })).toEqual({
			name: 'conversation',
			params: { token: 'token' },
			hash: '#message_298',
			query: { threadId: 294 },
		})
	})

	it('has no threadId query for channel messages and thread roots', () => {
		expect(getReminderRoute({ ...base, threadId: 298 }).query).toBeUndefined()
		expect(getReminderRoute({ ...base, threadId: 0 }).query).toBeUndefined()
		// old server without threadId in the response
		expect(getReminderRoute(base).query).toBeUndefined()
	})
})
