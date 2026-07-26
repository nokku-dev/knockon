# EAS Preview Build アイコン表示検証 チェックリスト

> 対象: Issue #236 (「EAS preview build (iOS/Android) でアイコン表示検証とチェックリスト完走」)
> 提案: nokku-dev/knockon#228 §5
> 位置付け: **アイコンが実機/シミュレータで意図通り表示されることを 1 回確認するための walk-through**。EAS build 実行 + 実機/Simulator 目視確認は自動化不能のため、本ドキュメントを Taku が上から順に実行する。

## 0. 依存タスクの完了確認 (前提)

以下がすべて **main にマージ済み** であることを確認してから開始:

- [ ] Issue #232 (`assets/icon.svg` SVG マスター) — PR #244
- [ ] Issue #233 (`assets/icon.png` / `assets/adaptive-icon.png` PNG 書き出し) — PR #245
- [ ] Issue #234 (`app.json` に `icon` / `ios.icon` / `android.adaptiveIcon`) — PR #246
- [ ] Issue #235 (`docs/release/app-store-submission.md` §1.1 の Expo 統合表記化) — PR #247

未マージのまま本チェックリストを走らせても `assets/*` が無いため EAS build が `Missing app icon` / `Icon not found` 系エラーで失敗する。**#244〜#247 のマージが完了ゲート**。

## 1. 制作段階のチェック (静的検証)

`assets/*` を触らず、既に main にある成果物を目視で確認する。

- [ ] `file assets/icon.png` の出力が `PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced` (= 1024×1024, sRGB, **alpha なし**)
- [ ] `file assets/adaptive-icon.png` の出力が `1024 x 1024` かつ `RGBA` (= alpha あり — 透過あり)
- [ ] Superellipse マスク (半径 22.37%) を適用したプレビュー画像で角の欠けがない
  - 例: `iOS Icon Preview` (macOS) / Figma でマスクをかけて確認
- [ ] 40×40 縮小プレビューで spine の縦線と star の五芒星が判別できる
  - macOS: Finder で assets/icon.png を選択 → プレビュー → 40px 相当に縮小して確認

## 2. Expo 統合段階 (EAS Build)

### 2.1 事前確認

- [ ] `eas whoami` が `nokku` (Owner) を返す
- [ ] `eas.json` の `build.preview.ios.simulator` が `true` (Issue #236 で追加。`npm test -- src/easJsonPreviewIos.test.ts` で機械検証済み)
- [ ] `eas.json` の `build.preview.android.buildType` が `apk`

### 2.2 iOS Simulator 向け preview build

Apple Developer 加入は不要 (`simulator: true` は Simulator 向け .app なので code signing が発生しない)。

```sh
eas build --profile preview --platform ios
# → クラウドで 10-15 分、Simulator 用 .app.tar.gz が生成される
```

- [ ] コマンドがエラーなく完了する
- [ ] ビルドログに `Missing app icon` / `Icon is too small` の警告が出ない
- [ ] ビルドログに `Generating icons for all sizes...` 相当の処理が走っている
- [ ] EAS ダッシュボード (`https://expo.dev/accounts/nokku/projects/knockon/builds`) で成果物をダウンロード可能

### 2.3 Android APK 向け preview build

```sh
eas build --profile preview --platform android
# → クラウドで 10-15 分、apk が生成される
```

- [ ] コマンドがエラーなく完了する
- [ ] ビルドログに adaptive icon 関連の警告が出ない (`Foreground image size mismatch` 等)
- [ ] EAS ダッシュボードから apk をダウンロード可能

## 3. 実機/Simulator 確認段階 (目視)

### 3.1 iOS Simulator

```sh
# ダウンロードした .app.tar.gz を展開
tar -xzf knockon.app.tar.gz  # または EAS が渡す形式に応じて
# Simulator に drop で install
xcrun simctl install booted knockon.app
```

- [ ] iOS Simulator のホーム画面に knockon アイコンが表示される
- [ ] spine の縦線 + 定着 star が判別できる (縮小されても崩れない)
- [ ] 背景が `#16161A` (dark) で、周囲が黒くない (= alpha 抜け起こしていない)
- [ ] Superellipse (22.37%) マスクが正しく適用され、角に描画欠けがない

### 3.2 Android 実機 (可能なら)

`adb install knockon.apk` または端末に転送してタップインストール。

- [ ] Android ホーム画面/ドロワーに knockon アイコンが表示される
- [ ] adaptive icon の foreground (spine + star) が円形/ピル/角丸のマスクいずれでも中央に収まる
  - Android 設定 → 画面 → アイコンの形状 で複数マスクを切り替えて確認 (Pixel 系のみ)
- [ ] 背景色が `#16161A` (`android.adaptiveIcon.backgroundColor`)

### 3.3 iOS 実機 (Apple Developer 加入後にのみ実行可能 — Issue #225 スコープ)

**本 Issue (#236) の preview スコープでは Simulator までで OK**。実機確認は Apple Developer 加入後、production build + TestFlight/Ad-hoc 経由で行う (Issue #225 の App Store 提出プレイブック §2 参照)。

以下は #225 実行時のチェック項目 (先回りリスト):

- [ ] iOS 実機 (可能なら iOS 18 端末) で Light モードで表示崩れなし
- [ ] iOS 18 Dark モードで表示崩れなし
- [ ] iOS 18 Tinted モードで star / grow が視認できる (明度差 74% / 92% で読める想定)
- [ ] iOS 18 Clear (glass) モードで grayscale 化されても star の形が残る

## 4. 失敗時の切り分け

| 症状 | 一次原因の候補 | 対応 |
|---|---|---|
| `Missing app icon` ビルドエラー | `assets/icon.png` が存在しない or `app.json` の `icon` が壊れている | 依存 PR (#245 / #246) の main マージを確認 |
| `Icon must not contain alpha channel` エラー | `assets/icon.png` が RGBA で書き出されている | Issue #233 (PR #245) の作り直し・alpha 除去 (`file` コマンドで再確認) |
| Simulator でアイコンが白 or 透明 | adaptive-icon 経路が iOS 側にも流れている / icon.png がロードされていない | `app.json` の `ios.icon` を明示指定してるか確認 (Issue #234 / PR #246) |
| Android で foreground が円マスクで切れる | adaptive-icon の中央 66% セーフエリアを外れている | Issue #233 (PR #245) で再書き出し |
| `eas build --profile preview --platform ios` が `preview profile has no ios config` で reject | `eas.json` の `preview.ios` が未定義 | Issue #236 で修正済み (本 PR)。`npm test -- src/easJsonPreviewIos.test.ts` で機械検証 |

## 5. 完了条件

- [ ] §1 〜 §3.2 のチェックボックスがすべて埋まる
- [ ] 失敗した項目があれば §4 の切り分け表 or 依存 PR にフィードバックして再走
- [ ] Issue #236 のコメントに Simulator/Android スクリーンショットを添付してクローズ

§3.3 の iOS 実機モード確認は Issue #225 (App Store 提出) の実行フェーズで担保する (本 Issue のスコープ外)。

## 参照

- [提案 #228](https://github.com/nokku-dev/knockon/issues/228) — アイコン設計案 (Motif A: spine + star)
- [App Store 提出プレイブック](./app-store-submission.md) — §1.1 (アイコン組み込み) / §2 (production build → submit)
- [ADR-0007](../decisions/0007-expo-react-native-stack.md) (Expo managed workflow)
- [ADR-0050](../decisions/0050-settlement-star-marker-and-today-headline.md) (定着 = star / アイコン内 star と in-app star の視覚同型)
- [KNOWLEDGE.md K-039](../../KNOWLEDGE.md#k-039) (iOS リリースは `eas build` → `eas submit`、`eas update` ではない)
