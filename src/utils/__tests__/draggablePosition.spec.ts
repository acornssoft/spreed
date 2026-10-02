/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { clampPosition, defaultPosition, parseStoredPosition } from '../draggablePosition.ts'

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
	it('右下に置く', () => {
		expect(defaultPosition(box, bounds)).toEqual({ x: 1000 - 320 - 16, y: 800 - 256 - 16 })
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
