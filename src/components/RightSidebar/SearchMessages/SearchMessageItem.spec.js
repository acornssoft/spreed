/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createStore } from 'vuex'
import NcDateTime from '@nextcloud/vue/components/NcDateTime'
import SearchMessageItem from './SearchMessageItem.vue'
import router from '../../../__mocks__/router.js'
import { REMINDER } from '../../../constants.ts'
import storeConfig from '../../../store/storeConfig.js'

describe('SearchMessageItem.vue (acorns: no due date reminder)', () => {
	let store

	beforeEach(() => {
		setActivePinia(createPinia())
		store = createStore(storeConfig)
	})

	function mountItem(timestamp) {
		return shallowMount(SearchMessageItem, {
			global: {
				plugins: [router, store],
				stubs: {
					// acorns: NcListItem を shallowMount するとスロットが描かれないため、
					// details / actions スロットを描く最小スタブに差し替える
					NcListItem: {
						template: '<li><slot name="details" /><slot name="actions" /></li>',
					},
				},
			},
			props: {
				messageId: 1,
				title: 'Alice',
				to: { name: 'conversation', params: { token: 'token' } },
				subline: 'hello',
				actorId: 'alice',
				actorType: 'users',
				token: 'token',
				timestamp,
				isReminder: true,
			},
		})
	}

	it('shows "No due date" instead of a date for bookmark reminders', () => {
		const wrapper = mountItem(REMINDER.NO_DUE_DATE_TIMESTAMP)
		expect(wrapper.findComponent(NcDateTime).exists()).toBe(false)
		expect(wrapper.text()).toContain('No due date')
		expect(wrapper.vm.clearReminderLabel).toBe('Clear reminder – no due date')
	})

	it('keeps the relative date for timed reminders', () => {
		const wrapper = mountItem(Math.floor(Date.now() / 1000) + 3600)
		expect(wrapper.findComponent(NcDateTime).exists()).toBe(true)
		expect(wrapper.vm.clearReminderLabel).toMatch(/^Clear reminder – /)
	})
})
