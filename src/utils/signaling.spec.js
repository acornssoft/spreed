/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@nextcloud/axios', () => ({
	default: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
	isCancel: vi.fn(),
}))

vi.mock('@nextcloud/dialogs', () => ({
	showError: vi.fn(() => ({ hideToast: vi.fn() })),
	showWarning: vi.fn(() => ({ hideToast: vi.fn() })),
	TOAST_PERMANENT_TIMEOUT: -1,
}))

vi.mock('../services/CapabilitiesManager.ts', () => ({
	hasTalkFeature: vi.fn(() => false),
}))

vi.mock('../services/participantsService.js', () => ({
	rejoinConversation: vi.fn(),
}))

vi.mock('../services/signalingService.js', () => ({
	pullSignalingMessages: vi.fn(),
}))

vi.mock('../store/index.js', () => ({
	default: {
		commit: vi.fn(),
		dispatch: vi.fn(() => Promise.resolve()),
		getters: {},
	},
}))

vi.mock('../stores/actor.ts', () => ({
	useActorStore: vi.fn(() => ({
		setCurrentParticipant: vi.fn(),
	})),
}))

vi.mock('../stores/pinia.ts', () => ({
	default: {},
}))

vi.mock('./e2ee/encryption.js', () => ({
	default: {
		isEnabled: vi.fn(() => false),
		isSupported: vi.fn(() => Promise.resolve(false)),
	},
}))

import store from '../store/index.js'
import Signaling from './signaling.js'

// Close codes of the WebSocket protocol (RFC 6455, section 7.4.1)
const CLOSE_GOING_AWAY = 1001
const CLOSE_ABNORMAL = 1006

/**
 * Stand-in for the browser WebSocket: it only records the created sockets, so
 * the tests can deliver the events of the real one by calling the handlers.
 */
class FakeWebSocket {
	static instances = []

	constructor(url) {
		this.url = url
		this.sent = []
		this.closed = false
		FakeWebSocket.instances.push(this)
	}

	send(data) {
		this.sent.push(JSON.parse(data))
	}

	close() {
		this.closed = true
	}
}

/**
 * The longest time the signaling waits before it connects again, in ms
 * (maxReconnectIntervalMs plus the random part added to it).
 */
const LONGEST_RECONNECT_DELAY = 30_000

describe('Signaling.Standalone connection', () => {
	const settings = {
		token: 'TOKEN',
		signalingMode: 'external',
		server: 'https://signaling.example.org/',
		helloAuthParams: {
			'1.0': { userid: 'alice', ticket: 'ticket' },
		},
	}

	let originalWebSocket
	let signaling

	beforeEach(() => {
		vi.useFakeTimers()
		originalWebSocket = globalThis.WebSocket
		globalThis.WebSocket = FakeWebSocket
		FakeWebSocket.instances = []

		signaling = Signaling.createConnection(settings)
	})

	afterEach(() => {
		signaling.disconnect()
		vi.clearAllTimers()
		vi.useRealTimers()
		globalThis.WebSocket = originalWebSocket
		window.dispatchEvent(new Event('pageshow'))
	})

	test('connects to the signaling server when created', () => {
		expect(FakeWebSocket.instances).toHaveLength(1)
		expect(FakeWebSocket.instances[0].url).toBe('wss://signaling.example.org/spreed')
	})

	test('connects again when the connection is lost without a close frame', () => {
		FakeWebSocket.instances[0].onclose({ code: CLOSE_ABNORMAL })
		vi.advanceTimersByTime(LONGEST_RECONNECT_DELAY)

		expect(FakeWebSocket.instances).toHaveLength(2)
	})

	// acorns: a proxy in front of the signaling server (or the server itself
	// when it shuts down) closes the connection with "going away" while the
	// page stays open. Without connecting again the page keeps running
	// without signaling until it is reloaded.
	test('connects again when the other side closes the connection with "going away"', () => {
		FakeWebSocket.instances[0].onclose({ code: CLOSE_GOING_AWAY })
		vi.advanceTimersByTime(LONGEST_RECONNECT_DELAY)

		expect(FakeWebSocket.instances).toHaveLength(2)
	})

	test('does not connect again when the browser closes the connection because the page is left', () => {
		window.dispatchEvent(new Event('pagehide'))
		FakeWebSocket.instances[0].onclose({ code: CLOSE_GOING_AWAY })
		vi.advanceTimersByTime(LONGEST_RECONNECT_DELAY)

		expect(FakeWebSocket.instances).toHaveLength(1)
	})

	test('connects again after a "going away" close once the page is shown again', () => {
		window.dispatchEvent(new Event('pagehide'))
		window.dispatchEvent(new Event('pageshow'))
		FakeWebSocket.instances[0].onclose({ code: CLOSE_GOING_AWAY })
		vi.advanceTimersByTime(LONGEST_RECONNECT_DELAY)

		expect(FakeWebSocket.instances).toHaveLength(2)
	})

	test('does not connect again after it was disconnected on purpose', () => {
		const socket = FakeWebSocket.instances[0]
		signaling.disconnect()
		socket.onclose({ code: CLOSE_GOING_AWAY })
		vi.advanceTimersByTime(LONGEST_RECONNECT_DELAY)

		expect(socket.closed).toBe(true)
		expect(FakeWebSocket.instances).toHaveLength(1)
	})
})

describe('Signaling.Standalone rejected join of a room', () => {
	const settings = {
		token: 'TOKEN',
		signalingMode: 'external',
		server: 'https://signaling.example.org/',
		helloAuthParams: {
			'1.0': { userid: 'alice', ticket: 'ticket' },
		},
	}

	let originalWebSocket
	let signaling
	let socket

	/**
	 * Answer the join of the given room as the signaling server does when
	 * Nextcloud does not know the session that was sent with it.
	 *
	 * @param {string} token conversation token of the join to reject
	 */
	function rejectJoin(token) {
		const join = socket.sent.findLast((message) => message.type === 'room' && message.room.roomid === token)
		socket.onmessage({
			data: JSON.stringify({
				id: join.id,
				type: 'error',
				error: { code: 'no_such_room', message: 'The user is not invited to this room.' },
			}),
		})
	}

	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(console, 'error').mockImplementation(() => {})
		originalWebSocket = globalThis.WebSocket
		globalThis.WebSocket = FakeWebSocket
		FakeWebSocket.instances = []

		signaling = Signaling.createConnection(settings)
		socket = FakeWebSocket.instances[0]
		socket.onopen({})
		const hello = socket.sent.find((message) => message.type === 'hello')
		socket.onmessage({
			data: JSON.stringify({
				id: hello.id,
				type: 'hello',
				hello: { sessionid: 'signaling-session', resumeid: 'resume-id', server: { features: [] } },
			}),
		})
	})

	afterEach(() => {
		signaling.disconnect()
		globalThis.WebSocket = originalWebSocket
		vi.restoreAllMocks()
	})

	test('joins the conversation again with a new session when the join of the current room is rejected', async () => {
		await signaling.joinRoom('ROOM_A', 'session-a')
		rejectJoin('ROOM_A')

		expect(store.dispatch).toHaveBeenCalledExactlyOnceWith('joinConversation', { token: 'ROOM_A' })
	})

	// acorns: when conversations are switched quickly the answer to the join of
	// a room that was left already can arrive late. Joining "the current room"
	// again then is at best not needed, and it is wrong when the room that was
	// left is still the current one for the signaling.
	test('does not join again when the rejected join is of a room that is not the current one any more', async () => {
		await signaling.joinRoom('ROOM_B', 'session-b')
		await signaling.joinRoom('ROOM_C', 'session-c')
		rejectJoin('ROOM_B')

		expect(store.dispatch).not.toHaveBeenCalled()
	})

	test('does not join again when the rejected join is of a room that was left meanwhile', async () => {
		await signaling.joinRoom('ROOM_B', 'session-b')
		signaling.leaveCurrentRoom()
		await Promise.resolve()
		rejectJoin('ROOM_B')

		expect(store.dispatch).not.toHaveBeenCalled()
	})
})
