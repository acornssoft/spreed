/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * l10n-acorns/<lang>.json の独自訳を Transifex 生成物 l10n/<lang>.{json,js} に重ねる。
 *
 *   node l10n-acorns/apply.mjs          # 再生成する
 *   node l10n-acorns/apply.mjs --check  # 差分が出るなら exit 1(反映漏れの検出用)
 *
 * 冪等。上流の l10n を同期して独自訳が消えたら、これを実行し直せば戻る。
 * 並びは l10n/en_GB.json のキー順に揃え、en_GB に無いキー(独自機能の文字列など)は末尾に置く。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const overlayDir = dirname(fileURLToPath(import.meta.url))
const l10nDir = join(dirname(overlayDir), 'l10n')
const check = process.argv.includes('--check')

/**
 * @param {string} path - 読み込む JSON ファイル
 * @return {object} パース結果
 */
function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * 生成物の書式は upstream の Transifex 出力に合わせる(空白・カンマの位置まで一致させる)
 *
 * @param {string|string[]} value - 翻訳。複数形は配列
 * @return {string} 1 エントリー分の右辺
 */
function renderValue(value) {
	return Array.isArray(value)
		? '[' + value.map((one) => JSON.stringify(one)).join(',') + ']'
		: JSON.stringify(value)
}

/**
 * @param {object} translations - ソース文字列から翻訳への対応
 * @return {string} エントリー行を並べたもの
 */
function renderEntries(translations) {
	return Object.entries(translations)
		.map(([key, value]) => `    ${JSON.stringify(key)} : ${renderValue(value)}`)
		.join(',\n')
}

/**
 * @param {object} translations - ソース文字列から翻訳への対応
 * @param {string} pluralForm - gettext の Plural-Forms
 * @return {string} l10n/<lang>.json の中身。末尾に改行は付かない
 */
function renderJson(translations, pluralForm) {
	return `{ "translations": {\n${renderEntries(translations)}\n},"pluralForm" :"${pluralForm}"\n}`
}

/**
 * @param {string} app - アプリ ID
 * @param {object} translations - ソース文字列から翻訳への対応
 * @param {string} pluralForm - gettext の Plural-Forms
 * @return {string} l10n/<lang>.js の中身
 */
function renderJs(app, translations, pluralForm) {
	return `OC.L10N.register(\n    "${app}",\n    {\n${renderEntries(translations)}\n},\n"${pluralForm}");\n`
}

/**
 * OC.L10N.register("<app>", …) の第 1 引数からアプリ ID を取る
 *
 * @return {string} アプリ ID
 */
function detectAppId() {
	const candidates = ['en_GB.js', ...readdirSync(l10nDir).filter((name) => name.endsWith('.js'))]
	for (const file of candidates) {
		const path = join(l10nDir, file)
		if (!existsSync(path)) {
			continue
		}
		const found = /^OC\.L10N\.register\(\s*"([^"]+)"/.exec(readFileSync(path, 'utf8'))
		if (found) {
			return found[1]
		}
	}
	throw new Error(`アプリ ID を ${l10nDir} の .js から判定できませんでした`)
}

/**
 * 上流訳に独自訳を重ね、en_GB のキー順に並べ直す
 *
 * @param {object} base - l10n/<lang>.json の translations
 * @param {object} overlay - l10n-acorns/<lang>.json の translations
 * @param {string[]} sourceOrder - l10n/en_GB.json のキー順
 * @return {object} マージ結果
 */
function mergeTranslations(base, overlay, sourceOrder) {
	const merged = {}
	for (const key of sourceOrder) {
		if (key in overlay) {
			merged[key] = overlay[key]
		} else if (key in base) {
			merged[key] = base[key]
		}
	}
	// en_GB に無いキー: 独自機能の文字列や、上流の l10n 同期がまだ追いついていない文字列
	for (const [key, value] of Object.entries(overlay)) {
		merged[key] ??= value
	}
	for (const [key, value] of Object.entries(base)) {
		merged[key] ??= value
	}
	return merged
}

const appId = detectAppId()
const sourceOrder = Object.keys(readJson(join(l10nDir, 'en_GB.json')).translations)
const overlays = readdirSync(overlayDir).filter((name) => name.endsWith('.json'))

let changed = 0
for (const name of overlays) {
	const lang = name.replace(/\.json$/, '')
	const overlay = readJson(join(overlayDir, name))
	const basePath = join(l10nDir, `${lang}.json`)
	const base = existsSync(basePath) ? readJson(basePath) : { translations: {}, pluralForm: overlay.pluralForm }
	const merged = mergeTranslations(base.translations, overlay.translations, sourceOrder)
	const pluralForm = base.pluralForm ?? overlay.pluralForm

	for (const [ext, content] of [['json', renderJson(merged, pluralForm)], ['js', renderJs(appId, merged, pluralForm)]]) {
		const path = join(l10nDir, `${lang}.${ext}`)
		if (existsSync(path) && readFileSync(path, 'utf8') === content) {
			continue
		}
		changed++
		if (check) {
			console.error(`差分あり: l10n/${lang}.${ext}`)
		} else {
			writeFileSync(path, content)
			console.log(`更新: l10n/${lang}.${ext} (${Object.keys(merged).length} 件)`)
		}
	}
}

if (check && changed) {
	console.error('l10n-acorns の内容が l10n/ に反映されていません。`node l10n-acorns/apply.mjs` を実行してください。')
	process.exit(1)
}
if (!changed) {
	console.log(`l10n/ は l10n-acorns と一致しています (${appId}, ${overlays.length} 言語)`)
}
