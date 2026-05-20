---
id: 15
date: 2026-05-20
project: knockon
tags: [library, architecture, ux]
status: accepted
supersedes: []
superseded-by: []
---

# ノード DnD ライブラリに `react-native-reorderable-list` を採用する

## 文脈

[ADR-0014](0014-crud-phase-1-7-1-8-frontload.md) で CRUD を Phase 1.7-1.8 に前倒した際、チェーン編集画面のノード並び替え UI を実装する必要が出てきた。Phase 1.7 の初期実装 (PR #20) では「↑↓ ボタン」で並び替えていたが、ユーザーから「ドラッグアンドドロップで動かしたい」要望が出て PR-1.7a に着手。

Phase 1 の DnD は (a) ノード数が 1-20 件程度、(b) Expo Go (managed workflow) 上で動くこと、(c) iOS / Android 両対応、(d) Expo SDK 54 + RN 0.81 + Reanimated v4 と peerDep 互換、が必要条件。

## 検討した選択肢

- **案 A**: `react-native-draggable-flatlist@^4.0.3` — GitHub stars が多く、ScaleDecorator 等の便利デコレータあり。実際に PR-1.7a で採用試行 (PR #21) したが、実機で「ドラッグしていたノードアイテムが一瞬上下にスライドして見える」チラつきが発生。3 回の修正試行 (`rAF` defer / `memo` 比較関数で `drag` を除外 / `ScaleDecorator` 撤去) でも消えず、動画分析 (0.05 秒間隔キャプチャ) の結果 **library 内部の DnD swap モーション (active セル高さ 0 化 + placeholder 挿入) 自体** が原因と判明 ([K-019](../../KNOWLEDGE.md))。
- **案 B**: `react-native-reorderable-list@^0.18.0` — reanimated v4 worklet ベースで smooth layout animations を提供 (公式 README)。peerDep は `gesture-handler >=2.12` / `reanimated >=3.12` で本プロジェクト (2.28 / 4.1) と整合。`useReorderableDrag` フック + `onReorder({from, to})` の素直な API。
- **案 C**: ↑↓ ボタンに戻して DnD を諦める — PR #20 時点の UI に戻し、PR-1.7a を「DnD 試行 → 諦め」として close。並び替え自体は ↑↓ で機能する。

## 決定

**案 B** (`react-native-reorderable-list@^0.18.0`) を採用 (PR #22 / PR-1.7b)。

並び替え自体は PR #22 後の実機検証でユーザー確認済み: 「うまく動くようになった」「チラつき消えた」。Phase 1 で必要十分。

## 理由

- **チラつき根治の確証**: 案 A は library 責務でユーザー側コードでは消せないことが動画分析で判明。案 B は reanimated v4 worklet で swap を行うため JS / native bridge での setState 競合が構造的に起きない。
- **API シンプルさ**: 案 B の `useReorderableDrag` フック + `onReorder({from, to})` は draggable-flatlist の `RenderItemParams` よりも依存表面が小さく、library 入れ替え耐性が高い。`useChainEdit.reorderNodes(from, to)` の単純な index 並び替えに直接マッピングできた。
- **Augmentation 原則整合**: 案 C (↑↓ ボタン) はユーザー操作を要求しすぎる ("正確な順番で 1 つずつ動かす" 認知負荷)。DnD は「ノードを掴んで動かす」自然な操作で習慣編集の摩擦を減らす。
- **早期検証ゲート (ADR-0006) との整合**: 「動くまでに 2-3 時間で済むか」が選定基準。案 B は API シンプル + reorder-flatlist と並ぶ十分な GitHub 活動量で、Phase 1 出荷タイムラインに収まる。

## 想定される影響

### 即時の影響

- `react-native-draggable-flatlist` を削除し `react-native-reorderable-list` を `dependencies` に追加。バンドルサイズへの影響は微小 (reorderable-list 単体で数 KB)。
- `useChainEdit` の hook signature が `moveNode(nodeId, direction)` → `reorderNodes(from, to)` に変わる。 hook 利用側は `chain/[chainId].tsx` と `chain/new.tsx` のみで影響範囲限定。
- `app/_layout.tsx` に `GestureHandlerRootView` でルート全体を包む変更が必要 (peerDep 要件)。これは reorderable-list 撤退時にも残せるので可逆。

### 将来の覆すコスト

- **case 1 (別の DnD ライブラリへ再切替)**: API 表面が小さいので、新 library の `onReorder` 相当 + `useDrag` 相当をマッピングするだけで切替可能。`ChainEditScreen.tsx` の NodeEditorRow と `useChainEdit.reorderNodes` の 2 箇所改修で済む。
- **case 2 (DnD 廃止 / ↑↓ ボタンに戻す)**: NodeEditorRow を ↑↓ Pressable に戻し、`reorderNodes(from, to)` を `moveNode(nodeId, direction)` に書き直す。所要時間 1-2 時間。
- **case 3 (Phase 2 で reorderable-list がメンテ停止)**: メンテナー (omahili) は個人で、版 0.18.0 と若い。停止リスクは draggable-flatlist より高い。停止が来たら case 1 で別 library に乗り換える。

### 注意点

- iOS の modal presentation 内で長押し DnD を使うと、modal の dismiss ジェスチャと競合する可能性があるが、現状実機検証で問題発生せず。Phase 2 で iOS 実機検証が本格化したら再確認。
- `keyboardShouldPersistTaps='handled'` で keyboard 展開中の DnD は許容する設定。実機で問題出たら再検討。
