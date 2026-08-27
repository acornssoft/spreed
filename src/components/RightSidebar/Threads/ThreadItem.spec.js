/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { flushPromises, mount } from '@vue/test-utils'
import { cloneDeep } from 'es-toolkit'
import { beforeEach, describe, expect, test } from 'vitest'
import { createStore } from 'vuex'
import NcListItem from '@nextcloud/vue/components/NcListItem'
import ThreadItem from './ThreadItem.vue'
import router from '../../../__mocks__/router.js'
import storeConfig from '../../../store/storeConfig.js'

describe('ThreadItem.vue', () => {
	const TOKEN = 'XXTOKENXX'
	let store

	beforeEach(() => {
		store = createStore(cloneDeep(storeConfig))
	})

	/**
	 * Shared function to mount component
	 *
	 * @param {object} attendee Thread attendee data
	 */
	function mountThreadItem(attendee) {
		const thread = {
			thread: {
				id: 123,
				roomToken: TOKEN,
				title: 'hello thread root',
				numReplies: 3,
				lastActivity: 1700000000,
			},
			attendee,
			first: null,
			last: null,
		}
		return mount(ThreadItem, {
			global: {
				plugins: [router, store],
			},
			props: { thread },
		})
	}

	test('renders unread count and bold title when there are unread messages', async () => {
		const wrapper = mountThreadItem({ notificationLevel: 0, lastReadMessage: 10, unreadMessages: 4 })
		// NcListItem renders the details slot only after mounted() sets hasDetails
		await flushPromises()
		expect(wrapper.find('.thread__unread').text()).toBe('4')
		expect(wrapper.findComponent(NcListItem).props('bold')).toBe(true)
	})

	test('renders nothing extra when tracked but read', async () => {
		const wrapper = mountThreadItem({ notificationLevel: 0, lastReadMessage: 10, unreadMessages: 0 })
		await flushPromises()
		expect(wrapper.find('.thread__unread').exists()).toBeFalsy()
	})
})
