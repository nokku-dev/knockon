---
id: 25
date: 2026-05-26
project: knockon
tags: [feature, data-model, ux]
status: accepted
supersedes: []
superseded-by: []
---

# ノードタイマー機能 (action 単位 + 自動達成 + フルスクリーン画面)

## 文脈

[ADR-0022](0022-phase-1-completion-and-verification-operation.md) 検証期間中、 ユーザーが「**ルーティンの中にタイマー機能を仕込みたい**」と判断 (不便駆動シグナル)。 具体例:
- 「読書を 30 分」のような時間ベースのアクション
- Today でタイマーボタンを押 → 控えめな音でアラーム
- タイマー画面は全面に出る

これは [SPEC.md](../../SPEC.md) には書かれていなかった新規機能。 Phase 1 検証で「ノードに時間情報を持たせたい」シグナルが具体化したので、 本 ADR で機能スコープを確定する。

## 検討した選択肢

### タイマーの保存単位

- **案 A (採用)**: action 単位 — `actions.timer_seconds INTEGER NULL`。 同じアクション (e.g. 「読書」) を別チェーンで使っても同じタイマー時間
- 案 B: node 単位 — `nodes.timer_seconds`。 同じ「読書」アクションでもチェーンごとに別タイマー設定
- ユーザー判断で案 A 採用 (シンプル / 設定ミス少ない / 「読書 = 30 分」のメンタルモデルと整合)

### タイマー完了時の挙動

- **案 X (採用)**: 自動で達成記録 + 控えめアラーム + 画面閉じる — タイマーが切れたら自動的にそのノードを達成扱い + アラーム + Today に戻る
- 案 Y: アラームのみ、 達成は手動タップ
- ユーザー判断で案 X 採用 (摩擦最小、 Augmentation 原則と整合)

### アラーム音 / 振動の実装

- **案 P (採用)**: 既存 `expo-notifications` でローカル通知を即発火 (trigger: null) + React Native 標準 `Vibration` API で振動。 依存追加ゼロ
- 案 Q: `expo-av` (or `expo-audio`) を追加して短い chime asset を再生
- 案 R: `expo-haptics` を追加して振動のみ (音なし)

案 P を採用: (1) 既存依存のみで動く、 (2) OS のデフォルト通知音は控えめ (ユーザー要件と整合)、 (3) サイレント時は鳴らない (デバイスのモードを尊重)。 ユーザーの希望と整合する場合に限り、 後で案 Q に切替可能 (依存 + asset 追加コスト発生)。

### タイマー画面の表示形式

- **案 M (採用)**: React Native の `Modal` で全面表示 (`presentationStyle="fullScreen"`)
- 案 N: expo-router の別 route で遷移
- 案 M を採用 (Modal の方が状態管理シンプル、 back gesture でキャンセル容易)

## 決定

採用 A + X + P + M を確定。 具体的に:

### スキーマ拡張

- `actions` テーブルに `timer_seconds INTEGER` (NULL 許容) を追加
- SCHEMA_VERSION 2→3 bump、 drop+recreate migration ([K-021](../../KNOWLEDGE.md) パターン継承)
- K-006 不変条件テスト更新: actions の 4 カラム固定 (id / title / variants_json / timer_seconds)

### ドメインモデル拡張

- `Action` 型に `timerSeconds: number | null` 追加
- `timerSeconds === null` → タイマーなし (デフォルト挙動、 既存アクション後方互換)
- `timerSeconds > 0` → タイマーあり

### UI 編集

- `ActionEditor` に「タイマー (分)」入力フィールド追加
- 入力単位は **分** (ユーザー入力しやすい)、 DB 保存単位は **秒** (整数で精度確保)
  - 入力 30 → 保存 1800
  - 表示 1800 → 表示 30
- 空入力 = NULL = タイマーなし

### Today 表示 + タイマー起動

- タイマー設定済みノード (`action.timerSeconds != null`) に「⏱ N 分」表示 + 「開始」ボタン
- 「開始」タップで `TimerScreen` (Modal) を全画面表示
- TimerScreen 内:
  - 残り時間カウントダウン (大きい数字、 tabular-nums)
  - 「一時停止 / 再開 / キャンセル」ボタン
  - 完了時:
    1. `expo-notifications.scheduleNotificationAsync({ trigger: null, content: { data: { kind: 'timer-complete' } } })` で即時通知 → OS 控えめ音
    2. `app/_layout.tsx` の `setNotificationHandler` は `data.kind === 'timer-complete'` のときだけ `shouldPlaySound: true` を返す ([K-026](../../KNOWLEDGE.md) 候補: global handler が個別 sound を上書きする仕様の回避)
    3. `Vibration.vibrate([100, 50, 100])` で短い振動パターン (React Native 標準 API)
    4. `onMarkNodeAchieved(chainId, nodeId, true)` で達成記録 = **force set** (= 案 X 自動達成)
       - **重要**: `onToggleNode` (bool 反転) ではなく `onMarkNodeAchieved` を使う ([K-027](../../KNOWLEDGE.md) 候補: 既達成ノードでタイマー完了して「未達成に戻る」バグの回避)
    5. Modal を閉じる
  - キャンセル時: 達成記録なし、 Modal 閉じる

### 既存判断との関係

- **[ADR-0001](0001-chain-data-model.md)**: 派生値非保存原則は **維持**。 `timer_seconds` は派生ではなく「ユーザー設定値 (= 観測した事実)」として正準データに含まれる。 [K-015](../../KNOWLEDGE.md) パターン (軸別追加) と整合
- **[ADR-0018](0018-variant-phase-2-frontload.md)**: variant 構造に影響なし (timer_seconds は variant 別ではなく action 単位、 シンプル)
- **[ADR-0024](0024-goal-view-analytics-phase-3-unified.md)**: メトリクスとは独立。 タイマー完了でメトリクス自動入力はしない (= ANT 違反警戒継承)
- **[SPEC.md](../../SPEC.md)**: 「禁止 UI / 形変化は定着で円→星」と矛盾しない (タイマー画面は別 Modal で、 ノードマーカー形状は変えない)

## 理由

- **action 単位 (案 A) の理由**: 「読書 = 30 分」が自然なメンタルモデル。 node 単位だと同じアクションを別チェーンで使うとき毎回設定が必要。 シンプル優先
- **自動達成 (案 X) の理由**: タイマー完了 = アクション完了として扱う方が摩擦ゼロ。 「タイマー切れたけど集中継続」のケースはキャンセルすれば達成なし
- **依存追加なし (案 P) の理由**: expo-av / expo-haptics を入れる前に Phase 1 完成判定の精神 ([ADR-0006](0006-phase1-completion-and-scope-narrowing.md)) を保つ。 通知音 + 振動で「控えめ」要件を満たし、 不足が判明したら別 ADR で expo-av 追加判断
- **Modal (案 M) の理由**: 状態 (残り時間 / 一時停止 flag) を Modal 内 useState で完結。 別 route だと状態管理が分散する

トレードオフ:
- アラーム音は OS 通知音固定 → ユーザーが任意の音を選べない (=「控えめ」が OS 設定依存)
- 通知音はサイレントモード下では鳴らない (= ユーザー判断、 Phase 2 でフォアグラウンドオーディオ強制再生に変える場合は ADR で記録)
- タイマー画面表示中にデバイスがロックされる可能性 (`expo-keep-awake` 未導入)。 Phase 1 受容、 不便シグナルが出たら追加判断

## 想定される影響

### 即時 (PR-BB 範囲)

- schema migration: drop+recreate で既存試作データ消失 ([K-021](../../KNOWLEDGE.md) パターン継承)
- `Action` 型に `timerSeconds` 追加 → `repository.insertAction` / `updateAction` / `getAction` 全部影響
- `ActionEditor` に分単位 input 追加
- `Today ChainDetail` のノード行にタイマー UI 追加 (タイマー設定済みノードのみ)
- 新規ファイル: `src/TimerScreen.tsx` (Modal) + テスト

### 将来の覆すコスト

- **action 単位 → node 単位 (案 B) に切替**: actions テーブルから timer_seconds カラムを削除、 nodes テーブルに追加。 schema migration + 全 UI 影響。 1 PR 規模
- **自動達成 → 手動達成 (案 Y) に切替**: TimerScreen 完了時の onToggleNode 呼び出しを削除 + 「達成にする」ボタン追加。 小規模
- **アラーム音を expo-av に切替**: expo-av (or expo-audio) 追加 + asset 配置 + Sound.createAsync 呼び出し。 1 PR 規模、 依存追加コスト

### 注意点

- **タイマー実行中のバックグラウンド遷移**: ユーザーが他アプリに切替えると JS タイマーは停止する場合あり。 Phase 1 受容 (= タイマー使用時は前面表示前提)
- **正準データの軸**: `timer_seconds` は派生値ではなく **ユーザー設定値**として正準に含めるが、 タイマー実行ログ (= 「いつ何秒経過したか」の record) は保存しない (= 派生値、 Phase 2 で「タイマー履歴」機能が出たら再判断)
- **K-006 不変条件テスト更新必要**: actions テーブルの 4 カラム (id / title / variants_json / timer_seconds) 固定化
