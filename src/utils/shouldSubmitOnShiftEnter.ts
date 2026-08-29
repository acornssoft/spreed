/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

type ShiftEnterContext = {
	/** acorns user setting `chat_send_on_shift_enter` */
	enabled: boolean
	/** Whether the mention autocomplete (tribute) menu is currently open */
	autocompleteActive: boolean
}

/**
 * acorns: Decide whether a Shift+Enter keydown in the message input should submit the message.
 * Only relevant when the user enabled "Enter inserts a newline, Shift+Enter sends".
 * Never submits during an IME composition (Japanese input confirms the conversion with Enter).
 *
 * @param event - keydown event (Shift+Enter, already filtered by the listener modifiers)
 * @param context - setting and editor state
 */
export function shouldSubmitOnShiftEnter(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>, context: ShiftEnterContext): boolean {
	if (!context.enabled) {
		return false
	}
	if (event.isComposing || event.keyCode === 229) {
		return false
	}
	if (context.autocompleteActive) {
		return false
	}
	return true
}
