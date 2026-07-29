# App Store 審査提出プレイブック (最小リリース / iOS 先行)

> 対象: Issue #225 (「App Store 審査提出対応（最小リリース）」)
> 根拠: vault `decision-20260721-knockon-minimal-release-q1` (iOS 先行・Q1 内・スコープフリーズ)
> 位置付け: **このドキュメントは実行手順の SoT**。Claude Code エージェントは提出そのものを自律実行できない (Apple Developer 認証 / Xcode / App Store Connect UI 操作を要する) ため、本ドキュメントを Taku が上から順に実行することで審査提出を完了させる。

## 0. iOS 通電に関する内部整合

`TODO.md` は「iOS は Android 版 v1 出荷判断の手前までスルー」と書いている (2026-05-19 判断)。一方 vault の `decision-20260721-knockon-minimal-release-q1` は「iOS 先行・Q1 内」への方針転換を含む。**後者 (2026-07-21) が新しく、こちらを優先する**。TODO.md の当該節はリリース完了後に retro で更新する (本 PR では触らない)。

## 1. 提出前チェックリスト (ゲート条件)

**すべて ✅ にならないと審査提出できない。**

### 1.1 アセット / 素材

- [ ] **アプリアイコン**: 1024×1024 マスター (App Store 用) を Expo `app.json` 経由で組み込み (Issue #223 / 提案 #228)
  - `assets/icon.png` (1024×1024, sRGB, alpha なし PNG) を配置
  - `app.json` に `expo.icon` / `expo.ios.icon` / `expo.android.adaptiveIcon` を設定
  - iOS 端末サイズセット (20/29/40/60pt @2x/@3x + 1024 marketing) は **EAS Build がマスター 1 枚から自動生成**する (Expo managed workflow / [ADR-0007](../decisions/0007-expo-react-native-stack.md)・`ios/knockon/Images.xcassets/AppIcon.appiconset/` を手動で触らない)
  - 検証: `eas build --profile preview --platform ios` が `Missing app icon` / `Icon is too small` 警告なしで通ること
- [ ] **スクリーンショット**: iPhone サイズ要件を満たす (Issue #224)
  - 必須: 6.7" (1290×2796) — iPhone 15/16 Pro Max 等
  - 推奨: 6.5" (1284×2778 or 1242×2688) — Fallback として App Store Connect が要求する場合あり
  - 撮影対象画面 (最低 3-5 枚):
    - Today (メイン画面・チェーンカード 3-4 本並んだ状態が理想)
    - Today > ChainDetail (Bottom Sheet 展開状態・スパイン + ノード列が見える)
    - チェーン一覧 (active タブ)
    - ログ (定着ポートフォリオ・「定着 N・もう少しで定着 P・育成中 M」見出しが見える)
    - 設定 or チェーン編集 (任意)
  - リポジトリ格納: `docs/release/screenshots/6.7/` 配下 (git 管理)
  - 検証: 実機で撮影後、Preview で寸法を確認

### 1.2 掲載情報 (App Store Connect フォーム)

- [ ] **アプリ名**: `knockon`
- [ ] **サブタイトル (30 字)**: 例)「積み上がる線で続く習慣」 (要調整)
- [ ] **カテゴリ**: プライマリ = `ライフスタイル` or `ヘルスケア/フィットネス` (要判断)
- [ ] **プロモーションテキスト (170 字)**: リリース後に変更可
- [ ] **説明文 (4000 字)**: 差別化 = If-Then / habit stacking + 反 streak + Celebrate 主。SPEC.md §1 を要約
- [ ] **キーワード (100 字)**: `習慣, ルーティン, if-then, 継続, タスク, モーニング, ナイト, 積み上げ, 定着, チェーン`
- [ ] **サポート URL**: 必須 (GitHub の Issue ページ or 独立サイト)
- [ ] **マーケティング URL**: 任意
- [ ] **著作権表記**: `© 2026 nokku`
- [ ] **年齢制限**: 4+ (該当なし多め)

### 1.3 プライバシー / 法務

- [x] **プライバシーポリシー URL**: **https://legal.nokku.dev/knockon/privacy** (Issue #255・**公開済み / 200 確認済み**)
  - ホスティングは **`nokku-dev/legal` (private repo) + Cloudflare Workers (static assets) + 独自ドメイン `legal.nokku.dev`**。
    当初 GitHub Pages + public repo で作ったが、repo は README・コミット履歴・Issue を含む公開の作業場であり、
    公開すべき HTML 以外まで露出するため作り直した。Cloudflare Pages は **無料プランで private repo から配信できる**
    ため、public repo を建てる必要が無い。配信範囲は repo の `wrangler.jsonc` の `assets.directory` で
    `site/` に固定しており、README 等の内部情報は配信されない。手順は `nokku-dev/legal` の README 参照
  - ⚠️ **URL に `.html` は付けない**。Cloudflare が拡張子なしへ 307 リダイレクトするため、上記が正規形
  - 内容の根拠: ADR-0001 (ローカル正準) / ADR-0003 (OS ジオフェンス・有料地図 API 不可) / ADR-0024 §3c (Notion 連携は任意)
  - **実装の事実確認済み**: `grep -rn "fetch(\|XMLHttpRequest\|sendBeacon\|axios\|WebSocket" src app` の結果、
    アプリ全体でネットワーク通信は `src/notionClient.ts` の `api.notion.com` **1 箇所のみ**。
    analytics / crash reporting / 広告 SDK は `package.json` に一切無い。
    さらに production build は Notion の secret 未注入で `isNotionConfigured()` が false になるため、
    **出荷バイナリは外部通信を一切行わない** (Issue #259 の判断待ち。案 A 以外を採る場合はポリシー §5 の改訂が必要)
- [ ] **プライバシー計測ラベル**: App Store Connect の Privacy Nutrition Label
  - **これはドキュメントではなく ASC 内のアンケートフォーム**。§1.3 のポリシー URL とは別物で、
    埋めないと提出できない。所要 5 分程度 (全項目「収集しない」で回答)
  - Data Collected: **None** (SQLite ローカルのみ、外部送信なし。上記の grep 結果が根拠)
  - Notion 連携は「ユーザー自身が設定した ID/token でユーザーのワークスペースにのみアクセス」なので開発者側のデータ収集ではない
- [x] **利用規約 URL**: **https://legal.nokku.dev/knockon/terms** (Issue #255・**公開済み / 200 確認済み**)
- [ ] **輸出コンプライアンス**: 暗号化を使わないなら `ITSAppUsesNonExemptEncryption=false` を Info.plist に。**HTTPS のみでカスタム暗号を使っていないので false でよい** (Notion API 呼び出しは標準 HTTPS)

### 1.4 権限文言 (Info.plist)

以下の権限を要求する場合、App Store 審査で拒否されないためユーザー向け文言が必要:

- [x] `NSLocationAlwaysAndWhenInUseUsageDescription`: 場所アンカー用ジオフェンス (Issue #254)
  - 「場所アンカー機能で、指定した場所に到達したときにチェーンを提案するために使用します。」
- [x] `NSLocationWhenInUseUsageDescription`: 場所登録時の現在地取得 (Issue #254)
  - 「アンカーとして登録する場所の座標を取得するために使用します。」
- **設定場所**: `app.json` の `plugins` に `expo-location` を options 付きで登録する (Issue #254)。
  expo-location の config plugin は `expo-module.config.json` に宣言が無いため **明示登録しないと適用されない**。
  未登録だと Info.plist に usage description が入らず、`src/location.ts` の `requestLocationPermission()`
  (AnchorEditor の「現在地を取得」) を呼んだ時点で iOS がアプリを即時終了する。
  `NSLocationAlwaysUsageDescription` を含む 3 キーは plugin の既定値により**必ず書かれる**ので、
  英語の既定文言が漏れないよう 3 つとも日本語で指定する。回帰は `src/appJsonLocationPlugin.test.ts` で固定。
  `isIosBackgroundLocationEnabled` は**立てない** (バックグラウンド発火は Phase 1.6b で未実装・
  `UIBackgroundModes` に `location` が入ると審査で説明できない)。
- [ ] **通知権限** (`expo-notifications`): 初回起動時にプロンプト
  - 文言は OS 標準のもの (追加設定不要)

## 2. ビルド & アップロード手順

### 2.1 前提

- [ ] Apple Developer Program 加入済み (`$99/年`)
- [ ] App Store Connect でアプリレコード作成済み (`co.nokku.knockon` バンドル ID)
- [ ] `eas login` 済み (`nokkus-org` owner)
- [ ] EAS credentials (iOS Distribution certificate + Provisioning profile) 設定済み
  - 初回は `eas credentials` で対話設定 or 自動生成に任せる

### 2.2 プロダクションビルド

```sh
# 1. app.json の version をリリース版に更新 (例: 0.1.0 → 1.0.0)
# 2. iOS プロダクションビルド
eas build --profile production --platform ios
# → EAS のクラウドでビルド。 20-30 分。 出来上がると .ipa が生成される
```

**ビルド前確認事項**:
- [ ] `app.json` の `version` が正しい (App Store は semver 準拠)
- [ ] `ios.bundleIdentifier` = `co.nokku.knockon` (App Store Connect と一致)
- [ ] `ios.buildNumber` は EAS の `appVersionSource: "remote"` で自動採番される (`eas.json` の設定済み)

### 2.3 App Store Connect へアップロード

```sh
# 3. eas submit で TestFlight/審査候補にアップロード
eas submit --profile production --platform ios --latest
# → 直近のプロダクションビルドを App Store Connect にアップロード
```

`eas.json` の `submit.production.ios` に Apple ID / ASC App ID / Team ID を設定していない場合は対話で入力を求められる。**secret を repo にコミットしないため対話入力を選ぶ** (envs は `eas.json` 直書きしない・PR-Z3 の Notion secret と同型)。

## 3. App Store Connect 提出フォーム

Web (https://appstoreconnect.apple.com/) でアプリを選び「App Store」タブから:

- [ ] **バージョン情報**
  - スクリーンショット (6.7" / 6.5") をアップロード (§1.1)
  - 説明文・キーワード・サポート URL・マーケティング URL (§1.2)
- [ ] **ビルド**: §2 でアップロードしたビルドを選択
- [ ] **年齢制限アンケート**: 全項目「なし」で回答 (該当機能なし)
- [ ] **App Review 情報**:
  - 連絡先メールアドレス
  - デモアカウント: **不要** (ログイン機能なし)
  - メモ: 「ローカル完結のオフライン習慣アプリ。初回起動 → チェーン作成 → Today でタップ達成、が主要フロー。Notion 連携は任意で、未設定時は非表示になる」
- [ ] **バージョンリリース**: 「手動でリリース」を選択 (審査通過後にリリースタイミングをコントロールできる)
- [ ] **輸出コンプライアンス**: `ITSAppUsesNonExemptEncryption=false` の宣言 (§1.3)
- [ ] **審査提出ボタン** をクリック

## 4. リジェクト時対応プレイブック

Apple のリジェクトは Resolution Center 経由でメッセージが届く。よくあるパターンと対応:

### 4.1 Guideline 2.1 - Information Needed / Metadata Rejection

**症状**: メタデータ (説明文・スクリーンショット・キーワード) の問題。

**対応**:
1. Resolution Center のメッセージを読む (何が問題か具体的に書かれている)
2. App Store Connect の該当メタデータを直接修正 (再ビルド不要)
3. Resolution Center で返信 + 修正を保存 → 再審査依頼

### 4.2 Guideline 4.0 - Design / Minimum Functionality

**症状**: 「機能が薄い」と判定される (Web ラッパー的 / 単純すぎ)。

**対応**:
- knockon は If-Then / habit stacking の独自差別化があるので、App Review 情報のメモに「Gollwitzer & Sheeran 2006 の implementation intentions 理論に基づく設計」と根拠を追記して再提出
- スクリーンショットにテキストを載せて価値を明示する (次サイクルで反映)

### 4.3 Guideline 5.1.1 - Privacy / Data Collection

**症状**: Privacy Nutrition Label と実装の乖離を疑われる。

**対応**:
1. コード確認: `grep -r "fetch\|axios\|sendBeacon" src/` で外部送信箇所を洗い出す
2. Notion 連携以外にネットワーク送信がないことを Resolution Center で説明
3. Notion 連携について「ユーザーが自分の API token を設定した場合のみ、そのユーザー自身のワークスペースに対してアクセスする」と明記

### 4.4 Guideline 4.5.4 - Push Notifications

**症状**: 通知を advertising や data collection に使っていないか確認される。

**対応**: 「ローカル通知のみ (`expo-notifications` の scheduleNotificationAsync)。サーバー push は使用していない」と明記。ADR-0019 / ADR-0042 の該当箇所を参照 URL として提示。

### 4.5 Guideline 2.3.3 - Screenshots

**症状**: スクリーンショットが「実機で撮ったものではない (モックアップ) / 機能を反映していない」と判定される。

**対応**: **実機の Screenshot 機能** で撮ったものだけを使う (フレームや文字入れの過剰装飾は避ける)。Issue #224 の撮影方針として「素の実機スクリーンショット + 最小のテキスト overlay」に固定する。

### 4.6 一般対応原則

- **1 サイクル 1 論点**: 複数指摘があっても、返信は論点ごとに分けず、修正版を 1 回で出す (往復回数を減らす)。
- **Metadata Rejection と Binary Rejection の区別**: Metadata 修正は再ビルド不要 (App Store Connect の入力欄直接修正 → 再提出)。Binary 修正は `eas build` から再実行必要 (§2.2)。
- **リジェクト回数の受容範囲**: 初回リリースで 1-2 回のリジェクトは想定内。3 回以上が予想される論点 (機能不足など核心的な指摘) を受けたら、リリース自体を延期して機能側の対応に回す判断も選択肢に入れる ([K-004](../../KNOWLEDGE.md) の「完成ゲートをコア体験に置く」原則の延長)。

## 5. 提出後の運用

- [ ] **審査ステータスを 1 日 1 回確認** (App Store Connect の Activity 画面 or EAS の web dashboard)
- [ ] 通常審査所要 24-48 時間、混雑時は 3-7 日
- [ ] Approved になったら **手動リリース** ボタンで公開 (§3 のバージョンリリース設定に依存)
- [ ] リリース直後の crash rate / ratings を watch (App Store Connect の Metrics で確認)

## 6. スコープ外 (本 PR で扱わない)

- **アイコン制作そのもの** (Issue #223)
- **スクリーンショット撮影・加工** (Issue #224)
- ~~**プライバシーポリシー / 利用規約の文面作成**~~ → Issue #255 で完了 (`nokku-dev/legal` private repo)
- **App Store Connect アプリレコードの作成** (Taku の Apple Developer 環境で手動作業)
- **サブスク / IAP 設定** (ADR-0048 で「無料出荷・サブスク先送り」を確定・v1 非スコープ)
- **Android 版の Play Store 提出** (別 issue が必要になった時点で本ドキュメントを Play Store 版に応用する)

## 7. 依存タスクの完了確認

本ドキュメントの §1 チェックリストを完走するには、以下の Issue が完了している必要がある:

- [x] Issue #223 (アプリアイコン制作) — 完了 (#231〜#236)
- [x] Issue #224 (App Store スクリーンショット制作) — 完了 (#237〜#239)。6.7" のみで確定
      ([screenshots/6.7/README.md](screenshots/6.7/README.md) §0。6.5" / 6.9" は ASC の自動 scale と
      Metadata Rejection 時の追い足し §4.1 に任せる)
- [x] プライバシーポリシー / 利用規約 / サポート URL のホスティング — Issue #255 で完了。
      `legal.nokku.dev` の 3 URL すべて 200 / TLS 証明書発行済みを確認
- [ ] `support@nokku.dev` の Cloudflare Email Routing 設定。サポートページとプライバシーポリシーが
      この宛先を公開しているため、**転送設定が無いと問い合わせが届かない**。審査提出はブロックしないが
      リリース前に必要
- [x] Issue #254 (iOS 位置権限文言) — 完了。**未対応のまま production build を焼くと実機でクラッシュする**ため §2 の前に必須だった
- [ ] Issue #256 (掲載情報の原稿確定 → [store-listing.md](store-listing.md))
- [ ] Issue #259 (Notion 連携を v1 で有効にするかの判断)。案 A 以外を採る場合、
      §1.3 のプライバシーポリシーと Privacy Nutrition Label の記述を改訂する必要がある
- [ ] App Store Connect アプリレコード作成 (手動作業・Issue 起票不要)
- [ ] Apple Developer Program 加入 (手動作業・**リードタイムが読めないため最優先で着手**)

これらが完了するまでは本ドキュメントは「実行待ち」状態として存置する。§1 のチェックボックスを全て埋められる状態になったら、Taku が上から順に手動実行して審査提出まで到達させる。

## 参照

- [Apple: App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Expo: iOS Deployment](https://docs.expo.dev/submit/ios/)
- [EAS Submit reference](https://docs.expo.dev/eas/submit-reference/introduction/)
- [ADR-0007](../decisions/0007-expo-react-native-stack.md) (Expo 採用)
- [ADR-0017](../decisions/0017-expo-dev-client-migration.md) (Dev Client 移行)
- [ADR-0048](../decisions/0048-release-monetization-free-launch.md) (無料出荷・サブスク先送り)
- [TODO.md §iOS](../../TODO.md) (iOS 通電タイミング — 本方針転換で更新予定)
