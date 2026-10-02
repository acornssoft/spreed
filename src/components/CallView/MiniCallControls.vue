<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup lang="ts">
// acorns: 通話小窓の操作バー(設計書 §4.3)。表示 token ではなく props の通話 token だけを見る
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import NcButton from '@nextcloud/vue/components/NcButton'
import IconArrowExpand from 'vue-material-design-icons/ArrowExpand.vue'
import IconMonitorOff from 'vue-material-design-icons/MonitorOff.vue'
import IconPhoneHangupOutline from 'vue-material-design-icons/PhoneHangupOutline.vue'
import LocalAudioControlButton from './shared/LocalAudioControlButton.vue'
import LocalVideoControlButton from './shared/LocalVideoControlButton.vue'
import { useActorStore } from '../../stores/actor.ts'
import { useCallViewStore } from '../../stores/callView.ts'
import { localMediaModel } from '../../utils/webrtc/index.js'

const props = defineProps<{
	token: string
}>()

const store = useStore()
const router = useRouter()
const actorStore = useActorStore()
const callViewStore = useCallViewStore()

const conversation = computed(() => store.getters.conversation(props.token))
const isSharingScreen = computed(() => !!localMediaModel.attributes.localScreen)

/**
 * 通話の会話に戻る(全画面の通話表示になる)
 */
function returnToCall() {
	router.push({ name: 'conversation', params: { token: props.token } })
}

/**
 * 自分だけ抜ける(D7)。表示中の会話への入室は useMinimizedCallLifecycle が行う
 */
async function leaveCall() {
	callViewStore.setSelectedVideoPeerId(null)
	await store.dispatch('leaveCall', {
		token: props.token,
		participantIdentifier: actorStore.participantIdentifier,
	})
}
</script>

<template>
	<div v-if="conversation" class="mini-call-controls">
		<LocalAudioControlButton
			:token="token"
			:conversation="conversation"
			:model="localMediaModel"
			variant="secondary"
			disableKeyboardShortcuts />
		<LocalVideoControlButton
			:token="token"
			:conversation="conversation"
			:model="localMediaModel"
			variant="secondary"
			disableKeyboardShortcuts />
		<NcButton
			v-if="isSharingScreen"
			data-test="mini-call-stop-screen"
			variant="secondary"
			:aria-label="t('spreed', 'Stop screensharing')"
			:title="t('spreed', 'Stop screensharing')"
			@click="localMediaModel.stopSharingScreen()">
			<template #icon>
				<IconMonitorOff :size="20" />
			</template>
		</NcButton>
		<NcButton
			data-test="mini-call-leave"
			variant="error"
			:aria-label="t('spreed', 'Leave call')"
			:title="t('spreed', 'Leave call')"
			@click="leaveCall">
			<template #icon>
				<IconPhoneHangupOutline :size="20" />
			</template>
		</NcButton>
		<NcButton
			data-test="mini-call-return"
			variant="secondary"
			:aria-label="t('spreed', 'Return to call')"
			:title="t('spreed', 'Return to call')"
			@click="returnToCall">
			<template #icon>
				<IconArrowExpand :size="20" />
			</template>
		</NcButton>
	</div>
</template>

<style lang="scss" scoped>
.mini-call-controls {
	display: flex;
	justify-content: center;
	gap: var(--default-grid-baseline);
	padding: var(--default-grid-baseline);
}
</style>
