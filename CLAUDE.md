# knockon

## プロジェクト概要

If-Then / habit stacking 型の習慣アプリ（nokku 配下）。起点アンカーから行動が連鎖していくチェーンを作り、続けて積み上がる手応えを主役にする。**prime objective は収益最大化ではなく「自分が毎日使う1本を最短で完成・出荷する」**。完成判定 = PLAN の Phase 4 終了（自分の実運用がアプリ上で閉じる）。

## 技術スタック

- 形態: モバイル先行（iOS 先行可）、クロスプラットフォームを後続で。
- **フレームワーク: Expo（React Native）/ managed workflow + EAS Build**（[ADR-0007](docs/decisions/0007-expo-react-native-stack.md)）。time-to-device 最優先で確定。bare workflow へ降りるのは Phase 1 実使用で障害が出た場合のみ。
- 永続化: **`expo-sqlite` でローカル正準**（v1 で同期は持たない）。`(ノード, 日付, bool)` のみを保存（[ADR-0001](docs/decisions/0001-chain-data-model.md)）。
- 位置: **`expo-location` の region monitoring**（OS 標準ジオフェンス）。**有料地図 API 禁止**（[ADR-0003](docs/decisions/0003-firing-logic.md)）。
- 通知: **`expo-notifications`**（ローカル通知のみ・サーバ push は v1 非スコープ）。
- 描画: **`react-native-svg`**（1 本連続スパインの線・マーカー描画、[ADR-0009](docs/decisions/0009-react-native-svg-for-spine.md)）。Phase 1.5 のノックモーションも SVG 上で実装予定。
- ナビゲーション: **`expo-router`** (ファイルベースルーティング、[ADR-0011](docs/decisions/0011-expo-router-for-navigation.md))。`app/` 配下が画面構成。Bottom Tabs で Today / チェーン を切替。

## ビルド・テストコマンド

Expo の標準慣例に従う。具体的なスクリプト・依存バージョンは Phase 0 着手時（`expo init` 実行・`package.json` 確定時）に定める。

- `npm install` / `pnpm install` — 依存関係インストール (`--legacy-peer-deps` を使うこともある、 K-009)
- **`npx expo install <module>` — Expo モジュール (`expo-*` / Expo plugin 持ち) 追加時は必ずこちらを使う。 `npm install` は SDK 非互換版を入れる可能性 ([K-025](KNOWLEDGE.md))**
- `npm test` — Jest（`jest-expo` プリセット）でテスト
- `npm run type-check` — TypeScript 型チェック

### 開発サーバ起動 (Dev Client 移行後、 PR-1.5b-1 以降)

[ADR-0017](docs/decisions/0017-expo-dev-client-migration.md) で Expo Go から Dev Client に移行済み。 Expo Go アプリは今後使わない。

- `npx expo start --dev-client` — Dev Client 向け開発サーバ起動 (Dev Build apk が実機にインストール済み前提)
- 初回 / SDK 更新後は実機に Dev Build apk を再インストール: `eas build --profile development --platform android` → 出来上がった apk をダウンロード or QR コード経由で実機に sideload

### EAS Build

- `eas build --profile development --platform android` — Android Dev Client apk (実機 sideload 用、 開発時)
- **`eas build --profile preview --platform android` — Android preview apk (JS bundle 内包、 Metro 不要で単体起動可)**。 Phase 1 検証期間 (= 「Today を実機で数日回す」、 [ADR-0006](docs/decisions/0006-phase1-completion-and-scope-narrowing.md)) の日常運用ビルド。 外出先 / 通勤中で動く。 コード変更後は再ビルド必要 (10-15 分)。
- `eas build --profile production --platform android` — Android 本番ビルド (配布用、 Phase 2 以降)
- iOS は Phase 1 出荷判断の手前までスルー (Apple Developer Program $99/年が必要、 [TODO.md](TODO.md) 方針)

### Dev Client / preview の使い分け

- **コード書く / デバッグ**: Dev Client (`npx expo start --dev-client` + 自宅 PC + 同じ Wi-Fi)
- **日常運用 / 検証期間 / 外出先**: preview apk (Metro 不要、 単体起動)
- 大きな変更後は preview を再ビルドして実機に再 install

## ディレクトリ構成

- `docs/` — `SPEC.md`（仕様 v0.4）/ `PLAN.md`（実装順序）/ `DESIGN-SYSTEM.md`（v0.2）/ `KNOWLEDGE.md`（失敗パターン）
- `docs/decisions/` — ADR（判断ログ）
- `reference/` — デザイン参照 HTML（**使い捨て前提・出荷物ではない**。実装の規範は SPEC/DESIGN-SYSTEM 側）
- `app/` — `expo-router` のファイルベースルーティング（[ADR-0011](docs/decisions/0011-expo-router-for-navigation.md)）。`_layout.tsx` がルート、`(tabs)/` 配下が Bottom Tabs。
- `src/` — domain 層（純粋関数）/ DB クライアント / repository / presentation コンポーネント / hooks / トークン。

これらは [ADR-0007](docs/decisions/0007-expo-react-native-stack.md) の Expo 採用と [ADR-0011](docs/decisions/0011-expo-router-for-navigation.md) のナビ採用に基づく構成。

## Augmentation原則（このプロジェクト固有）

ユーザーに行動変容を要求しない。「習慣を覚えておく・順番に実行する」という認知負荷を、システム側が**起点アンカー → ノード連鎖**と**Today に並ぶ active チェーン全表示 + タップ達成**で吸収する。具体的には:

- 自動発火（時刻/場所）が効かなくても、 Today を開けば active チェーンが全部並ぶので**ノードタップだけで運用が成立**する。ユーザーに「正確に通知を設定する」ことを要求しない ([ADR-0020](docs/decisions/0020-deprecate-manual-firing-concept.md) で旧「手動発火」概念を廃止)。
- 連鎖が途切れても咎めない（ゆるい判定）。**マイナスを指差さず、積み上がりと定着だけを可視化する（Celebrate 主）**。
- 新しい記法・運用ルールの学習を強制しない。新規作成は単純（バリアントなし）で、必要なときだけ複雑さを開く。

## プロジェクト固有の注意点

実装者が放置すると自然に逆をやる箇所。ここは **load-bearing（不変）**。デザインのトークン/レイアウトは変更前提（v0.2）だが、以下は勝手に変えない:

1. **正準データは 5 軸:** ノード達成 `(ノード, 日付, bool)` + アンカー発火 `(anchor_id, 日付)` + メトリクス `(metric_key, value, recorded_at)` + 手動メモ `(note_id, node_id?, content, created_at, updated_at)` + 定着取り下げ `(node_id, retracted_at)` のみ ([ADR-0012](docs/decisions/0012-anchor-firing-events.md) / [ADR-0024](docs/decisions/0024-goal-view-analytics-phase-3-unified.md) / [ADR-0044](docs/decisions/0044-research-manual-notes.md) / [ADR-0047](docs/decisions/0047-settlement-lifecycle-and-log-portfolio.md))。**チェーン平均・連鎖の流れ・定着判定・星種別・進捗率・メトリクスの移動平均は一切保存せず表示時に派生計算**する。派生値のカラム追加・キャッシュ・非正規化は禁止。アンカー発火イベント / メトリクス / 手動メモは「観測した事実」として保存 (派生値ではない)。手動メモはユーザーが書いた事実で `node_id` 単一 nullable・ノード削除時は `ON DELETE SET NULL` で本文保全 ([ADR-0044](docs/decisions/0044-research-manual-notes.md))。研究画面はメモ一覧 + FAB、 Today はアクション長押しでメモ作成。アプリ動作設定 (`app_settings` テーブル) は別軸 (= 観測データではなく app config、 [ADR-0028](docs/decisions/0028-app-settings-and-reset-time.md))。**定着ライフサイクル ([ADR-0047](docs/decisions/0047-settlement-lifecycle-and-log-portfolio.md)): 定着は生涯マイルストーン (latch) だが判定は派生のまま保存しない** (履歴の不変性から latch は派生で単調増加)。保存するのはユーザーの「定着取り下げ」= 観測事実の 1 軸のみ ([ADR-0012](docs/decisions/0012-anchor-firing-events.md)/[ADR-0044](docs/decisions/0044-research-manual-notes.md) と同型)。定着ノードは Today で **左ドットが星型**、**タップは従来どおり有効** (ADR-0050、2026-07-07 確定)。星は達成状態とは別軸のマイルストーン記号 (auto-✓ #211 は撤回・達成レコードは実タップのみ・K-002)。定着 = 星は Today ドット / 7D ミニマトリクス / 60D マトリクスに通底 (60D は #212 の緑塗りから星へ・レコード非生成)。**Today 見出しは「定着 N 個」** (旧「累計 N 個達成」#213 effective 累計を撤回・ADR-0041 の累計はチェックリスト内部利用に降格)。この点は判断が数転: auto-✓ ⇄ タップ従来どおりを経て、最終的に「タップ従来どおり + 定着は星記号」に確定 (ADR-0050 が #118/#211/#213 を反転)。
2. **チェーンモデルは「起点アンカー1つ ＋ ノード順序列」。** ノードは将来 アクション or サブチェーン参照（再帰1段）だが **v1 はアクションのみ**（サブチェーンは非スコープ・後から無移行で追加可）。中間アンカーは持たない（2番目以降のトリガーは暗黙=直前ノード完了、UI 非表示）。**旧「リンク=アンカー×アクション」モデルは破棄。復活させない。**
3. **連鎖判定はゆるい（意図的な逸脱）。** ノードを飛ばしても後続をゼロ評価にしない／各ノード独立達成。habit stacking の教科書的な厳密連鎖切れに"修正"しないこと。サブチェーンの親視点達成 = 内部いずれか1ノードでも実行で達成。
4. **禁止 UI（ハードガードレール）:** 格子 / ヒートマップ / カレンダー型ストリーク / ストリーク炎 / 紙吹雪 / 弱い輪・未達のアラート的指差し表示 / ドット塗り率の段階表現は**追加禁止**。**定着ノードの左 SVG マーカーは星型** (ADR-0050、2026-07-07 で Issue #118「常に円」を反転)、未定着ノードは円。星は常に塗り (今日の達成状態で ★/☆ 塗り分けはしない = 反 streak / (−) 禁則と整合)。定着 = 星は Today ドット / 7D ミニマトリクス / 60D マトリクス / 見出し「定着 N 個」に通底させる。**「円→星の形変化は撤回」だった #118 自体を ADR-0050 で再反転した** (実機判断: 定着はドット自体を星にする)。段階塗り率 / ストリーク炎等の禁止は不変。**旧例外だった「分析タブの二値マトリクス」（#115 / ADR-0037）は [ADR-0051](docs/decisions/0051-remove-matrix-and-merge-fresh-into-growing.md) で UI 撤去**（未達セル＝ギャップを指差すため・実機の違和感）。コードは残置するが再追加時は「未達を可視化する面は核とぶつかる」ことを踏まえて判断する。**判定軸 (#174 / [ADR-0036 §一般原則](docs/decisions/0036-rescind-today-streak-display.md)):** 数字 / グリフ / ハイライトを新規追加するときは「失われうるか (+/-)」で判定する。(+) 失われない指標 (単調増加 / one-way フラグ / 塗り分けしないクロス断面) は採用可、(−) 失われうる指標 (連続日数 / 比率 / 段階塗り率 / 達成状態反映の塗り分け) は追加禁止。グレーは (−) 側に倒す。過去判断対応表は ADR-0036 §一般原則を参照。
5. **スコープ境界:** 完成判定は **Phase 1（Today が実機で数日回ること）**。v1 非スコープ = サブチェーン参照（白抜き星含む） / ウィンドウ 7/31 切替 / サブスク有料機能 / 広告 / 複数デバイス同期 / テーマ追加 / 弱い輪 / ソーシャル / **アクションのバリアント編集の週マップ (隔週)** / **チェーンステータス active/stocked 切替 UI の自動化機能**。"production-ready" を理由にこれらへスコープを広げない。設計の精密化より実機到達を優先（早期検証ゲート）。チェーン / アクション CRUD は [ADR-0014](docs/decisions/0014-crud-phase-1-7-1-8-frontload.md) で Phase 1.7-1.8 に前倒し済み。**アクションのバリアント編集の曜日マップ** は [ADR-0018](docs/decisions/0018-variant-phase-2-frontload.md) で Phase 2 から前倒し採用 (週マップは引き続き非スコープ)。**目標ビュー / メトリクス / 分析** は [ADR-0024](docs/decisions/0024-goal-view-analytics-phase-3-unified.md) で Phase 3 と統合実装 (v1 範囲に取り込み、 K-004 の ANT 違反は「メトリクスは任意 + チェーンと疎結合 + 連携 read-only」で構造回避)。
6. **再検討禁止の確定事項:** 場所発火 = OS 標準ジオフェンス（有料 API 不可）。場所登録は v1 は現在地のみ（地図検索は後発）。Today の active チェーン全表示 + ノードタップは v1 必須 ([ADR-0020](docs/decisions/0020-deprecate-manual-firing-concept.md))。 ファイル名は ASCII/英語。プロダクト名 `knockon` を user-facing 文字列にハードコードせず1箇所に集約。

> 既出の基礎判断は ADR として back-fill 済み: チェーンデータモデル = [0001](docs/decisions/0001-chain-data-model.md) / ゆるい連鎖判定 = [0002](docs/decisions/0002-loose-chain-judgement.md) / 発火ロジック（OS ジオフェンス + 手動発火） = [0003](docs/decisions/0003-firing-logic.md) / デザイン方針 v0.2 と弱い輪 v1 廃止 = [0004](docs/decisions/0004-design-direction-v02.md) / 命名 knockon = [0005](docs/decisions/0005-product-name-knockon.md)。これら基礎判断と矛盾する実装が出てきたら、対応する ADR を `superseded` にする新規 ADR が必要。

## タスク連携

> 注 (2026-08-15): 外部タスク管理ツール（Todoist / Notion）との連携は廃止した。**GitHub Issues が唯一の起票先**。
> 以前この節にあった Todoist / Notion Tasks の手順は、いずれのツールも運用から外れたため削除している。

- 作業は Issue 起点で行い、PR から `Closes #NN` で紐付ける
- 状態は Issue / PR の open-close で表す。外部ツールへの二重記入はしない

## レビューロール

PRレビュー時は以下の観点で指摘すること（プロジェクトのフェーズに応じて更新する）:

- [ ] テストカバレッジ: 主要パスと境界値がテストされているか
- [ ] 設計一貫性: 既存のアーキテクチャパターンに沿っているか
- [ ] Augmentation原則: ユーザーに新しい負担を要求していないか
- [ ] **正準データ厳守: 派生値（達成率・定着・星種別等）を保存・キャッシュしていないか**
- [ ] **禁止 UI 不在: 格子/ヒートマップ/ストリーク炎/弱い輪アラートを追加していないか**
- [ ] **モデル整合: 旧リンクモデル・厳密連鎖切れ・中間アンカーが混入していないか**
- [ ] **ドメイン層の純粋性 (K-007): `src/domain.ts` 等の `import` が DB/UI/状態管理に依存していないか（`grep '^import' src/domain*.ts` で確認）**
- [ ] **ハードガードレールのテスト固定 (K-006): スキーマ不変条件（派生値カラム不在・旧テーブル不在）が `PRAGMA table_info` / `sqlite_master` 等で機械検証されているか**
- [ ] **Expo 依存変更時の 4 ファイル diff (K-009): `expo install` / SDK バンプを含む PR では `package.json` / `tsconfig.json` / `babel.config.js` / `app.json` の 4 ファイルの diff が意図通りか確認（自動付与された変更が混入していないか）**
- [ ] **楽観更新パターンの判断明示 (K-010): タップ → UI 即時反映 → 非同期永続化のような楽観更新を入れる場合、rollback / stale closure / 同時実行への対処を「受容する」「対処する」のどちらかで明示しているか（コードコメント or PR 本文）**
- [ ] パフォーマンス: 明らかなボトルネックがないか
- [ ] セキュリティ: 入力バリデーション・認証・認可は適切か

## 参照

- 詳細ルールは .claude/rules/ を参照
- 蓄積された知見は @KNOWLEDGE.md を参照
- 仕様（ビジネス要件・機能仕様）は @SPEC.md を参照
- 現在の全体像（実装済みの構造・判断・把握状況）は @understanding-map.md を参照
- 過去の判断は `docs/decisions/` を参照
- デザインルールは @DESIGN-SYSTEM.md を参照（v0.2・変更前提。ただし上記「禁止 UI」と「正準データ」は不変）

## 判断ログ

このプロジェクトの判断は `docs/decisions/` に ADR 形式で記録する。

### 判断ログを書く / 参照する

新しい判断を記録する場合: `/decision` スキル（グローバル）を起動するか、`./scripts/new-decision.sh <kebab-case-title>` を実行。

実装前に既存の判断を確認: `docs/decisions/` を一読する。
特に以下のタグの判断は新規実装に影響する可能性が高いので必ず確認:
- `architecture`
- `library`
- `data-model`
- `branding`（デザイン関連の実装時）

### 判断ログを残すべきタイミング

- ライブラリ・依存関係の選定
- アーキテクチャ判断（ディレクトリ構造、状態管理、データフロー）
- デザイン要素の決定（色、タイポグラフィ、スペーシング、アニメーション基本方針）
- API 設計・命名規則
- スコープ判断（やる / やらない / 先送り）
- トレードオフを伴う判断（A を取って B を捨てた）

### 判断ログとの整合性

新しい実装が既存の判断ログと矛盾する場合は、実装を進める前にユーザーに確認する。
矛盾を解消する方針:
- 過去の判断を維持: 既存実装に合わせる
- 過去の判断を覆す: 新しい判断ログを作成し `supersedes: [過去ID]` を記載、過去ログの `status` を `superseded`、`superseded-by: [新ID]` を記載

詳細なタグ語彙集・status 値・supersede フローは `docs/decisions/README.md` を参照。
