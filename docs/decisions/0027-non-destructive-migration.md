---
id: 27
date: 2026-05-26
project: knockon
tags: [data-model, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# schema migration を ALTER ベースに切替 (ADR-0016 / K-021 補完)

## 文脈

[ADR-0016](0016-schema-migration-user-version-drop-recreate.md) / [K-021](../../KNOWLEDGE.md#k-021) で「`PRAGMA user_version` ベース + drop+recreate」を採用していた。 Phase 1 N=1 試作期間中の判断:

> Phase 1 N=1 開発中の判断: スキーマ変更時は drop + recreate で済ませる (試作データの再作成は許容範囲)。 Phase 2 以降で migration 履歴を残す必要が出てきたら ALTER TABLE 系に切替。

[ADR-0022](0022-phase-1-completion-and-verification-operation.md) で Phase 1 検証期間に入り、 ユーザー (= 自分) がチェーン / アクションを実際に作って数日運用し始めた。 直近の 3 PR (Z3a / BB / CC) で SCHEMA_VERSION bump (1→2→3→4) するたびに **「保存したチェーンが全部消える」** という UX が現実問題化。

シグナル: ユーザーが「更新するたびに保存済みのチェーンのデータが消えるのって仕方ない?」と判断 (= 不便駆動シグナル)。 検証期間で揃ってきた実データを守る時期。

## 検討した選択肢

- 案 A: 現状維持 (Phase 1 N=1 受容)
- **案 B (採用)**: ALTER TABLE ベース migration に切替 (これ以降の bump)
- 案 C: データ export / import 機能 (大規模、 Phase 2 以降)
- ユーザー判断で案 B 採用

## 決定

### 段階的 migration の仕組み

`initSchema(db)` を以下のロジックに変更:

1. **`current === 0`** (初回起動): 最新 schema を `CREATE TABLE` で構築 + builtin seed + `PRAGMA user_version = ${SCHEMA_VERSION}`
2. **`0 < current < 4`** (legacy 試作期間 = ADR-0016 範囲): drop + recreate + builtin seed (= 既存挙動維持、 試作期間データ消失受容)
3. **`current === 4`** (PR-CC マージ後の最新): 何もしない (= データ保全)
4. **`current > 4`** (将来の bump): `MIGRATIONS[v]` を順に実行 + `user_version` 更新

### MIGRATIONS テーブル

`src/db.ts` に追加:

```ts
type Migration = (client: DbClient) => Promise<void>;
const MIGRATIONS: Record<number, Migration> = {
  // 5: async (client) => { await client.exec(`ALTER TABLE ... ADD COLUMN ...`); },
  // 将来の SCHEMA_VERSION bump 時に追加
};
```

- 各 migration step は **冪等にしない** (= v4 → v5 は 1 度だけ実行される前提、 user_version で管理)
- `ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` が主。 列削除 / 型変更は SQLite 制限 (3.35+ で DROP COLUMN サポート、 型変更はテーブルコピー必要)。 出てきたタイミングで個別判断

### 既存判断との関係

- **[ADR-0016](0016-schema-migration-user-version-drop-recreate.md)**: **supersede しない**。 v1-v4 範囲の drop+recreate は維持 (= 過去の試作期間中のデータ消失は受容済み)。 「v4 以降は ALTER ベース」という追加判断
- **[K-021](../../KNOWLEDGE.md#k-021)**: 該当する追記が必要 (= 「`CREATE TABLE IF NOT EXISTS` で不足」の解は drop+recreate **or** ALTER、 後者を選ぶ場合がある)

### K-006 不変条件テストの維持

- スキーマ不変条件テスト (`PRAGMA table_info` / `sqlite_master` / `PRAGMA foreign_key_list`) は影響なし
- 「ALTER で追加した列が定義通りか」を K-006 テストが固定する (= 自然な拡張)

## 理由

- **検証期間に入ったタイミングの正当性**: Phase 1 試作期間中は「drop+recreate で済ます」が正しかった (= 不変条件遵守の精神優先、 試作データに価値がない)。 検証期間でユーザーが運用データを蓄積し始めた以降は、 「データ保全」の重要度が逆転する
- **過去の v1-v3 を ALTER で再現するコストは高い**: 過去の drop+recreate を ALTER 履歴に書き直すには全マイグレーション関数を再構築する必要 (= 投入コストに見合わない)。 v4 = 現状を基準にして以降を ALTER で対応するのが現実解
- **「冪等な initSchema」 ではなく 「step ベース migration」**: 段階的に user_version を bump する方が SQLite の標準パターンと整合。 履歴も追いやすい

## 想定される影響

### 即時 (PR 範囲)

- `src/db.ts` の `initSchema` を 4 分岐に変更 (上記)
- `MIGRATIONS: Record<number, Migration>` を追加 (現状空、 将来 v5+ で追加)
- テスト更新:
  - 新規 install で各テーブル作成 + builtin seed (既存テスト引き継ぎ)
  - `current === 4` で何も起きない (= データ保全) を fixture + before/after で検証
  - legacy fallback (`current < 4`) で drop+recreate が走る (既存挙動)
  - 将来の `MIGRATIONS` step が呼ばれる (= モック step を入れて確認)
- ドキュメント更新: KNOWLEDGE.md K-021 に追記 (case-by-case の判断ルール)

### 将来の覆すコスト

- **「v4 ↓ の ALTER 履歴も再構築」**: もし「過去にさかのぼってすべて ALTER で migration」したい場合、 v0 → v4 の各ステップを ALTER + CREATE で再現する必要。 ただし v1-v3 試作期間のユーザーは drop+recreate を通過済みなので、 実際の DB は v4 状態 → 不要
- **「SQLite 列削除 / 型変更が出てきたら個別判断」**: 「テーブルコピー方式」(新テーブル作成 → INSERT SELECT → 旧 drop → ALTER RENAME) が必要。 出てきたタイミングで migration step に書く

### 注意点

- **v5+ で複雑な変更 (列削除 / 型変更) が出てきた場合**: テーブルコピーは複数 SQL 文の sequence。 トランザクション内で実行する必要がある (= `db.exec` 内で複数文を 1 トランザクションで)。 [K-022](../../KNOWLEDGE.md#k-022) (用語と実装の一致) を踏襲して、 各 migration の責務 / アトミック性をコメント明示
- **builtin seed の重複防止**: PR-CC で builtin seed は `IF current < SCHEMA_VERSION` 内 (= drop+recreate 時のみ) に閉じている。 ALTER 経路では builtin が既に存在する前提なので seed 不要 (= ユーザーが削除した builtin が再投入されないルールを維持、 ADR-0026 と整合)
- **「とても古い試作データを ALTER で救済」しない**: v1-v3 は drop されて消える挙動を維持。 これは ADR-0016 の試作期間方針と整合
