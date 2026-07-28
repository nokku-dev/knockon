# App Store スクリーンショット撮影 自動化 (POC)

> 対象: Issue #237 (撮影 SOP) / #238 (demo seed)。本 POC は「撮影の前後を自動化し、Taku の手作業を
> `eas build` と目視チェックだけに絞る」ことを狙う。
> SoT: [`../docs/release/demo-seed/README.md`](../docs/release/demo-seed/README.md) (demo データ規約) /
> [`../docs/release/screenshots/6.7/README.md`](../docs/release/screenshots/6.7/README.md) (撮影 SOP)。
> **本 POC はまだ実ビルドで通し検証していない** — 未検証ポイントを末尾に明記する。

## 何を自動化したか

手動 SOP (`docs/release/screenshots/6.7/README.md` §5) のうち、以下を自動化した:

| SOP ステップ | 自動化 | スクリプト |
|---|---|---|
| simulator 起動 / status bar override | ✅ | `capture-screenshots.sh` |
| fresh install (Erase) | ✅ (破壊的・専用機のみ) | `capture-screenshots.sh` |
| **demo チェーン 3 本 + 達成 + 定着状態の投入** (SOP §2 の手 UI 作成 + SQL 直投入) | ✅ **全自動化** | `screenshot-demo-seed.ts` |
| 5 画面へ遷移 → 撮影 | ✅ (deep-link) | `capture-screenshots.sh` |
| サイズ検証 (1290×2796) | ✅ | `capture-screenshots.sh` |
| **app のビルド / install** | ❌ 手動 (`eas build`) | — (下記 TODO) |

元 SOP は「Step A: UI で 3 チェーンを手作成」+「Step B/C: SQLite 直投入 + 今日タップ」だったが、
本 POC は **seed スクリプト 1 本で全 state (チェーン/ノード/過去達成/今日達成) を注入**する
(手 UI 作成が不要になる = 文言ブレ・作成順ドリフトを構造的に排除)。

## 構成ファイル

- `scripts/screenshot-demo-seed.ts` — demo seed 投入 (tsx)。`createBetterSqliteClient` +
  `src/repository.ts` の insert 関数で `knockon.db` に直接注入する純粋データ投入。SQL 手書きなし。
- `scripts/verify-demo-seed.ts` — **ビルド不要の seed 検証**。in-memory sqlite にアプリの
  `initSchema` を適用 → seed 注入 → 派生関数で §1.2 と一致を assert。`npm run screenshot:verify`。
- `scripts/capture-screenshots.sh` — 撮影パイプライン (simulator / seed / deep-link / 検証)。
- `package.json` に `tsx` (devDep) と `screenshot:seed` / `screenshot:verify` スクリプトを追加。

## 前提

- **iPhone 15 Pro Max** = 6.7" = **1290×2796**。App Store 6.7" 枠はこのサイズ。
  iPhone 16 Pro Max は 6.9"/1320×2868 で**別サイズ**なので使わない (`DEVICE_TYPE` 固定)。
  ※ 元 SOP / demo-seed README は「16 Pro Max 推奨」と書くが、6.7" のピクセル厳密一致は
  **15 Pro Max** が正 (16 Pro Max だとサイズ検証で FAIL する)。本 POC は 15 Pro Max に統一した。
- iOS 18.x runtime (runtime に 18.6 導入済み)。
- **EAS `preview` (or `development`) ビルド**が要る。**production は SQLite 外部アクセス経路が閉じる**
  ため seed 注入不可 (demo-seed README §2.1)。
- テーマ Dark 固定 (`FORCE_DARK_FOR_REVIEW = true` の現状追認)。`simctl ui appearance dark` でも固定。
- このリポジトリで `npm install` 済み (`better-sqlite3` / `tsx`)。

## 実行フロー (end-to-end)

```sh
# 0. seed が §1.2 と一致することを先に証明 (ビルド不要・数秒)
npm run screenshot:verify

# 1. simulator 向け preview ビルド (別途・時間がかかる。本 POC では実行しない)
eas build --profile preview --platform ios --simulator
#    → 生成物 (.tar.gz) を展開し knockon.app のパスを控える

# 2. 撮影パイプライン (APP_PATH に .app を渡す)
APP_PATH="/path/to/knockon.app" scripts/capture-screenshots.sh
#    → docs/release/screenshots/6.7/ に 01..05.png を出力し 1290×2796 を検証

# 3. 目視チェック (demo-seed README §3): 定着 3 個 / 星マーカー / ログ見出し 等

# 4. コミット → PR → App Store Connect
```

`APP_PATH` 未指定で実行すると、install ステップ手前で停止し `eas build` の手順を表示する
(simulator の作成・boot・erase までは進む)。

## deep-link マッピング (5 画面)

scheme = `knockon`。expo-router の各ルートに対応。

| # | ファイル | deep-link | ルート | 備考 |
|---|---|---|---|---|
| 1 | `01-today.png` | `knockon://` | `app/(tabs)/index.tsx` | Today |
| 2 | `02-chain-detail.png` | `knockon://?openChainId=chain-morning` | `app/(tabs)/index.tsx` | **ChainDetail Bottom Sheet を自動展開** |
| 3 | `03-analytics-portfolio.png` | `knockon://analytics` | `app/(tabs)/analytics.tsx` | ログ / 定着ポートフォリオ |
| 4 | `04-chains-list.png` | `knockon://chains` | `app/(tabs)/chains.tsx` | チェーン一覧 (active) |
| 5 | `05-chain-edit.png` | `knockon://chain/chain-morning` | `app/chain/[chainId].tsx` | 朝ルーティンの**編集画面** |

### 「チェーン編集」カットの結論 — `chain/new` ではなく `chain/chain-morning`

タスクの仮説「チェーン編集カットは `knockon://chain/new` でよいか」に対する結論: **No**。

- `knockon://chain/new` (`app/chain/new.tsx`) は `useChainEdit(null)` = **空の新規フォーム**
  (タイトル空・ノード 0・アンカー未設定)。撮影 SOP §2.5 が要求する「朝ルーティンの
  アンカー 07:00 + ノード 4 個 + DnD ハンドル」の絵は**出せない**。
- `knockon://chain/chain-morning` (`app/chain/[chainId].tsx`) は `useChainEdit(chainId)` =
  **既存チェーンの編集画面**で、同じ `ChainEditScreen` を既存 draft (4 ノード / 07:00 / DnD) で描く。
  これが §2.5 の構図。seed が固定 ID `chain-morning` を採番するので deep-link から直接指せる。

### ChainDetail (カット 2) の deep-link 根拠

`app/(tabs)/index.tsx` が `useLocalSearchParams<{ openChainId }>()` を読み、`TodayScreen` の
`initialOpenChainId` に渡して Bottom Sheet を自動 open する経路が実装済み (元は通知タップ動線
PR-1.5b-3)。この経路を deep-link のクエリ `?openChainId=` で流用する。**ChainDetail は独立ルートでは
なく Today 上の Bottom Sheet** なので、`knockon://chain/<id>` (=編集画面) とは別物である点に注意。

## seed が作る state (`docs/release/demo-seed/README.md` §1.1/§1.2 準拠)

- 3 チェーン: 朝ルーティン (07:00) / 集中の入り (机に座ったら) / 夜ルーティン (22:30)。
- 定着ノード 3 個 (左マーカー星型): 朝②深呼吸 / 朝③ストレッチ / 集中②タスク
  (`node-morning-2` / `node-morning-3` / `node-focus-2`)。過去 14D 窓に 10 日ぶん
  (D-13..D-4) の達成を注入 = `isNodeSettled` の latch 成立 (windowDays=14 / minAchievedDays=10)。
- 今日の達成: 朝 4/4 / 集中 2/3 (③タイマー未達) / 夜 0/3。
- 派生見出し: **定着 3 / もう少しで定着 0 / 育成中 7** (7 = 4-2 + 3-1 + 3)。

`verify-demo-seed.ts` がこの全数値を assert し **PASS を確認済み** (下記)。

### 検証ログ (実行済み・ビルド不要)

```
$ npm run screenshot:verify
  [PASS] settled (定着): 3    almost: 0    growing: 7
  [PASS] 定着ノード: node-focus-2 / node-morning-2 / node-morning-3
  [PASS] 今日達成: 朝 4 / 集中 2 / 夜 0
ALL PASS — seed が §1.2 の state と一致
```

## まだ埋まっていない箇所 / 未検証ポイント (実ビルドが要る)

1. **app のビルド・install** (`capture-screenshots.sh` (c))。`eas build --profile preview
   --platform ios --simulator` を回して `.app` を作り `APP_PATH` に渡す必要がある。
   スクリプト内 install 行は TODO コメントで待機している。
2. **deep-link が実機ビルドで全 5 画面に効くか** — **未検証**。expo-router のルート/クエリ対応
   (`knockon://chain/<id>` / `knockon://?openChainId=`) はコード上存在するが、`simctl openurl`
   経由で cold-launch 済みアプリに届き期待画面を出すかは**実ビルドでの確認が必須**。特に:
   - `?openChainId=chain-morning` が ChainDetail Bottom Sheet を確実に開くか
     (index.tsx は 300ms で consume する。open 済み Sheet は保持される想定だが要実測)。
   - tab ルート (`analytics` / `chains`) への openurl が正しいタブを前面にするか。
3. **seed 注入タイミングの前提** — アプリ初回起動で `initSchema` が `knockon.db` を作った**後**に
   seed を流す (スクリプトは launch→terminate→注入→relaunch の順で担保)。preview ビルドで
   実際に `Documents/SQLite/knockon.db` のパスに出るかは**要実機確認** (パス差異の保険として
   container 配下 find フォールバックを入れてある)。
4. **今日の達成が「実タップ」でなく直投入である点** — K-002/ADR-0050 は「レコードは実タップのみ」
   だが、これは**アプリ実行時の制約**。撮影用 demo は SQLite 直投入で state を作る (demo-seed
   README §2.3 が明示的に許容)。ただし達成ジェスチャのアニメ (線が伸びる等) は静止 seed では
   発火しない → 「積み上がった線」は seed 済みの静的状態として写る。演出付きの瞬間を撮りたい
   場合のみ手タップが要る (優先度低)。
5. **almost (もう少しで定着) の数** — 本 POC は demo-seed README **§1.2** に忠実 = `almost=0`。
   一方 screenshots README **§2.3** は `almost=1 / 育成中5` を望む (ログ画面の見栄え)。両者は
   規約間で不一致。§1.3 の任意調整 (あるノードを 8-9 日達成にする) で `almost=1` に寄せられる
   (`SETTLE_OFFSET` を 1 ノードだけ緩める) が、まず §1.2 を正として実装した。どちらを撮るかは
   Taku 判断 (この不一致自体を SoT 側で解消するのが望ましい)。

## Taku が朝にやること (完走への最短手順)

1. `npm run screenshot:verify` で seed が緑なのを再確認 (数秒)。
2. `eas build --profile preview --platform ios --simulator` を回す (時間がかかる)。
3. 生成 `.app` のパスを控え、`APP_PATH=... scripts/capture-screenshots.sh` を実行。
4. 5 枚が 1290×2796 で出るか + demo-seed README §3 の目視項目を確認。
5. 上記「未検証ポイント 2」(deep-link の実挙動) がズレたら、該当画面だけ手動遷移で撮り直し、
   結果を本 README にフィードバック (どのルートが openurl で効かなかったか)。
