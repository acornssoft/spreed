/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { PARTICIPANT, WEBINAR } from '../constants.ts'
import { useActorStore } from '../stores/actor.ts'
import { callSwitchInProgress, useCallToken, useIsCallMinimized } from './useCallToken.ts'

/**
 * acorns: 小窓で通話していた会話の通話が終わったら(自分の切断・全員終了・強制退出)、
 * 通話の会話から退出し、表示中の会話に正式に入室して通常の状態に戻す(設計書 §4.2・D7)
 */
export function useMinimizedCallLifecycle() {
	const store = useStore()
	const route = useRoute()
	const callToken = useCallToken()

	watch(callToken, async (newToken, oldToken) => {
		if (!oldToken || newToken || callSwitchInProgress.value) {
			return
		}

		const viewToken = route.name === 'conversation' ? route.params.token as string : ''
		if (viewToken === oldToken) {
			// 通話の会話を表示中: 従来どおりその会話に残る
			return
		}

		await store.dispatch('leaveConversation', { token: oldToken })
		if (viewToken) {
			await store.dispatch('joinConversation', { token: viewToken })
		}
	})

	// acorns: 小窓の間に通話の会話がロビー化したら抜ける(MainView の同じ処理は表示中の会話しか見ない。設計書 §4.1-11)。
	// 判定は conversationsStore の isInLobby / isModerator と同じ条件を、通話の会話に対して行う
	const actorStore = useActorStore()
	const isMinimized = useIsCallMinimized()
	const isCallConversationInLobby = computed(() => {
		const conversation = callToken.value ? store.getters.conversation(callToken.value) : undefined
		if (!conversation) {
			return false
		}
		const isModerator = [PARTICIPANT.TYPE.OWNER, PARTICIPANT.TYPE.MODERATOR, PARTICIPANT.TYPE.GUEST_MODERATOR]
			.includes(conversation.participantType)
		return conversation.lobbyState === WEBINAR.LOBBY.NON_MODERATORS
			&& !isModerator
			&& (conversation.permissions & PARTICIPANT.PERMISSIONS.LOBBY_IGNORE) === 0
	})
	watch(isCallConversationInLobby, (inLobby) => {
		if (inLobby && isMinimized.value) {
			store.dispatch('leaveCall', {
				token: callToken.value,
				participantIdentifier: actorStore.participantIdentifier,
			})
		}
	})
}
