/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// acorns: 通話中に別の会話を見て回るときの規則(設計書 §4.2)。副作用を持たない

export type BrowseDuringCallContext = {
	/** 通話中の会話の token。通話していなければ '' */
	callToken: string
	isLoggedIn: boolean
	/** 通話中の会話がボイスルームか */
	isVoiceRoom: boolean
	/** 通話中の会話が外部通話サービス(iframe)か */
	hasExternalCall: boolean
}

/**
 * 通話を続けたまま別の会話・画面に移れるか(D8 の対象外を除く)
 *
 * @param ctx 判定材料
 */
export function canBrowseDuringCall(ctx: BrowseDuringCallContext): boolean {
	return ctx.callToken !== ''
		&& ctx.isLoggedIn
		&& !ctx.isVoiceRoom
		&& !ctx.hasExternalCall
}

export type ConversationSwitchInput = {
	/** 遷移元が会話ルートならその token、それ以外は '' */
	fromToken: string
	/** 遷移先が会話ルートならその token、それ以外は '' */
	toToken: string
	/** 通話中の会話の token。通話していなければ '' */
	callToken: string
	/** canBrowseDuringCall の結果 */
	browsing: boolean
	/** 通話ごと別の会話に移す遷移か(ブレイクアウト / switch-to-conversation) */
	transferCall: boolean
}

export type ConversationSwitchPlan = {
	leaveToken: string | null
	joinToken: string | null
}

/**
 * 会話ルートの切り替えで、どの会話から退出し、どの会話に入室するか
 *
 * @param input 遷移の情報
 */
export function planConversationSwitch(input: ConversationSwitchInput): ConversationSwitchPlan {
	const { fromToken, toToken, callToken, browsing, transferCall } = input

	if (fromToken === toToken) {
		return { leaveToken: null, joinToken: null }
	}

	if (transferCall && callToken) {
		// 表示中の会話ではなく、シグナリングがつながっている通話の会話から抜ける
		return { leaveToken: callToken, joinToken: toToken || null }
	}

	if (browsing) {
		// 通話の会話に入室したまま、表示だけ切り替える
		return { leaveToken: null, joinToken: null }
	}

	return { leaveToken: fromToken || null, joinToken: toToken || null }
}
