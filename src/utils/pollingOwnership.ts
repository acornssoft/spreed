/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * acorns: トークンごとに long-poll を回す useGetMessages インスタンスを 1 つに限定する登録簿。
 *
 * 背景: messagesStore.pollNewMessages は requestId = token で前回のリクエストをキャンセルし、
 * キャンセルされた useGetMessages はループを再開しない。メイン領域(チャンネル)と右ペイン
 * (スレッド)に MessagesList を同時に出すと互いに殺し合うので、所有者だけがポーリングする。
 */

export type PollingInstance = {
	id: symbol
	/** 0 = メイン領域(チャンネル)。引き継ぎで優先される */
	getThreadId: () => number
	/** 所有者になったときに呼ばれる(ポーリング開始) */
	start: () => void
}

/**
 * 登録簿を作る(テストでは都度作り、アプリではモジュール単一の pollingOwnership を使う)
 */
export function createPollingOwnership() {
	const instancesByToken = new Map<string, PollingInstance[]>()
	const ownerByToken = new Map<string, PollingInstance>()

	/**
	 * @param token conversation token
	 */
	function electOwner(token: string) {
		const instances = instancesByToken.get(token) ?? []
		if (instances.length === 0) {
			ownerByToken.delete(token)
			return
		}
		// メイン領域(threadId 0)を優先、無ければ最初に登録されたもの
		const next = instances.find((i) => i.getThreadId() === 0) ?? instances[0]!
		ownerByToken.set(token, next)
		next.start()
	}

	return {
		register(token: string, instance: PollingInstance) {
			const instances = instancesByToken.get(token) ?? []
			if (!instances.some((i) => i.id === instance.id)) {
				instances.push(instance)
			}
			instancesByToken.set(token, instances)
			if (!ownerByToken.has(token)) {
				electOwner(token)
			}
		},

		unregister(token: string, instance: PollingInstance) {
			const instances = (instancesByToken.get(token) ?? []).filter((i) => i.id !== instance.id)
			if (instances.length === 0) {
				instancesByToken.delete(token)
			} else {
				instancesByToken.set(token, instances)
			}
			if (ownerByToken.get(token)?.id === instance.id) {
				ownerByToken.delete(token)
				electOwner(token)
			}
		},

		isOwner(token: string, instance: PollingInstance): boolean {
			return ownerByToken.get(token)?.id === instance.id
		},

		getOwner(token: string): PollingInstance | undefined {
			return ownerByToken.get(token)
		},
	}
}

export const pollingOwnership = createPollingOwnership()
