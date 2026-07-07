---
id: 51
date: 2026-07-07
project: knockon
tags: [scope, ux, design]
status: accepted
supersedes: []
superseded-by: []
---

# 達成マトリクス（60D / 7D）を撤去し、ステージ「これから」を「育成中」に統合する

## 文脈

実機で見返したユーザーが 2 点の違和感を挙げた（2026-07-07）:

1. **マトリクスは本質に必要か**: 60D 達成マトリクス（#115/ADR-0037）と Today ノード行の 7D ミニマトリクス（#125/ADR-0038）は、二値化（炎・赤・段階塗りなし）しているとはいえ **「やらなかった日（未達セル）」を可視化する**。これは本アプリの核（反 streak / マイナスを指差さない / Celebrate 主 = 積み上がる線と定着の星が主役）と方向が逆で、「やらない日があるとテンションが下がる」。特に 7D は**実行直前**に過去の未達を見せるため逆効果。
2. **「これから」と「育成中」の違い**: これから（実タップ 0）と育成中（実タップ ≥1）の差は薄く、「これから」は“着手してない backlog を指差す”ニュアンスが出る。「追加した＝育てるつもり」なら全部「育成中」でよい。

## 検討した選択肢

- **案 A (採用)**: (1) マトリクス（60D + 7D）を**撤去**（UI から外す。`DateMatrixSection` / `useDateMatrix` / `nodeDateMatrixCells` / `settledDatesForNode` のコードは残置・出荷後に戻せる）。(2) ステージ `'fresh'`（これから）を廃止し **`'growing'`（育成中）に統合**（未定着・未 almost は実タップの有無に関わらず育成中）。
- **案 B**: マトリクスを「達成/定着だけのポジティブ表示」に変える。→ ユーザーは「撤去」を選択（ギャップ表示そのものを無くす）。
- **案 C**: 現状維持。→ 実機の違和感（テンションが下がる）を放置することになり不採用。

## 決定

1. **60D 達成マトリクスを撤去**: `app/(tabs)/analytics.tsx` から `DateMatrixSection` / `useDateMatrix` を外す。ログタブは「定着ポートフォリオ + メトリクス手入力」のみ。
2. **7D ミニマトリクスを撤去**: `ChainDetail` のノード行右端の `NodeRecentCellsMatrix` を削除。`useTodayData` の `nodeRecentCells` / `nodeRecentSettled` 計算・フィールドも削除（無駄な hot-path 計算を残さない）。
3. **ステージ `'fresh'` を廃止し `'growing'` に統合**: `SettlementStage = 'growing' | 'almost' | 'settled'`。`nodeSettlementStage` は未定着・未 almost を常に `'growing'` に。`SettlementStageCounts` から `fresh` を削除。ポートフォリオは **育成中 / もう少しで定着 / 定着** の 3 ステージ。
4. **コードは残置（reversible）**: マトリクスの純粋派生（`nodeDateMatrixCells` / `dateMatrixForWindow` / `settledDatesForNode`）とコンポーネント（`DateMatrixSection`）・フック（`useDateMatrix`）は削除せず残す（テストも維持）。出荷後に戻したくなれば再配線で復帰できる（SPEC §5「削った機能は不要ではなく後回し」の一貫）。

## 理由

- **核に忠実**: マトリクスの未達セルは、控えめでも「ギャップを指差す」。本アプリの主役は「積み上がる線 + 定着の星」であり、未達の可視化はそれと競合する。撤去することで反 streak / Celebrate 主が純化する。実機の違和感 → 原則に戻す（[K-014](../../KNOWLEDGE.md) の正規ルート）。
- **7D が最も off-thesis**: 実行直前に過去の未達を見せるのは Augmentation（負担・萎えを増やさない）に逆行。60D も同種だが opt-in なので影響は小さい。両方外すのが最も一貫。
- **stage 統合**: 0 タップ / ≥1 タップの区別は本人の体感で意味が薄く、「これから」は未着手 backlog を指差す。全部「育成中」にすると「追加したものは育てている最中」という素直な意味になり、マイナスを指差さない。

## 想定される影響

- **CLAUDE §4 の「例外: 分析タブの二値マトリクス」条文**は、マトリクス撤去に伴い実質休眠（コードは残るが UI から外れる）。禁止 UI（格子/ヒートマップ）の本則は不変。
- **ADR-0037（60D マトリクス）/ ADR-0038（7D）/ #125 / #128** の UI は本 ADR で撤去（派生・コンポーネントは残置）。逆参照。
- **ADR-0050（定着=星）**: 7D / 60D の「定着日を星で描く」は撤去に伴い休眠（Today のノードドット星は存続）。
- SPEC §3 のステージ記述・§マトリクス、DESIGN-SYSTEM §0、understanding-map を同期。
- `SettlementStageCounts` の型変更（`fresh` 削除）は全呼び出しを更新済み。

## 関連

- **[ADR-0037](0037-analytics-date-matrix.md) / [ADR-0038](0038-today-chaindetail-7d-matrix-axis-reinterpretation.md)**: マトリクスの導入。本 ADR で UI 撤去（コード残置）。逆参照。
- **[ADR-0047](0047-settlement-lifecycle-and-log-portfolio.md) / [ADR-0050](0050-settlement-star-marker-and-today-headline.md)**: 定着ライフサイクル / 星の可視化。ステージ 4 段 → 3 段に更新。
- **[ADR-0036](0036-rescind-today-streak-display.md)**: 反 streak の判定軸。本 ADR は「未達の可視化を外す」方向で核に収束。
