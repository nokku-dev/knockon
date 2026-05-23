---
id: 17
date: 2026-05-23
project: knockon
tags: [architecture, deployment, library]
status: accepted
supersedes: []
superseded-by: []
---

# Expo Go から Dev Client (EAS Build) に移行する (Android 先行)

## 文脈

Phase 1 検証期間 ([ADR-0006 早期検証ゲート](0006-phase1-completion-and-scope-narrowing.md)) に入り、「Today を実機で数日継続して回す」段階で、毎朝アプリを開く動線を補強する**ローカル通知** (`expo-notifications`) を Phase 1.5b で実装する必要が出てきた。

`expo-notifications` SDK 53/54 では「ローカル通知は Expo Go では動かなくなった」(SDK 53 のリリースで Expo Go から削除)。

K-008 で予告済みの判断点に到達した: 「Phase 1.5/1.6 で時刻/場所アンカーを実装した後に SDK 強制移行が来ると壊れる可能性が高いため、その時点で EAS Dev Build への移行判断を再評価する」。

加えて、Expo Go は Play Store / App Store 経由の自動更新でいつでも SDK を上げる外圧があり、プロジェクト SDK を pin したまま安定運用するには Dev Client (= 自前 SDK バージョン管理) が必須。

## 検討した選択肢

- **案 A**: Expo Go のまま継続し、通知機能を諦める — Phase 1 完成判定 ([ADR-0006](0006-phase1-completion-and-scope-narrowing.md)) で「Today を毎朝開く」動線が成立しない可能性。Augmentation 原則と矛盾 (ユーザーが自力で「アプリを開く時間」を覚えていないといけない)。
- **案 B**: Dev Client (`expo-dev-client`) + EAS Build に移行 — managed workflow を維持しつつ自前 SDK バージョン管理、ローカル通知が動く。`eas build --profile development --platform android` で apk を作って実機にインストール、`npx expo start --dev-client` で開発サーバ起動。
- **案 C**: bare workflow に降りる — Android Studio / Xcode の全機能を握る代わりに、ネイティブ設定の保守責任を全部抱える。 [ADR-0007](0007-expo-react-native-stack.md) で「bare workflow へ降りるのは Phase 1 実使用で障害が出た場合のみ」と明示済み。Phase 1.5b の障害は managed workflow の範囲で解決可能なので、 bare には降りない。
- **案 D**: Expo Application Services (EAS) を使わず、自前で apk をビルドする — 学習コスト / メンテコストが高すぎる。 EAS Free tier で十分。

## 決定

**案 B** (Dev Client + EAS Build) を採用。Android 先行で進める (iOS は CLAUDE.md / [TODO](../../TODO.md) 方針で「Android v1 出荷判断の手前まではスルー」)。

具体:
- `expo-dev-client@~6.0.13` を追加 (`devDependencies` ではなく `dependencies`、 native module のため)
- `eas.json` の `development` プロファイルに `android.buildType: 'apk'` を明示 (デフォルトは aab で実機 sideload 不可)
- EAS Build 実行 (`eas build --profile development --platform android`) は本 PR 完了後にユーザーが手動実施
- 実機インストール後、`npx expo start --dev-client` で開発サーバを起動し、Expo Go ではなく Dev Client から接続

## 理由

- **時間最優先**: 案 B は managed workflow を維持し、 native 設定を抱えない。実装着手から実機到達まで 1-2 時間。
- **SDK pin が可能**: K-008 で予告した「Expo Go の外圧更新」リスクから解放される。 SDK バンプは自分のペースで実施 ([K-009](../../KNOWLEDGE.md) の 4 ファイル diff チェックリスト遵守)。
- **expo-notifications + ローカル通知が動く**: Phase 1.5b-2 (次 PR) の前提が満たされる。
- **iOS 移行の準備**: 後日 iOS Dev Build を追加するときも `eas build --profile development --platform ios` を実行するだけ。`eas.json` の `ios.simulator: true` は既に入っている。
- **Phase 1 N=1 で EAS Free tier に収まる**: Free tier は月 30 ビルドまで。Phase 1 検証期間中はこれで十分。Phase 2 で頻度が上がったら課金 ($19/月 = Production tier) を判断。

## 想定される影響

### 即時の影響

- **ローカル開発フローが変わる**: Expo Go アプリで開いていたものを Dev Client (専用 apk) に切り替える。 Expo Go は今後使わない。
- **初回 build に 10-15 分** (EAS Build キュー次第)。本 PR の merge 後にユーザーが `eas login` → `eas build --profile development --platform android` 実行。
- **`expo-dev-client` 追加で `package.json` に 1 行追加**。 native module だが managed workflow なので prebuild 不要。

### 将来の覆すコスト

- **case 1 (Expo Go に戻したい)**: `expo-dev-client` を `npm uninstall`、`eas.json` から development プロファイル削除。所要 5 分。ただし Phase 1.5b-2 (通知) を実装すると Expo Go では動かないので、 通知も同時に剥がす必要がある。
- **case 2 (bare workflow に降りる)**: ADR-0007 の判断点に従い別 ADR で記録。 `npx expo prebuild` で `android/` / `ios/` ディレクトリを生成し、 EAS Build は使い続けられる。 native module の手動管理が始まる。
- **case 3 (iOS 追加)**: `eas.json` の `development.ios` 設定は既にあるので、`eas build --profile development --platform ios` を実行するだけ。Apple Developer Program ($99/年) 課金が前提。

### 注意点

- **Dev Client は production と異なる**: Dev Client は内部に hot reload 等の開発機能を含むため、配布 (production build) には使えない。 Phase 1 出荷時は `eas build --profile production --platform android` で別 build を作る必要がある (Phase 2 以降の判断点)。
- **EAS の app slug は固定**: `app.json` の `slug: "knockon"` と `eas.json` のプロジェクト紐付けが必要。 EAS への登録 (`eas project:init`) は本 PR 完了後に実施 (`eas.json` の `cli.appVersionSource: "remote"` のため)。
- **`react-dom` peer dependency**: `expo install` 内部の npm install が strict peer mode で `react@19.1.0` vs `react-dom@19.2.6` 不整合で失敗する。本 PR では `npm install --legacy-peer-deps` で回避。 K-009 系の落とし穴で、将来別の `expo install` でも同じ問題が起きうる。

### EAS owner の選定: `nokkus-org` (組織) を採用

`eas whoami` で `nokku` (個人) と `nokkus-org` (組織) の両方 Owner ロールを持つ状態だった。 `app.json` に `expo.owner: "nokkus-org"` を明示して、初回 `eas project:init` で owner プロンプトが出ないようにする。

組織 (`nokkus-org`) を選んだ理由:
- bundle ID が既に `co.nokku.knockon` で組織ドメイン前提
- GitHub も `nokku-dev` org に置いており、 Expo も組織アカウントに揃えると整合
- Phase 2 以降で複数 dev / AI agent / 別ロールが触る場合に権限管理しやすい
- 個人アカウントから組織への移管は手動操作で面倒、逆方向はもっと面倒。前倒しで組織に置くほうが将来の覆すコストが低い

将来 `nokku` (個人) に戻すケース: Expo dashboard で「Transfer project」を手動操作。コスト中。
