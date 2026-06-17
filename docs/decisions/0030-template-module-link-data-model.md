---
id: 0030
date: 2026-05-31
project: knockon
tags: [architecture, data-model, scope]
status: accepted
supersedes: []
superseded-by: []
---

# テンプレートの module / link を catalog 専用テーブルに分離し、live nodes に module_id を持たせる

> **部分置換 ([ADR-0039](0039-catalog-restructure-modules-to-categories.md) / K-005・K-015)**: 本 ADR の **catalog/live 分離原則は ADR-0039 でも継承**される。ただし catalog 内部の **module(テーマ束) 概念と束ベースの採用単位は ADR-0039 で「カテゴリ2型 + 個別アクション採用」に置換**された。本 ADR 単体の `modules` / `links` スキーマと採用前メタ（`moment` / `starter` 等）の前提は ADR-0039 以降は無効。catalog/live 分離だけが生きている。

## 文脈

Issue #62（テンプレート充実）の実装第一歩 Issue #68。テンプレート機能は「扉 → 束 → モジュール → リンク」の階層を持ち（[docs/template-modules-spec.md](../template-modules-spec.md) §2-§3）、`module { id, name, color, moment[], goal[], source, kind }` / `link { id, title, moduleId, default_on, position, source, timerSeconds? }` というデータモデルを要求する。

このモデルを既存の live スキーマ（`chains` → `nodes` → `actions`、[ADR-0001](0001-chain-data-model.md) / [src/db.ts](../../src/db.ts)）とどう関係づけるかが、後続 #69-#74（seed / discovery / onboarding / 編集 UI）すべての土台になる。

核心の論点は「テンプレート定義（catalog）」と「採用後の実チェーン（live）」を**同じテーブルで表現するか、分離するか**。

- catalog 側は `default_on` / `starter` / `moment` / `goal` といった**採用前の選択メタ情報**を持つ。
- live 側は採用で生成された実ノードで、これらのメタは原則として無意味（既に採用済み・並びは physical position）。
- ただし編集 UI（#73）は「このノードはどのモジュール由来か」をチップ表示するため、live ノードにも**所属モジュール参照だけ**は必要。

正準データ不変条件（[ADR-0001](0001-chain-data-model.md) / CLAUDE.md §正準データ）に抵触しないこと（派生値・採用前メタを live に混入させない）が制約。

## 検討した選択肢

- **案A（採用）: 分離 catalog + live に module_id**
  - `modules` / `links` を**テンプレート定義専用テーブル**として新設。`default_on` / `starter` / `moment` / `goal` / `timer_seconds` は catalog だけが持つ。
  - 採用フロー（#70）は `links` を読んで既存 `nodes` / `actions` を**生成**する変換ロジック。採用後は live が正準で、catalog を参照し続けない。
  - 編集 UI 用に `nodes.module_id`（NULL 許容・`REFERENCES modules(id)`）だけを追加。テンプレ採用ノードは module_id が入り、手作り／既存チェーンのノードは `NULL`。
  - catalog ↔ live のライフサイクルが綺麗に分離する。

- **案B（不採用）: 拡張モデル（catalog と live を同居）**
  - `modules` のみ新設し、`nodes` に `module_id` + `default_on` + `starter` を持たせ、catalog 用 chain を `status='template'` で同居させる。
  - 問題: `default_on` / `starter` は live ノードでは**意味を持たないカラム**になり、「catalog 行だけ意味を持つ」濁りが出る。[ADR-0001](0001-chain-data-model.md) の「live に採用前メタを混ぜない」と相性が悪く、K-002（保存単位の歪み）/ K-030（permission と state の混同に近い「行ごとに意味が変わるカラム」）を誘発する。

- **案C（不採用）: テンプレートをコード定数のみで持つ（DB 化しない）**
  - 編集 UI でのユーザーモジュール昇格（#73 §6）・カスタムインボックスがユーザー生成データを要求するため、catalog を DB 化しないと user source を置く場所がなくなる。早期に破綻。

## 決定

**案A を採用。** 具体スキーマ（#68 の実装範囲）:

```
modules (
  id TEXT PK,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  moment_json TEXT NOT NULL,   -- JSON 配列 ["morning","night",...]
  goal_json TEXT NOT NULL,     -- JSON 配列 ["exercise","skincare",...]
  source TEXT NOT NULL CHECK(source IN ('official','user')),
  kind TEXT NOT NULL CHECK(kind IN ('normal','custom')),
  order_index INTEGER NOT NULL
)

links (
  id TEXT PK,
  title TEXT NOT NULL,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,  -- orphan 物理禁止
  default_on INTEGER NOT NULL CHECK(default_on IN (0,1)),
  position INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('official','user')),
  timer_seconds INTEGER,        -- NULL = タイマーなし（actions.timer_seconds と同型）
  starter INTEGER NOT NULL CHECK(starter IN (0,1))  -- 束プレビューのスターター×ON判定用
)

nodes に列追加:
  module_id TEXT REFERENCES modules(id)  -- NULL 許容（テンプレ未経由ノード = 手作り/既存）
```

確定した設計詳細:

1. **module_id（live nodes）= NULL 許容 + FK→modules**。既存チェーンの全ノードは `module_id=NULL`。MIGRATIONS[7] は `ALTER TABLE nodes ADD COLUMN module_id ...` だけで既存データ保全（[ADR-0027](0027-non-destructive-migration.md) の ALTER ベース）。
2. **配列（moment / goal）は JSON 文字列カラム**（`actions.variants_json` と同型）。中間テーブルは作らない。フィルタは読み出し後に domain 層の純粋関数で行う（K-007 / カタログ規模が §9 で十数モジュールなので十分）。
3. **orphan 防止 = `links.module_id NOT NULL + FK`**。SQL レベルで物理強制（K-006 スタイルの機械検証）。カスタム = 単一インボックス module を1行常駐させ、振り分け先にする（§6）。
4. **#68 のスコープはスキーマのみ**。v0 カタログ（§9）の seed 投入は #69 の責務（Issue 依存関係どおり）。#68 完了条件「既存チェーンが新モデルで表現でき、リンクの所属と位置が独立に動く」は、空 catalog + 既存チェーン互換 + 不変条件テストで満たす。
5. **SCHEMA_VERSION を 6 → 7 に bump**。MIGRATIONS[7] で `modules` / `links` CREATE + `nodes.module_id` ADD COLUMN。新規ユーザーは SCHEMA_SQL 側にも同じ定義を持たせ二重 truth source を値で一致させる（既存の MIGRATIONS[6] パターン踏襲）。

## 理由

- **catalog ↔ live のライフサイクル分離**を最優先した。採用は「catalog を読んで live を生成する一方向変換」で、採用後は catalog を参照しない。これにより [ADR-0001](0001-chain-data-model.md) の正準データ不変条件（live は `(node,日付,bool)` + 採用済み実体のみ）が綺麗に保たれる。
- **CLAUDE.md グローバル原則「データ構造の未来形設計」「分類軸の独立性」**に沿う。`default_on` / `starter` を live に持たせない＝「行ごとに意味が変わるカラム」を作らない（K-002 / K-030 と同型の回避）。
- **module_id NULL 許容**で既存チェーンを無移行で共存させ、早期検証ゲート後の N=1 運用データ（[ADR-0022](0022-phase-1-completion-and-verification-operation.md) / K-021 追記の検証期間データ）を壊さない。
- **JSON カラム + アプリ層フィルタ**は既存 `variants_json` の前例があり、カタログ規模（十数件）に対して中間テーブルは過剰（CLAUDE.md「過剰設計を避ける」）。
- トレードオフとして捨てたもの: (a) SQL レベルでの moment/goal フィルタ（→ アプリ層で実装）、(b) catalog と live の DDL 共通化による行数削減（→ 濁りを避けるため意図的に別テーブル）。

## 想定される影響

- **後続 #69-#74 がこのスキーマに依存**する。特に #70 採用フローは「links → nodes/actions 生成」変換に依存。ここを覆すと #69 以降を全て書き直す（覆すコスト大、Issue #62 全体に波及）。
- **K-006 不変条件テスト追加**: `PRAGMA table_info(modules/links)` / `PRAGMA foreign_key_list(links)` で「links.module_id NOT NULL + FK」「nodes.module_id 存在」を機械固定する（#68 で実装）。
- **K-018 / K-021 系の test/prod 差**に注意。MIGRATIONS[7] の ALTER は better-sqlite3（test）と expo-sqlite（prod）両方で検証する（既存 repository.test.ts の MIGRATIONS 検証パターン踏襲）。
- **覆す場合のコスト**: module_id を後から NOT NULL 化／FK 付け外しするのは ALTER の制約上テーブルコピー方式が必要（src/db.ts のコメント参照）。逆に「JSON → 中間テーブル」への正規化は、カタログが数百モジュール規模に育ったら再検討の余地（その時点で新 ADR）。
- **アクション重複の扱いは #70 で別途判断**（同じ「歯磨き」リンクを採用したとき既存 action を再利用するか新規作るか）。本 ADR では未決定とし #70 に委譲。
