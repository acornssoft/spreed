/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type SidebarContentState = 'default' | 'search' | 'threads' | 'thread'

export type ThreadPaneTransition = {
	contentState: SidebarContentState
	previousContentState: SidebarContentState
	/** サイドバーを開くべきか(threadId が立ったとき) */
	openSidebar: boolean
}

/**
 * acorns: URL の threadId の変化に対する右サイドバーの contentState 遷移(設計書 §4.3)
 *
 * @param threadId new threadId from the URL (0 = pane closed)
 * @param current current contentState
 * @param previous contentState saved when entering 'thread'
 * @param sidebarOpen whether the sidebar is currently open
 */
export function resolveThreadPaneState(
	threadId: number,
	current: SidebarContentState,
	previous: SidebarContentState,
	sidebarOpen: boolean,
): ThreadPaneTransition {
	if (threadId > 0) {
		return {
			contentState: 'thread',
			// 'thread' 自身は保存しない(N → M の切替)
			previousContentState: current === 'thread' ? previous : current,
			openSidebar: !sidebarOpen,
		}
	}
	if (current === 'thread') {
		return { contentState: previous, previousContentState: previous, openSidebar: false }
	}
	return { contentState: current, previousContentState: previous, openSidebar: false }
}
