/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { resolveThreadPaneState } from '../threadPaneState.ts'

describe('resolveThreadPaneState', () => {
	it('0 → N: thread に入り、直前状態を保存し、閉じていれば開く', () => {
		expect(resolveThreadPaneState(138, 'default', 'default', false)).toEqual({
			contentState: 'thread',
			previousContentState: 'default',
			openSidebar: true,
		})
	})

	it('0 → N: 開いていれば openSidebar は false', () => {
		expect(resolveThreadPaneState(138, 'default', 'default', true).openSidebar).toBe(false)
	})

	it('一覧(threads)から開いたら previous は threads', () => {
		expect(resolveThreadPaneState(138, 'threads', 'default', true).previousContentState).toBe('threads')
	})

	it('N → M: thread のまま、previous は変えない(thread 自身を保存しない)', () => {
		expect(resolveThreadPaneState(285, 'thread', 'threads', true)).toEqual({
			contentState: 'thread',
			previousContentState: 'threads',
			openSidebar: false,
		})
	})

	it('N → 0: 直前状態に復帰(D7)', () => {
		expect(resolveThreadPaneState(0, 'thread', 'threads', true)).toEqual({
			contentState: 'threads',
			previousContentState: 'threads',
			openSidebar: false,
		})
		expect(resolveThreadPaneState(0, 'thread', 'default', true).contentState).toBe('default')
	})

	it('N → 0 で previous が search なら search に戻る', () => {
		expect(resolveThreadPaneState(0, 'thread', 'search', true).contentState).toBe('search')
	})

	it('threadId 0 で thread 状態でない(通話中など)なら何も変えない', () => {
		expect(resolveThreadPaneState(0, 'default', 'default', true)).toEqual({
			contentState: 'default',
			previousContentState: 'default',
			openSidebar: false,
		})
	})
})
