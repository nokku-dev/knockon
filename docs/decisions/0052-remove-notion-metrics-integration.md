---
id: 52
date: 2026-07-29
project: knockon
tags: [scope, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# Notion メトリクス同期をコードごと撤去する (ADR-0024 §3c の Notion 部分を部分改訂)

## 文脈

Notion Body Metrics 連携は [ADR-0024](0024-goal-view-analytics-phase-3-unified.md) §3c (PR-Z3b) で v1 範囲に取り込み、`notionClient.ts` / `notionConfig.ts` / `notionMetricsSync.ts` として実装済みだった。しかし出荷を前に確認したところ、**実質的に死んでいる**状態だった。

- `app.config.ts` が `process.env` から token / data source ID を読む構造で、**production build には secret が注入されていない**。`isNotionConfigured()` が false を返し、`syncNotionMetricsInBackground` は即 return する
- `eas secret:create` による注入は `app.config.ts` のコメントで「Phase 2 で整備」と先送りされたまま
- **アプリ実行時に token を入れる導線も無い**。#184 でメトリクス種別編集画面から Notion 連携キー入力欄を削除済み

つまり App Store 版は誰も (Taku 自身も) Notion 同期を使えない。**これは決定ではなく事故**であり、明文化が必要になった (#259)。

そのうえで Taku が「**今後も Notion を使う予定がない**」と判断した。

## 検討した選択肢

- **案 A**: コードを残したまま「v1 は Notion 同期なしで出荷する」と決めるだけ。実装は将来の再有効化に備えて温存する。
- **案 B**: `eas secret:create` で production build に secret を注入して有効化する。
- **案 C**: アプリ内で各ユーザーが自分の token を入力する UI を復活させる。
- **案 D (採用)**: Notion 連携を**コードごと撤去する**。

## 決定

**案 D を採用。** 以下を削除する。

- `src/notionClient.ts` / `src/notionConfig.ts` / `src/notionMetricsSync.ts` / `src/notionMetricsSync.test.ts`
- `src/useMetricsData.ts` の `syncNotionMetricsInBackground` と、`useFocusEffect` 内の sync 発火・`notionSyncedRef`
- `app.config.ts` (Notion secret の注入だけが存在理由だったため。設定は `app.json` 1 本に戻る)
- `docs/notion-setup.md`

**メトリクス機能そのものは維持する。** 手入力・14D 系列表示・種別編集は無変更で、消えるのは「Notion からの取り込み」のみ。

**`metrics.source` の CHECK 制約 (`'manual' | 'notion'`) は変更しない。** 理由は後述。

## 理由

- **「後回し」ではなく「不要」だから**。SPEC §5 の「削った機能は不要ではなく後回し」は *いつか戻す* 前提の条項で、[ADR-0045](0045-exclude-analytics-tab-from-release-scope.md) / [ADR-0049](0049-exclude-research-tab-from-release-scope.md) / [ADR-0051](0051-remove-matrix-and-merge-fresh-into-growing.md) がコードを残したのはその適用だった。本件は**戻す予定が無い**ので該当しない。同じ「隠す」でも前提が違う。
- **死んだコードは読む人を誤らせる**。「実装はあるが動かない」は、無いことより分かりにくい。実際 #259 は「動いていると思っていたら動いていなかった」ことの発見から起票された。
- **案 B は原理的に不可**。secret は build に焼き込まれるため、Taku 個人の token が全ユーザーのビルドに入る。他のユーザーが使うと Taku の Notion workspace に書き込むことになる。
- **案 C は #184 を覆す**。in-app token 入力は一度削除した判断で、Notion を使わないと決めた以上、復活させる根拠が無い。
- **`metrics.source` を触らない理由**: CHECK 制約から `'notion'` を外すには table-copy migration ([ADR-0027](0027-non-destructive-migration.md)) が必要で、開発中に入った `source='notion'` の既存行があると移行が壊れる。値が使われないだけで害が無いため、制約は残置して理由をスキーマコメントに書く。**新規に `'notion'` が書かれることは無い** (書き手が存在しない)。

### 「ネットワーク通信がゼロになる」は理由にしない

本 ADR の検討中、撤去によってアプリからネットワーク通信が完全に消えるため、プライバシーポリシーの「外部送信しない」が留保なしになるという利点があった。しかし [ADR-0053](0053-analytics-platform-posthog.md) で分析 SDK を導入する判断をしたため、**この利点は成立しない**。撤去の根拠は「使わない機能を消す」ことのみに置く。

## 想定される影響

- **[ADR-0024](0024-goal-view-analytics-phase-3-unified.md) §3c の部分改訂**: Notion 連携の条項のみ本 ADR で覆る。**メトリクス手入力 / チェーンとの疎結合 / メトリクスデータモデル / ANT 回避構造は維持**されるため supersede ではなく部分改訂とし、0024 側に逆参照を 1 行追加する ([K-005](../../KNOWLEDGE.md) の系譜維持)。
- **[ADR-0026](0026-metric-kinds-customization.md)** (メトリクス種別編集): 手入力側の機能なので無影響。
- SPEC / CLAUDE.md / understanding-map の Notion 記述を同期更新する。
- プライバシーポリシー (`nokku-dev/legal`) §5 の「将来的に利用者自身が保有する外部サービスとの連携を提供する場合」の記述は、[ADR-0053](0053-analytics-platform-posthog.md) の分析導入とあわせて書き直す。
- **覆すコスト (中)**: 復活させるには約 390 行の再実装が要る。ただし正準データ ([ADR-0001](0001-chain-data-model.md)) は不変で `metrics` テーブルも `source` 列もそのままなので、**データ移行は不要**。取り込みロジックを書き直すだけで戻せる。
