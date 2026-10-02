/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Ref } from 'vue'
import type { Point, Size } from '../utils/draggablePosition.ts'

import { useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, ref, watch } from 'vue'
import BrowserStorage from '../services/BrowserStorage.js'
import { clampPosition, defaultPosition, parseStoredPosition } from '../utils/draggablePosition.ts'

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
		position.value = stored ? clampPosition(stored, box, boundsSize) : defaultPosition(box, boundsSize)
	}, { immediate: true })

	// ウィンドウを縮めたときに範囲の外へ出ないよう補正する
	useResizeObserver(bounds, () => {
		boundsSize = readBounds()
		position.value = clampPosition(position.value, box, boundsSize)
	})

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
		dragStart = null
		window.removeEventListener('pointermove', onPointerMove)
		window.removeEventListener('pointerup', onPointerUp)
		BrowserStorage.setItem(storageKey, JSON.stringify(position.value))
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

	return { position, onPointerDown }
}
