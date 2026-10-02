/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// acorns: 通話小窓の位置計算(副作用なし)

export type Point = { x: number, y: number }
export type Size = { width: number, height: number }

const CLAMP_MARGIN = 8
const DEFAULT_MARGIN = 16

/**
 * 箱が範囲の中に収まるよう位置を補正する
 *
 * @param position 箱の左上
 * @param box 箱の大きさ
 * @param bounds 動かせる範囲の大きさ
 * @param margin 範囲の縁からの余白
 */
export function clampPosition(position: Point, box: Size, bounds: Size, margin = CLAMP_MARGIN): Point {
	const maxX = Math.max(margin, bounds.width - box.width - margin)
	const maxY = Math.max(margin, bounds.height - box.height - margin)
	return {
		x: Math.min(Math.max(position.x, margin), maxX),
		y: Math.min(Math.max(position.y, margin), maxY),
	}
}

/**
 * 初期位置(右下)
 *
 * @param box 箱の大きさ
 * @param bounds 動かせる範囲の大きさ
 * @param margin 範囲の縁からの余白
 */
export function defaultPosition(box: Size, bounds: Size, margin = DEFAULT_MARGIN): Point {
	return clampPosition({ x: bounds.width - box.width - margin, y: bounds.height - box.height - margin }, box, bounds)
}

/**
 * 保存しておいた位置を読む。壊れていれば null
 *
 * @param raw BrowserStorage の値
 */
export function parseStoredPosition(raw: string | null): Point | null {
	if (!raw) {
		return null
	}
	try {
		// acorns: JSON.parse の戻りは unknown 扱いにして x/y が数値のときだけ受け入れる
		const value = JSON.parse(raw) as Partial<Point> | null
		if (typeof value?.x === 'number' && typeof value?.y === 'number') {
			return { x: value.x, y: value.y }
		}
	} catch {
		// 壊れた値は捨てる
	}
	return null
}
