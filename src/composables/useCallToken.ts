/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Store } from 'vuex'

import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { CONVERSATION } from '../constants.ts'
import SessionStorage from '../services/SessionStorage.js'
import { useActorStore } from '../stores/actor.ts'
import { canBrowseDuringCall } from '../utils/callNavigation.ts'
import { hasExternalCallService } from '../utils/conversation.ts'
import { useJoinedConversation } from './useJoinedConversation.ts'

// acorns: 通話中に別の会話を見て回るための「通話 token」(設計書 §4.2)。
// 表示 token(ルート)とは別に、入室中の会話で通話しているならその token を指す

/**
 * 通話を別の会話へ移し替えている最中(Task 7 の自動入室を止める)
 */
export const callSwitchInProgress = ref(false)

/**
 * コンポーネント外から通話 token を得る(useCallToken と同じ判定)
 *
 * @param store vuex store
 */
export function getOngoingCallToken(store: Store<unknown>): string {
	const joined = SessionStorage.getItem('joined_conversation')
	return joined && store.getters.isInCall(joined) ? joined : ''
}

/**
 * 通話中なら通話の会話の token、それ以外は ''
 */
export function useCallToken() {
	const store = useStore()
	const joinedConversationToken = useJoinedConversation()
	return computed<string>(() => {
		const joined = joinedConversationToken.value
		return joined && store.getters.isInCall(joined) ? joined : ''
	})
}

/**
 * 通話を続けたまま別の会話・画面に移れるか
 */
export function useCanBrowseDuringCall() {
	const store = useStore()
	const actorStore = useActorStore()
	const callToken = useCallToken()
	return computed<boolean>(() => {
		const conversation = callToken.value ? store.getters.conversation(callToken.value) : undefined
		return canBrowseDuringCall({
			callToken: callToken.value,
			isLoggedIn: actorStore.isLoggedIn,
			isVoiceRoom: Boolean(conversation?.attributes & CONVERSATION.ATTRIBUTE.VOICE_ROOM),
			hasExternalCall: hasExternalCallService(conversation),
		})
	})
}

/**
 * 通話を小窓で出す状態か(見て回れる通話中で、表示中のルートが通話の会話でない)
 */
export function useIsCallMinimized() {
	const route = useRoute()
	const callToken = useCallToken()
	const canBrowse = useCanBrowseDuringCall()
	return computed<boolean>(() => {
		if (!canBrowse.value) {
			return false
		}
		return !(route.name === 'conversation' && route.params.token === callToken.value)
	})
}
