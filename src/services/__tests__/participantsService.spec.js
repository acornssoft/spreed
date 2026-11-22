/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
	signalingJoinConversation,
	signalingLeaveConversation,
} from '../../utils/webrtc/index.js'
import { joinConversation, leaveConversation } from '../participantsService.js'

vi.mock('@nextcloud/axios', () => ({
	default: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}))

vi.mock('@nextcloud/dialogs', () => ({
	showWarning: vi.fn(),
}))

vi.mock('../../utils/webrtc/index.js', () => ({
	signalingJoinConversation: vi.fn(),
	signalingLeaveConversation: vi.fn(),
	signalingSetTyping: vi.fn(),
}))

/**
 * A promise that the test settles when it wants the request to finish
 */
function createDeferred() {
	let resolve
	const promise = new Promise((_resolve) => {
		resolve = _resolve
	})
	return { promise, resolve }
}

/**
 * Response of the request to join a conversation
 *
 * @param {string} token conversation token
 * @param {string} sessionId session id given by the server
 */
function joinResponse(token, sessionId) {
	return {
		headers: new Map(),
		data: { ocs: { data: { token, sessionId } } },
	}
}

/**
 * URL of the requests to join and to leave a conversation
 *
 * @param {string} token conversation token
 */
function activeUrl(token) {
	return generateOcsUrl('apps/spreed/api/v4/room/{token}/participants/active', { token })
}

describe('participantsService', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		axios.delete.mockResolvedValue({})
		signalingJoinConversation.mockResolvedValue(true)
		signalingLeaveConversation.mockResolvedValue()
	})

	describe('joinConversation', () => {
		test('joins the conversation in the signaling server with the session of the response', async () => {
			const response = joinResponse('ROOM_B', 'session-b')
			axios.post.mockResolvedValue(response)

			const result = await joinConversation({ token: 'ROOM_B' })

			expect(axios.post).toHaveBeenCalledWith(activeUrl('ROOM_B'), { force: false }, undefined)
			expect(signalingJoinConversation).toHaveBeenCalledExactlyOnceWith('ROOM_B', 'session-b', expect.any(Function))
			expect(result).toBe(response)
		})

		// acorns: the join is not awaited when switching conversations, so the
		// next switch can leave the conversation before the response arrives.
		// Joining it in the signaling server afterwards moves the signaling
		// away from the conversation that is shown.
		test('does not join the signaling server if the conversation was left while the request was pending', async () => {
			const pendingJoin = createDeferred()
			axios.post.mockReturnValueOnce(pendingJoin.promise)

			const joining = joinConversation({ token: 'ROOM_B' })
			await leaveConversation('ROOM_B')
			pendingJoin.resolve(joinResponse('ROOM_B', 'session-b'))
			const result = await joining

			expect(signalingJoinConversation).not.toHaveBeenCalled()
			expect(result).toBeNull()
		})

		test('removes the session of a join that finished after the conversation was left', async () => {
			const pendingJoin = createDeferred()
			axios.post.mockReturnValueOnce(pendingJoin.promise)

			const joining = joinConversation({ token: 'ROOM_B' })
			await leaveConversation('ROOM_B')
			expect(axios.delete).toHaveBeenCalledTimes(1)
			pendingJoin.resolve(joinResponse('ROOM_B', 'session-b'))
			await joining

			expect(axios.delete).toHaveBeenCalledTimes(2)
			expect(axios.delete).toHaveBeenLastCalledWith(activeUrl('ROOM_B'))
		})

		test('does not join the signaling server if another conversation was joined while the request was pending', async () => {
			const pendingJoinB = createDeferred()
			axios.post.mockReturnValueOnce(pendingJoinB.promise)
			axios.post.mockResolvedValueOnce(joinResponse('ROOM_C', 'session-c'))

			const joiningB = joinConversation({ token: 'ROOM_B' })
			const resultC = await joinConversation({ token: 'ROOM_C' })
			pendingJoinB.resolve(joinResponse('ROOM_B', 'session-b'))
			const resultB = await joiningB

			expect(signalingJoinConversation).toHaveBeenCalledExactlyOnceWith('ROOM_C', 'session-c', expect.any(Function))
			expect(resultC).not.toBeNull()
			expect(resultB).toBeNull()
			expect(axios.delete).toHaveBeenCalledExactlyOnceWith(activeUrl('ROOM_B'))
		})

		test('only the latest of several joins of the same conversation joins the signaling server', async () => {
			const pendingFirstJoin = createDeferred()
			axios.post.mockReturnValueOnce(pendingFirstJoin.promise)
			axios.post.mockResolvedValueOnce(joinResponse('ROOM_B', 'session-b-2'))

			const firstJoining = joinConversation({ token: 'ROOM_B' })
			const secondResult = await joinConversation({ token: 'ROOM_B' })
			pendingFirstJoin.resolve(joinResponse('ROOM_B', 'session-b-1'))
			const firstResult = await firstJoining

			expect(signalingJoinConversation).toHaveBeenCalledExactlyOnceWith('ROOM_B', 'session-b-2', expect.any(Function))
			expect(secondResult).not.toBeNull()
			expect(firstResult).toBeNull()
			// The conversation is still wanted, the session of the latest join must stay
			expect(axios.delete).not.toHaveBeenCalled()
		})

		test('leaving another conversation does not cancel a pending join', async () => {
			const pendingJoin = createDeferred()
			axios.post.mockReturnValueOnce(pendingJoin.promise)

			const joining = joinConversation({ token: 'ROOM_B' })
			await leaveConversation('ROOM_A')
			pendingJoin.resolve(joinResponse('ROOM_B', 'session-b'))
			const result = await joining

			expect(signalingJoinConversation).toHaveBeenCalledExactlyOnceWith('ROOM_B', 'session-b', expect.any(Function))
			expect(result).not.toBeNull()
		})

		describe('while the signaling settings are fetched', () => {
			let pendingSettings

			beforeEach(() => {
				// Like the real one: the room is only joined if the join is
				// still wanted once the signaling settings were fetched
				pendingSettings = createDeferred()
				signalingJoinConversation.mockImplementation(async (token, sessionId, isStillWanted) => {
					await pendingSettings.promise
					return isStillWanted()
				})
				axios.post.mockResolvedValue(joinResponse('ROOM_B', 'session-b'))
			})

			test('gives the response when nothing else happened', async () => {
				const joining = joinConversation({ token: 'ROOM_B' })
				pendingSettings.resolve()

				expect(await joining).not.toBeNull()
				expect(axios.delete).not.toHaveBeenCalled()
			})

			test('does not join the signaling room and removes the session if the conversation was left', async () => {
				const joining = joinConversation({ token: 'ROOM_B' })
				await vi.waitFor(() => expect(signalingJoinConversation).toHaveBeenCalled())
				await leaveConversation('ROOM_B')
				pendingSettings.resolve()

				expect(await joining).toBeNull()
				expect(axios.delete).toHaveBeenCalledTimes(2)
				expect(axios.delete).toHaveBeenLastCalledWith(activeUrl('ROOM_B'))
			})

			test('does not join the signaling room and keeps the session if the same conversation was joined again', async () => {
				const firstJoining = joinConversation({ token: 'ROOM_B' })
				await vi.waitFor(() => expect(signalingJoinConversation).toHaveBeenCalled())
				const secondJoining = joinConversation({ token: 'ROOM_B' })
				pendingSettings.resolve()

				expect(await firstJoining).toBeNull()
				expect(await secondJoining).not.toBeNull()
				expect(axios.delete).not.toHaveBeenCalled()
			})
		})

		test('gives no response if the conversation was left while the signaling room was joined', async () => {
			const pendingSignalingJoin = createDeferred()
			signalingJoinConversation.mockReturnValueOnce(pendingSignalingJoin.promise)
			axios.post.mockResolvedValue(joinResponse('ROOM_B', 'session-b'))

			const joining = joinConversation({ token: 'ROOM_B' })
			await vi.waitFor(() => expect(signalingJoinConversation).toHaveBeenCalled())
			await leaveConversation('ROOM_B')
			pendingSignalingJoin.resolve(true)

			expect(await joining).toBeNull()
			// Leaving removed the session already
			expect(axios.delete).toHaveBeenCalledTimes(1)
		})
	})

	describe('leaveConversation', () => {
		test('leaves the conversation in the signaling server and in the server', async () => {
			await leaveConversation('ROOM_A')

			expect(signalingLeaveConversation).toHaveBeenCalledExactlyOnceWith('ROOM_A')
			expect(axios.delete).toHaveBeenCalledExactlyOnceWith(activeUrl('ROOM_A'))
		})
	})
})
