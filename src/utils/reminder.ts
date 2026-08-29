/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { REMINDER } from '../constants.ts'

/**
 * acorns: リマインダーが「期限なし」(ブックマーク)かどうか
 *
 * @param timestamp - UNIX 秒
 */
export function isNoDueDateReminder(timestamp: number): boolean {
	return timestamp === REMINDER.NO_DUE_DATE_TIMESTAMP
}

type ReminderRouteSource = {
	roomToken: string
	messageId: number
	threadId?: number
}

/**
 * acorns: リマインダー項目の遷移先。スレッド返信(threadId が自分の id と違う)なら
 * `?threadId=` を付けて右ペインでスレッドを開く(通知リンクと同じ形式)
 *
 * @param reminder - 一覧 API の 1 件
 */
export function getReminderRoute(reminder: ReminderRouteSource) {
	const inThread = !!reminder.threadId && reminder.threadId !== reminder.messageId
	return {
		name: 'conversation',
		params: { token: reminder.roomToken },
		hash: `#message_${reminder.messageId}`,
		query: inThread ? { threadId: reminder.threadId } : undefined,
	}
}
