/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { clampPosition, defaultPosition, parseStoredPosition, positionAfterResize } from '../draggablePosition.ts'

const box = { width: 320, height: 256 }
const bounds = { width: 1000, height: 800 }

describe('clampPosition', () => {
	it('範囲内ならそのまま', () => {
		expect(clampPosition({ x: 100, y: 100 }, box, bounds)).toEqual({ x: 100, y: 100 })
	})

	it('左上にはみ出したら余白の位置に戻す', () => {
		expect(clampPosition({ x: -50, y: -10 }, box, bounds)).toEqual({ x: 8, y: 8 })
	})

	it('右下にはみ出したら箱が収まる位置に戻す', () => {
		expect(clampPosition({ x: 900, y: 700 }, box, bounds)).toEqual({ x: 1000 - 320 - 8, y: 800 - 256 - 8 })
	})

	it('範囲が箱より狭ければ左上に寄せる', () => {
		expect(clampPosition({ x: 50, y: 50 }, box, { width: 200, height: 200 })).toEqual({ x: 8, y: 8 })
	})
})

describe('defaultPosition', () => {
	it('既定の余白(右 16・下 96)で右下に置く', () => {
		expect(defaultPosition(box, bounds)).toEqual({ x: 1000 - 320 - 16, y: 800 - 256 - 96 })
	})

	it('右と下で違う余白を使う', () => {
		expect(defaultPosition(box, bounds, { right: 24, bottom: 120 })).toEqual({ x: 1000 - 320 - 24, y: 800 - 256 - 120 })
	})

	it('範囲が狭いときは左上(clampPosition の余白)へ寄せる', () => {
		expect(defaultPosition(box, { width: 200, height: 200 })).toEqual({ x: 8, y: 8 })
	})
})

describe('positionAfterResize', () => {
	it('まだ動かしていなければ既定位置に置き直す', () => {
		expect(positionAfterResize({ position: { x: 10, y: 10 }, userMoved: false, box, bounds }))
			.toEqual({ x: 1000 - 320 - 16, y: 800 - 256 - 96 })
	})

	it('動かした後は範囲内に補正するだけ(既定位置に戻さない)', () => {
		expect(positionAfterResize({ position: { x: 100, y: 100 }, userMoved: true, box, bounds }))
			.toEqual({ x: 100, y: 100 })
	})

	it('動かした後に範囲外へ出ていれば補正する', () => {
		expect(positionAfterResize({ position: { x: 900, y: 700 }, userMoved: true, box, bounds }))
			.toEqual({ x: 1000 - 320 - 8, y: 800 - 256 - 8 })
	})
})

describe('parseStoredPosition', () => {
	it.each([
		['{"x":10,"y":20}', { x: 10, y: 20 }],
		[null, null],
		['', null],
		['not json', null],
		['{"x":"a","y":1}', null],
		['{"x":1}', null],
	])('%s -> %o', (raw, expected) => {
		expect(parseStoredPosition(raw)).toEqual(expected)
	})
})
