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

/**
 * acorns: NewMessageUploadEditor は ChatView ごと(チャンネル / スレッドペイン)に 1 つ
 * mount されるため、自分の threadId 向けのアップロードだけモーダルを開く。
 * チャンネル向けアップロードは threadId が undefined/0
 *
 * @param uploadThreadId threadId of the upload (undefined/0 = channel)
 * @param ownThreadId this component's threadId (0 = channel)
 */
export function isUploadForThread(uploadThreadId: number | undefined, ownThreadId: number): boolean {
	return (uploadThreadId ?? 0) === ownThreadId
}
