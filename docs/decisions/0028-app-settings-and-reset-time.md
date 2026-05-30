---
id: 0028
date: 2026-05-30
project: knockon
tags: [data-model, ux, scope]
status: accepted
supersedes: []
superseded-by: []
---

# 日次リセット時刻のユーザー設定化と app_settings テーブルの導入

## 文脈

Issue #54: 「ノードステータスのリセット時刻を設定で変更できるようにする」。

これまで `todayIsoDate(now)` は `now.getFullYear/Month/Date` で「今日」を切り出していたため、リセット時刻はローカル深夜 0 時固定だった。 深夜帯 (0-3 時) にノードを操作すると、 本人感覚はまだ「昨日」なのにアプリ上は「今日」扱いになる ([CLAUDE.md §Augmentation 原則](../../CLAUDE.md) の「行動変容を要求しない」と逆向き)。

ユーザーが任意の HH:MM (例: 03:00) を「日付の境界」と定義できれば、 夜型運用でも操作 → 当日記録が一致する。

これに加えて、 これまで knockon には **app-level の永続設定 を保持する場所** がなかった (チェーン / アンカー / アクションは「ユーザーが作るデータ」、 メトリクス種別は「観測軸のマスタ」、 通知/位置情報の権限は OS 側)。 リセット時刻の追加に合わせて、 将来の app-wide 設定の置き場所も同時に定義する。

## 検討した選択肢

- **案A: ユーザー設定可能な reset_time + 専用 app_settings テーブル (採用)**
  - HH:MM 文字列を保持。 default `'00:00'` で既存挙動互換。
  - `app_settings (id TEXT PK = 'singleton', reset_time TEXT NOT NULL)` の単一行テーブル。
  - 将来の設定追加は `ALTER TABLE app_settings ADD COLUMN ...` で対応 (ADR-0027 の ALTER ベース migration と整合)。
- **案B: ユーザー設定可能な reset_time + key/value テーブル**
  - `app_settings (key TEXT PK, value TEXT)` の汎用 KV。 schema 変更なしで設定追加可。
  - 却下理由: 型安全性が弱い (全 value が string で個別に parse 必要)。 KV の柔軟性は v1 規模で不要。 設定が増えても ALTER TABLE は SQLite で安価。
- **案C: AsyncStorage / SecureStore で持つ**
  - DB を持ち出さず key/value で永続化。
  - 却下理由: 他データ (チェーン/アクション) が全部 SQLite ローカル正準 ([ADR-0001](./0001-chain-data-model.md))。 設定だけ別永続層にすると backup / 移行戦略が分岐する。 SQLite に寄せる方が将来の export/import で 1 経路で済む。
- **案D: チェーン or アンカー単位のリセット時刻**
  - 「朝のチェーンは 03:00 リセット、 夜のチェーンは 12:00 リセット」など。
  - 却下理由: Issue の要件 (ユーザー本人の生活リズムの境界) と乖離。 N=1 で「複数の昼夜リズム」は発生しない (= over-engineering)。 必要になったら anchor 単位への拡張で対応可能 (= 後から無移行で足せる)。

## 決定

**案A** を採用。

- 純粋関数 `effectiveTodayIsoDate(now: Date, resetTime: string): IsoDate` を `src/domain.ts` に追加。 `now` の時刻 (hour×60+min) が `resetTime` (HH:MM) より前なら 1 日前を返す。 既存 `todayIsoDate` は `resetTime='00:00'` 等価でそのまま残す (後方互換)。
- `app_settings` 単一行テーブルを SCHEMA_VERSION = 5 で追加。 ALTER 経路で既存 v4 ユーザーは MIGRATIONS[5] で table 作成 + default `'00:00'` の row insert ([ADR-0027](./0027-non-destructive-migration.md))。
- `useTodayData` / `useAnalyticsData` / `useMetricsData` 全てで設定された reset_time を反映 (= 「Today だけ昨日扱いだが Analytics は今日扱い」の表示乖離を防ぐ)。
- UI: チェーン一覧タブの右上に歯車アイコン → `SettingsModal` で HH:MM 編集 (= 「設定の置き場所」を 1 か所に決める)。

## 理由

- **HH:MM 文字列フォーマット**: 既存の `Anchor.time` (時刻アンカー) と揃える。 別フォーマットを持つと domain 層に複数のパース関数が必要になる。
- **デフォルト `'00:00'`**: 既存ユーザーの挙動を変えない。 K-006 ハードガードレール (派生値非保存) と独立した「設定軸」を増やすが、 ユーザー観測データではない (= [ADR-0001](./0001-chain-data-model.md) §正準データの 3 軸とは別カテゴリ、 [CLAUDE.md §プロジェクト固有の注意点 1](../../CLAUDE.md) の不変条件を侵さない)。
- **単一行テーブル**: 設定は「アプリ全体で 1 つ」の特性。 マルチユーザーの世界に行かない (N=1 / 単機運用、 ADR-0006 早期検証ゲート)。 行が複数あれば不整合になるリスクを SQL レベルで `id='singleton'` の制約 (= UPSERT で常に 1 行) で消す。
- **3 hook 全て同期**: 「Today では reset 前なので昨日表示、 Analytics は今日表示」のような表示乖離は混乱の元。 一貫して `effectiveTodayIsoDate` 経由に揃える。
- **専用 settingsRepository**: chains/anchors/actions の repository 関数群と同じパターン (純粋関数の薄いラッパー)。 ドメイン層の純粋性 (K-007) を維持。

## 想定される影響

- **K-006 / K-015 (全称禁則の軸別拡張)**: ADR-0001 §決定4 「正準データは `(ノード, 日付, bool)` のみ」は **ユーザーが観測したデータ** の話。 app_settings は「ユーザーが選ぶ app 動作設定」軸で別カテゴリ。 ADR-0012 / 0024 と同型の「軸別追加」パターン。 ADR-0001 への双方向リンクは追加しない (= ADR-0001 §決定4 は元から「達成記録」側の話と読める文脈)。
- **schema invariants テスト (K-006)**: `app_settings` テーブルの存在 + カラム構造 + 1 行制約を機械検証するテストを `repository.test.ts` に追加。 既存の「全テーブル列挙」テストも 1 件追加。
- **MIGRATIONS[5]**: ALTER 経路で初めての追加 step。 SCHEMA_VERSION=4 (PR-CC 後) のユーザーは drop+recreate なしで table 追加 → default row insert。 ADR-0027 が意図した「データ保全」が実運用で初めて発火する。
- **Notion 連携 (PR-Z3b)**: Notion Body Metrics の `recorded_at` は UTC ISO-like 文字列で、 reset_time の影響を受けない (= sync は変更前と同じ動作)。 ローカル表示の「今日」とのずれは表示時の groupBy 関数側で揃う (= 表示時派生計算原則 [ADR-0001](./0001-chain-data-model.md))。
- **次の設定追加コスト**: `ALTER TABLE app_settings ADD COLUMN xxx ...` を MIGRATIONS[6] に書くだけ。 ALTER ベース migration の枠組み (ADR-0027) を活かす最初の事例。

## 関連

- [ADR-0001](./0001-chain-data-model.md): 正準データの「軸」概念。 本判断で「設定軸」が増える (= K-015 同型の軸別拡張パターン)。
- [ADR-0027](./0027-non-destructive-migration.md): ALTER ベース migration。 SCHEMA_VERSION=5 で初めて MIGRATIONS step を本実装する。
- [CLAUDE.md §Augmentation 原則](../../CLAUDE.md): 夜型運用ユーザーへの低摩擦化。
