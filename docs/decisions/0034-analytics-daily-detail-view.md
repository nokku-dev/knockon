---
id: 0034
date: 2026-06-01
project: knockon
tags: [ux, scope, data-model]
status: accepted
supersedes: []
superseded-by: []
---

# 分析タブの「日々の詳細」ビュー (1 日スナップショット)

## 文脈

Issue #63: knockon の分析で「日々の詳細を追えるビュー」を作りたい。現状の分析 ([ADR-0024](./0024-goal-view-analytics-phase-3-unified.md)) は「14D・チェーン別の達成率 + 折れ線グラフ」という集計層のみで、特定の 1 日に「どのノードを達成したか／何を記録したか」を掘り下げる手段がなかった。Issue は内容・配置が未定義で、着手前に受け入れ条件を確定する必要があった (CLAUDE.md 認知特性: 曖昧な完了条件を避ける)。

## 検討した選択肢

### 表示内容 (ユーザー判断で確定)

- **採用: ノード達成スナップショット + その日のメトリクス**
  - 選んだ日の各 active チェーンについて「達成 / 未達 / 休む日 (variant null)」+ アンカー発火有無、加えてその日に記録したメトリクス値。
- 却下: ノード達成のみ (メトリクスを含めない) / 達成数サマリのみ (掘り下げが浅い)。
- **除外: 実行時刻** — 正準データは `(ノード, 日付, bool)` と `(anchor_id, 日付)` で**時刻を持たない** ([ADR-0001](./0001-chain-data-model.md))。実行時刻を出すにはスキーマに時刻を足す必要があり、正準データ最小主義に反するため非対応とした。

### 配置 (ユーザー判断で確定)

- **採用: 既存分析タブ内に日付セレクタ**
  - 過去 14 日の日付チップを横 1 行で並べ (格子ではない)、選んだ日の詳細を同じ画面 (同一 ScrollView) に表示。
- 却下: 折れ線グラフの点タップで展開 (タップ判定実装が複雑) / 新規「日別」画面 (ADR-0024 の「分析統合」方針と逆行・画面増)。

## 決定

- 純粋ドメイン (`analyticsDerivation.ts`, K-007): `dayNodeStatuses(date, nodes, actionsById, achievements)` (達成/未達/休む日を variant 解決込みで判定) + `metricsOnDate(metrics, kinds, date)` (当日記録の抽出 + ラベル/単位付与)。
- repository: `listAllMetricsInRange(from, to)` (全 key の範囲取得を 1 クエリ)。
- hook `useDayDetail`: 選択日 state を持ち、active チェーン × (ノード状態 + アンカー発火 `isAnchorFiringToday`) + 当日メトリクスを組み立てる。フォーカス毎に再ロード (達成タップ後の反映)。
- UI `DayDetailSection` (props 駆動): 日付チップ列 + 選択日のチェーン別ノード状態 (✓ 達成 / ○ 未達 / — 休む日) + メトリクス。`AnalyticsScreen` に `footer` slot を足して同一 ScrollView 内に差し込む。

## 理由

- **集計と詳細を分離**: 達成率 (集計) は `useAnalyticsData`、1 日の事実 (詳細) は `useDayDetail`。責務が異なるためデータパスを分け、日付切替で画面全体を再ロードしない。
- **表示時派生のみ**: 日別詳細も `(ノード,日付,bool)` / `(anchor,日付)` / メトリクスから毎回計算。派生値は保存しない ([ADR-0001](./0001-chain-data-model.md) 維持)。
- **禁止 UI を避ける**: 日付セレクタは横 1 行のチップ (ノード×日付の格子・ヒートマップではない)。未達は淡色 (`○` / fg-soft) で赤くしない。streak は出さない (反 streak / Celebrate 主、DESIGN-SYSTEM §0)。達成 `✓` / 未達 `○` / 休む日 `—` は Today のマーカー語彙と整合し「マイナスを指差さない」。

## 想定される影響

- **正準データ不変**: スキーマ変更なし。`listAllMetricsInRange` は読み取り専用の追加。
- **実行時刻が欲しくなったら**: 達成記録に時刻を持たせる判断が別途必要 (ADR-0001 の 3 軸拡張 = K-015 同型)。現時点では非スコープ。
- **パフォーマンス**: 日付切替で 1 日分を再クエリ (active チェーン数 × 数クエリ)。N=1 規模で体感問題なし。多チェーン化したら window 一括取得 + クライアント側で日付フィルタに変える判断トリガー。

## 関連

- [ADR-0024](./0024-goal-view-analytics-phase-3-unified.md): 分析タブ (達成率) の統合方針。本 ADR はその詳細層を足す。
- [ADR-0001](./0001-chain-data-model.md): 正準データ 3 軸 (時刻を持たない根拠)。
- [DESIGN-SYSTEM.md §0](../../DESIGN-SYSTEM.md): 禁止 UI (格子/ヒートマップ/streak) と Celebrate 主。
- [K-016](../../KNOWLEDGE.md): マイナスを指差さない表示。
