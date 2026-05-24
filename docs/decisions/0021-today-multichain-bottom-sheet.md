---
id: 21
date: 2026-05-24
project: knockon
tags: [ux, library, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# Today はチェーンカード一覧 (折りたたみ) + Bottom Sheet (個別展開) で構成する

## 文脈

[ADR-0020](0020-deprecate-manual-firing-concept.md) で「手動発火」ワード廃止 + Today に全 active チェーンを並べる方針を確定。 ただし複数チェーン (例: 「朝のルーティン」「就寝前」) を Today にどう並べるかの UX が未確定。

選択肢:
- **A. 全チェーンを縦に並べてフル展開 (スパイン + ノードリスト)** — 縦が長くなり、 1 つに集中できない
- **B. 1 つだけ展開 + 他は折りたたみ + アコーディオン切替** — 切替が暗黙的、 ユーザーが「どれが今開いている」か追いにくい
- **C. 全チェーンを折りたたみカード + タップで Bottom Sheet 展開 (集中 UX)** — 一覧で進捗俯瞰 + 個別作業で集中、 メンタルモデル明確

ユーザー判断: 「**複数チェーンを同時に見る必要がない & 見れない気がするので、 ビューを分けてもいい**」 = **案 C**。

## 検討した選択肢

### Bottom Sheet ライブラリ

- **案 P1**: `@gorhom/bottom-sheet@^5` — デファクトスタンダード。 reanimated v3+ / gesture-handler v2+ ベース。 ハンドル / ドラッグ to dismiss / snap points 標準機能。 peer dep 互換 (本プロジェクトは reanimated 4.1 / gesture-handler 2.28)
- **案 P2**: React Native 標準 `Modal` + 自前 PanResponder — 軽量だが ハンドル / ドラッグ to dismiss / アニメーションを全部自前。 Phase 2 規模で再発明する価値なし
- **案 P3**: `react-native-modalfy` / `react-native-actions-sheet` — 別系統の選択肢、 デファクトを外す合理的理由なし

### 折りたたみ表示の情報量

- **案 D1**: タイトル + 発火中ピル + 円グラフ + N/M 文字 — 進捗を視覚 (円グラフ) + 数値 (N/M) で 2 重表現
- **案 D2**: タイトル + N/M のみ (テキスト) — シンプルすぎる、 視覚情報が薄い
- **案 D3**: タイトル + マーカー列 (各ノードの達成状況を小ドット 5 個並べる) — Today の本来のスパイン要素を縮小再現、 情報量多いがゴチャつく

### 100% 達成時の表示

- **案 F1**: 円グラフを 100% 塗りつぶし + 「5/5 完了」テキストのまま
- **案 F2**: 円グラフを ✓ バッジに切替 (達成感の強調)
- **案 F3**: カード全体を Celebrate モーションで装飾 (DESIGN-SYSTEM §4.3 ノックの拡張、 PR 規模拡大)

## 決定

- **Bottom Sheet ライブラリ**: 案 P1 (`@gorhom/bottom-sheet@^5`) を採用
- **折りたたみ表示**: 案 D1 (タイトル + 発火中ピル + 円グラフ + N/M)
- **100% 達成時**: 案 F2 (✓ バッジ + 円グラフ非表示)
- **状態管理**: `openChainId: string | null` を Today 画面で 1 つだけ持つ、 同時に開く sheet は 1 つ
- **ProgressRing コンポーネント**: react-native-svg の Circle + strokeDasharray で部分塗り、 中央に N/M テキスト

## 理由

- **ライブラリ選定 (P1)**: K-019 「3 サイクルで消えない UI バグは library 責務を疑い、 入れ替えを選択肢に」の経験から、 デファクトを選ぶ。 自前 PanResponder は K-019 級の落とし穴がある。 `@gorhom/bottom-sheet` は GitHub 7k stars 級の成熟、 example も豊富で挙動確認が容易。
- **集中 UX (案 C)**: チェーン間に**順番が定義されない** (起床時 / 就寝前等、 別の状況で発火する複数本) ため、 「全部並べて全部やる」 ではなく「今やる 1 つに集中」のメンタルモデルが正しい。 Bottom Sheet で「開いている 1 つ」と「他は俯瞰」が明確に分かれる。
- **円グラフ + N/M (D1)**: 「視覚 (円グラフ) + 数値 (N/M)」の二重表現は冗長ではなく、 「ぱっと見の進捗 + 正確な達成数」を両立する。 アクセシビリティ的にも数値が読まれることで補強される。
- **✓ バッジ (F2)**: DESIGN-SYSTEM §4.3 (ノック + マーカーバウンス + テキストバウンス) は**達成タップ時**の祝福。 100% 達成の**カード表示**は別軸の状態表現。 ✓ バッジは「形変化 1 回 (円→星)」とは独立した「達成状態の表示」で、 既存の規律と衝突しない。

## 想定される影響

### 即時の影響

- `@gorhom/bottom-sheet@^5.2.x` 追加 (peer deps: reanimated >=3 / gesture-handler >=2 → 既存 install で満たす)
- `useTodayData.ts` の型変更: `TodayData` を `{ today, chains: TodayChainData[] }` に
- `TodayScreen.tsx` を `ChainCard` 縦並び + `ChainDetailSheet` (bottom sheet) に分割
- 新規コンポーネント:
  - `ProgressRing.tsx`: 円グラフ (SVG Circle)
  - `ChainCard.tsx`: 折りたたみカード (タイトル / 発火中ピル / 円グラフ or ✓ / N/M)
  - `ChainDetailSheet.tsx`: bottom sheet (既存 Today のスパイン + ノードリストを内包)

### 将来の覆すコスト

- **Bottom Sheet ライブラリ入れ替え**: API の薄いラッパで使えば移行コスト中。 case: library 不具合・メンテ停止
- **アコーディオン展開 (案 B) への変更**: bottom sheet を廃止し、 ChainCard 内に展開表示を追加する。 ProgressRing / ChainCard は流用可能、 Sheet 関連だけ廃棄
- **全展開 (案 A) への変更**: ChainCard を廃止し、 既存 TodayScreen を縦に N 回描画する形に。 状態管理シンプル化、 ただし UX 集中性は失う

### 注意点

- **Bottom Sheet 内の TextInput / Pressable**: ScrollView 内に置く場合 `keyboardShouldPersistTaps='handled'` 等の設定が必要。 既存 ChainEditScreen (Phase 1.7b) と同等の対応
- **Today の `useFocusEffect` でリロードされるとき** sheet は閉じるか?: 閉じる方が予期せぬ画面状態を避けられる。 `openChainId` を focus 時にリセットする
- **達成タップ時のノックアニメーション**: 展開時 (Bottom Sheet 内) のみ動作。 折りたたみカード側は ProgressRing が「3/5」→「4/5」と数値が変わるだけ
- **GPS 経由の場所アンカー発火検出**: chain ごとに非同期発動するため、 マルチチェーン化で並列実行される可能性。 既存 K-017 同型の race を Phase 2 N=2 で観測したら判断
