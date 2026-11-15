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

vi.mock('../sounds.js', () => ({
	Sounds: {
		playJoin: vi.fn(),
		playLeave: vi.fn(),
	},
}))

vi.mock('./LocalStateBroadcasterMcu.ts', () => ({
	LocalStateBroadcasterMcu: class {
		destroy() {}
	},
}))

// RTCPeerConnection and media devices are not available in the tests, so
// SimpleWebRTC is replaced by a minimal stand-in that only keeps track of the
// peers and whether there are local tracks.
vi.mock('./simplewebrtc/simplewebrtc.js', () => {
	class FakeEmitter {
		constructor() {
			this._handlers = {}
		}

		on(event, handler) {
			this._handlers[event] = this._handlers[event] || []
			this._handlers[event].push(handler)
		}

		off(event, handler) {
			this._handlers[event] = (this._handlers[event] || []).filter((registered) => registered !== handler)
		}

		emit(event, ...args) {
			(this._handlers[event] || []).slice().forEach((handler) => handler(...args))
		}
	}

	class FakePeer extends FakeEmitter {
		constructor(parent, options) {
			super()

			Object.assign(this, options)

			this._parent = parent
			this.pc = {
				iceConnectionState: 'connected',
				connectionState: 'connected',
				signalingState: 'stable',
				addEventListener() {},
				getSenders() {
					return []
				},
			}
		}

		start() {}

		end() {
			this._parent.peers = this._parent.peers.filter((peer) => peer !== this)
		}

		getDataChannel() {}
	}

	class FakeWebRtc extends FakeEmitter {
		constructor() {
			super()

			this.peers = []
			this.localStreams = [{}]
			this.audioTrack = false
			this.videoTrack = false
		}

		getPeers(sessionId, type) {
			return this.peers.filter((peer) => {
				return (!sessionId || peer.id === sessionId) && (!type || peer.type === type)
			})
		}

		createPeer(options) {
			const peer = new FakePeer(this, options)
			this.peers.push(peer)

			return peer
		}

		hasAudioTrack() {
			return this.audioTrack
		}

		hasVideoTrack() {
			return this.videoTrack
		}

		isAudioAllowed() {
			return true
		}

		isVideoAllowed() {
			return true
		}
	}

	class FakeSimpleWebRTC extends FakeEmitter {
		constructor(options) {
			super()

			this.connection = options.connection
			this.webrtc = new FakeWebRtc()
		}

		removePeers(sessionId) {
			this.webrtc.getPeers(sessionId).forEach((peer) => peer.end())
		}

		getLocalScreen() {
			return null
		}

		leaveCall() {}
	}

	return { default: FakeSimpleWebRTC }
})

const TOKEN = 'XXTOKENXX'
const LOCAL_SESSION_ID = 'localSessionId'

const IN_CALL = 1
const IN_CALL_WITH_AUDIO = 3
const IN_CALL_WITH_VIDEO = 5
const IN_CALL_WITH_AUDIO_AND_VIDEO = 7

describe('webrtc', () => {
	let axios
	let signaling
	let webrtc
	let pendingRequests

	/**
	 * Wait for the promise chains triggered by a settled request to finish.
	 */
	async function flushPromises() {
		for (let i = 0; i < 10; i++) {
			await Promise.resolve()
		}
	}

	/**
	 * Make the next requests of the given method stay pending until they are
	 * explicitly settled from the test.
	 *
	 * @param {string} method the axios method
	 */
	function holdRequests(method) {
		axios[method].mockImplementation(() => new Promise((resolve, reject) => {
			pendingRequests[method].push({ resolve, reject })
		}))
	}

	/**
	 * @param {object} user the participant as sent by the signaling server
	 */
	function inCallUser(user) {
		return {
			userId: user.sessionId + '-user',
			participantPermissions: 502,
			...user,
		}
	}

	/**
	 * @param {number} flags the call flags to join with
	 * @param {object} localMedia whether there are local audio and video tracks
	 */
	async function joinCall(flags, localMedia) {
		webrtc.webrtc.audioTrack = localMedia.audio
		webrtc.webrtc.videoTrack = localMedia.video

		axios.post.mockResolvedValue({})

		await signaling.joinCall(TOKEN, flags)
	}

	/**
	 * Report the participants in the call as the signaling server does once
	 * the call was joined, including the local participant.
	 *
	 * @param {number} localFlags the call flags of the local participant
	 * @param {Array} others the other participants in the call
	 */
	function setParticipantsInCall(localFlags, others) {
		signaling._trigger('usersChanged', [[
			inCallUser({ sessionId: LOCAL_SESSION_ID, inCall: localFlags }),
			...others.map((user) => inCallUser(user)),
		]])
	}

	/**
	 * The HPB answers the offer of the own (publisher) peer.
	 */
	function receiveAnswerForOwnPeer() {
		signaling._trigger('message', [{ type: 'answer', roomType: 'video', from: LOCAL_SESSION_ID }])
	}

	beforeEach(async () => {
		vi.resetModules()

		axios = (await import('@nextcloud/axios')).default
		axios.post.mockReset()
		axios.put.mockReset()

		pendingRequests = { put: [] }

		const Signaling = (await import('../signaling.js')).default
		const { CallParticipantCollection } = await import('./models/CallParticipantCollection.js')
		const { LocalCallParticipantModel } = await import('./models/LocalCallParticipantModel.js')
		const { initWebRtc } = await import('./webrtc.js')

		signaling = new Signaling.Base({ turnservers: [], stunservers: [] })
		signaling.sessionId = LOCAL_SESSION_ID
		signaling.features = { mcu: true }
		// The connection with the signaling server is out of the scope of
		// these tests; only what is requested to it matters.
		signaling.requestOffer = vi.fn()
		signaling.forceReconnect = vi.fn()

		const localCallParticipantModel = new LocalCallParticipantModel()
		localCallParticipantModel.setPeerId(LOCAL_SESSION_ID)

		webrtc = initWebRtc(signaling, new CallParticipantCollection(), localCallParticipantModel)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('call flags of the local participant (HPB)', () => {
		test('forces a reconnection if the audio track comes back while the "no media" flags are still being sent', async () => {
			await joinCall(IN_CALL_WITH_AUDIO, { audio: true, video: false })
			setParticipantsInCall(IN_CALL_WITH_AUDIO, [{ sessionId: 'otherSessionId', inCall: IN_CALL_WITH_AUDIO }])
			receiveAnswerForOwnPeer()

			holdRequests('put')

			// The microphone is lost...
			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			expect(axios.put).toHaveBeenCalledTimes(1)
			expect(axios.put.mock.calls[0][1]).toEqual({ flags: IN_CALL })

			// ... and got again before the server confirmed the new flags.
			webrtc.webrtc.audioTrack = true
			webrtc.emit('localTrackReplaced', { kind: 'audio' }, null)

			pendingRequests.put[0].resolve({})
			await flushPromises()

			// Participants joining from now on would see flags without any
			// media and would not connect, so the same recovery as when the
			// track is got once the flags were confirmed is expected.
			expect(signaling.forceReconnect).toHaveBeenCalledTimes(1)
			expect(signaling.forceReconnect).toHaveBeenCalledWith(true, IN_CALL_WITH_AUDIO)
		})

		test('sends the flags again if the audio track comes back while flags with only video are still being sent', async () => {
			await joinCall(IN_CALL_WITH_AUDIO_AND_VIDEO, { audio: true, video: true })
			setParticipantsInCall(IN_CALL_WITH_AUDIO_AND_VIDEO, [{ sessionId: 'otherSessionId', inCall: IN_CALL_WITH_AUDIO }])
			receiveAnswerForOwnPeer()

			holdRequests('put')

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			expect(axios.put).toHaveBeenCalledTimes(1)
			expect(axios.put.mock.calls[0][1]).toEqual({ flags: IN_CALL_WITH_VIDEO })

			webrtc.webrtc.audioTrack = true
			webrtc.emit('localTrackReplaced', { kind: 'audio' }, null)

			pendingRequests.put[0].resolve({})
			await flushPromises()

			expect(signaling.forceReconnect).not.toHaveBeenCalled()
			expect(axios.put).toHaveBeenCalledTimes(2)
			expect(axios.put.mock.calls[1][1]).toEqual({ flags: IN_CALL_WITH_AUDIO_AND_VIDEO })
		})

		test('forces a reconnection if the audio track comes back once the "no media" flags were confirmed', async () => {
			await joinCall(IN_CALL_WITH_AUDIO, { audio: true, video: false })
			setParticipantsInCall(IN_CALL_WITH_AUDIO, [{ sessionId: 'otherSessionId', inCall: IN_CALL_WITH_AUDIO }])
			receiveAnswerForOwnPeer()

			holdRequests('put')

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			pendingRequests.put[0].resolve({})
			await flushPromises()

			expect(signaling.forceReconnect).not.toHaveBeenCalled()

			webrtc.webrtc.audioTrack = true
			webrtc.emit('localTrackReplaced', { kind: 'audio' }, null)

			expect(signaling.forceReconnect).toHaveBeenCalledTimes(1)
			expect(signaling.forceReconnect).toHaveBeenCalledWith(true, IN_CALL_WITH_AUDIO)
			expect(axios.put).toHaveBeenCalledTimes(1)
		})

		test('does not force a reconnection if the audio track that came back is lost again while the "no media" flags are still being sent', async () => {
			await joinCall(IN_CALL_WITH_AUDIO, { audio: true, video: false })
			setParticipantsInCall(IN_CALL_WITH_AUDIO, [{ sessionId: 'otherSessionId', inCall: IN_CALL_WITH_AUDIO }])
			receiveAnswerForOwnPeer()

			holdRequests('put')

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			webrtc.webrtc.audioTrack = true
			webrtc.emit('localTrackReplaced', { kind: 'audio' }, null)

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			pendingRequests.put[0].resolve({})
			await flushPromises()

			// The flags confirmed by the server already match the local media.
			expect(signaling.forceReconnect).not.toHaveBeenCalled()
			expect(axios.put).toHaveBeenCalledTimes(1)
		})

		test('waits until the flags adjusted when joining the call are confirmed before sending the flags for a lost track', async () => {
			holdRequests('put')

			// Joined announcing only audio, but there is also a video track.
			await joinCall(IN_CALL_WITH_AUDIO, { audio: true, video: true })

			expect(axios.put).toHaveBeenCalledTimes(1)
			expect(axios.put.mock.calls[0][1]).toEqual({ flags: IN_CALL_WITH_AUDIO_AND_VIDEO })

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			expect(axios.put).toHaveBeenCalledTimes(1)

			pendingRequests.put[0].resolve({})
			await flushPromises()

			expect(axios.put).toHaveBeenCalledTimes(2)
			expect(axios.put.mock.calls[1][1]).toEqual({ flags: IN_CALL_WITH_VIDEO })
		})

		test('sends the flags for a later track change after a failed update', async () => {
			await joinCall(IN_CALL_WITH_AUDIO_AND_VIDEO, { audio: true, video: true })
			setParticipantsInCall(IN_CALL_WITH_AUDIO_AND_VIDEO, [{ sessionId: 'otherSessionId', inCall: IN_CALL_WITH_AUDIO }])
			receiveAnswerForOwnPeer()

			holdRequests('put')

			webrtc.webrtc.videoTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'video' })

			pendingRequests.put[0].reject(new Error('Request failed'))
			await flushPromises()

			webrtc.webrtc.audioTrack = false
			webrtc.emit('localTrackReplaced', null, { kind: 'audio' })

			expect(axios.put).toHaveBeenCalledTimes(2)
			expect(axios.put.mock.calls[1][1]).toEqual({ flags: IN_CALL })
		})
	})
})
