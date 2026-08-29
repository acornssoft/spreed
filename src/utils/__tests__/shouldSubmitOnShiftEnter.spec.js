/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { shouldSubmitOnShiftEnter } from '../shouldSubmitOnShiftEnter.ts'

describe('shouldSubmitOnShiftEnter', () => {
	const event = (overrides = {}) => ({ isComposing: false, keyCode: 13, ...overrides })

	it('submits when the setting is enabled', () => {
		expect(shouldSubmitOnShiftEnter(event(), { enabled: true, autocompleteActive: false })).toBe(true)
	})

	it('does nothing when the setting is disabled (upstream behaviour: Shift+Enter inserts a newline)', () => {
		expect(shouldSubmitOnShiftEnter(event(), { enabled: false, autocompleteActive: false })).toBe(false)
	})

	it('does not submit while an IME composition is in progress', () => {
		expect(shouldSubmitOnShiftEnter(event({ isComposing: true }), { enabled: true, autocompleteActive: false })).toBe(false)
		// Some browsers report keyCode 229 instead of isComposing for the confirming Enter
		expect(shouldSubmitOnShiftEnter(event({ keyCode: 229 }), { enabled: true, autocompleteActive: false })).toBe(false)
	})

	it('does not submit while the mention autocomplete is open', () => {
		expect(shouldSubmitOnShiftEnter(event(), { enabled: true, autocompleteActive: true })).toBe(false)
	})
})
