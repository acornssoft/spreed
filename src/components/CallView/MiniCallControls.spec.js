/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'
import MiniCallControls from './MiniCallControls.vue'
import router from '../../__mocks__/router.js'
import { useActorStore } from '../../stores/actor.ts'

vi.mock('../../utils/webrtc/index.js', () => ({
	localMediaModel: { attributes: { localScreen: null }, stopSharingScreen: vi.fn() },
	localCallParticipantModel: {},
}))

describe('MiniCallControls', () => {
	let leaveCall
	let wrapper

	beforeEach(async () => {
		setActivePinia(createPinia())
		useActorStore().sessionId = 'my-session'
		leaveCall = vi.fn()
		const store = createStore({
			getters: {
				conversation: () => () => ({ displayName: 'Sales', callStartTime: 0, permissions: 0 }),
			},
			actions: { leaveCall },
		})
		await router.push({ name: 'conversation', params: { token: 'Y' } })
		wrapper = mount(MiniCallControls, {
			props: { token: 'X' },
			global: {
				plugins: [router, store],
				stubs: { LocalAudioControlButton: true, LocalVideoControlButton: true },
			},
		})
	})

	it('切断ボタンで通話の会話 X から抜ける(表示中の Y ではなく)', async () => {
		await wrapper.find('[data-test="mini-call-leave"]').trigger('click')
		expect(leaveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: 'X' }))
	})

	it('戻るボタンで通話の会話に移る', async () => {
		const push = vi.spyOn(router, 'push')
		await wrapper.find('[data-test="mini-call-return"]').trigger('click')
		expect(push).toHaveBeenCalledWith({ name: 'conversation', params: { token: 'X' } })
	})

	it('画面共有していなければ共有停止ボタンを出さない', () => {
		expect(wrapper.find('[data-test="mini-call-stop-screen"]').exists()).toBe(false)
	})
})
