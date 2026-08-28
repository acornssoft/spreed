<!--
  - SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup lang="ts">
import type { Events } from '../../services/EventBus.ts'

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import PollDraftHandler from './PollDraftHandler.vue'
import PollEditor from './PollEditor.vue'
import { CONVERSATION, PARTICIPANT } from '../../constants.ts'
import { hasTalkFeature } from '../../services/CapabilitiesManager.ts'
import { EventBus } from '../../services/EventBus.ts'

const store = useStore()

const pollEditorRef = ref<InstanceType<typeof PollEditor> | null>(null)

const showPollEditor = ref(false)
const showPollDraftHandler = ref(false)
const container = ref<string | undefined>(undefined)

const token = ref('')
// acorns: ペインから開いた投票の投稿先スレッド(下書きはチャンネル機能なので undefined のまま)(設計書 §4.7)
const threadId = ref<number | undefined>(undefined)
const canCreatePollDrafts = computed(() => {
	const { participantType, type } = store.getters.conversation(token.value) ?? {}
	// TODO: getters.isModerator should accept token
	return hasTalkFeature(token.value, 'talk-polls-drafts')
		&& ([PARTICIPANT.TYPE.OWNER, PARTICIPANT.TYPE.MODERATOR, PARTICIPANT.TYPE.GUEST_MODERATOR].includes(participantType))
		&& ([CONVERSATION.TYPE.GROUP, CONVERSATION.TYPE.PUBLIC].includes(type))
})

onMounted(() => {
	EventBus.on('poll-editor-open', openPollEditor)
	EventBus.on('poll-drafts-open', openPollDraftHandler)
})

onBeforeUnmount(() => {
	EventBus.off('poll-editor-open', openPollEditor)
	EventBus.off('poll-drafts-open', openPollDraftHandler)
})

/**
 * Opens PollDraftHandler dialog
 *
 * @param payload event payload
 * @param payload.token conversation token
 * @param [payload.selector] selector to mount dialog to (body by default)
 */
function openPollDraftHandler(payload: Events['poll-drafts-open']) {
	token.value = payload.token
	container.value = payload.selector
	// acorns: 下書きはチャンネルの機能。スレッドには紐づけない(設計書 §4.7)
	threadId.value = undefined
	showPollDraftHandler.value = true
}

/**
 * Opens PollEditor dialog
 *
 * @param payload event payload
 * @param payload.token conversation token
 * @param payload.id poll draft ID to fill form with (null for empty form)
 * @param payload.fromDrafts whether editor was opened from PollDraftHandler dialog
 * @param payload.action required action ('fill' from draft or 'edit' draft)
 * @param [payload.selector] selector to mount dialog to (body by default)
 * @param [payload.threadId] thread ID to post the poll into (undefined = channel)
 */
function openPollEditor(payload: Events['poll-editor-open']) {
	token.value = payload.token
	container.value = payload.selector
	// acorns: ペインから開いた投票の投稿先スレッド(設計書 §4.7)。
	// NewMessageAttachments は常にキーあり(チャンネルは明示的 undefined = 毎回上書き)、
	// PollDraftHandler からの再 emit はキー無し(直前の値を維持)なので、キーの有無で判定する
	if ('threadId' in payload) {
		threadId.value = payload.threadId
	}
	showPollEditor.value = true
	nextTick(() => {
		pollEditorRef.value?.fillPollEditorFromDraft(payload.id, payload.fromDrafts, payload.action)
		// Wait for editor to be mounted and filled before unmounting drafts dialog to avoid issues when inserting nodes
		showPollDraftHandler.value = false
	})
}
</script>

<template>
	<div>
		<!-- Poll creation dialog -->
		<PollEditor
			v-if="showPollEditor"
			ref="pollEditorRef"
			:token="token"
			:canCreatePollDrafts="canCreatePollDrafts"
			:container="container"
			:threadId="threadId"
			@close="showPollEditor = false" />
		<!-- Poll drafts dialog -->
		<PollDraftHandler
			v-if="canCreatePollDrafts && showPollDraftHandler"
			:token="token"
			:container="container"
			:editorOpened="showPollEditor"
			@close="showPollDraftHandler = false" />
	</div>
</template>
