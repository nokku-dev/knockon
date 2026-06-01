---
id: 0033
date: 2026-06-01
project: knockon
tags: [ux, branding, scope]
status: accepted
supersedes: []
superseded-by: []
---

# 編集UI 仕上げ: faint テキストの WCAG AA 化 / 空状態 / タッチターゲット

## 文脈

Issue #74: テンプレ編集UI のアクセシビリティ + 空状態の仕上げ。SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §7/§8。discovery(#70/#71) / onboarding(#72) / 編集UI(#73,#95,#93,#94) の後の最終仕上げ。

3 点が宿題だった: (1) モジュールの色のみ依存回避、(2) タッチターゲット ≥44px、(3) 補助テキスト(faint グレー)の WCAG AA、加えて (4) 空状態の定義。

特に (3) は `--fg-faint`（DESIGN-SYSTEM v0.2 §1 で Dark 28% / Light 26% = 実測 `#5A5A60` / `rgba(26,26,25,0.26)`）が **bg 上で約 2.7:1 / 1.7:1 と AA(4.5:1) 未達**だった。faint はアプリ全体（Today / 分析 / 編集）の補助テキストに使われるため、修正は全画面に波及する。

## 検討した選択肢

### faint コントラスト (ユーザー判断で確定)

- **案A: AA(4.5:1) まで明るく＝全体反映 (採用)**
  - `--fg-faint` を Dark `#8A8A90` / Light `#6E6E6E` に変更。bg / surface 双方で AA 達成。
- 案B: AA 3:1 (大きめ文字基準) に留める — 見た目変化最小だが AA(4.5) 未達のまま。却下。
- 案C: 今は変えない (別 issue) — SPEC §7 を満たせない。却下。

### モジュールの非色キュー

- **採用**: 識別は常時テキスト（チップ層の色ドット+名前 / 追加先ピッカー / 行の run 先頭名=C 案）で成立させ、カラーストライプは冗長な副次キューとする。新たなアイコン/形は増やさない（DESIGN-SYSTEM の「形変化は定着で星の 1 回のみ」を侵さない）。

### 全 OFF（全ノード一時停止）の空状態

- **採用 (ユーザー判断)**: Today で「すべて一時停止中 · 編集で再開できます」を穏やかに表示。マイナスを指差さず前向きに再開導線（Augmentation 原則）。チェーンカードは残す。active チェーンは必ず 1 ノード以上保存されるため「表示ノード 0 = 全休止」と一意に判定できる。

## 決定

上記 案A + 非色キュー + 穏やかな空状態 を採用。

- `tokens.ts` / `theme.ts`(DARK/LIGHT) の `fgFaint` を AA 達成値に変更。DESIGN-SYSTEM §1 の fg-faint 行を実 hex に更新し AA 注記。
- `theme.test.ts` に faint × bg/surface のコントラスト ≥4.5 を計算する機械検証を追加（K-006 spirit の a11y 不変条件）。
- `ChainDetail`: 表示ノード 0 件で「すべて一時停止中 · 編集で再開できます」。
- タッチターゲット: ON/OFF・削除は明示ボタン（スワイプ非依存）、小要素は `hitSlop` で実効 ≥44px。

## 理由

- **faint を AA に寄せる**: 補助テキストでも可読性は必須（SPEC §7）。「faint＝薄い」見た目より可読性を優先。コントラスト不変条件をテスト固定し、将来の token 変更で再退行しないようにする。
- **非色キューはテキスト常時表示で担保**: 既存の C 案ラベル + ロスター凡例が既にテキスト識別を提供しており、追加の形/アイコンは Celebrate 主の核（形変化は定着のみ）と競合させない。
- **空状態は Celebrate 主と整合**: 「休止＝悪」ではなく「再開できる」という前向き表現にし、離脱を指差さない（[K-016](../../KNOWLEDGE.md)）。

## 想定される影響

- **全画面の faint テキストが一律で明るくなる**（Today / 分析 / 設定 / 編集）。視覚トーンの変化はあるが可読性向上。DESIGN-SYSTEM v0.2 の fg-faint 数値は本 ADR で更新（核の方針＝モダンミニマル/Celebrate 主は不変）。
- **コントラスト機械検証**: `theme.test.ts` が faint の AA を固定。今後 palette を触るときはこのテストが退行を弾く。

## 関連

- SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §7/§8（本 ADR で対応済みに更新）。
- [DESIGN-SYSTEM.md §1](../../DESIGN-SYSTEM.md): fg-faint 値の更新 + AA 注記。
- [ADR-0032](./0032-edit-ui-two-layer-chips.md): 編集UI 本体（チップ2層）。本 ADR はその仕上げ。
- [K-016](../../KNOWLEDGE.md): 「離脱を指差さない」空状態の方針。
