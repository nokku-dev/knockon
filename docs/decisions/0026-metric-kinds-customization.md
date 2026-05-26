---
id: 26
date: 2026-05-26
project: knockon
tags: [feature, data-model, ux]
status: accepted
supersedes: []
superseded-by: []
---

# メトリクス種別の DB 化 + ユーザーカスタマイズ可能化

## 文脈

[ADR-0024](0024-goal-view-analytics-phase-3-unified.md) §3c MVP (PR-Z3a) で、 メトリクス種別 (weight / exercise_minutes / sleep_hours) は `src/metricKinds.ts` の builtin code 定数として固定していた:

```ts
export const METRIC_KINDS = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'exercise_minutes', label: '運動', unit: '分' },
  { key: 'sleep_hours', label: '睡眠', unit: '時間' },
];
```

検証期間中、 ユーザーが「**目標メトリクスはユーザーカスタマイズ可能にしたい**」と判断 (不便駆動シグナル)。 「体重 / 運動 / 睡眠」以外のメトリクス (例: 朝の気分 / 飲水量 / 集中時間) を追加したい、 既存の名前 / 単位を変えたい、 不要な種別は削除したい。

ADR-0024 §3c (将来の覆すコスト) では「テンプレを DB 永続化 (ユーザー追加可能に): template_kinds テーブル追加、 CRUD UI 追加。 1 PR 規模で対応可」と書いていた。 本 ADR で実装方針を確定する。

## 検討した選択肢

### 編集スコープ

- 案 A: 既存 3 種は固定、 ユーザー追加のみ可
- **案 B (採用)**: 既存 3 種を含めて全て編集可 (builtin を DB seed として保存)
- 案 C: 既存 3 種は非表示、 完全に user カスタムだけ
- ユーザー判断で案 B 採用 (柔軟、 「使わない builtin を消せる」が UX として大きい)

### データモデル

- 案 X: `metrics` テーブルに `metric_key` を残しつつ、 種別マスタは別 `metric_kinds` テーブル
- 案 Y: `metrics` の `metric_kind_id` 外部キー化 (= cascading)
- **案 X 採用**: 疎結合維持 (ADR-0024 と整合)。 種別削除しても観測 record は残る (= データ保全)。 表示時に種別マスタを join するが、 種別なし record は「未分類」表示

### Notion 連携互換性

- builtin 3 種の `key` ('weight' / 'exercise_minutes' / 'sleep_hours') を維持
  - = ADR-0024 §3c [docs/notion-setup.md](../notion-setup.md) で示した Notion 側 property name 規約と一致
- ユーザーが builtin の key を変更した場合、 Notion 連携は機能しなくなる (ユーザー責任、 UI で警告)

## 決定

採用 B + X を確定。

### スキーマ拡張

- 新規 `metric_kinds` テーブル: `(id, key, label, unit, order_index, is_builtin)`
  - `id`: PRIMARY KEY (UUID)
  - `key`: UNIQUE NOT NULL (= metrics.metric_key と一致、 アプリ内識別子)
  - `label`: NOT NULL (UI 表示用、 例: '体重')
  - `unit`: NOT NULL (UI 表示用、 例: 'kg')
  - `order_index`: NOT NULL (一覧表示順)
  - `is_builtin`: INTEGER (0/1) — builtin seed フラグ。 削除確認時に警告するための情報のみ、 削除自体は許可
- SCHEMA_VERSION 3→4 bump、 drop+recreate migration ([K-021](../../KNOWLEDGE.md))
- 起動時 (`initSchema` 後) に builtin 3 種を `INSERT OR IGNORE` で seed:
  - `{ key: 'weight', label: '体重', unit: 'kg', is_builtin: 1, order_index: 0 }`
  - `{ key: 'exercise_minutes', label: '運動', unit: '分', is_builtin: 1, order_index: 1 }`
  - `{ key: 'sleep_hours', label: '睡眠', unit: '時間', is_builtin: 1, order_index: 2 }`

### Repository

- 新規 `src/metricKindsRepository.ts`:
  - `listMetricKinds(db)`: order_index 昇順
  - `insertMetricKind(db, kind)`: key 重複は UNIQUE 制約で reject
  - `updateMetricKind(db, kind)`: id 指定で update
  - `deleteMetricKind(db, kindId)`: 行削除。 関連 metrics record はそのまま残す (疎結合)

### ドメイン / 既存 metricKinds.ts の変更

- `src/metricKinds.ts` の `METRIC_KINDS` 定数は **`BUILTIN_METRIC_KINDS` に rename + 中身変更** (ファイル維持で実装)
  - 旧: 単純な定数配列、 アプリ表示用
  - 新: DB seed 用 (`BuiltinMetricKindSeed` 型)、 起動時 schema migration 経由で metric_kinds テーブルに挿入
- `MetricKind` 型は `metricKindsRepository.ts` に新設 (id / orderIndex / isBuiltin 含む完全形)
- `BUILTIN_METRIC_KINDS` は本実装で 2 箇所に参照される (= 1 出典化は将来 refactor 判断、 spec-sync 文脈):
  1. `src/db.ts` の `BUILTIN_METRIC_KINDS_SEED_SQL` (schema migration の INSERT 文字列)
  2. `src/notionMetricsSync.ts` および `src/useMetricsData.ts` の Notion 連携重複判定 (= K-028 同型バグ回避、 後述)

### useMetricsData hook 変更

- `METRIC_KINDS` import を削除し、 hook 内で `listMetricKinds(db)` で動的取得
- 戻り値の `series` が「現在の種別マスタ」に依存
- 既存 `metrics` record で種別マスタにない key (= ユーザーが種別削除後) は「未分類」セクションで表示 (or 単純に表示しない、 Phase 1 では「表示しない」採用)

### UI 編集

- 分析タブの「メトリクス」セクションヘッダーに「種別を編集」ボタン
- タップで `MetricKindsEditor` モーダル開く
- モーダル内:
  - 種別一覧 (label / unit 表示) + 並び替え (Phase 1 はシンプルに add/remove のみ、 並び替えは Phase 2 判断)
  - 「+ 追加」ボタン → 新規モーダルで key / label / unit 入力
  - 各行に編集 (鉛筆) / 削除 (×) ボタン
  - 削除確認: 「'体重' を削除すると、 既存の体重記録は『未分類』扱いになります (記録は残ります)」
  - builtin (is_builtin=1) は削除時に追加警告: 「これは初期種別です。 削除しても問題ありませんが、 Notion 連携が壊れる可能性があります」

### Notion 連携への影響

- ユーザーが builtin の key を変更すると、 [src/notionMetricsSync.ts](../../src/notionMetricsSync.ts) の `mapNotionPagesToMetrics` で取り込めなくなる
- ユーザーが builtin そのものを削除した場合は **「取り込み停止」ではなく「重複累積」リスクがある** (K-028 同型): mapNotionPagesToMetrics は `BUILTIN_METRIC_KINDS` の key 集合で照合するため、 削除済み builtin key の pages も candidate に残る。 重複判定 (existing 取得) も `BUILTIN_METRIC_KINDS` を基準にすることで対処済み ([src/useMetricsData.ts](../../src/useMetricsData.ts) syncNotionMetricsInBackground)
- UI 警告: key 編集時に「Notion 連携を使っている場合は key 変更で sync が壊れます」
- これはユーザー責任、 silent fallback (K-024 同型受容)

### 既存判断との関係

- **[ADR-0024](0024-goal-view-analytics-phase-3-unified.md)**: 「メトリクスは疎結合 + 任意 + read-only」原則は維持。 種別 DB 化はその上で更に柔軟性を加える
- **[ADR-0001](0001-chain-data-model.md)**: 派生値非保存原則は維持。 metric_kinds は「ユーザー設定値」(= 観測した事実) として正準データに含まれる ([K-015](../../KNOWLEDGE.md) パターン)
- **[K-006](../../KNOWLEDGE.md) ハードガードレール**: metric_kinds の 6 カラム (id / key / label / unit / order_index / is_builtin) を K-006 不変条件テストで固定

## 理由

- **案 B (全部編集可) の採用理由**: ユーザーが明示判断。 builtin を「消せる」ことで「使わない種別がノイズ」問題を解消できる。 builtin 復活手段は後で考えれば良い (= Phase 2 で「リセット to defaults」ボタン追加判断)
- **案 X (疎結合) の採用理由**: 種別削除 → 関連 record も消える挙動は ADR-0001 派生値非保存 / データ保全と矛盾。 「観測した事実は保存しつづける」原則を維持
- **builtin key 維持の理由**: Notion 連携 (PR-Z3b) との互換性。 ユーザーが key 変えるのは可だが、 デフォルトでは Notion 連携が動く

## 想定される影響

### 即時 (PR-CC 範囲)

- schema migration: drop+recreate で既存試作データ消失 ([K-021](../../KNOWLEDGE.md))
- `src/metricKinds.ts` 廃止 → builtin seed を `src/metricKindsSeed.ts` に分離
- 全 `useMetricsData` / `MetricsSection` / `MetricInputModal` で `METRIC_KINDS` 定数依存を DB 取得に置換
- 新規ファイル: `src/metricKindsRepository.ts` / `src/MetricKindsEditor.tsx` (モーダル)
- 新規テスト: 種別 CRUD / seed 投入 / 種別削除後の metrics 残存

### 将来の覆すコスト

- **builtin リセット機能**: 「初期に戻す」ボタン追加 (= 削除した builtin を再 seed)。 1 PR 規模
- **種別並び替え UI**: Phase 2 で reorderable-list 採用 (Phase 1.7b で経験済み)
- **種別 → metrics の FK CASCADE 化**: 「種別削除で record も消す」モードに切替。 ただしデータ消失リスクが高い

### 注意点

- **Notion 連携の key 変更リスク**: 警告は出すが防がない。 「ユーザーが書き換えたら自己責任」
- **既存 builtin key の hardcode 残存**: ADR-0024 §3c で「Notion DB の property 名が `weight` / `exercise_minutes` / `sleep_hours` 前提」と書いた。 builtin key を維持することでこの前提は保持される
- **Phase 1 受容**: 種別並び替え UI は Phase 1 では非実装、 order_index は CRUD 順で自動採番のみ
