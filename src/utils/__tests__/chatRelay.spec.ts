/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { isChatRelayActiveFor, shouldStartPollingImmediately } from '../chatRelay.ts'

describe('isChatRelayActiveFor', () => {
	it.each([
		[true, 'X', 'X', true],
		[true, 'Y', 'X', false], // 通話中に別の会話を表示: relay は X の分しか来ない
		[false, 'X', 'X', false],
		[null, 'X', 'X', false],
		[true, '', '', false],
	])('supported=%s token=%s signaling=%s -> %s', (supported, token, signalingToken, expected) => {
		expect(isChatRelayActiveFor(supported, token, signalingToken)).toBe(expected)
	})
})

describe('shouldStartPollingImmediately', () => {
	it.each([
		[true, 'X', 'X', true],
		[false, 'X', 'X', true],
		[null, 'X', 'X', false], // hello 待ち(従来どおり 30 秒のフォールバック)
		[null, 'Y', 'X', true], // 未入室の会話は hello が来ないので待たない
	])('supported=%s token=%s signaling=%s -> %s', (supported, token, signalingToken, expected) => {
		expect(shouldStartPollingImmediately(supported, token, signalingToken)).toBe(expected)
	})
})
