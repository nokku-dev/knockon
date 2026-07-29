---
id: 53
date: 2026-07-29
project: knockon
tags: [architecture, library, scope]
status: accepted
supersedes: []
superseded-by: []
---

# 分析基盤に PostHog を採用し、nokku 全プロダクト共通の SDK とする (収集の線 = 追跡しない / 記録内容を送らない)

## 文脈

[ADR-0048](0048-release-monetization-free-launch.md) は「Phase 1 完成ゲート (毎日使えるか) と**継続率データを先に取り**、マネタイズは実利用後に判断」と決めていた。しかし**継続率を取る手段が実装されていなかった**。出荷しても、続いているのか離脱しているのかが分からない状態だった。

あわせて Taku から 2 つの要求が出た。

1. **良・悪シグナルを細かく検知して分析したい** (Daily 継続率 / 滞在時間 / cohort / カスタムイベント)
2. **今後リリースする他プロダクトも含め、共通の SDK を入れれば完了する形にしたい** (プロダクトごとに選定し直さない)

### 前提の訂正

検討の出発点で、実装を確認して書いたプライバシーポリシーが「一切収集しない」と宣言していたため、当初これを制約として扱っていた。しかし**これは Taku の方針ではなく、ポリシー執筆時の後付けだった**。「何も収集しない」を守る要件は存在しない。収集方針を先に決め、ポリシーをそれに合わせる順序に戻す。

## 検討した選択肢

### 収集の線 (どこまで集めるか)

- **線 A**: 何も収集しない。Nutrition Label = Data Not Collected。
- **線 B (採用)**: **匿名の利用統計は収集する。追跡はしない。ユーザーの記録内容は送らない。**
- **線 C**: 行動追跡・広告 ID の利用も含めて収集する。

### プラットフォーム

- **Aptabase**: OSS・プライバシー特化・セルフホスト可・config plugin 不要。→ **却下**。永続識別子を持たない設計のため、**継続率と cohort が原理的に取れない** (公式に「MAU や User Retention のようなユーザー単位の分析はできない」と明記)。要件の中核を満たさない。
- **TelemetryDeck**: プライバシー特化・DAU/MAU 対応・学習コストが低い。→ **却下**。feature flag と実験機能が無く、要求 2 (将来の A/B を含め 1 つで完結) を満たさない。
- **Firebase (GA4 + Remote Config + Crashlytics)**: 最も一般的・イベント無制限・Crashlytics が優秀。→ **却下**。(1) `useFrameworks: "static"` を含む重い native 設定が必要で、[K-040](../../KNOWLEDGE.md) (config plugin の設定漏れが実機クラッシュを起こす) と同じリスク帯、(2) 米国サーバーへの越境移転と永続識別子により **EU 向けに同意フローが必要**になり得る。同意ダイアログはユーザーに操作を要求するため **Augmentation 原則 (新しい負担を要求しない) と衝突する**。
- **PostHog (採用)**: 分析 + 継続率 + cohort + カスタムイベント + feature flag + 実験 + エラー追跡が 1 つに入る。無料枠 1M events / 100K error events / 1M flag requests。Expo 対応。
- **Sentry を併用**: エラー追跡は Sentry の方が成熟。→ **今は却下 (将来の追加候補)**。無料枠が 5,000 events/月と小さく、SDK・ダッシュボード・ベンダーが 2 つになる。クラッシュ情報は PostHog で既に申告済みになるため、**後から足してもプライバシー方針の再変更が発生しない** = 今決める必要が無い。

## 決定

### 1. 収集の線 = 線 B

> **開発者のためにユーザーの記録内容を集めない。ユーザーのために預かるのは、ユーザーが明示的に選んだときだけ。**

判定軸は「データが端末を出るか」ではなく「**誰の目的で、誰の同意で出るか**」。

- **送る**: 匿名の利用統計 (下記イベント)、エラー / クラッシュ
- **送らない**: チェーン名 / アクション名 / メモ本文 / **メトリクスの値 (体重等)** / 位置アンカーの座標 / 広告 ID 等のクロスアプリ識別子
- **将来バックアップ / 同期を実装しても本線は破れない**。バックアップはユーザーの目的・明示的な同意・可視の機能であり、Nutrition Label 上も purpose = App Functionality で Tracking ではない。同型の先例が [ADR-0024](0024-goal-view-analytics-phase-3-unified.md) §3c の Notion 連携 (「ユーザー自身の token で、ユーザー自身の領域にのみ」) にある。

### 2. プラットフォーム = PostHog (nokku 共通)

nokku の全プロダクト (knockon / tazna / pentimento …) で PostHog に統一する。1 組織に複数プロジェクトを置く。

### 3. SDK は薄いラッパー越しにしか使わない

`src/analytics.ts` を唯一の窓口とし、画面やフックから `posthog.*` を直接呼ばない ([CLAUDE.md](../../CLAUDE.md) のドメイン層隔離と同型)。

**プロパティの型で「記録内容を送らない」を強制する**:

```ts
type SafeValue = number | boolean;   // string を許可しない
export const track = (event: AnalyticsEvent, props?: Record<string, SafeValue>) => …
```

文字列を受け付けなければ、チェーン名・メモ本文・体重値を送るコードが**コンパイルを通らない**。人間の注意力ではなく型で止める ([K-006](../../KNOWLEDGE.md) のハードガードレール機械検証と同じ思想)。

### 4. イベント設計 = 観測した事実のみを送り、解釈は後から派生させる

[ADR-0001](0001-chain-data-model.md) の「派生値を保存せず表示時に派生計算する」を分析にも適用する。**悪シグナルのイベントは作らない** — 良シグナル (事実) を送り、その不在としてクエリ側で定義する。

| # | イベント | プロパティ |
|---|---|---|
| 1 | `onboarding_completed` | `skipped` |
| 2 | `chain_created` | `source` (0=オンボーディング/1=発見/2=手動), `node_count`, `nodes_from_template`, `anchor_kind` |
| 3 | `node_completed` | `node_position`, `chain_node_count`, `is_settled` |
| 4 | `node_settled` | `days_to_settle`, `definition_version` |
| 5 | `settlement_retracted` | `days_since_settled` |
| 6 | `permission_result` | `kind` (0=通知/1=位置), `granted` |
| 7 | `chain_deleted` | `age_days`, `total_completions` |

- 継続率 / cohort / セッション長は**専用イベント不要** (任意のイベントから PostHog が算出)。
- 画面の autocapture は**有効**にする (「開いたが押していない」を導出するのに必要)。
- **`node_settled` だけが派生値**。定着判定は 14D 窓とドメインロジックに依存し PostHog 側で再現できないため例外とする。ただし定着の定義は既に 3 回変わっている ([ADR-0047](0047-settlement-lifecycle-and-log-portfolio.md) / [ADR-0050](0050-settlement-star-marker-and-today-headline.md) / [ADR-0051](0051-remove-matrix-and-merge-fresh-into-growing.md)) ため、**`definition_version` を付けて変更時にインクリメント**し、時系列比較の断絶を数字側で切り分けられるようにする。

### 5. session replay は使わない

習慣アプリの画面は個人の生活記録そのもの。録画は線 B と正面から衝突するため、明示的に無効化する。

## 理由

- **要件から一意に決まる**。cohort を要件に含めた時点で Aptabase は脱落し、実験を含めた時点で TelemetryDeck も脱落する。Firebase は Augmentation 原則と衝突する。残るのは PostHog のみ。
- **不確実な将来をカバーできる唯一の選択肢**。A/B を「やるか分からない」状態で、後から実験機能が必要になっても**移行もプライバシー方針の再変更も発生しない**。プライバシー方針の変更は出荷後にやるほど costly (「何も集めない」と言って出したアプリが集め始めるのは、ユーザーから見れば裏切り) なので、**ユーザーがまだ 1 人もいない今が唯一きれいに決められるタイミング**。
- **共通化してよい対象だから**。法務文書は中身がアプリごとの事実なので共通化すると正確さが落ちるが、分析 SDK は**インフラ**であり、アプリ固有なのは「何を計測するか」の側。そこは SDK を共通化しても各アプリ固有のまま残る。
- **標準化の判断を安く覆せるようにしてある**。ラッパー 1 ファイル越しにしか使わないため、乗り換えコストは 1 ファイルの書き換え。1 プロダクトも運用していない段階で標準を決めるリスクは、この隔離で受容可能な水準に下がる。

## 想定される影響

### 受け入れる不利益

- **学習コストが高い** (PostHog への最多の不満)。イベント設計・ファネル・ダッシュボードを作り込む時間が要る。入れれば見えるツールではない。
- **クラウド依存**。PostHog はセルフホストが実質不可 (Kubernetes サポート終了、残るのは無保証の Docker Compose「Hobby」構成のみ)。**法務文書で「可用性を他社に預けない」と判断したのと逆向きの選択**を意図的に取る。分析データは無くても製品が動くため、法務文書とは依存の重みが違うと判断した。
- **config plugin が必要になる**。ソースマップのアップロードとネイティブクラッシュ捕捉に plugin が要るため、[K-040](../../KNOWLEDGE.md) のリスク帯に入る。plugin 導入時は app.json のスナップショットテストで固定する。

### 更新が必要になるもの (実装と同じ PR で扱う)

分析を入れると**申告と実挙動の一致**が審査・規制の両面で要求される。以下は分割せずセットで更新する。

- **プライバシーポリシー** (`nokku-dev/legal`): 「一切収集しない」→ 匿名の利用統計とエラー情報を収集する旨。§5 の外部サービス連携の記述も書き直す
- **App Store Privacy Nutrition Label**: Data Not Collected → Usage Data / Diagnostics (**not linked to identity・Tracking なし**)
- **ストア説明文** ([docs/release/store-listing.md](../release/store-listing.md)): 「広告も、行動を追跡する仕組みもありません」を削除
- **App Review メモ**: 「ネットワーク通信は本バージョンでは無効」を修正
- **[docs/release/app-store-submission.md](../release/app-store-submission.md)** §1.3 の「外部通信ゼロ」を根拠にした記述

### 覆すコスト

- **プラットフォーム変更 (低)**: `src/analytics.ts` の差し替えのみ。ただし過去データの継続性は失われる。
- **収集をやめる / 線 A に戻す (中)**: 実装の除去は容易だが、公開済みポリシーと Nutrition Label の再変更が要る。出荷後は「集めると言って集めなくなる」方向なので、逆よりは害が小さい。
- **Sentry 追加 (低)**: クラッシュ情報は既に申告済みになるため、プライバシー方針の変更なしで足せる。
