# App Store 6.7" スクリーンショット制作 SOP

> 対象: Issue #237 (親: #224 / 提案: #229)
> 上位 SoT: [../../app-store-submission.md](../../app-store-submission.md) (Issue #225 の playbook) §1.1
> 位置付け: **本ドキュメントは 6.7" スクリーンショット再撮影の実行 SoT**。Taku が上から順に実行し `docs/release/screenshots/6.7/*.png` を再生成できる粒度で書く (Claude Code は Apple Developer 環境と Xcode/実機を持たないため撮影は自動化不能・playbook §0 と同じ制約)。

## 0. サイズと枚数 (固定)

- **サイズ**: **6.7" (1290×2796) のみ**。6.5" / 6.9" は追い足しせず、App Store Connect の自動 scale と Metadata Rejection 時の追い足し (playbook §4.1) に任せる。
- **枚数**: **5 枚**。App Store 一覧で先頭 3 枚が特に重要 (プレビュー領域) なので順序を厳守する。
- **形式**: PNG (Apple 要件)。git-lfs は使わない (5 枚 × 6.7" で 5-10 MB 想定・repo 圧不要)。1 枚 1 MB を超えたら `pngquant` で lossy 圧縮 (画質劣化許容範囲・store 側で再エンコードされる)。
- **テーマ**: **Dark 固定**。`app/_layout.tsx` の `FORCE_DARK_FOR_REVIEW = true` および `SettingsModal` の `SHOW_THEME_SELECTOR = false` の現状 (DESIGN-SYSTEM §1 追記 / [ADR-0029](../../../decisions/0029-theme-mode-light-dark-auto.md) の段階移行未着手を追認) に揃える。

## 1. 命名規約

```
docs/release/screenshots/6.7/
  01-today.png
  02-chain-detail.png
  03-analytics-portfolio.png
  04-chains-list.png
  05-chain-edit.png
  README.md            # 本ファイル
```

- **形式**: `NN-<screen-slug>.png` (2 桁 zero-pad prefix)。
- **順序**: App Store Connect のアップロード順 = **ファイル名昇順に一致**させる (Connect 側 UI 手動並び替えに依存しない = 再撮影時の順序ドリフトを防ぐ)。
- **slug は ASCII / kebab-case** (CLAUDE.md §6 のファイル名 ASCII/英語ルール)。

## 2. 撮影対象 5 枚と各画面の state 仕様

リリース対象タブ = **Today / チェーン / ログ** の 3 本 (研究タブは [ADR-0049](../../../decisions/0049-exclude-research-tab-from-release-scope.md) で `href: null`・撮影対象外)。順序と狙いは提案 #229 §1.2 の確定を踏襲する。

### 2.1 01-today.png — Today (最頻画面)

**狙い**: 「積み上がる線」の主役性・複数チェーンが並ぶ日常性を先頭で伝える。

**state**:

- 3 チェーンが縦に並ぶ (§3 demo チェーン 3 本すべて active)
- **朝ルーティン**: 4/4 全達成 (スパインが下端まで `--grow`)、うち「深呼吸 3 回」「5 分ストレッチ」の 2 ノードが**定着** = 左マーカー星型 ([ADR-0050](../../../decisions/0050-settlement-star-marker-and-today-headline.md))
- **集中の入り**: 2/3 達成 (「タイマー 25 分」だけ未達)、うち「今日 1 番の 1 タスクを書く」が**定着**
- **夜ルーティン**: 0/3 (これから・スパインは `--line-bg`)
- **見出し右上**: `定着 3 個` ([ADR-0050](../../../decisions/0050-settlement-star-marker-and-today-headline.md))
- ChainDetail Bottom Sheet は**閉じた状態**

### 2.2 02-chain-detail.png — Today > ChainDetail (Bottom Sheet 展開)

**狙い**: スパイン + ノード列で「1 本の連続線」の差別化を伝える。

**state**:

- **朝ルーティン**を選択して Bottom Sheet を**中段展開**
- 4 ノード全達成、スパインは起点から最下段まで `--grow`
- 「深呼吸 3 回」「5 分ストレッチ」の 2 ノードが左マーカー星型
- 起点アンカー = 07:00 (時刻) が上端に表示
- **注**: ノード行右端の 7D ミニマトリクスは [ADR-0051](../../../decisions/0051-remove-matrix-and-merge-fresh-into-growing.md) で UI 撤去済み。マトリクスが見える構図を狙わない (コード残置だが表示されない)。

### 2.3 03-analytics-portfolio.png — ログ (定着ポートフォリオ)

**狙い**: 反 streak な独自 UI = 差別化点を 3 枚目で押す。

**state**:

- 見出し行: `定着 3 / もう少しで定着 1 / 育成中 5` (SPEC §3・[ADR-0047](../../../decisions/0047-settlement-lifecycle-and-log-portfolio.md))
- 今週の流入: `定着入り +1 ・ もう少しで定着入り +1` (両方 0 の週は非表示になるため、demo データは流入が発生する構成にする)
- ステージ折りたたみ: **「定着」を開いた状態で撮影** (SPEC §3 は初期畳みだが、閉じた見出しだけだと App Store 一覧で「何のリスト?」となる)。「もう少しで定着」「育成中」は畳んだままでよい。
- **注**: 60D マトリクスは [ADR-0051](../../../decisions/0051-remove-matrix-and-merge-fresh-into-growing.md) で UI 撤去済み。マトリクスが見える構図を狙わない。

### 2.4 04-chains-list.png — チェーン一覧 (active タブ)

**狙い**: 複数チェーン管理の全容。

**state**:

- `active` フィルタ選択
- demo チェーン 3 本が並ぶ
- `stocked` タブは 0 件で構わない (active 中心運用の伝達を優先)

### 2.5 05-chain-edit.png — チェーン編集

**狙い**: If-Then / habit stacking の作り方の一端を見せる。

**state**:

- 「朝ルーティン」を選んで編集画面
- 起点アンカー = `07:00` (時刻)
- ノード列に 4 個並び、DnD 用ハンドル (`≡`) が見える構図
- 「アクション追加」ボタンが見える (Header/Footer に集約されている領域を含める)

## 3. Demo データ規約 (個人情報漏洩防止 = 最重要)

**Taku 個人の実データ (会社名 / 場所名 / 個人的アクション名) を絶対に出さない**。撮影用の **fresh device / fresh install** で demo seed から作る。

Demo チェーン 3 本 (推奨):

1. **朝ルーティン** (時刻アンカー: 07:00 / active)
   - コップ 1 杯の水
   - 深呼吸 3 回
   - 5 分ストレッチ
   - ジャーナル 2 行
2. **集中の入り** (行動アンカー: 「机に座ったら」 / active)
   - タブを 1 枚に絞る
   - 今日 1 番の 1 タスクを書く
   - タイマー 25 分
3. **夜ルーティン** (時刻アンカー: 22:30 / active)
   - 机の上を空にする
   - 明日の 1 タスクを 1 行
   - ライトを暖色に

**達成状態**: §2.1-§2.3 で規定した組み合わせを再現する。**定着マーカー (星型) は latch = 派生**なので、撮影時点で「14D 中 10 日達成」の履歴を作る必要がある = fresh install 直後の即席撮影では出せない。実運用ではなく、demo 用に **日付操作** (シミュレータの日付を過去に戻して達成タップを繰り返す or `AsyncStorage` / SQLite に直接 INSERT する seed スクリプト) で作る。手段の詳細は別 issue [Issue #229 ===TASKS=== 2 番目] で整備する `docs/release/demo-seed/README.md` に委譲する (本 SOP のスコープ外)。

## 4. 撮影環境

- **実機推奨** (playbook §4.5 = Guideline 2.3.3 リスク最小化)。iPhone 15/16 Pro Max があれば TestFlight ビルドを実機で撮る。
- **代替**: **Xcode Simulator の iPhone 16 Pro Max (1290×2796)**。iOS 17+ の simulator screenshot は pixel-perfect (Simulator メニュー Window > Save Screen or Cmd+S → PNG)。**Apple の Guideline 2.3.10 は 2020 以降 simulator screenshot も許容**。ただし審査官が個別に「実機で撮り直して」と言う可能性は残るので、実機優先。
- **ステータスバー**: iOS 標準の 9:41 表示。Simulator では下記 override コマンドで綺麗に固定できる:

  ```sh
  xcrun simctl status_bar "iPhone 16 Pro Max" override \
    --time "9:41" \
    --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 \
    --batteryState charged --batteryLevel 100
  ```

- **通知バッジ / debug 表示**: 全て OFF。`__DEV__` バナー / red box が出ない **preview / production ビルドで撮る** (dev client のホットリロード表示が乗らないよう注意)。

## 5. 実行ワークフロー (Taku 手動作業 SoT)

再撮影が要る局面 (UI 変更でスクショが陳腐化 / 審査で撮り直し指示 / demo データの取り違え発覚 等) は本節を上から順に実行して 5 枚を再生成する。

1. `git switch main && git pull`
2. Simulator (iPhone 16 Pro Max, iOS 最新) を起動し、§4 の `xcrun simctl status_bar override` を実行
3. **fresh install**: 既存の `knockon` app データを消す (Simulator メニュー Device > Erase All Content and Settings)
4. `eas build --profile preview --platform ios --simulator` で app を install (or `--profile production` の TestFlight ビルドを実機に流す)
5. Onboarding をスキップ or 通過 (研究タブは非表示のはず = [ADR-0049](../../../decisions/0049-exclude-research-tab-from-release-scope.md))
6. `docs/release/demo-seed/README.md` (別 issue で整備) の手順で **demo チェーン 3 本**を投入し、§3 の達成状態を作る
7. §2 の各画面にタップ遷移
8. 各画面で Cmd+S でスクショ (Simulator メニュー Window > Save Screen)
9. Finder で 5 枚を §1 の命名規約に従って `docs/release/screenshots/6.7/` に保存
10. **サイズ検証**:

    ```sh
    sips -g pixelWidth -g pixelHeight docs/release/screenshots/6.7/*.png
    ```

    全 5 枚が **1290×2796** であることを確認 (Simulator サイズ違い機種で撮っていないか)
11. `git add docs/release/screenshots/6.7 && git commit -m "chore: App Store 6.7\" スクショ再生成 (#224)"`
12. PR 起票 → merge → App Store Connect にアップロード (playbook §3)

## 6. スコープ外 (本 SOP で扱わない)

- **実際の PNG 5 枚の撮影**: 別 issue (#229 ===TASKS=== 3 番目)。本 SOP の §5 を実行して生成する。
- **demo seed 投入手順の詳細**: 別 issue (#229 ===TASKS=== 2 番目) で `docs/release/demo-seed/README.md` に整備。
- **6.5" / 6.9" 追加サイズ**: App Store Connect の自動 scale + Metadata Rejection 時の追い足し (playbook §4.1) に委譲。
- **テキストオーバーレイ / デバイスフレーム装飾**: v1.0 は素の実機スクショで出す。v1.1 で retro 判断 (#229 §7)。
  - ⚠️ **これは Apple の制約ではなく我々の判断**。Apple はテキストオーバーレイ・デバイスフレーム・
    背景装飾を**明示的に許可**している。Guideline 2.3.3 が禁じるのは「アプリに無い機能を売り込む」
    「実際の画面がマーケ素材で隠れる」ことで、装飾の枠そのものではない。
  - ⚠️ **判断の前提が変わった (2026-07-31)**: #229 の時点では「CTR のため」の話だったが、
    2025 年半ばから **キャプション文字が OCR で抽出されランキング signal になっている**
    (先頭 3 枚の重みが最大)。CVR だけでなく**検索順位にも効く**ため、v1.1 送りの根拠は弱まった。
    再撮影する判断をするなら、先頭 3 枚に価値を一言で書いたキャプションを載せる。
- **英語版スクリーンショット / A/B テスト**: 海外展開判断時に別 issue で扱う。

## 参照

- [../../app-store-submission.md](../../app-store-submission.md) §1.1 (playbook・上位 SoT)
- Issue #224 / 提案 Issue #229 (本 SOP の設計根拠)
- [ADR-0029](../../../decisions/0029-theme-mode-light-dark-auto.md) (Light 段階移行未着手 = Dark 固定の追認)
- [ADR-0036](../../../decisions/0036-rescind-today-streak-display.md) (反 streak / (+/-) 判定軸 = 装飾を煽らない根拠)
- [ADR-0047](../../../decisions/0047-settlement-lifecycle-and-log-portfolio.md) (定着ポートフォリオ = カット 3 の state)
- [ADR-0049](../../../decisions/0049-exclude-research-tab-from-release-scope.md) (研究タブ非表示 = 撮影対象外)
- [ADR-0050](../../../decisions/0050-settlement-star-marker-and-today-headline.md) (左ドット星型 / 見出し「定着 N 個」)
- [ADR-0051](../../../decisions/0051-remove-matrix-and-merge-fresh-into-growing.md) (60D / 7D マトリクス撤去 = 構図で狙わない根拠)
