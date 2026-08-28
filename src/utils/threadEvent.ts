/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * acorns: MessagesList が 2 つ(メイン=チャンネル / 右ペイン=スレッド)mount されるため、
 * グローバルな EventBus イベントをどちらが処理するかを payload.threadId で選ぶ。
 * 未指定なら従来どおり全員が反応する
 *
 * @param payloadThreadId threadId in the event payload (undefined = broadcast)
 * @param ownThreadId this component's threadId (0 = channel)
 */
export function isEventForThread(payloadThreadId: number | undefined, ownThreadId: number): boolean {
	return payloadThreadId === undefined || payloadThreadId === ownThreadId
}
