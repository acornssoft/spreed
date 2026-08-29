/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMINDER } from '../../constants.ts'
import { getUpcomingReminders, removeMessageReminder } from '../../services/remindersService.js'
import { generateOCSResponse } from '../../test-helpers.js'
import { useDashboardStore } from '../dashboard.ts'

vi.mock('../../services/remindersService.js', () => ({
	getUpcomingReminders: vi.fn(),
	removeMessageReminder: vi.fn(),
}))
vi.mock('../../services/CapabilitiesManager.ts', () => ({
	hasTalkFeature: vi.fn(() => true),
}))

const NO_DUE = REMINDER.NO_DUE_DATE_TIMESTAMP
const now = Math.floor(Date.now() / 1000)
/**
 * @param {number} messageId message id
 * @param {number} reminderTimestamp reminder timestamp
 */
function reminder(messageId, reminderTimestamp) {
	return {
		messageId,
		reminderTimestamp,
		roomToken: 'token',
		actorType: 'users',
		actorId: 'alice',
		actorDisplayName: 'Alice',
		message: `m${messageId}`,
		messageParameters: {},
	}
}

describe('dashboardStore reminders (acorns)', () => {
	let dashboardStore

	beforeEach(() => {
		setActivePinia(createPinia())
		dashboardStore = useDashboardStore()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('requests the list limit when the server supports no-due-date reminders', async () => {
		getUpcomingReminders.mockResolvedValueOnce(generateOCSResponse({ payload: [] }))
		await dashboardStore.fetchUpcomingReminders()
		expect(getUpcomingReminders).toHaveBeenCalledWith(REMINDER.LIST_LIMIT)
	})

	it('splits timed and bookmarked reminders keeping server order', () => {
		// server order: timed ASC, then no-due-date (id DESC)
		dashboardStore.upcomingReminders = [
			reminder(4, now + 3600),
			reminder(2, now + 7200),
			reminder(3, NO_DUE),
			reminder(1, NO_DUE),
		]
		expect(dashboardStore.timedReminders.map((r) => r.messageId)).toEqual([4, 2])
		expect(dashboardStore.bookmarkedReminders.map((r) => r.messageId)).toEqual([3, 1])
		expect(dashboardStore.sortedReminders.map((r) => r.messageId)).toEqual([3, 1, 4, 2])
	})

	it('caps timedReminders at 10 for the dashboard but not sortedReminders', () => {
		dashboardStore.upcomingReminders = Array.from({ length: 15 }, (_, i) => reminder(i + 1, now + (i + 1) * 60))
		expect(dashboardStore.timedReminders).toHaveLength(10)
		expect(dashboardStore.sortedReminders).toHaveLength(15)
	})

	it('removeReminder drops the item from every getter', async () => {
		removeMessageReminder.mockResolvedValueOnce(generateOCSResponse({ payload: [] }))
		dashboardStore.upcomingReminders = [reminder(1, NO_DUE), reminder(2, now + 60)]
		await dashboardStore.removeReminder('token', 1)
		expect(dashboardStore.bookmarkedReminders).toEqual([])
		expect(dashboardStore.sortedReminders.map((r) => r.messageId)).toEqual([2])
	})
})
