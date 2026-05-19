---
id: 0009
date: 2026-05-19
project: knockon
tags: [library, ui]
status: accepted
supersedes: []
superseded-by: []
---

# 1 本連続スパインの描画ライブラリに `react-native-svg` を採用する

## 文脈

PLAN PR-1.3 で「1 本連続スパイン」描画を実装する。差別化の中核要素 ([DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) §4.1) であり、ストリーク格子・ヒートマップを禁止する代わりにこの 1 本線で達成の流れを表現する。

Phase 1.5 で「ノックモーション」（達成時に線が一段スッと伸びる短いイージング、[DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) §4.3）が乗る前提で、描画手段を選ぶ。Phase 1.3 単体では静的描画で済むが、線アニメや SVG 形状制御を後発に控えていると分かっているなら、その想定の延長で選定する方が後の手戻りが少ない。

[ADR-0007](./0007-expo-react-native-stack.md) で Expo (managed workflow + EAS Build) に確定済み。time-to-device 最優先という選定基準は本 ADR にも適用される。

## 検討した選択肢

- **案A（採用）**: **`react-native-svg`** を採用。Expo Go に標準同梱 (SDK 54 で `react-native-svg@~15.x`)。SVG の `Line` / `Circle` / `Path` で描画。Phase 1.5 のノックモーションは `Animated.View` ラッパか `react-native-reanimated` で `Path` アニメ。
- **案B（却下）**: **`View` 矩形 + 絶対座標** で線を再現。RN 標準のみで依存追加なし。各 row 内に thin rectangle を入れて縦に並べる (`/docs/design/phase-1.pen` の PR-1.3 モックでこの構造を試作済み)。
- **案C（却下）**: **`react-native-skia`** で高性能描画。GPU 加速。

## 決定

案A を採用する。具体的に以下を固定する:

1. **PR-1.3 から `react-native-svg` を使う**。`expo install react-native-svg` で SDK 54 互換版を導入。Expo Go に同梱されているので Dev Build は不要、Phase 1.5/1.6 まで Expo Go で完結する見込み。
2. **PR-1.3 スコープでは `<Svg>` 内に `<Line>` 2 本（`--grow` 範囲と `--line-bg` 範囲）と `<Circle>`（マーカー、アンカードット）を配置する最小実装** とする。アニメ・グラデーション・複雑な path は Phase 1.5 のノックモーション着手時に追加判断。
3. **線の塗り範囲計算は domain 層の純粋関数** で行う（旧: `firstUnachievedNodeIndex`、現: `lastAchievedNodeIndex` ← [ADR-0010](./0010-spine-fill-to-last-achieved.md) により改名・意味も「連続実行範囲」→「達成済みノード範囲」に変更）。SVG レンダリングは座標計算した結果を受け取るだけ。これにより線の意味は SVG ライブラリ依存にならず、後で別の描画手段に差し替えても domain 側は無修正。
4. これは Phase 1 確定事項。覆す場合は本 ADR を `superseded` にする新規 ADR が必要。

## 理由

- **Phase 1.5 のノックモーションを見越した選定**: 静的描画だけなら案B で済むが、ノックモーション (線が一段スッと伸びる短いアニメ、[DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) §4.3) が Phase 1.5 で乗る予定。SVG の `Line` の長さや `Path` の `strokeDasharray` をアニメするのは `react-native-reanimated` 等との相性も良く、View 矩形をリサイズするより自然。後で手段を切替えるコストを避けるため最初から SVG にする。
- **Expo Go 同梱で追加コストなし**: `react-native-svg` は Expo SDK 54 の同梱モジュール。Dev Build を必要としない（[ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) の早期検証ゲートと整合: Expo Go で完結する範囲は維持）。
- **DOM 同等の宣言的 API**: SVG 要素は React の declarative model と素直にマップする。`<Line x1={} y1={} x2={} y2={} stroke={} />` で意図がそのまま読める。View 矩形の座標計算で線を再現する案B は、後で「分断された線の中間に何かを描く」「角丸スパイン」「線アニメ」が来た時に再実装になる。
- **案B を却下する理由**: 依存追加なしの利点はあるが、Phase 1.5 で SVG に乗り換える前提なら今避けても意味がない。`/docs/design/phase-1.pen` モックでの View 矩形試作で「row ごとに rail piece を入れ、`--grow` 半分 / `--line-bg` 半分で塗る」構造を検証したが、SVG なら 2 行の `<Line>` で済む。コード量とロジック明快さで SVG が勝る。
- **案C（`react-native-skia`）を却下する理由**: Phase 1 スパインは細い直線 1 本のみで GPU 描画は過剰。Skia は学習コスト・バンドルサイズ・Expo Go 非同梱（Dev Build 必須）の制約があり、time-to-device に逆行する。Phase 1 では避ける。Phase 2 以降で複雑な視覚表現が必要になった場合に再評価。

トレードオフ:
- `react-native-svg` への依存が固定される。バージョンアップ時に SDK 互換性を見る必要が出る（K-008 / K-009 の管理対象が 1 つ増える）。
- SVG レンダリングは JS スレッドで座標計算するため、巨大な path や多数の要素では性能劣化の可能性。Phase 1 の N=3 規模では問題なし。Phase 2 以降で N=20+ や複数チェーン同時表示が来たら測定して判断。

## 想定される影響

- **同 PR で同期更新が必要**: なし。`CLAUDE.md` の技術スタック節に「描画: `react-native-svg`」を 1 行足す程度は任意（Phase 1.3 完了時にまとめても可）。
- **Phase 1.3 着手時の作業**: `expo install react-native-svg`、[src/Spine.tsx](../../src/Spine.tsx) （または `TodayScreen` 内）に SVG ベースのスパイン描画を実装、[src/domain.ts](../../src/domain.ts) に `firstUnachievedNodeIndex` 等の純粋関数を追加（K-007 維持）。
- **既存 ADR との整合**: [0007](./0007-expo-react-native-stack.md) の Expo + managed workflow と整合 (Expo Go 同梱)。[0006](./0006-phase1-completion-and-scope-narrowing.md) の早期検証ゲートと整合 (Dev Build 不要)。[0001](./0001-chain-data-model.md) の正準データ原則を破壊しない (線の表示は派生計算、保存しない)。[0008](./0008-test-strategy-ts-jest-bettersqlite.md) のテスト戦略はそのまま (`jest-expo` で SVG コンポーネントテスト可能)。supersede 関係なし。
- **後で覆すコスト**: 案B（View 矩形）に降りる場合は、SVG コンポーネントを書き換えるだけで domain 層は無修正（決定3 のリターン）。案C（Skia）に上げる場合は描画レイヤだけ切替で済むが、Dev Build 移行とセットになるため [ADR-0008](./0008-test-strategy-ts-jest-bettersqlite.md) や [ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) と関連する判断が必要。
- **これは v1 の確定事項**。Phase 1.3-1.6 着手後に「やはり View 矩形で書き直す」などの再検討は **行わない**。Phase 1 実機実使用で SVG 起因の問題（性能・描画崩れ）が出た場合のみ本 ADR と関連 ADR の両方を見直す。
