---
id: 0008
date: 2026-05-18
project: knockon
tags: [testing, library]
status: accepted
supersedes: []
superseded-by: []
---

# テスト戦略を `ts-jest + better-sqlite3 (:memory:)` で確定し、Phase 1 までは jest-expo を導入しない

## 文脈

[ADR-0007](./0007-expo-react-native-stack.md) で Expo (React Native) スタックを確定したが、§決定6 では「ビルド・テストコマンドの具体は Phase 0 着手時に Expo の慣例に従って確定する」と細部を Phase 0 着手に繰り延べていた。Phase 0 を実装する中で、Jest の設定とテスト戦略を具体的に固める必要が出てきた。

Phase 0 のテスト対象は `src/domain.ts` / `src/repository.ts` / `src/seed.ts`（純粋 TypeScript）であり、React Native コンポーネント（`App.tsx` 等）のテストは Phase 0 スコープに含まれない（[ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) の早期検証ゲートに従って Phase 1 で Today UI と一緒に導入する）。一方、`repository.ts` は `expo-sqlite` を経由した DB 往復のテストが必要で、ここでどう実装等価性を担保するかが論点になる。

[PR #5](https://github.com/nokku-dev/knockon/pull/5) で `DbClient` インターフェース経由で expo-sqlite と better-sqlite3 を切り替える設計を確立し、テストは better-sqlite3 の `:memory:` で動かしている。本 ADR はこの設計の判断ログを back-fill する位置付け（コードは先行・判断ログを後追い、ただし K-005 の教訓を踏まえて Phase 1 着手前に固定する）。

## 検討した選択肢

- **案A（採用）**: **`ts-jest` preset + `better-sqlite3` (`:memory:`)**。`DbClient` インターフェースを介して expo-sqlite と better-sqlite3 を切り替え、テストは better-sqlite3 で実装等価に行う。jest-expo は Phase 0 では導入しない。
- **案B（却下）**: **jest-expo を Phase 0 から導入**。Expo 標準のテストプリセットに揃える。
- **案C（却下）**: **`expo-sqlite` を `jest.mock` でモック化**。インメモリ Map 等で SQL の挙動を手で再現する。
- **案D（却下）**: **実機 E2E のみ**（Detox / Maestro 等）。単体テストを書かない。

## 決定

案A を採用する。具体的に以下を固定する:

1. **テストランナー**: `jest` + `ts-jest` preset。`testEnvironment: 'node'`、`testMatch: <rootDir>/src/**/*.test.ts`（`package.json` の `jest` セクションで定義済み）。
2. **DB テスト**: `src/db.bettersqlite.ts` の `createBetterSqliteClient(':memory:')` で `DbClient` を生成し、`initSchema` で本番と同じ `SCHEMA_SQL` を流し込む。テスト終了時に `close` で破棄。
3. **jest-expo は Phase 0 では導入しない**。Phase 1 で React Native コンポーネントテストを書く必要が生じた時点で、`npm install --save-dev jest-expo` し、Jest の `projects` 設定で multi-project 化する（ts-jest と並走 / 排他切替ではない）。
4. **expo-sqlite を `jest.mock` でモック化しない**。SQL 挙動の実装等価性を保つには、SQLite を直接実装している better-sqlite3 を使うのが最も信頼できる。
5. **これは Phase 0 / Phase 1 の確定事項である**。Phase 1 で jest-expo を並走追加する際に本 ADR を覆す必要はない（追加であって変更ではない）。将来 better-sqlite3 を捨てる / ts-jest を捨てる判断をする場合のみ新規 ADR で本 ADR を `superseded` にする。

## 理由

- **実装等価性が最も高い (案C への決定的反論)**: better-sqlite3 は SQLite を C++ で実装したライブラリで、SQL の挙動（CHECK 制約・PRIMARY KEY 制約・FOREIGN KEY 制約・UPSERT・PRAGMA）が expo-sqlite と等価に動く。これにより `repository.test.ts` の「スキーマの不変条件」テスト（`PRAGMA table_info` で派生値カラム不在を検証）が **本番と同じ意味** を持つ。expo-sqlite を `jest.mock` でモック化する案C は、SQL の挙動を手で再現することになり、スキーマ制約・UPSERT・PRAGMA がモック実装の精度に依存して検証の信用度が落ちる。K-002「保存単位の選択が差別化を殺す」と同型の罠で、検証レイヤーで信頼性を失うのは正準データ厳守の精神に反する。
- **テストの摩擦が最小 (案B への反論)**: Phase 0 のテスト対象は純 TypeScript（React Native コンポーネントなし）。jest-expo は Metro / React Native のセットアップを引き込むため、純粋関数テストにとって過剰。実際 Phase 0 のテスト実行は ts-jest で 0.3 秒程度で完結しており、TDD ループが軽快に回る。jest-expo はテスト対象が出てきた時点で並走追加すれば良い。
- **TDD ルールとの整合 (案D への反論)**: [CLAUDE.md](../../CLAUDE.md) §TDD ルールは「新しい機能やバグ修正では実装コードの前にテストを書く」「テストなしの PR は原則作成しない」と定めている。実機 E2E のみでは単体テストの TDD ループが回らず、ドメイン層のリグレッションを早く捕まえられない。Detox / Maestro 等は Phase 1 後の補完レイヤーとして候補だが、Phase 0 の代替にはならない。
- **ADR-0001 / ADR-0007 との構造的整合**: [ADR-0001](./0001-chain-data-model.md) の「保存は事実、解釈は関数」と [ADR-0007](./0007-expo-react-native-stack.md) §決定6「コマンド体系の細部は縛らない」の自然な帰結。`DbClient` インターフェースが SQL を仕様として共有することで、実装（expo-sqlite vs better-sqlite3）を切り替えても domain 層は無修正で通る。これがテスト戦略を選べる根拠そのもの。

トレードオフ:
- **better-sqlite3 のネイティブビルド依存**: C++ コンパイルが CI 環境で必要（node-gyp）。一般的な GitHub Actions / macOS / Linux では問題ないが、Alpine ベース等の特殊環境では追加対応が必要になる可能性。これは受け入れる（v1 規模では問題にならない見込み）。
- **React Native コンポーネントテストが書けない**: Phase 0 段階では作るコンポーネントが App.tsx の最小スタブのみで、書く対象が無い。Phase 1 で `npx expo start` を初めて触ってコンポーネントが増えてきた時点で並走追加。
- **テスト設定が 2 種類になる将来コスト**: Phase 1 以降は ts-jest プロジェクトと jest-expo プロジェクトが並走する。Jest の multi-project 設定で吸収するが、設定ファイルが 1 段複雑になる。

## 想定される影響

- **Phase 1 着手時の作業**: `npm install --save-dev jest-expo @testing-library/react-native` を追加し、`package.json` の `jest` セクションを `projects: [...]` 形式に変更（ts-jest プロジェクトと jest-expo プロジェクトの 2 つを並走）。`testMatch` をプロジェクトごとに分離（`src/**/*.test.ts` と `src/components/**/*.test.tsx` 等）。
- **既存 ADR との関係**: ADR-0001 / ADR-0007 と整合し、supersede 関係なし。ADR-0007 §決定6 の「ビルド・テストコマンドの具体は Phase 0 着手時に固める」を本 ADR が具体化する形で完了させる。
- **後で覆すコスト**:
  - ts-jest → jest-expo 一本化: preset 切替 + テスト動作確認のみ。テストコードは無修正（domain は React Native に依存しないため）。
  - better-sqlite3 → 別実装: `DbClient` インターフェースを満たす別アダプタを書くだけ。テストコードは無修正。データ移行は当然なし（インメモリ前提）。
- **Phase 0 / Phase 1 の運用ルール**: 新しいテストを書くときの選択は「純粋 TypeScript / SQL 経由なら ts-jest、React Native コンポーネントなら jest-expo 側」。境界が明瞭なので意思決定コストは低い。
