---
id: 0032
date: 2026-06-01
project: knockon
tags: [ux, scope, data-model, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# 編集UI のチップあり2層化 (ON/OFF・source 別削除・カスタム所属) と active 列の導入

## 文脈

Issue #73: テンプレ編集UI (チップあり2層・並べ替え・ON/OFF・削除・カスタム)。SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §6。

discovery (#70/#71) でテンプレ束を採用し、onboarding (#72) で初回ルートが通った。採用後のチェーンは `nodes.module_id` で「採用元モジュール」を覚えている ([ADR-0030](./0030-template-module-link-data-model.md))。#73 はこの所属情報を編集 UI で可視化・操作可能にする。

既存の `ChainEditScreen` は並べ替え (`react-native-reorderable-list`) / ノード追加 / 削除 / チェーン削除を持つが、(a) モジュール所属を表示せず、(b) `persistChainDraft` が `module_id` を保存していなかった (= **編集保存で採用チェーンのモジュール所属が消える潜在バグ**)、(c) ノードの一時停止 (ON/OFF) 概念がなかった。

## 検討した選択肢

### このPRのスコープ (AskUserQuestion で確定)

- **案A: コア機能優先・昇格/undo は後送り (採用)**
  - 並べ替え (既存) / ON/OFF (一時停止) / source 別削除 / カスタム追加 を動かす。
  - カスタム → ユーザーモジュール昇格 (複数選択 → 命名+色付け) と undo は別 Issue/PR に分離。
- **案B: 昇格・undo まで一括**
  - 却下理由: 1 PR が肥大化しレビュー負荷増。昇格/undo は完了条件に含まれず後送り可 (Issue 記載)。

### ON/OFF (一時停止) の表現

- **案A: nodes.active 列 (0/1) を新設 (採用)**
  - 「停止」と「削除/外す」を 2 系統に分ける (SPEC §6)。停止は非破壊・可逆。
  - Today は `active=false` のノードを出さない (= チェーンから外すが残す)。
- **案B: status 文字列 (active/paused) をノードに持つ**
  - 却下理由: 2 値なので bool で十分。chains.status と紛らわしい。

### カスタム追加の所属先

- **案A: 単一のカスタムインボックスモジュール (kind='custom') に所属させる (採用)**
  - 「+追加」したノードは新要素クラスを増やさず module 所属に統一 (SPEC §6)。source='user' なので削除は破壊的。
  - インボックスは catalog seed で固定 ID (`mod-custom-inbox`) を 1 件 seed (INSERT OR IGNORE 冪等)。
- **案B: 追加時に既存モジュール or カスタムを選ぶ振り分け UI を即実装**
  - 却下理由: 振り分けピッカーは複雑。まず custom inbox に集約して動かし、振り分け UI は後送り (コア機能優先の判断と整合)。

### モジュールラベルの自己修復 (C 案)

- **採用: 左カラーストライプ + run 先頭だけモジュール名**。同じモジュールが非連続に散らばると run が分かれ各 run 先頭で名前が再出 (自己修復)。純粋関数 `computeRunLeaders` で判定。

## 決定

**案A (コア優先) + active 列 + custom inbox + C 案** を採用。

- 純粋ドメイン層 `src/editLayout.ts` (K-007): `buildModuleRoster` (チップ層) / `computeRunLeaders` (C 案ラベル) / `deleteKindForSource` (official→detach / user・未所属→delete)。
- `nodes.active INTEGER NOT NULL DEFAULT 1` を SCHEMA_VERSION = 9 で追加。MIGRATIONS[9] で既存ノードは 1 保全。`updateNodeActive` repository 関数。
- `persistChainDraft` で `module_id` + `active` を保存 (潜在バグ修正含む)。`useChainEdit` の `EditableNode` に `moduleId` / `active`、`toggleNodeActive` を追加。「+追加」ノードは `CUSTOM_INBOX_MODULE_ID` 所属。
- `ChainEditScreen`: チップ層ロスター / 行の左カラーストライプ + run 先頭名 / ON-OFF トグル / source 別削除ラベル (「削除」/「チェーンから外す」)。
- `useTodayData`: `active=false` のノードを Today から除外。

## 理由

- **active を bool 列で持つ**: 観測データ ([ADR-0001](./0001-chain-data-model.md) の 3 軸) ではなく「ノードの構成状態」。chains.status と同じ「構成軸」で、派生値ではないので保存してよい (K-006 不変条件を侵さない)。
- **module_id を編集保存で保持**: 採用時の所属 (ADR-0030) を live 編集後も維持する。これがないとチップが消える = ADR-0030 の所属モデルが編集で壊れる。
- **custom inbox に集約**: 「新要素クラスを増やさない」(SPEC §6)。カスタムは module の一種 (kind='custom') として既存の所属モデルに乗せる。
- **削除は draft からの除去で統一、破壊性は label で出し分け**: official=「チェーンから外す」(catalog から再採用可)、user=「削除」。undo は後送りだが、保存前ならキャンセルで戻せる (= draft モデルの可逆性)。

## 想定される影響

- **schema invariants (K-006)**: `nodes.active` のカラム存在 + DEFAULT + MIGRATIONS[9] の既存ノード保全を `repository.test.ts` で機械検証。
- **catalogSeed**: custom inbox が seed されるため、DB 全体のモジュール件数を数える既存テストは「official のみ」フィルタに変更 (K-033 seed 非依存)。
- **後送り (別 Issue/PR)**: カスタム → ユーザーモジュール昇格 / undo (多重・タイムアウト) / 「+追加」の既存モジュール振り分けピッカー / 空状態 (全 OFF / 全削除) は #73 続きまたは #74 で扱う。
- **チップタップのハイライト/絞り込み**: SPEC §6 は「チップタップ=ハイライトが主」だが、本 PR ではロスター表示 (count 付き) までを実装。絞り込みインタラクションは後送り。

## 関連

- SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §6 (編集UI) / §8 (undo・空状態は引き続き open)。
- [ADR-0030](./0030-template-module-link-data-model.md): nodes.module_id の所属モデル。本 PR で編集保存時の保持を担保。
- [ADR-0001](./0001-chain-data-model.md): 正準データの軸。active は「構成軸」で観測データではない。
- [DESIGN-SYSTEM.md §1](../../DESIGN-SYSTEM.md): destructive action の文字色のみ accent (削除/外すラベルに適用)。
