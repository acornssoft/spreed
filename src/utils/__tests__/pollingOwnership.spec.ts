/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest'
import { createPollingOwnership } from '../pollingOwnership.ts'

/**
 * @param threadId このインスタンスが描くスレッド(0 = チャンネル)
 */
function makeInstance(threadId: number) {
	return { id: Symbol('i'), getThreadId: () => threadId, start: vi.fn() }
}

describe('pollingOwnership', () => {
	it('最初に登録したインスタンスが所有者になり start が呼ばれる', () => {
		const o = createPollingOwnership()
		const main = makeInstance(0)
		o.register('T', main)
		expect(o.isOwner('T', main)).toBe(true)
		expect(main.start).toHaveBeenCalledTimes(1)
	})

	it('2 つ目は非所有者で start は呼ばれない', () => {
		const o = createPollingOwnership()
		const main = makeInstance(0)
		const pane = makeInstance(138)
		o.register('T', main)
		o.register('T', pane)
		expect(o.isOwner('T', pane)).toBe(false)
		expect(pane.start).not.toHaveBeenCalled()
	})

	it('所有者が外れると残りが引き継いで start が呼ばれる', () => {
		const o = createPollingOwnership()
		const main = makeInstance(0)
		const pane = makeInstance(138)
		o.register('T', main)
		o.register('T', pane)
		o.unregister('T', main)
		expect(o.isOwner('T', pane)).toBe(true)
		expect(pane.start).toHaveBeenCalledTimes(1)
	})

	it('非所有者が外れても所有者は変わらず start は再度呼ばれない', () => {
		const o = createPollingOwnership()
		const main = makeInstance(0)
		const pane = makeInstance(138)
		o.register('T', main)
		o.register('T', pane)
		o.unregister('T', pane)
		expect(o.isOwner('T', main)).toBe(true)
		expect(main.start).toHaveBeenCalledTimes(1)
	})

	it('引き継ぎでは threadId 0(メイン)を優先する', () => {
		const o = createPollingOwnership()
		const paneInCall = makeInstance(138) // 通話中はペインだけが居て所有者
		o.register('T', paneInCall)
		const main = makeInstance(0) // 通話終了でメインが mount
		o.register('T', main)
		o.unregister('T', paneInCall)
		expect(o.isOwner('T', main)).toBe(true)
	})

	it('引き継ぎ候補が複数のペインならどれか 1 つだけが所有者', () => {
		const o = createPollingOwnership()
		const a = makeInstance(1)
		const b = makeInstance(2)
		const c = makeInstance(3)
		o.register('T', a)
		o.register('T', b)
		o.register('T', c)
		o.unregister('T', a)
		expect([o.isOwner('T', b), o.isOwner('T', c)].filter(Boolean)).toHaveLength(1)
	})

	it('トークンごとに独立', () => {
		const o = createPollingOwnership()
		const a = makeInstance(0)
		const b = makeInstance(0)
		o.register('T1', a)
		o.register('T2', b)
		expect(o.isOwner('T1', a)).toBe(true)
		expect(o.isOwner('T2', b)).toBe(true)
		expect(o.isOwner('T1', b)).toBe(false)
	})

	it('未登録のインスタンスは所有者ではない / 最後の 1 つが外れると所有者は居ない', () => {
		const o = createPollingOwnership()
		const a = makeInstance(0)
		expect(o.isOwner('T', a)).toBe(false)
		o.register('T', a)
		o.unregister('T', a)
		expect(o.getOwner('T')).toBeUndefined()
	})
})
