---
id: 19
date: 2026-05-24
project: knockon
tags: [architecture, library, ux]
status: accepted
supersedes: []
superseded-by: []
---

# 時刻アンカーのローカル通知は `expo-notifications` で daily 1 つ・全 active チェーン syncAll する

## 文脈

Phase 1.5 で時刻アンカー設定はできたが、 [K-008](../../KNOWLEDGE.md) / [ADR-0017](0017-expo-dev-client-migration.md) で書いたとおり Expo Go では `expo-notifications` のローカル通知が動かない。 PR-1.5b-1 で Dev Client に移行し、 通知 API が使えるようになった。

Phase 1 完成判定 ([ADR-0006](0006-phase1-completion-and-scope-narrowing.md)) は「Today が実機で数日継続して回る」こと。 毎朝 Today を開く動線を補強するために時刻アンカー通知が必要。

## 検討した選択肢

- **案 A**: weekday-specific スケジュール — variant の有効曜日ごとに別 trigger を作って通知。 例: 「月 = 胸トレ」「火 = 足トレ」を通知本文に出す。 詳細だが通知 ID 管理が複雑 (chain×7 = 最大 7 個)、 variant 変更時の cancel/再生成も 7 倍コスト。
- **案 B**: daily 1 つ — 時刻アンカーが設定された active チェーンに対して、 毎日その時刻に 1 つの通知。 variant の曜日違いは Today 側で表示する (= 通知タップで Today を開いて variant 適用後の状態を見る)。 通知 ID は chain × 1 で単純。
- **案 C**: 通知なし — 手動発火フォールバック ([ADR-0003](0003-firing-logic.md)) で押し切る。 N=1 で「自分が時間を覚えていられる」前提に依存。 Augmentation 原則 (新しい認知負荷を要求しない) に反する。
- **案 D**: バックグラウンドジオフェンス (場所アンカー) も同時に — PR-1.6b の範囲。 別 PR で分離する判断。

## 決定

**案 B** (daily 1 つ × syncAllNotifications) を採用。

具体:
- `src/notifications.ts` (Expo SDK wrapper) + `src/notificationHelpers.ts` (純粋関数、 ts-jest でテスト可能)
- 通知 ID 規約: `chain-{chainId}` (1 チェーン = 1 通知)
- スケジュール条件: `status='active'` + `anchor.kind='time'` + `anchor.time` が有効な HH:MM
- 通知 content: title=chain.title、 body=「{time} 開始」、 data={ chainId } (次 PR でディープリンク用)
- 通知 trigger: `SchedulableTriggerInputTypes.DAILY` + `{ hour, minute }` (毎日繰り返し)
- 再スケジュールタイミング:
  - `useChainEdit.save` 成功時に該当チェーン分を cancel+再 schedule
  - `useChainEdit.deleteChain` 成功時に該当チェーン分を cancel
  - アプリ起動時 (`app/_layout.tsx`) に `syncAllNotifications()` で全 active チェーンと整合 (drift 解消の safety net)
- 権限拒否 (denied) は手動発火フォールバック ([ADR-0003](0003-firing-logic.md)) で補う。 通知エラーで save 自体を失敗にしない (catch で握り潰す)
- Android 通知チャンネル: `chains` (importance: DEFAULT)

## 理由

- **シンプルさ最優先**: 案 A は variant の曜日違いを通知本文に出すが、 ユーザー UX 上は「通知タップ → Today で確認」が自然な流れ。 案 B で十分。 通知 ID 管理の複雑度を 7 分の 1 に。
- **variant との責務分離**: variant の曜日 specific は Today 側で表示済み ([ADR-0018](0018-variant-phase-2-frontload.md) + PR-1.9 後のグレー skip 表示)。 通知レイヤーで重複処理する必要なし。
- **drift 解消の safety net**: 個別 cancel+schedule のタイミングを 1 つでも漏らすと OS 側に古い通知が残る。 起動時 `syncAllNotifications` で「全 active チェーン = OS 側通知集合」を担保する [K-006](../../KNOWLEDGE.md) 的なガードレール。
- **拒否時の動線確保**: 権限拒否でも save / 削除は成功する設計。 [ADR-0003 §「決定」第 5 項](0003-firing-logic.md) の「再要求ループ・許可誘導 UI 禁止」と整合 — 一度拒否されたらフォールバックに移る。
- **テスト可能な純粋関数を分離**: `notificationHelpers.ts` に純粋関数 (parseTimeString / shouldNotifyForChain) を切り出し ts-jest で testable に。 Expo SDK 呼び出し部 (`notifications.ts`) は wrapper として薄く、 実機検証で動作確認。

## 想定される影響

### 即時の影響

- `expo-notifications@^56.0.13` 追加。 `app.json` の plugins に登録
- `useChainEdit` の save / deleteChain で通知 API を呼ぶ (失敗は catch で握り潰す)
- `app/_layout.tsx` の起動時 init に `syncAllNotifications()` を追加
- 通知が出るタイミングは「OS の cron 的なスケジューラ」で、 端末スリープ中も発火する (省電力モードによっては遅延する場合あり)

### 将来の覆すコスト

- **案 A への変更 (weekday-specific)**: variant の通知本文を出したくなったら、 通知 ID 規約を `chain-{chainId}-{weekday}` に拡張、 schedule ロジックを 7 倍に。 既存通知の cancel は `chain-{chainId}` プレフィックス検索で簡単。
- **案 C への変更 (通知なし)**: `useChainEdit` から通知呼び出しを取り除き、 `app/_layout.tsx` の syncAll を消す。 1-2 時間で復元可能。
- **バックグラウンドジオフェンス追加 (PR-1.6b)**: `expo-location` の region monitoring を別途実装。 通知レイヤーとは独立。

### 注意点

- **expo-notifications types の型解決失敗**: tsc が `NotificationPermissionsStatus` の `granted: boolean` を解決できず、 局所的に `as unknown as { granted: boolean }` キャストで突破。 ランタイム挙動には影響なし、 expo-notifications の types バージョン依存の問題。
- **権限拒否 + canAskAgain=false の挙動**: `requestPermissionsAsync` は再度許可ダイアログを出さず即時 denied を返す。 ユーザーは設定アプリから手動で許可する必要があるが、 ADR-0003 「再要求ループ・許可誘導 UI 禁止」に従い専用 UI は作らない。 手動発火フォールバックで運用。
- **OS の通知配信タイミング**: iOS / Android の省電力モード、 Doze モード、 アプリ強制停止状態では通知が遅延する可能性。 これは OS 側の挙動で、 Phase 1 実機検証で受容できなければ Phase 2 で foreground service / Critical Alerts 等を検討。
- **通知タップ → Today への遷移は PR-1.5b-3 で実装**。 本 PR では `data: { chainId }` を載せるだけ、 listener / router の連動は別 PR。
