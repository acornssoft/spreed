/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Participant } from '../types/index.ts'

import { showError } from '@nextcloud/dialogs'
import { emit } from '@nextcloud/event-bus'
import { t } from '@nextcloud/l10n'
import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { watch } from 'vue'
import { useStore } from 'vuex'
import ConfirmDialog from '../components/UIShared/ConfirmDialog.vue'
import { ATTENDEE, CALL, PARTICIPANT } from '../constants.ts'
import { callSIPDialOut } from '../services/callsService.ts'
import { getTalkConfig } from '../services/CapabilitiesManager.ts'
import { useActorStore } from '../stores/actor.ts'
import { useSettingsStore } from '../stores/settings.ts'
import { useTokenStore } from '../stores/token.ts'
import { isAxiosErrorResponse } from '../types/guards.ts'
import { isConversationPhoneRoom } from '../utils/conversation.ts'
import { callSwitchInProgress, getOngoingCallToken } from './useCallToken.ts'

/**
 * Handler function to join a call and manage side effects
 */
export function useJoinCall() {
	const actorStore = useActorStore()
	const settingsStore = useSettingsStore()
	const vuexStore = useStore()
	const tokenStore = useTokenStore()

	/**
	 * acorns: シグナリングの部屋が token に移るまで待つ(joinCall は入室済みが前提)
	 *
	 * @param token 待つ会話
	 * @param timeoutMs 打ち切り
	 */
	function waitForSignalingRoom(token: string, timeoutMs = 15_000): Promise<boolean> {
		if (tokenStore.lastJoinedConversationToken === token) {
			return Promise.resolve(true)
		}
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				stop()
				resolve(false)
			}, timeoutMs)
			const stop = watch(() => tokenStore.lastJoinedConversationToken, (value) => {
				if (value === token) {
					clearTimeout(timer)
					stop()
					resolve(true)
				}
			})
		})
	}

	/**
	 * acorns: 別の会話で通話中なら、抜けて token の会話に移るか確認する(設計書 §4.4・D6)。
	 * 了承されたら通話の会話から退出し、token の会話に入室してシグナリングが移るまで待つ
	 *
	 * @param token これから通話に参加する会話
	 * @return 続行してよいか
	 */
	async function ensureNoOtherCall(token: string): Promise<boolean> {
		const callToken = getOngoingCallToken(vuexStore)
		if (!callToken || callToken === token) {
			return true
		}

		const confirmed = await spawnDialog(ConfirmDialog, {
			name: t('spreed', 'Leave current call?'),
			message: t('spreed', 'You are in a call in {conversation}. Leave it and join this call?', {
				conversation: vuexStore.getters.conversation(callToken)?.displayName ?? '',
			}),
			buttons: [
				{
					label: t('spreed', 'Cancel'),
					callback: () => undefined,
				},
				{
					label: t('spreed', 'Leave and join'),
					variant: 'primary',
					callback: () => true,
				},
			],
		})
		if (!confirmed) {
			return false
		}

		callSwitchInProgress.value = true
		try {
			await vuexStore.dispatch('leaveConversation', { token: callToken })
			await vuexStore.dispatch('joinConversation', { token })
			return await waitForSignalingRoom(token)
		} finally {
			callSwitchInProgress.value = false
		}
	}

	/**
	 * Tries to call the given SIP phone participant
	 *
	 * @param token - conversation token of where to join
	 * @param attendeeId - id of the phone participant
	 */
	async function dialOutPhoneNumber(token: string, attendeeId: number) {
		try {
			await callSIPDialOut(token, attendeeId)
		} catch (exception) {
			if (isAxiosErrorResponse<{ message: string }>(exception) && exception.response?.data?.ocs?.data?.message) {
				showError(t('spreed', 'Phone number could not be called: {error}', {
					error: exception.response.data.ocs.data.message,
				}))
			} else {
				console.error(exception)
				showError(t('spreed', 'Phone number could not be called'))
			}
		}
	}

	/**
	 * Starts or joins a call
	 *
	 * @param token - conversation token of where to join
	 * @param options - joining options
	 * @param options.silent - whether to join the call silently (no notifications)
	 * @param options.recordingConsent - whether to join the call with recording consent
	 * @param options.shouldStartRecording - whether to start the recording together with the call (requires recording backend)
	 * @param options.directCall - whether to join call with video off
	 */
	async function joinCall(token: string, {
		silent = false,
		recordingConsent = false,
		shouldStartRecording = false,
		directCall = false,
	} = {}) {
		// acorns: 別の会話で通話中なら確認して移る(MainView の direct-call などボタン以外の入口も通る)
		if (!await ensureNoOtherCall(token)) {
			return
		}

		const conversation = vuexStore.getters.conversation(token)
		if (!actorStore.participantIdentifier.sessionId || conversation.attendeeId !== actorStore.participantIdentifier.attendeeId) {
			console.error('Trying to join call without having joined the conversation')
			return
		}

		const isPhoneRoom = isConversationPhoneRoom(conversation)

		// Define flags to join with (just call / with audio / with video)
		let flags = PARTICIPANT.CALL_FLAG.IN_CALL
		if (conversation.permissions & PARTICIPANT.PERMISSIONS.PUBLISH_AUDIO) {
			flags |= PARTICIPANT.CALL_FLAG.WITH_AUDIO
		}
		if (conversation.permissions & PARTICIPANT.PERMISSIONS.PUBLISH_VIDEO && !isPhoneRoom) {
			flags |= PARTICIPANT.CALL_FLAG.WITH_VIDEO
		}

		// Close MediaSettings
		emit('talk:media-settings:hide')
		// Close navigation when joining the call
		emit('toggle-navigation', { open: false })

		const options: Partial<Record<'audioOn' | 'videoOn', boolean>> = {}
		if (!settingsStore.showMediaSettings || directCall) {
			// Join calls with video off if device preview skipped or bypassed
			options.videoOn = false
			if (settingsStore.startWithoutMedia) {
				// Option: 'Turn camera and microphone off by default'
				options.audioOn = false
			}
		}

		console.debug('Joining call')
		await vuexStore.dispatch('joinCall', {
			token,
			participantIdentifier: actorStore.participantIdentifier,
			flags,
			silent,
			recordingConsent,
			options,
		})

		if (shouldStartRecording && getTalkConfig(token, 'call', 'recording')) {
			// Do not wait for async operation
			vuexStore.dispatch('startCallRecording', {
				token,
				callRecording: CALL.RECORDING.VIDEO,
			})
		}

		if (isPhoneRoom) {
			const attendeeId = vuexStore.getters.participantsList(token)
				.find((participant: Participant) => participant.actorType === ATTENDEE.ACTOR_TYPE.PHONES)
				?.attendeeId
			if (attendeeId) {
				// Do not wait for async operation
				dialOutPhoneNumber(token, attendeeId)
			}
		}
	}

	return {
		joinCall,
		ensureNoOtherCall,
	}
}
