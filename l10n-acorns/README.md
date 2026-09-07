<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# l10n-acorns — 独自に補った翻訳

`l10n/` は Transifex が生成するディレクトリで、上流の l10n 同期のたびに丸ごと置き換わる。
このディレクトリはそこに重ねる**独自訳の正典**で、次の 3 種類を持つ。

1. 上流の Transifex に訳が無く英語のまま出ていた文字列
2. fork 固有の機能で追加した文字列(スレッド右ペイン、無期限リマインダー、Enter 送信設定など)
3. 上流訳の不具合を上書きしたもの

## 再生成

```sh
node l10n-acorns/apply.mjs          # l10n/<lang>.{json,js} を作り直す
node l10n-acorns/apply.mjs --check  # 反映漏れがあれば exit 1
```

冪等なので何度実行してもよい。**上流をマージして `l10n/` が更新されたら、必ず実行し直す**
(`l10n/ja.json` はコンフリクトしやすいので、上流側を採用してから再適用するのが早い)。

翻訳を追加・修正するときは `l10n/` を直接触らず、`l10n-acorns/<lang>.json` に書いて
`apply.mjs` を実行する。並びは `l10n/en_GB.json` のキー順に揃えられ、`en_GB` に無いキー
(fork 固有の文字列)は末尾に置かれる。

## 日本語版の現状

`l10n/ja.json` は `l10n/en_GB.json` のソース文字列 2332 件すべてを訳出済み
(内訳: 上流 Transifex 1846 件 + このディレクトリ 505 件、うち 18 件は `en_GB` に無い fork 固有・新規文字列)。

## Talk Desktop との関係

`acornssoft/talk-desktop` は `l10n-spreed/ja.json` に同じ内容の実行時オーバーレイを持っている。
同梱する spreed がこのディレクトリの訳を適用済みなら、そちらは冗長になる(登録順が後なので
同じ値で上書きされるだけで、害は無い)。整理する場合は talk-desktop 側を消す。
