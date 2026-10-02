/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { canBrowseDuringCall, planConversationSwitch } from '../callNavigation.ts'

describe('canBrowseDuringCall', () => {
	const base = { callToken: 'X', isLoggedIn: true, isVoiceRoom: false, hasExternalCall: false }

	it('通話中のログインユーザーなら true', () => {
		expect(canBrowseDuringCall(base)).toBe(true)
	})

	it.each([
		['通話していない', { callToken: '' }],
		['ゲスト', { isLoggedIn: false }],
		['ボイスルーム', { isVoiceRoom: true }],
		['外部通話サービス', { hasExternalCall: true }],
	])('%s なら false', (_, patch) => {
		expect(canBrowseDuringCall({ ...base, ...patch })).toBe(false)
	})
})

describe('planConversationSwitch', () => {
	const none = { leaveToken: null, joinToken: null }

	it.each([
		['通話外 A→B は A を出て B に入る', { fromToken: 'A', toToken: 'B', callToken: '', browsing: false, transferCall: false }, { leaveToken: 'A', joinToken: 'B' }],
		['通話外 A→会話外は A を出るだけ', { fromToken: 'A', toToken: '', callToken: '', browsing: false, transferCall: false }, { leaveToken: 'A', joinToken: null }],
		['通話外 会話外→B は B に入るだけ', { fromToken: '', toToken: 'B', callToken: '', browsing: false, transferCall: false }, { leaveToken: null, joinToken: 'B' }],
		['同じ会話の中の遷移は何もしない', { fromToken: 'A', toToken: 'A', callToken: '', browsing: false, transferCall: false }, none],
		['通話中 X→Y は何もしない', { fromToken: 'X', toToken: 'Y', callToken: 'X', browsing: true, transferCall: false }, none],
		['通話中 Y→Z は何もしない', { fromToken: 'Y', toToken: 'Z', callToken: 'X', browsing: true, transferCall: false }, none],
		['通話中 Y→X は入り直さない', { fromToken: 'Y', toToken: 'X', callToken: 'X', browsing: true, transferCall: false }, none],
		['通話中 X→会話外は何もしない', { fromToken: 'X', toToken: '', callToken: 'X', browsing: true, transferCall: false }, none],
		['通話中 会話外→Y は何もしない', { fromToken: '', toToken: 'Y', callToken: 'X', browsing: true, transferCall: false }, none],
		['通話の移送(ブレイクアウト)は Y 表示中でも通話の X を出て移動先に入る', { fromToken: 'Y', toToken: 'B', callToken: 'X', browsing: true, transferCall: true }, { leaveToken: 'X', joinToken: 'B' }],
		['通話の移送で X から直接なら X を出て移動先に入る', { fromToken: 'X', toToken: 'B', callToken: 'X', browsing: true, transferCall: true }, { leaveToken: 'X', joinToken: 'B' }],
		['見て回れない通話(ゲスト等)は従来どおり', { fromToken: 'X', toToken: 'Y', callToken: 'X', browsing: false, transferCall: false }, { leaveToken: 'X', joinToken: 'Y' }],
	])('%s', (_, input, expected) => {
		expect(planConversationSwitch(input)).toEqual(expected)
	})
})
