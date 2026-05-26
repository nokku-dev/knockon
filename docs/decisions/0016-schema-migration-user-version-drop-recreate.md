---
id: 16
date: 2026-05-20
project: knockon
tags: [data-model, architecture, scope]
status: accepted
supersedes: []
superseded-by: []
---

# スキーマ migration は `PRAGMA user_version` + 全 DROP + CREATE で済ませる (Phase 1 限定)

## 文脈

PR-1.8a で `ON DELETE CASCADE` 句を schema (`src/db.ts`) に追加した際、テスト env (`createBetterSqliteClient(':memory:')`) では全 30 件 pass。しかし実機 (Expo Go) で「`FOREIGN KEY constraint failed`」が発生し、チェーン削除が失敗した。

原因: 既存 DB ファイル (`knockon.db`) は Phase 1.7 までの古いスキーマ (CASCADE なし) で作成済みで、`CREATE TABLE IF NOT EXISTS` は既存テーブルがあるとスキップするため CASCADE 句が反映されない。そこに `PRAGMA foreign_keys=ON` だけが新規有効化された結果、古いデフォルト RESTRICT で削除が拒否された ([K-021](../../KNOWLEDGE.md))。

`REFERENCES` 句 / CHECK 制約 / UNIQUE 等のスキーマ変更は migration 経路なしには既存 DB に反映されない、SQLite の典型的な落とし穴に踏んだ。

## 検討した選択肢

- **案 A**: `CREATE IF NOT EXISTS` のままで放置し、ユーザーに「アプリの DB を手動でリセットしてください」と依頼する — 実装ゼロだが、ユーザーに毎回手動操作を要求する。Augmentation 原則 (ユーザーに新しい負担を要求しない) に反する。
- **案 B**: `PRAGMA user_version` でスキーマバージョン追跡を導入。`SCHEMA_VERSION` 定数 + `initSchema` で `current < SCHEMA_VERSION` なら**全テーブル DROP → CREATE → user_version 更新**。実装シンプル、Phase 1 N=1 で試作データ消失を許容できる。
- **案 C**: 本格的な ALTER TABLE 系 migration を導入。`SQLite ALTER TABLE` は制約変更が貧弱 (`ADD COLUMN` / `RENAME COLUMN` 等は可、`DROP COLUMN` は 3.35+、`MODIFY CONSTRAINT` は非対応) のため、CASCADE 追加には「rename → create new → INSERT SELECT → drop old」の 4 段が必要。複数バージョン履歴も管理する必要がある。Phase 2 で複数デバイス同期や履歴保存が要求された時点で導入する判断もできる。
- **案 D**: migration ライブラリを導入 (例: `expo-sqlite/kv-store` の応用、`drizzle-orm` 等の migration runner) — 依存追加 / 学習コスト。

## 決定

**案 B** (`PRAGMA user_version` + 全 DROP + CREATE) を採用 (PR-1.8a / `5ea790c`)。`SCHEMA_VERSION = 1` で導入。

> **追記 (ADR-0027 反映)**: 本判断は **v4 (= PR-CC マージ後) までの試作期間** に限定。 [ADR-0022](./0022-phase-1-completion-and-verification-operation.md) で検証期間に入りユーザーが運用データを蓄積し始めたため、 [ADR-0027](./0027-non-destructive-migration.md) で **v4 以降は ALTER ベース migration** に切替。 既存挙動 (drop+recreate) は v1-v3 範囲の legacy fallback として `initSchema` 内に残るが、 通常の bump 経路は ALTER に。 K-005 双方向リンク。

```typescript
export const initSchema = async (client: DbClient): Promise<void> => {
  const rows = await client.all<{ user_version: number }>(`PRAGMA user_version`);
  const current = rows[0]?.user_version ?? 0;
  if (current < SCHEMA_VERSION) {
    await client.exec(DROP_SQL);
    await client.exec(SCHEMA_SQL);
    await client.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else {
    await client.exec(SCHEMA_SQL);
  }
};
```

## 理由

- **Phase 1 N=1 の前提と整合**: 自分一人 / 試作データ / 単機運用。データが消えても再作成 5 分で済む。
- **早期検証ゲート (ADR-0006) と整合**: 「実機到達を最優先」。案 C / D は実装に半日以上かかり、検証ゲートが遠のく。
- **後で覆せる**: 案 B は「migration 抽象が存在しない」状態ではなく「最小限の migration 抽象がある」状態。Phase 2 で履歴保存が必要になったら `if (current < 2) { ...ALTER TABLE... }` を `initSchema` に足す形で発展可能。
- **テスト環境への影響なし**: `createBetterSqliteClient(':memory:')` は毎回新規 DB なので `user_version=0` から始まり、migration が常に走って新スキーマで pass。test/prod 環境差 (K-018) を増やさない。
- **スキーマ不変条件テスト (K-006) に乗る**: `user_version == SCHEMA_VERSION` を `PRAGMA user_version` で機械検証するテストを `repository.test.ts` に追加済み。「migration が走ったか」までは検証できないが、「migration 完了状態である」は固定できる。

## 想定される影響

### 即時の影響

- 既存ユーザー (= 自分) の DB ファイルは次回起動時に全テーブル DROP される。Phase 1.7 段階で作った試作チェーン (例: 「テストルーティン」) は消える。Phase 1 N=1 の試作データなので許容。
- `initSchema` が同期から非同期 (`async`) に変更されたが、呼び出し側 (`app/_layout.tsx`) は元々 `await initSchema(db)` だったので影響なし。

### 将来の覆すコスト

- **case 1 (Phase 2 で履歴保存が必要)**: `SCHEMA_VERSION` を 2 に上げ、`if (current < 2)` で ALTER TABLE 系の変更を追加する。drop + create のパスは「初回作成 (`current === 0`)」のみ通る形に restructure する必要があるが、`initSchema` の中だけで完結する。
- **case 2 (migration ライブラリへ移行)**: `drizzle-orm` 等を入れる時点で `initSchema` を runner に置換。スキーマ version 番号は記憶しておく必要がある。
- **case 3 (ALTER TABLE で in-place 変更が必要なケース)**: 例えば「既存ユーザーの達成記録を保持したまま CHECK 制約を緩和したい」のような変更。現状の drop+create では達成記録ごと消える。Phase 2 で実ユーザーデータを残したくなった時点で本格 migration に進む。

### 注意点

- `SCHEMA_VERSION` 定数を上げ忘れると古い schema のままになる。スキーマ変更時のチェックリスト: (a) `SCHEMA_SQL` を変更、(b) `SCHEMA_VERSION` を上げる、(c) repository.test の `user_version === SCHEMA_VERSION` テストが pass することを確認、(d) 必要なら DROP_SQL も拡張 (新テーブルがあれば追加)。
- 「DB をリセットせず実機検証したい」シーンが Phase 2 で来たら、それは案 C / D への移行トリガー。
