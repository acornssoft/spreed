/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Ref } from 'vue'
import type { Point, Size } from '../utils/draggablePosition.ts'

import { useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, ref, watch } from 'vue'
import BrowserStorage from '../services/BrowserStorage.js'
import { clampPosition, defaultPosition, parseStoredPosition, positionAfterResize } from '../utils/draggablePosition.ts'

/**
 * acorns: 通話小窓をドラッグで動かす。範囲は bounds 要素の中、最後の位置は BrowserStorage に残す(設計書 §4.3)。
 * 要素を包み直さず、呼び出し側が position を transform に流すだけにする(DOM を動かさないため)
 *
 * @param options 設定
 * @param options.box 箱の大きさ(固定)
 * @param options.bounds 動かせる範囲の要素
 * @param options.storageKey BrowserStorage のキー
 */
export function useDraggablePosition({ box, bounds, storageKey }: { box: Size, bounds: Ref<HTMLElement | null>, storageKey: string }) {
	const position = ref<Point>({ x: 0, y: 0 })
	let boundsSize: Size = { width: 0, height: 0 }
	let dragStart: { pointer: Point, position: Point } | null = null
	// 利用者が動かしたか(保存済みの位置を読んだ、または実際に動いたドラッグ)。
	// 動かすまでは基準の大きさが変わったら既定位置に置き直す
	let userMoved = false

	const readBounds = (): Size => {
		const rect = bounds.value?.getBoundingClientRect()
		return { width: rect?.width ?? 0, height: rect?.height ?? 0 }
	}

	watch(bounds, (element) => {
		if (!element) {
			return
		}
		boundsSize = readBounds()
		const stored = parseStoredPosition(BrowserStorage.getItem(storageKey))
		if (stored) {
			userMoved = true
			position.value = clampPosition(stored, box, boundsSize)
		} else {
			userMoved = false
			position.value = defaultPosition(box, boundsSize)
		}
	}, { immediate: true })

	// 基準の大きさが変わったとき(ウィンドウ・右サイドバーの開閉など):
	// まだ動かしていなければ既定位置に置き直し、動かした後は範囲内に補正するだけ
	useResizeObserver(bounds, () => {
		boundsSize = readBounds()
		position.value = positionAfterResize({ position: position.value, userMoved, box, bounds: boundsSize })
	})

	/**
	 * 基準の大きさを測り直して位置を決め直す(小窓が初めて出たとき等に呼ぶ)
	 */
	const remeasure = () => {
		boundsSize = readBounds()
		position.value = positionAfterResize({ position: position.value, userMoved, box, bounds: boundsSize })
	}

	const onPointerMove = (event: PointerEvent) => {
		if (!dragStart) {
			return
		}
		position.value = clampPosition({
			x: dragStart.position.x + event.clientX - dragStart.pointer.x,
			y: dragStart.position.y + event.clientY - dragStart.pointer.y,
		}, box, boundsSize)
	}

	const onPointerUp = () => {
		if (!dragStart) {
			return
		}
		// 実際に位置が変わったドラッグだけを「動かした」と見なす
		// (見出しをクリックしただけ=位置が同じ、では保存も userMoved もしない)
		const moved = position.value.x !== dragStart.position.x || position.value.y !== dragStart.position.y
		dragStart = null
		window.removeEventListener('pointermove', onPointerMove)
		window.removeEventListener('pointerup', onPointerUp)
		if (moved) {
			userMoved = true
			BrowserStorage.setItem(storageKey, JSON.stringify(position.value))
		}
	}

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) {
			return
		}
		boundsSize = readBounds()
		dragStart = { pointer: { x: event.clientX, y: event.clientY }, position: { ...position.value } }
		window.addEventListener('pointermove', onPointerMove)
		window.addEventListener('pointerup', onPointerUp)
	}

	onBeforeUnmount(onPointerUp)

	return { position, onPointerDown, remeasure }
}
