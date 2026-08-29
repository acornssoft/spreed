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
