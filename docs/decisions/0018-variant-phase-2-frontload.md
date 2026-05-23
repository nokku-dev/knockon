---
id: 18
date: 2026-05-23
project: knockon
tags: [scope, data-model, ux]
status: accepted
supersedes: []
superseded-by: []
---

# Phase 2 の variant + active/stocked を前倒し (variant は string map 形式で実装、 サブチェーン化との分離)

## 文脈

Phase 1.x (PR-1.7〜1.9 / PR-1.5b-1) が完成し、 [ADR-0006 早期検証ゲート](0006-phase1-completion-and-scope-narrowing.md) 「Today を実機で数日継続して回す」に進める段階。

ここで N=1 ユーザー判断として「Phase 2 から `variant` (アクションの曜日別ラベル切替) + `チェーンステータス active/stocked 切替 UI` の 2 つを前倒して、 数日実機検証の前に入れたい」と決めた ([ADR-0014](0014-crud-phase-1-7-1-8-frontload.md) と同じ前倒し判断パターン)。

variant の data structure 検討で論点が出た: ユーザーは将来「`筋トレ` の `胸トレ` をサブチェーン化したい」(月曜の variant が独立したサブチェーンを起動するシナリオ) を希望。 これは [SPEC §2](../../SPEC.md) で v1 非スコープとされた**サブチェーン参照** ([ADR-0001](0001-chain-data-model.md)) と関係する。

variant の data structure を「将来サブチェーン互換にしておく」か「シンプル string map にして、 サブチェーン実装時に variant も再設計するか」が判断点。

## 検討した選択肢

- **案 A**: variant = `{ [WeekdayKey]: string | null }` (シンプル string map) — Phase 2 前倒しで実装、 サブチェーン機能とは独立軸として完結。 将来サブチェーン入れる際は variant の型も再設計する (移行コスト受容)。
- **案 B**: variant = `{ [WeekdayKey]: { kind: 'action'; label } | { kind: 'subchain'; chainId } | null }` (union 型) — 最初から将来互換、 サブチェーン kind を後で追加実装。 「将来 variant の型に触らない」設計。 ただし今すぐ実装する必要がある以上、 余計な複雑度を Phase 1 完成前にコードに入れる。
- **案 C**: 「アクション = ミニチェーン」モデル (案 C は SPEC §2 を覆す) — アクション自体に子ノード列を持たせ、 variant の中身は actionId 参照固定。 サブチェーン化はそのアクションに子ノードを足すだけ。 概念的に最もエレガントだが、 既存 data model を大幅変更 + migration 必須 + [ADR-0001](0001-chain-data-model.md) を覆す。

## 決定

**案 A** (シンプル string map) を採用。

具体:
- `VariantMap = { [K in WeekdayKey]: string | null }` (7 曜日固定キー)
- `actions.variants_json` カラムに JSON serialize して保存 (既存 column を流用、 schema 変更なし)
- `resolveActionForDate(action, isoDate): ResolvedAction` 純粋関数 (`{ kind: 'fire'; label } | { kind: 'skip' }`)
- variant null の曜日 = Today に出ない (発火スキップ、 ユーザー判断 Q1=A)
- variant 設定済みかつ当日 variant=string → fire / ラベルは variant 文字列
- variants 自体 null → 既存挙動 (毎日 fire / ラベル = 親 title)

## 理由

- **Phase 1 完成優先 (ADR-0006 早期検証ゲートとの整合)**: 案 B / C は Phase 1 完成前のコード複雑度を上げる。 ADR-0006 「設計の精密化より実機到達を優先」と矛盾。
- **YAGNI**: サブチェーンは [ADR-0001](0001-chain-data-model.md) で「データ原則上、後から無移行で追加できる」と書かれていたが、 ユーザー希望シナリオ (曜日でサブチェーン切替) では variant 型を破壊的に変える必要がある。 つまり ADR-0001 の「無移行で追加できる」前提が完全には成立しない。 これを今 PR で詰めるよりも、 サブチェーン実装する PR で variant 含めて再設計するほうが、 「実機で何が必要か」確認後に意思決定できる。
- **variant データの再生成は許容**: Phase 1 N=1 試作中のため、 サブチェーン実装時に variant データを消して再構成しても実害なし ([K-021](../../KNOWLEDGE.md) と同型の受容)。
- **Augmentation 原則と整合**: variant は「曜日で違うラベルで Today に出す」シンプルな機能で、 ユーザーに新しい認知負荷を要求しない。 案 B / C の複雑な data 構造を学ぶ必要なし。

## 想定される影響

### 即時の影響

- `src/domain.ts`: `WeekdayKey` / `VariantMap` 型を確定、 `getWeekdayKey` / `resolveActionForDate` 純粋関数を追加
- `src/useTodayData.ts`: 各ノードを `resolveActionForDate` で評価、 `kind='skip'` のノードは Today から除外
- `src/TodayScreen.tsx`: `TodayNode` 型に `label` フィールド追加、 表示ラベルを variant 由来に
- `src/ActionEditor.tsx` (新規): 曜日別 variant 編集モーダル UI
- `src/ChainEditScreen.tsx`: ActionPicker の既存チップに鉛筆アイコン追加、 Modal で ActionEditor 表示
- `useChainEdit.updateAction` を expose、 ChainEditScreen から保存できる経路を作る

### 将来の覆すコスト

- **サブチェーン実装 PR (Phase 2 後半 or Phase 3)**: variant の型 / 意味の再設計が必要。 「曜日で違うサブチェーンが起動」シナリオを実現するなら variant に chainId 参照を加える、 もしくは ノードレベルで曜日別差し替えロジックを追加、 のどちらか。 並行して既存 variant データを (a) 新型に変換する script、 (b) 捨てて再入力させる UI、 のどちらかを実装。 Phase 1 N=1 では (b) を取る判断が高確率。
- **「アクション = ミニチェーン」 (案 C)**: 大規模リファクタが必要なときは別 ADR で記録。 [ADR-0001](0001-chain-data-model.md) を覆す supersede 関係になる。

### 注意点

- ノードを variant でスキップした日は、 [ADR-0010](0010-spine-fill-to-last-achieved.md) のスパインモデルも自動的にそのノードを除外したリストで動く。 「火曜日に variant=null のノードがあると、 火曜日の Today にはそのノードがそもそも出ない → スパインも短くなる」挙動。 これは「マイナスを指差さない」原則と整合 (= 休む日は線が伸びないだけで、 罰されない)。
- 達成記録は親アクションの **ノード ID** に紐付くまま。 variant が変わっても達成記録の意味は変わらない (= 「親アクションをやった/やってない」)。
- アクション編集 UI は ChainEditScreen 内の Modal で表示 (専用画面を作らず、 ChainEdit のサブモーダルとして発見性確保)。 将来「アクション一覧」が別画面で必要になったら別 PR で追加。
