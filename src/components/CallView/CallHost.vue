<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup lang="ts">
// acorns: 通話中に CallView を 1 インスタンスだけ常駐させ、全画面と小窓を CSS で切り替える(設計書 §4.3)。
// 要素を包み直したり Teleport したりしない(DOM が動くと <video> が止まり、CallView を作り直すと
// RemoteVideoBlocker の状態が失われて相手の映像が戻らない)
import type { Conversation } from '../../types/index.ts'

import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import CallView from './CallView.vue'
import MiniCallControls from './MiniCallControls.vue'
import { useCallToken, useIsCallMinimized } from '../../composables/useCallToken.ts'
import { useDraggablePosition } from '../../composables/useDraggablePosition.ts'
import { useIsInCall } from '../../composables/useIsInCall.js'
import { hasExternalCallService } from '../../utils/conversation.ts'
import { formattedTime } from '../../utils/formattedTime.ts'

const MINI_BOX = { width: 320, height: 180 + 40 + 52 } // 映像 + 見出し + 操作バー

const store = useStore()
const route = useRoute()
const router = useRouter()
const callToken = useCallToken()
const isMinimized = useIsCallMinimized()
const isInCall = useIsInCall()

const conversation = computed<Conversation | undefined>(() => store.getters.conversation(callToken.value))
const isInLobby = computed<boolean>(() => store.getters.isInLobby)

const isFull = computed(() => isInCall.value
	&& !isInLobby.value
	&& route.name === 'conversation'
	&& !hasExternalCallService(conversation.value))

// 通話の会話が一覧から消えたら(削除・外された)小窓は描かない(リロードは useSessionIssueHandler が行う)
const isShown = computed(() => callToken.value !== ''
	&& route.name !== 'recording'
	&& (isFull.value || (isMinimized.value && !!conversation.value)))

const host = useTemplateRef<HTMLElement>('host')
const bounds = shallowRef<HTMLElement | null>(null)
onMounted(() => {
	bounds.value = host.value?.parentElement ?? null
})

const { position, onPointerDown, remeasure } = useDraggablePosition({
	box: MINI_BOX,
	bounds,
	storageKey: 'callMiniViewPosition',
})

// acorns: 小窓が初めて出たときに基準の大きさを測り直す(マウント時に親の幅が 0 だった救済・既定位置の置き直し)
watch(isMinimized, (value) => {
	if (value) {
		remeasure()
	}
})

const now = shallowRef(Date.now())
const timer = setInterval(() => {
	now.value = Date.now()
}, 1000)
onBeforeUnmount(() => clearInterval(timer))

const callTime = computed(() => {
	const start = conversation.value?.callStartTime
	return start ? formattedTime(now.value - start * 1000) : ''
})

const miniStyle = computed(() => isMinimized.value
	? {
			width: MINI_BOX.width + 'px',
			height: MINI_BOX.height + 'px',
			transform: `translate(${position.value.x}px, ${position.value.y}px)`,
		}
	: undefined)

/**
 * 通話の会話に戻る
 */
function returnToCall() {
	router.push({ name: 'conversation', params: { token: callToken.value } })
}
</script>

<template>
	<div
		ref="host"
		class="call-host"
		:class="{
			'call-host--hidden': !isShown,
			'call-host--full': isShown && !isMinimized,
			'call-host--mini': isShown && isMinimized,
		}"
		:style="miniStyle">
		<div
			v-if="isShown && isMinimized"
			class="call-host__header"
			:title="t('spreed', 'Drag to move')"
			@pointerdown="onPointerDown">
			<span class="call-host__name">{{ conversation?.displayName }}</span>
			<span class="call-host__time">{{ callTime }}</span>
		</div>
		<div v-if="callToken && !hasExternalCallService(conversation)" class="call-host__body" @click="isMinimized && returnToCall()">
			<CallView
				:token="callToken"
				:isSidebar="isMinimized"
				:isMinimized="isMinimized" />
		</div>
		<MiniCallControls v-if="isShown && isMinimized" :token="callToken" />
	</div>
</template>

<style lang="scss" scoped>
.call-host {
	position: absolute;
	inset-block-start: 0;
	inset-inline-start: 0;

	&--hidden {
		display: none;
	}

	&--full {
		inset: 0;
	}

	&--mini {
		z-index: 11000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: var(--border-radius-large);
		box-shadow: 0 0 10px var(--color-box-shadow);
		background-color: var(--color-main-background);
	}

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--default-grid-baseline);
		height: 40px;
		padding-inline: calc(var(--default-grid-baseline) * 2);
		cursor: move;
		user-select: none;
		touch-action: none;
	}

	&__name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: bold;
	}

	&__time {
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	&__body {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		height: 100%;
	}

	&--mini &__body {
		cursor: pointer;
	}
}
</style>
