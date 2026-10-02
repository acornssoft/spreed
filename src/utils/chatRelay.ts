/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// acorns: chat-relay はシグナリングがつながっている部屋の分しか届かない(設計書 §4.1-10)

/**
 * この会話の新着が chat-relay で届くか
 *
 * @param supported シグナリングサーバが chat-relay に対応しているか(hello 前は null)
 * @param token 判定する会話
 * @param signalingToken シグナリングがつながっている部屋
 */
export function isChatRelayActiveFor(supported: boolean | null, token: string, signalingToken: string): boolean {
	return supported === true && token !== '' && token === signalingToken
}

/**
 * 履歴の取得後、hello を待たずにポーリングを始めてよいか
 *
 * @param supported シグナリングサーバが chat-relay に対応しているか(hello 前は null)
 * @param token 判定する会話
 * @param signalingToken シグナリングがつながっている部屋
 */
export function shouldStartPollingImmediately(supported: boolean | null, token: string, signalingToken: string): boolean {
	return supported !== null || token !== signalingToken
}
