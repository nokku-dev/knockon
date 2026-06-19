---
id: 0042
date: 2026-06-20
project: knockon
tags: [notification, ux, augmentation, phase-1]
status: accepted
supersedes: []
superseded-by: []
---

# 夜の達成サマリ通知 (21:00 一本、 4 象限分岐本文)

## 文脈

Issue #169: 夜に「今日の達成数 N / 残チャンス M」を訴求するプッシュ通知を実装する。
目的: 就寝前に「あと M 個できる時間がある」を思い出してもらい、 翌朝の Today
チェックインに地続きで戻ってくる導線を作る。

設計判断ポイント:

1. **送信時刻**: いつ送ると効果的か。
2. **本文の組み立て**: N=0 / M=0 のような端点ケースをどう扱うか (Augmentation 原則 = マイナスを指差さない)。
3. **通知のスケジュール手段**: DAILY trigger か、 都度 one-shot か。

## 検討した選択肢

### 送信時刻

- **案 T-A**: 20:00 (帰宅・夕食後)。
- **案 T-B**: 21:00 (夜のリフレクション窓)。
- **案 T-C**: 22:00 (就寝直前)。

### 本文の組み立て

- **案 B-A**: 常に「今日は N 個達成済み。 M 個の達成チャンスがあります。」固定文。
- **案 B-B**: 4 象限分岐:
  - N>0 / M>0: 「今日は N 個アクションを達成済み。 M 個の達成チャンスがあります。」
  - N>0 / M=0: 「今日は N 個アクションを達成済み。 お疲れさまでした。」
  - N=0 / M>0: 「M 個の達成チャンスがあります。」 (達成 0 を指差さない)
  - N=0 / M=0: 通知を出さない (= null)。

### スケジュール手段

- **案 S-A**: DAILY trigger 1 本、 body は schedule 時点で固定。 syncAllNotifications で都度 cancel + 再 schedule。
- **案 S-B**: 21:00 直前に one-shot DATE trigger を毎日 (handler / BackgroundTask 経由で) 立てる。 直前の達成状態を反映できる。
- **案 S-C**: notification handler 内 (foreground) で受信時に再計算 + 即時 present。

## 決定

- **送信時刻**: **案 T-B (21:00)**。
- **本文**: **案 B-B (4 象限分岐)**。
- **スケジュール**: **案 S-A (DAILY trigger + syncAllNotifications で都度更新)**。
- 通知 ID は `'night-summary'` 固定 (per-chain `chain-{id}` と衝突しない)。
- 純粋関数 `computeNightSummary` / `formatNightSummaryBody` を `src/nightSummary.ts` に切り出し、 K-007 (ドメイン純粋性) を守る。
- `data: { kind: 'night-summary' }` を載せるが、 deep-link target (chainId) は持たない (= タップで開くと既存 expo-router 経路で Today タブが開く)。

## 理由

### 21:00 を選んだ理由

- Duolingo / Streaks / Habitica 等の習慣アプリの evening reminder は 19:00-21:00 帯が標準的。 就寝前のリフレクション窓 (= 翌朝の予定を思い浮かべる時間) に該当する。
- 20:00 だと帰宅・夕食中で見ない / 動けない可能性。 22:00 だと就寝直前で「今からやる」より「明日にしよう」の心理が強い。
- 21:00 はちょうど「夕食後・就寝までに 1-2 個まだ動ける」窓で、 残 M の訴求が機能する時間帯。

### 4 象限分岐を選んだ理由

- **N=0 / M>0 ケースで「今日は 0 個達成済み」を出すと、 マイナスを指差すことになる** ([CLAUDE.md](../../CLAUDE.md) §Augmentation 原則 / [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) §0 Celebrate 主)。 達成 0 を明示せず、 残チャンスだけ提示する。
- **N=0 / M=0 ケース (= 今日 fire ノード 0 / 全達成済かつ未達 0) で通知を出すと、 「アプリが何を訴えたいか」が曖昧で、 ノイズになる**。 null を返して通知を出さない判断にする。
- **N>0 / M=0 ケース (= 全達成済) はチャンスではなく祝福で締める** (= Celebrate 主)。 「お疲れさまでした」で 1 日を閉じる。
- 単位は「個アクション」「個」で [ADR-0041](0041-cumulative-count-revision.md) (`累計 N 個達成`) の語彙と統一。

### DAILY trigger + 都度再 schedule を選んだ理由

- 案 S-B (one-shot DATE trigger 毎日) は精度が高いが、 (a) BackgroundTask の信頼性は OS / バッテリ最適化に依存、 (b) Expo managed workflow で BackgroundTask を安定運用する複雑度が Phase 1 N=1 に対して過剰。
- 案 S-C (foreground 再計算) は 21:00 にアプリを開いていない普通のケースで動かない。
- 案 S-A の弱点 = 「body が schedule 時点で固定 → 21:00 時点の実際の N/M と乖離する可能性」は、 `syncAllNotifications` が **app 起動 + 個別データ変更で都度呼ばれる** ことで実用上吸収される (= ユーザーが今日中に 1 回でもアプリを開けば、 その時点の N/M に更新される)。
- Phase 1 N=1 では「精度より到達」を優先 ([ADR-0006](0006-phase1-completion-and-scope-narrowing.md) 早期検証ゲート)。 Phase 2 で N が増えて drift が問題になれば S-B / S-C に切替判断する。

## 想定される影響

### 後で覆す場合のコスト

- 送信時刻を変えるだけなら `NIGHT_SUMMARY_HOUR` / `NIGHT_SUMMARY_MINUTE` 定数を変えるだけ。 ユーザー設定化 (= Settings 画面で時刻を選べる) も小さい拡張で可能 (= 将来やる場合は `app_settings.night_summary_time` の ALTER 追加と Settings UI 追加で完結)。
- 本文の言い回し変更は `formatNightSummaryBody` の文字列 4 行のみ。
- 通知 ID `'night-summary'` を変える場合は、 ユーザー端末側の古い ID の通知を 1 度だけ手動 cancel する移行コードを syncAllNotifications に追加する必要あり (= 軽微)。

### 既知の trade-off

- **body の drift**: 21:00 までにアプリを 1 度も開かない日は、 前回 sync 時点 (= 昨日以前) の N/M が出る可能性。 Phase 1 N=1 で「ユーザーが今日 1 度もアプリを開かない」ケースは「すでに使っていない日」なので、 古い body でも実害なし (= 通知が呼び戻し動線になる)。 ただし表示数字の正確性は Phase 2 で再判断 (= K-010 と同型の受容判断、 明示的に「受容する」と記録)。
- **dataless tap**: 通知タップ時に chain 詳細に飛ばさず Today タブのみ開く。 night summary は「特定チェーンへの誘導」ではなく「今日全体のリフレクション」が目的なので、 Today で十分。
- **foreground 中の挙動**: 既存の `setNotificationHandler` ([app/_layout.tsx](../../app/_layout.tsx)) が `shouldShowBanner: false` を返すため、 アプリ起動中の 21:00 では OS バナーは出ない。 ただし `data.chainId` が無い → in-app Toast も出ない (= silent receive)。 これは「アプリを開いている = リフレクションは既にできている」前提で許容する。
- **PRAGMA / FK / DB scheme には影響なし** ([ADR-0001](0001-chain-data-model.md) / [ADR-0012](0012-anchor-firing-events.md) の正準データ条文に抵触しない、 = 派生表示のみ)。

### KNOWLEDGE への跳ね返り候補

- K-026 (foreground 個別 sound の global handler 上書き) と同様、 「通知 ID を per-chain prefix と衝突させない」運用ルールを後続実装で再利用する。 night summary 実装時には抵触しなかったが、 Phase 2 で別の global 通知 (= 全チェーン横断のサマリ / リマインダ) を足すたびに ID 衝突リスクを review すること。
