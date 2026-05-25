---
id: 24
date: 2026-05-25
project: knockon
tags: [scope, ux, data-model, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# 目標ビュー + 分析 + Phase 3 (チェーン詳細) を統合実装する (SPEC §5 一部覆し)

## 文脈

[SPEC.md §5](../../SPEC.md) で **目標ビュー / メトリクス / 分析** は v1 非スコープ (= 出荷後レイヤー) と明示していた。理由は [K-004](../../KNOWLEDGE.md) 「完成ゲートを非コア機能 / ANT 違反機能の上に置いた」: 旧定義の「目標ビューで実運用が閉じる」は (1) コア体験から外れ、(2) 既存 Notion Body Metrics / `/fitness` と二重記録になり ANT 違反だった。

[ADR-0022](0022-phase-1-completion-and-verification-operation.md) で Phase 1 が完成判定に到達し、検証期間に入った。この間ユーザー (= 自分) が「習慣に関する一連の流れは一通りできる状態にしたい」「目標ビューと分析は先にやってしまいたい」と判断。具体的には:

- **データソース**: 体重 / 運動時間 / Notion Body Metrics 等の **外部メトリクス** を取り込みたい
- **強制しない**: 「別に使わなくてもいい」 — メトリクスは任意。使わなくてもチェーンだけで完結する
- **疎結合**: 「特定アクションと紐付けなくてもいい」 — メトリクスを「このアクションの効果」と 1-1 で繋がない設計

[SPEC §5](../../SPEC.md) v1 非スコープ判断と [K-004](../../KNOWLEDGE.md) を再評価する必要が出た。本 ADR で v1 範囲を拡張し、 [Phase 3 (チェーン詳細)](../../PLAN.md) と統合する計画を確定する。

## 検討した選択肢

### スコープ統合の形

- **案 A (採用)**: 目標 / 分析 = Phase 3 + 追加として**一体実装** (チェーン詳細 + 定着 + 達成率ダッシュボード + メトリクス)
- **案 B**: 目標 / 分析 = 別 Phase (Phase 4 新設、Phase 3 完了後)
- **案 C**: Phase 3 を「定着 + 円→星」だけに留め、目標 / 分析は出荷後レイヤーのまま

### メトリクスのデータソース

- **案 X (却下)**: ユーザー手入力中心 → K-004 の ANT 違反 (二重記録)
- **案 Y (却下)**: チェーンアクション完了に連動した自動派生 (例: 「ジムに行く」アクション達成 → 運動時間 +60min) → ユーザー希望 (「特定アクションと紐付けなくてもいい」) と乖離
- **案 Z (採用)**: 外部メトリクス取り込み中心 (Notion Body Metrics API 連携 + 手入力フォールバック)、チェーンとは疎結合 (= 同じ画面で並べて見れるが、データとしては独立)

### メトリクスの位置付け

- **案 M1**: メトリクスを「目標」として設定 → 達成率 / 進捗% を計算 (= goal tracking)
- **案 M2 (採用)**: メトリクスは「観測値」として時系列で表示するだけ。目標値は将来 (P2) 判断
- **案 M3**: メトリクスをチェーンに紐付ける (= 「この習慣のせいで体重が減った」の効果測定)

## 決定

### 案 A + 案 Z + 案 M2 を採用

**v1 範囲を拡張**: 目標ビュー / メトリクス / 分析を v1 非スコープから外し、Phase 3 と統合して実装する。

### Phase 3 (統合後) のスコープ

| サブフェーズ | 内容 | 既存スコープか |
|---|---|---|
| **3a (チェーン詳細)** | 1 本連続スパイン (Today から拡張) + ノード単位進捗 + **定着判定で円→星** + 14D 固定 | 既存 (元 Phase 3) |
| **3b (達成率ダッシュボード)** | チェーン別 / ノード別 / 期間別 (14D) 達成率の派生集計表示。グラフは折れ線か棒。streak は使わない (反 streak 原則) | 新規 (拡張) |
| **3c (メトリクスビュー)** | 外部メトリクス (体重 / 運動時間 / Notion Body Metrics) の時系列表示。Notion 連携 + 手入力フォールバック。チェーンとは疎結合 (同画面表示はするが紐付けない) | 新規 (拡張、SPEC §5 覆し) |

### データモデル (メトリクス追加)

- **新規テーブル `metrics`** = `(id, key, value, recorded_at, source)` のみ
  - `key`: メトリクス種別 (`weight` / `exercise_minutes` / `sleep_hours` 等の文字列)
  - `value`: 数値 (REAL)
  - `recorded_at`: 観測時刻 (YYYY-MM-DD HH:mm)
  - `source`: `'manual'` / `'notion'` / `'health_app'` (取り込み元)
- **チェーン / アクション / ノードへの外部キーは持たない** (疎結合)
- **派生値は保存しない** ([ADR-0001](0001-chain-data-model.md) 原則維持) — 集計 / 移動平均 / 達成率は表示時派生計算
- **メトリクス種別 (`metricKinds`) は当面 builtin コード定数** ([ADR-0023](0023-template-chains-and-subchain-implementation-plan.md) のテンプレと同方針)。ユーザー追加 UI は P2 後半
- **schema migration**: SCHEMA_VERSION bump + drop+recreate ([K-021](../../KNOWLEDGE.md) パターン継承)

### 達成率ダッシュボードの計算ルール

- **チェーン達成率** = 当該期間 (14D) における **チェーン全ノード ÷ 達成済みノード** の比率
  - variant null 日 (休む日) は分母から除外 (= 「対象日が来てない」と扱う)
- **ノード単位達成率** = 当該期間における該当ノードの **達成日数 ÷ 対象日数** (variant 考慮)
- **streak は持たない / 表示しない**: 反 streak / Celebrate 主の核 ([DESIGN-SYSTEM §0](../../DESIGN-SYSTEM.md)) を維持
- **赤の警告色は使わない**: 低達成率も `--fg-soft` / `--fg-faint` で淡く表示 (マイナスを指差さない)

### Notion 連携の方針

- **P1 (3c の MVP)**: 手入力 UI のみ (Notion API 連携は次段階)
- **P2 (3c の本実装)**: Notion Body Metrics データソースの page ID を CLAUDE.local.md 経由で受け取り、 起動時 sync (rate limit を考慮、 fetch は 1 日 1 回程度)
- **絶対に避けること**: 「Notion へ書き込み」 (ユーザーの既存 Notion 運用を壊す)。常に **read-only** (= データ取り込みのみ)

### PR 分割

| PR | スコープ | 完了条件 |
|---|---|---|
| **PR-Z1 (3a)** | チェーン詳細画面 + 定着判定 + 円→星 + 14D 達成率の派生計算 (UI 表示は最小) | `app/chain/[chainId]/detail.tsx` で 1 本スパイン + 定着マーカー表示 |
| **PR-Z2 (3b)** | 達成率ダッシュボード (チェーン別 / ノード別) | Today から「分析」タブで集計表示。グラフは折れ線 (react-native-svg) |
| **PR-Z3a (3c MVP)** | メトリクス DB + 手入力 UI + 時系列表示 | metrics テーブル追加、手入力 + 一覧表示 |
| **PR-Z3b (3c Notion 連携)** | Notion Body Metrics 連携 (read-only sync) | CLAUDE.local.md の page ID を読み 1 日 1 回 fetch |

PR-Z1 単独で「チェーン詳細 + 定着」(= 元の Phase 3 スコープ) は完結する。Z2 / Z3 はそこから積み増し。

### 既存判断との関係

- **[K-004](../../KNOWLEDGE.md)**: **覆さない**。 K-004 は「完成ゲートを目標ビューに置いた」判断のミス。完成ゲート自体は [ADR-0022](0022-phase-1-completion-and-verification-operation.md) で Phase 1 (Today 実機運用) のまま。本 ADR はあくまで「目標 / 分析 機能を v1 範囲に追加する」だけで、完成ゲートの再変更ではない。 K-004 から学んだ「ANT 違反になりうる」は **疎結合 + 任意 + read-only** で構造的に回避する。
- **[SPEC §5](../../SPEC.md)**: **一部覆す**。 目標ビュー / メトリクス / 分析を v1 非スコープから外す。サブチェーン参照 + 白抜き星 / ウィンドウ 7/31 切替 / サブスク / 広告 / 同期 / テーマ / ソーシャル は v1 非スコープのまま。
- **[ADR-0001](0001-chain-data-model.md)**: **影響あり (派生値原則の再確認)**。 メトリクス追加で「正準データは `(node, date, bool)` + `(anchor_id, date)` のみ」に **第 3 軸 `(metric_key, value, recorded_at)`** が加わる。これは [ADR-0012](0012-anchor-firing-events.md) で「アンカー発火イベント」を追加した時と同型の判断 ([K-015](../../KNOWLEDGE.md): 軸別に分離して両者を共存)。 ADR-0001 に逆参照を追加 (K-005 双方向リンクルール)。 派生値禁止原則 (= 達成率や定着判定をカラムに持たない) は維持。
- **[ADR-0006](0006-phase1-completion-and-scope-narrowing.md)**: **影響なし**。 Phase 1 完成判定はすでに [ADR-0022](0022-phase-1-completion-and-verification-operation.md) で達成済み。本 ADR は Phase 3 の範囲を変える話。
- **[PLAN.md](../../PLAN.md)**: 同 PR で更新 (Phase 3 の中身を 3a/3b/3c に分け、 出荷後レイヤーから目標 / 分析を削除)。
- **[CLAUDE.md](../../CLAUDE.md) §プロジェクト固有 5 (v1 非スコープ)**: 同 PR で更新 (目標ビュー / 分析 / メトリクス を v1 非スコープリストから外す)。

## 理由

- **「習慣の流れを一通り」のメンタルモデル**: チェーン管理だけだと「やった / やらなかった」の二値しか見えない。 14D ダッシュボード + メトリクス時系列を並べて初めて「習慣 → 効果」のループが体感できる。 Phase 1 検証で「今のままだと寂しい / 達成感の蓄積が薄い」が暗黙のシグナル。
- **K-004 罠を構造的に回避**: ANT 違反の中核は「ユーザーに新しい記録習慣を強要する」こと。本 ADR では (1) メトリクス手入力を **任意** に、(2) Notion 連携を **read-only** に、(3) チェーンとは **疎結合** にすることで、ユーザーに新しい行動を要求しない設計を取る。
- **案 B (Phase 4 新設) を却下する理由**: 「Phase 3 = チェーン詳細だけ」だと達成率ダッシュボードと密に関係する画面が分散する。同 Phase 内で実装する方が UX の一貫性が出る。 PR は分けるが Phase は統合。
- **案 Y (アクション連動派生) を却下する理由**: ユーザーが明示的に「特定アクションと紐付けなくてもいい」と判断。 アクション連動は「効果測定」の発想で、Augmentation (= 既存の生活に lift する) より Transformation (= 新しい運用を要求) に寄る。
- **派生値非保存原則の維持**: 達成率 / 移動平均 / 進捗% を DB に保存したくなる引力は強い (パフォーマンス理由) が、 [ADR-0001](0001-chain-data-model.md) / [K-006](../../KNOWLEDGE.md) で守ってきた「保存は事実、解釈は表示時関数」の原則を維持する。 N=1 規模なら派生計算で十分速い (14D × 数チェーン × 数ノード = 100 行以下のクエリ)。
- **PR 分割の理由**: PR-Z1 (= 元 Phase 3 スコープ) だけで「チェーン詳細 + 定着」は完結する。 Z2 / Z3 は追加価値レイヤー。一気に大 PR を出すと review / debug 困難 ([K-019](../../KNOWLEDGE.md) 経験)。

## 想定される影響

### 即時の影響 (PR-Z1 範囲)

- **新規ファイル**: `app/chain/[chainId]/detail.tsx` / `src/ChainDetailScreen.tsx` / 定着判定の純粋関数 `src/domain.ts` 拡張
- **定着判定ルール (新規確定)**: ノード単位達成率 × 期間 (14D 中 X 日以上達成) で「定着」とみなす閾値を本 ADR では決めない (PR-Z1 着手時に再判断、要 PR コメント明記)
- **円→星モーション**: 達成と同時に「定着到達」した場合、 ノック (= 線伸び) と同じ達成ジェスチャの一部として星化アニメを発火 ([DESIGN-SYSTEM §4.3](../../DESIGN-SYSTEM.md) ノック節と整合)

### PR-Z2 範囲

- **新規ファイル**: `app/(tabs)/analytics.tsx` 新タブ / `src/AnalyticsScreen.tsx` / 集計関数 `src/analyticsDerivation.ts`
- **タブ追加判断**: Today / チェーン / **分析** の 3 タブに拡張。 タブ追加は ADR-0011 (expo-router) と整合
- **グラフ実装**: 折れ線は `react-native-svg` (既存依存) で自作 (Phase 1 で SVG パスは経験あり)。 chart library は導入しない

### PR-Z3a 範囲

- **新規テーブル `metrics`**: schema migration (SCHEMA_VERSION bump)
- **新規ファイル**: `src/metricsRepository.ts` / `src/MetricsScreen.tsx` (分析タブ内 sub view)
- **schema 不変条件テスト ([K-006](../../KNOWLEDGE.md)) 拡張**: metrics テーブルの存在 + 派生値カラムが無いことを `PRAGMA table_info` で固定

### PR-Z3b 範囲

- **Notion API クライアント追加**: `src/notionClient.ts` (rate limit awareness + read-only)
- **CLAUDE.local.md 読み出し**: `notion_body_metrics_datasource` 等の追加項目を local 設定で受け取る
- **同期失敗の扱い**: API 落ち / token 切れ時は **silently fallback to local metrics**。 エラー赤色アラートを出さない (Celebrate 主)

### 将来の覆すコスト

- **「目標値」を後から追加 (= goal tracking)**: metrics テーブルに `target_value` 列追加 + UI 拡張。 1 PR 規模で対応可
- **「チェーンとメトリクスの紐付け」を後から追加**: `metric_chain_link` テーブル追加 + 集計関数拡張。 1-2 PR 規模
- **「Notion 以外のソース」追加**: source enum 拡張 + 各 source 用 client 追加。 source ごと 1 PR
- **本 ADR を覆す (= 目標 / 分析を再度出荷後レイヤーに戻す)**: 検証期間 (= Phase 3 実装後の自分の実使用) で「メトリクス無くても全然困らない」と判断したら、 metrics テーブルだけ残して UI を hidden。 schema drop は不要 (= データ消失受容したくない場合)

### 注意点

- **K-004 罠の再発防止**: PR-Z3 着手時、「メトリクス入力を毎日要求する UI」になっていないか自己レビュー。 手入力フォームは「いつでも開けるが開かなくても良い」設計に
- **定着判定の閾値決定**: PR-Z1 で実数値を決めるが、検証で違和感あれば再調整 ([K-014](../../KNOWLEDGE.md): 実機 → SPEC 改訂は正規ルート)
- **分析タブの追加は禁止 UI に該当しないか確認**: streak 表示 / 格子 / ヒートマップ / 弱い輪の指差し は引き続き禁止 ([CLAUDE.md §5](../../CLAUDE.md))
- **PR-Z3b 後 Notion datasource 名は CLAUDE.local.md (gitignore) に閉じる**: 本番リポに secret を含めない
