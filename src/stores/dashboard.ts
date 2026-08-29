/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { DashboardEventRoom, UpcomingReminder } from '../types/index.ts'

import { showError, showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { defineStore } from 'pinia'
import { REMINDER } from '../constants.ts'
import { hasTalkFeature } from '../services/CapabilitiesManager.ts'
import { getDashboardEventRooms } from '../services/dashboardService.ts'
import { getUpcomingReminders, removeMessageReminder } from '../services/remindersService.js'
import { isNoDueDateReminder } from '../utils/reminder.ts'

const supportsUpcomingReminders = hasTalkFeature('local', 'upcoming-reminders')
// acorns: 無期限リマインダーと limit 付き一覧に対応したサーバか
const supportsReminderBookmarks = hasTalkFeature('local', 'acorns-reminder-no-due-date')

type State = {
	eventRooms: DashboardEventRoom[]
	upcomingReminders: UpcomingReminder[]
	eventRoomsInitialised: boolean
	upcomingRemindersInitialised: boolean
}
export const useDashboardStore = defineStore('dashboard', {
	state: (): State => ({
		eventRooms: [],
		upcomingReminders: [],
		eventRoomsInitialised: false,
		upcomingRemindersInitialised: false,
	}),

	getters: {
		// acorns: ダッシュボード用。期限付きだけ、先頭 10 件(サーバ順 = 近い順)
		timedReminders: (state): UpcomingReminder[] => state.upcomingReminders
			.filter((reminder) => !isNoDueDateReminder(reminder.reminderTimestamp))
			.slice(0, 10),
		// acorns: 無期限(ブックマーク)だけ。サーバ順 = 新しく付けた順
		bookmarkedReminders: (state): UpcomingReminder[] => state.upcomingReminders
			.filter((reminder) => isNoDueDateReminder(reminder.reminderTimestamp)),
		// acorns: 左ペイン用。無期限 → 期限付き(全件)
		sortedReminders: (state): UpcomingReminder[] => [
			...state.upcomingReminders.filter((reminder) => isNoDueDateReminder(reminder.reminderTimestamp)),
			...state.upcomingReminders.filter((reminder) => !isNoDueDateReminder(reminder.reminderTimestamp)),
		],
	},

	actions: {
		async fetchDashboardEventRooms() {
			try {
				const response = await getDashboardEventRooms()
				this.eventRooms = response.data.ocs.data
				this.eventRoomsInitialised = true
			} catch (error) {
				console.error('Error fetching dashboard event rooms:', error)
				showError(t('spreed', 'Error fetching upcoming events'))
			}
		},

		async fetchUpcomingReminders() {
			try {
				if (!supportsUpcomingReminders) {
					return
				}
				const response = await getUpcomingReminders(supportsReminderBookmarks ? REMINDER.LIST_LIMIT : undefined)
				this.upcomingReminders = response.data.ocs.data
				this.upcomingRemindersInitialised = true
			} catch (error) {
				console.error('Error fetching upcoming reminders:', error)
				showError(t('spreed', 'Error fetching upcoming reminders'))
			}
		},

		async removeReminder(token: string, messageId: number) {
			try {
				await removeMessageReminder(token, messageId)
				this.upcomingReminders = this.upcomingReminders.filter((reminder) => {
					return reminder.messageId !== messageId
				})
				showSuccess(t('spreed', 'A reminder was successfully removed'))
			} catch (error) {
				console.error(error)
				showError(t('spreed', 'Error occurred when removing a reminder'))
			}
		},
	},
})
