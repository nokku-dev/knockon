---
id: 0040
date: 2026-06-17
project: knockon
tags: [architecture, data-model, ux, scope]
status: accepted
supersedes: []
superseded-by: []
---

# 編集 UI の module(チェーン内ノード束ね) 概念を廃止し、旧 modules/links モデルを完全撤去する

## 文脈

カタログ再構成シリーズ ([ADR-0039](0039-catalog-restructure-modules-to-categories.md) 構造 / #154 データ層 / #155 採用フロー UI) で、テンプレカタログは module(テーマ束) → カテゴリ2型 (genre/recommended) へ移行した。新カタログモデル (`categories` / `catalog_actions` / `recommended_items`) は discovery / onboarding が使う。

移行後、旧 Module/Link モデルの残る consumer は **チェーン編集 UI** だけになった。編集 UI の「モジュール」は、カタログの category とは**別目的の概念**である:

- カタログの category = 行動の**発見・採用**の軸 (discovery/onboarding)。
- 編集 UI の module = 1 本のチェーン内で**ノードを視覚的に束ねる**ライブ側の概念。左カラーチップ + run 先頭ラベル / モジュール別絞り込み / 一括外し (detachModule) / promote-to-module (custom inbox ノードを user モジュールに昇格) / custom inbox (新規ノードの既定所属)。

[ADR-0039](0039-catalog-restructure-modules-to-categories.md) は「live ノードの由来参照を category にするか action にするか」を後続に委譲し、#155 で**新規採用チェーンは由来参照 (nodes.module_id) を持たない**実装にした (= 新チェーンには既にチップが出ない)。残るのは旧チェーンの module_id と編集 UI の module 機能群、および旧 modules/links テーブル。

論点は「編集 UI の module 概念 (ノード束ね) を新カテゴリに合わせて作り直すか、ライブ独自概念に切り出すか、廃止するか」。

## 検討した選択肢

- **案A (採用): 廃止して旧モデル完全撤去**
  - 編集 UI の module 機能 (チップ/ストライプ/run ラベル/絞り込み/detach/promote/custom inbox) を全廃。
  - 旧 `Module` / `Link` / `ModuleKind` / `buildChainDraftFromBundle` / `nodes.module_id` / `modules` / `links` テーブル / 旧 `catalogSeed.ts` を撤去。
  - 編集はノードの追加/削除/並び替え/ON-OFF/タイマーに簡素化。

- **案B (不採用): ライブ独自の「グループ」概念に切り出す**
  - module → live 専用 `group` に rename (catalog FK なし)。ノード束ね機能は保持しつつカタログから疎結合化。
  - 旧 modules/links カタログテーブルは撤去できるが、live `groups` テーブル + nodes.group_id + 昇格 UI が残り、作業量・保守面が大きい。N=1 で束ね機能の実利用実績が薄く、投資に見合わない。

- **案C (不採用): 現状維持 (旧 modules/links を残す)**
  - 編集 UI を旧モデルのまま据え置き。掃除は先送り。旧 module モデルが新カテゴリモデルと二重に残り続け、コードベースに「採用は category / 編集は module」の二系統が常駐する濁りが残る。

## 決定

**案A を採用。** 編集 UI の module 概念を廃止し、旧 modules/links モデルを完全撤去する。

撤去対象:
- **編集 UI 機能**: 色チップ層 / run 先頭モジュール名 / カラーストライプ / モジュール別絞り込み / 一括外し (detachModule) / promote-to-module / custom inbox / source 別削除文言。編集は「ノード追加 (アクション選択) / 削除 / 並び替え / ON-OFF / タイマー」に簡素化する。
- **domain**: `Module` / `Link` / `ModuleKind` / `Node.moduleId` / `ChainDraftNode.moduleId` / `buildChainDraftFromBundle`。
- **repository**: module/link の row mapper / insert / seed / list / `updateNodeModule`。
- **seed**: 旧 `catalogSeed.ts` (`buildV0Catalog` / `CUSTOM_INBOX_MODULE`) を削除 (新 `categoryCatalogSeed.ts` が後継)。
- **DB**: `modules` / `links` テーブル、`nodes.module_id` 列、`idx_links_module` / `idx_modules_order`。`nodes.module_id` は FK 列のため table-copy 方式の migration で除去する。

実装は 2 トラックに分割:
- **PR-1**: 編集 UI から module を撤去 (schema 変更なし)。本 ADR を含む。
- **PR-2**: domain / repository / DB schema の撤去 (table-copy migration でデータ保全)。

## 理由

- **prime objective (N=1 / 毎日使う 1 本を最短で出荷) と整合**。編集 UI の束ね機能は実利用実績が薄く、カタログ移行後は維持コストだけが残る。最小化が出荷に近い。
- **二系統の濁りを解消**。採用 = category / 編集 = module の二重カタログ概念が消え、カタログは新カテゴリモデル 1 本になる。CLAUDE.md「分類軸の独立性 / 過剰設計を避ける」と整合。
- **正準データがさらに純粋化**。`nodes.module_id` (採用前メタの live への染み出し) が消え、live は `(node, 日付, bool)` + 採用済み実体に近づく ([ADR-0001](0001-chain-data-model.md) 維持)。
- トレードオフとして捨てたもの: (a) チェーン内ノードの視覚グルーピング、(b) ユーザーがアドホックな束を命名・色付けする promote、(c) テンプレ由来チップ。いずれも N=1 で必須でなく、必要になれば case B (live group) として後から足せる。

## 想定される影響

- **[ADR-0030](0030-template-module-link-data-model.md) を supersede** (module/link データモデルの撤去)。[ADR-0032](0032-edit-ui-two-layer-chips.md) (編集 UI 2 層チップ) / [ADR-0033](0033-edit-ui-a11y-empty-states.md) の module チップ部分も本 ADR で無効化される。これらに逆参照を残す ([K-005](../../KNOWLEDGE.md))。
- **table-copy migration のリスク** ([K-018](../../KNOWLEDGE.md) / [K-021](../../KNOWLEDGE.md))。`nodes.module_id` は FK 列のため単純な DROP COLUMN 不可。`foreign_keys=OFF` 下で nodes 新テーブル作成 → INSERT SELECT → 旧 drop → rename の 12-step 手順を 1 トランザクションで行い、`achievements.node_id` / `nodes.chain_id` の CASCADE 関係を維持する。test (better-sqlite3) / prod (expo-sqlite) 両方で検証する。
- **K-006 不変条件テストの更新**: `modules` / `links` テーブル不在・`nodes.module_id` 列不在を機械固定に切り替える (従来は存在を固定していた)。
- **覆す場合のコスト**: ノード束ね機能を再導入するなら案B (live group) を新規実装する。カタログ由来の module は復活させない (新カテゴリモデルが正)。
- SPEC.md / DESIGN-SYSTEM.md の編集 UI チップ記述、CLAUDE.md §正準データの `nodes.module_id` 言及を同期更新する。
