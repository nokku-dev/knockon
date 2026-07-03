---
id: 45
date: 2026-07-03
project: knockon
tags: [scope, ux]
status: accepted
supersedes: []
superseded-by: []
---

# 分析 (ログ) タブを v1 リリーススコープから除外しミニマルリリースに絞る (ADR-0024 §スコープを部分的に覆し)

## 文脈

[ADR-0024](0024-goal-view-analytics-phase-3-unified.md) で目標ビュー / メトリクス / 分析を v1 非スコープから外し、Phase 3 と統合して v1 範囲に取り込んだ。その結果、現在のタブ構成は **Today / チェーン / ログ (分析) / 研究** の 4 本になっている。分析タブは 14D 達成率カード (PR-Z2) / メトリクス手入力 (PR-Z3a) / メトリクス種別編集 (PR-CC, [ADR-0026](0026-metric-kinds-customization.md)) / 60D 達成マトリクス (#115, [ADR-0037](0037-analytics-date-matrix.md)) を持つ。

Obsidian inbox capture (#194) で「スコープが広がりすぎるため、まずはミニマルな構成でリリースすることを優先」という判断が出た。prime objective (= 自分が毎日使う 1 本を最短で完成・出荷する) と完成判定 = Phase 1 (Today が実機で数日回る) に照らすと、分析タブは初回リリースのコア体験 (If-Then チェーン + Today) の外側にある。リリースの表面積を絞り、コア体験だけで出荷する判断が必要になった。

## 検討した選択肢

- **案 A (採用)**: 分析タブを **タブバーから非表示 (`href: null`)** にし、`analytics.tsx` / `AnalyticsScreen` / メトリクス系コード・ルートは残す。
- **案 B**: 分析タブのコード (`analytics.tsx` + タブ登録 + `AnalyticsScreen` / `DateMatrixSection` / メトリクス系 UI) を削除する。`analyticsDerivation.ts` は Today の 7D マトリクス ([ADR-0038](0038-today-chaindetail-7d-matrix-axis-reinterpretation.md)) が共有するため残す。
- **案 C (却下)**: 現状維持。分析タブをリリースに含めたまま出荷する。→ スコープが広すぎるという #194 の判断に反する。

## 決定

**案 A を採用。** `app/(tabs)/_layout.tsx` の分析タブ `Tabs.Screen` に `href: null` を付与し、タブバーから非表示にする。ルート・画面コード・メトリクスデータモデルは一切削除しない。

- 出荷後に分析を再有効化するときは `href: null` を外す 1 行で戻せる (無移行)。
- `analyticsDerivation.ts` は Today の ChainDetail 7D マトリクス (ADR-0038) が共有しているため、タブを隠しても Today 側は無影響。
- 正準データ (achievements / metrics / metric_kinds) は [ADR-0001](0001-chain-data-model.md) のまま保存され続ける (派生の非表示化であってデータの削除ではない)。

## 理由

- **非破壊 / 無移行の一貫性**: knockon のスコープ削除は「不要」ではなく「後回し」(SPEC §5)。派生が非保存でデータ正準が変わらないため、UI を隠すだけで後から無移行で戻せる。案 B (削除) は再有効化時に UI を作り直すコストを生むため、「後回し」の意味に合わない。
- **リスクに触れる出荷を優先**: 完成判定は Phase 1 のコア体験 (Today) であり、分析はコアの外。表面積を絞ってミニマルにリリースするほうが prime objective に直結する ([K-004](../../KNOWLEDGE.md) 「完成ゲートをコア体験に置く」の精神)。
- **ADR-0024 を全面 supersede しない**: 0024 が確定した「チェーン詳細 (Phase 3a)」「メトリクスは任意 + 疎結合 + read-only という ANT 回避構造」「メトリクスデータモデル」は維持される。覆すのは **分析タブをリリースに載せるというスコープ判断のみ**。よって supersede ではなく部分改訂とし、双方向リンクで系譜を残す ([K-005](../../KNOWLEDGE.md) / [K-015](../../KNOWLEDGE.md))。

## 想定される影響

- タブは Today / チェーン / 研究 の 3 本になる (研究タブは #175/#181 で新設済み、ADR-0044)。
- [ADR-0024](0024-goal-view-analytics-phase-3-unified.md): §スコープの「分析を v1 リリースに載せる」部分は本 ADR で当面棚上げ。0024 側に逆参照 1 行を追加 (単体読みでの誤誘導防止、K-005)。0024 の他条項 (チェーン詳細 / ANT 回避構造 / データモデル) は有効。
- [ADR-0037](0037-analytics-date-matrix.md) (60D 達成マトリクス) / [ADR-0026](0026-metric-kinds-customization.md) (メトリクス種別編集): 分析タブ内の機能なのでリリースからは同時に休眠。コードは残るため ADR は accepted のまま (再有効化で復帰)。
- SPEC §3 (ビュー) を「分析 (ログ) タブは v1 リリース非表示」に同期更新。
- 再有効化コスト = `href: null` を外す 1 行 (低)。ミニマルリリース検証後、分析を戻すかは実機運用で判断する。
- 回帰ガード: `src/TabsLayout.test.tsx` で分析タブが `href: null`・他 3 タブが可視であることを機械検証。
