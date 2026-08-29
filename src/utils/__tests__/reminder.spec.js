/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { REMINDER } from '../../constants.ts'
import { isNoDueDateReminder } from '../reminder.ts'

describe('isNoDueDateReminder', () => {
	it('is true only for the fixed far-future timestamp', () => {
		expect(isNoDueDateReminder(REMINDER.NO_DUE_DATE_TIMESTAMP)).toBe(true)
		expect(isNoDueDateReminder(4102444800)).toBe(true)
		expect(isNoDueDateReminder(4102444801)).toBe(false)
		expect(isNoDueDateReminder(Math.floor(Date.now() / 1000) + 3600)).toBe(false)
		expect(isNoDueDateReminder(0)).toBe(false)
	})
})
