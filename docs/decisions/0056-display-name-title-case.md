---
id: 0056
date: 2026-08-16
project: knockon
tags: [branding, naming]
status: accepted
supersedes: []
superseded-by: []
---

# user-facing の表示名は `Knockon`（Title Case）にする — ADR-0005 の未決事項を解消する

## 文脈

[ADR-0005](./0005-product-name-knockon.md) がプロダクト名を `knockon` に確定した。ただし同 ADR は §想定される影響で

> 派生する未確定事項: … ロゴのタイポグラフィ表記（`knockon` の**レターケース** / 句読点）。これらは別 ADR / DESIGN-SYSTEM 側で扱う。**本 ADR では扱わない**。

と書いており、**レターケースは明示的に未決**として残されていた。一方で決定文には「リポジトリ名 / コード上の識別子 / nokku 配下の表示はすべて `knockon`（小文字 ASCII）」ともあり、ストア掲載名の扱いが読み手によって割れる状態だった。

v1.0.0 公開後、実際に表示が割れていることが分かった。

| | 表示 |
|---|---|
| ホーム画面のアイコン名（`CFBundleDisplayName` ← `app.json` の `expo.name`） | `knockon` |
| App Store の掲載名 | `Knockon` |

#286 は「ADR-0005 に従って ASC 側を `knockon` に直す」としていたが、これは未決事項を「小文字で確定済み」と読んだ解釈だった。ここで逆向き（Title Case に揃える）を選ぶ判断をする。

## 検討した選択肢

- **案A（採用）**: user-facing の表示名を **`Knockon`** に統一する。ホーム画面（`app.json` の `expo.name`）を `Knockon` に変更し、ASC の掲載名 `Knockon` は据え置く。
- **案B（却下）**: `knockon`（小文字）に統一する。ASC の掲載名を変更する。#286 の当初案。
- **案C（却下）**: 現状維持（ホーム画面 `knockon` / ストア `Knockon`）。

## 決定

**user-facing の表示名は `Knockon`（Title Case）**。

1. `app.json` の `expo.name` を `Knockon` にする（→ `CFBundleDisplayName` / Android `app_name`）。
2. ASC の掲載名 `Knockon` は**変更しない**。
3. ⚠ **`knockon`（小文字）のままにするもの**: リポジトリ名 / `expo.slug` / バンドル ID（`co.nokku.knockon`） / コード上の識別子 / パッケージ名 / ドメイン。これらは user-facing ではない。
4. user-facing なプロダクト名は **1 箇所に集約**する（[CLAUDE.md](../../CLAUDE.md) §プロジェクト固有の注意点 6 の既存指示）。`src/productName.ts` の `PRODUCT_NAME` を唯一の出所とし、`app.json` の `expo.name` と一致することをテストで固定する。
5. [ADR-0005](./0005-product-name-knockon.md) は **supersede しない**。同 ADR が未決として残した項目を解消するだけで、プロダクト名が `knockon` という語であることは変わらない。ADR-0005 側に逆参照を残す（[K-005](../../KNOWLEDGE.md#k-005)）。

## 理由

- **ストアの慣行に合う**。App Store のアプリ名は Title Case が一般的で、小文字始まりは意図的な様式として読まれるか、単に不揃いに見えるかのどちらかになる。ブランド資産を蓄積させる（ADR-0005 §理由）方針なら、読み手の既定の期待に乗る方が摩擦が少ない。
- **ADR-0005 の整合性の論拠が、示された例自体で崩れている**。同 ADR は nokku 一族の命名として `jotlog` / `tsundone.` / **`Graft`** を挙げるが、**`Graft` は大文字始まり**。「小文字で揃っている」は一族の実態と一致していない。
- **既に公開済みで、掲載名の変更にはコストがある**。ADR-0005 自身が「ストア掲載後は**事実上のロックイン**」と書いている。既に `Knockon` で公開されている以上、変えない側に寄せるのが安い。
- **案C（現状維持）を却下する理由**: ホーム画面とストアで名前が違うのは、ユーザーから見て「別のアプリに見える / 探せない」に直結する。不一致そのものが問題なので、どちらかに揃える必要がある。

トレードオフ:
- ⚠ **既存ユーザーのホーム画面のアイコン名が `knockon` → `Knockon` に変わる**。名前自体は同じ語なので再認知コストは小さいと判断する。
- コード上は小文字、表示は Title Case という二重表記になる。`PRODUCT_NAME` に集約して、どちらを使うべきかを迷わせない形にする。

## 想定される影響

- **再ビルドが要る**（`CFBundleDisplayName` は Info.plist に載る）。v1.0.1 のビルドに含める。
- **ASC 側の作業はゼロ**。掲載名は据え置きなので、#286 の「表示名修正」項目は**不要になる**。
- `src/notifications.ts` の夜サマリ通知タイトルが `'knockon'` 直書きだった（CLAUDE.md §6 の「ハードコードせず 1 箇所に集約」に違反していた）。`PRODUCT_NAME` 経由に直す。
- **測れないままのこと**: 表示名の大小がインストール率や再認知に効くかは、この規模では測れない。効果測定を前提にした判断ではない。

## 関連

- [ADR-0005](./0005-product-name-knockon.md) — プロダクト名を `knockon` に確定（本 ADR がその未決事項を解消する）
- #286 — v1.0.1 提出（本 ADR により「表示名修正」項目が不要になる）
