---
id: 0007
date: 2026-05-18
project: knockon
tags: [library, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# 実装スタックを Expo（React Native）で確定し、永続化は expo-sqlite でローカル正準とする

## 文脈

[ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) で完成判定を Phase 1（Today が実機で数日継続して回ること）に前倒しし、「早期検証ゲート」を PLAN 最上位ルールに置いた。これによりスタック選定の支配的基準が **time-to-device（実機の Phase 1 に最短で到達できるか）** に変わった。技術的理想形・将来拡張性・パフォーマンスではなく、**出荷速度** が支配変数。

加えて [ADR-0003](./0003-firing-logic.md) で場所発火は OS 標準ジオフェンス専用 / 手動発火 v1 必須と確定済み。したがってスタックの最低要件は:

1. iOS / Android の OS 標準ジオフェンス（region monitoring）へのアクセス
2. ローカル通知
3. ローカル永続化（v1 で同期は持たない）
4. 自分の既存スキルで実機ビルドまで最短で持っていける

[CLAUDE.md](../../CLAUDE.md) の技術スタック節は「フレームワーク選定は未確定 = ADR 化対象（nokku の既存パターン Capacitor モバイル / Tauri は有力候補）」とプレースホルダ状態だったため、これを ADR として確定させる。

## 検討した選択肢

- **案A（採用）**: **Expo（React Native）**。永続化は `expo-sqlite` でローカル正準。位置は `expo-location`（region monitoring）、通知は `expo-notifications`。ネイティブモジュールを自前で書かない。
- **案B（却下）**: **Capacitor（Web → モバイル）**。
- **案C（却下）**: **Flutter / ネイティブ Swift / Tauri モバイル**。

## 決定

案A を採用する。具体的に以下を固定する:

1. **アプリ本体は Expo（React Native）で実装**する。bare workflow ではなく **managed workflow（Expo Application Services / EAS Build 前提）** を基本線とする。
2. **永続化は `expo-sqlite`** を使い、`(ノード, 日付, bool)` を唯一の正準データとして保存（[ADR-0001](./0001-chain-data-model.md) を遵守、派生値カラムは持たない）。
3. **場所発火は `expo-location`** の region monitoring を使用（[ADR-0003](./0003-firing-logic.md) と整合）。地図 / Places API は依存に含めない。
4. **ローカル通知は `expo-notifications`**。サーバ側からの push 通知は v1 非スコープ。
5. **同期は v1 非スコープ**。ローカル正準のまま運用し、複数デバイス同期 / クラウドバックアップは [ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) の出荷後レイヤーに従って Phase 1 実使用後に判断。
6. **ディレクトリ構成 / ビルド・テストコマンドの具体** は Phase 0 着手時に Expo の慣例（`app/` または `src/`、`package.json` のスクリプト群、`jest-expo` テスト構成）に従って確定する。本 ADR ではフレームワーク選定までを確定し、コマンド体系の細部までは縛らない。

## 理由

- **既存スキルが最も深い → time-to-device 最大**: 自分は RN / Expo で出荷実績がある。[ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) で「早期検証ゲートを最上位ルール」に置いた以上、スタック選定の唯一の決定変数は **どれだけ早く実機で自分が触れる状態に持っていけるか**。学習コストゼロで動かせる Expo がそのまま正解になる。
- **必要なネイティブ機能がプラグインで揃う**: `expo-location` が region monitoring、`expo-notifications` がローカル通知、`expo-sqlite` がローカル永続化を **ネイティブモジュールを書かずに** 提供する。自前ネイティブ実装が要らない点が time-to-device を直接押し下げる。
- **iOS バックグラウンドジオフェンスの粗さは許容済みリスク**: iOS の region monitoring は精度・遅延が OS 任せで、バックグラウンド復帰タイミングも保証されない。これは [ADR-0003](./0003-firing-logic.md) §「決定」第 5 項「Always 拒否時は手動発火にフォールバック」と第 3 項「手動発火を v1 必須・行動アンカー成立の中核」で既に **構造的に許容している**。つまり Expo のジオフェンス精度が自前ネイティブに劣っていてもプロダクトの成立条件は変わらない。これが Capacitor との比較で決定的な差をつける。
- **`expo-sqlite` でデータモデルが単純に組める**: [ADR-0001](./0001-chain-data-model.md) の「正準は `(ノード, 日付, bool)` のみ」は SQLite の単一テーブル + 数本の参照テーブルで完結する。重い ORM / 状態同期ライブラリは不要。
- **案B（Capacitor）を却下する理由**: 参考デザインが純 HTML/CSS なので **literal 再利用** できる強い反論があったが、(a) `/reference/` は SPEC / DESIGN-SYSTEM で「使い捨て前提・出荷物ではない」と明記済みで再利用利得は見かけより小さい、(b) ジオフェンス（唯一のゲーティングなネイティブ機能）が community plugin 領域で **統合リスク高**、(c) Web ベースゆえバックグラウンド動作・OS API への到達が Native より一段不確実。第二候補としては妥当だが主にしない。
- **案C を却下する理由**: Flutter は学習コストが time-to-device 最優先と矛盾。ネイティブ Swift は iOS のみ先行になり Android 後追いコスト高。Tauri は Graft（PC 用途）想定で、モバイルのジオフェンス周りが未成熟。

トレードオフ:
- React Native の起動コスト・JS スレッドの制約・OTA 更新依存は受け入れる。Phase 1 の N=1 規模では実害なし。
- managed workflow を基本にすることで、将来 bare に降りる必要が出た場合のコストを抱える。これは Phase 1 後の実使用で判断する。
- Expo SDK 更新サイクルへの追従コストが発生する。v1 スコープでは年 1-2 回の SDK 更新を許容。
- **Expo Go を dev クライアントとして使う限り、プロジェクト SDK バージョンはストア側 Expo Go の SDK によって外圧的に決まる**（ストア更新で Expo Go が新 SDK に上がると、旧 SDK のプロジェクトは `PlatformConstants` 等の TurboModule 不整合で起動不能になる）。年 1-2 回の許容は **自分のペースで上げるコスト** を想定していたが、実際は Expo Go ストア更新で随時強制される運用になる。SDK ピン留めしたい時点で EAS Dev Build への移行が必要（Phase 1.1 時点では追従で運用）。Phase 1.1 で SDK 53→54 への一斉バンプを踏んだのはこの構造の最初の発現。
- **EAS の有料プラン課金は [ADR-0003](./0003-firing-logic.md) の「有料地図 API 禁止」とは別レイヤー**: ADR-0003 / [CLAUDE.md](../../CLAUDE.md) §6 の「有料 API 禁止」は **ランタイムで従量課金が発生する地図 / Places API** を対象とする禁則で、ビルドインフラ（EAS Build / EAS Submit）の課金とは独立した話。v1 は EAS Free tier の範囲で運用し、ビルドキュー混雑等で必要になった場合のみ有料プラン課金を判断する（ランタイムコストではないため ADR-0003 の趣旨と矛盾しない）。

## 想定される影響

- **同 PR で同期更新が必要**: [CLAUDE.md](../../CLAUDE.md) §技術スタック（Expo で確定）/ §ビルド・テストコマンド（Expo 標準に従う旨を明記）/ §ディレクトリ構成（Phase 0 着手時に Expo 慣例で固める）の文言を本 ADR に揃える。
- **Phase 0 着手時の作業**: `expo init` での雛形生成、`package.json` スクリプト群の確定、`tsconfig.json`、`jest-expo` 設定、`app.json` / `eas.json` の初期化。これらは本 ADR の決定の自然な帰結であり、追加 ADR は不要（具体的な依存バージョン選定で迷う場合のみ別 ADR）。
- **既存 ADR との整合**: [0001](./0001-chain-data-model.md)（データモデル）/ [0003](./0003-firing-logic.md)（発火ロジック）と整合。supersede 関係なし。[0006](./0006-phase1-completion-and-scope-narrowing.md) の早期検証ゲートが本 ADR の選定基準を支配しているため、6 → 7 の依存関係を本文で明示。
- **派生 ADR**: ナビゲーションは [ADR-0011](./0011-expo-router-for-navigation.md) で `expo-router` (ファイルベースルーティング、`app/` ディレクトリ) を採用。本 ADR の Expo 採用を前提に画面構成を確定する。本 ADR と矛盾しないが、エントリポイントは `App.tsx` から `expo-router/entry` に変更されているため、本 ADR を読み戻すときに `App.tsx` を再生成しないこと。
- **後で覆すコスト**: Expo → bare RN へ降りるのは Phase 1 後の実使用で困った場合のみ実施（managed workflow 上で `npx expo prebuild` 経由）。Expo → 他フレームワーク（Flutter / ネイティブ / Capacitor）へ全面移行するコストは Phase 1 規模を超えるため、現時点では想定しない。覆す場合は本 ADR を `superseded` にする新規 ADR が必要。
- **これは v1 の確定事項である**。Phase 0 / 1 着手後に「やはり Capacitor で書き直す」などの再検討は **行わない**。実機ビルドの障害が出た場合は本 ADR と別 ADR の両方を見直す。
