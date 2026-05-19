---
id: 0011
date: 2026-05-19
project: knockon
tags: [library, architecture, navigation]
status: accepted
supersedes: []
superseded-by: []
---

# ナビゲーションに `expo-router` を採用し、ファイルベースルーティングへ移行する

## 文脈

PLAN PR-1.4 で「Today + チェーン一覧」のタブナビゲーションを導入する。Phase 0/1.1-1.3 までは画面 1 つだけ (`App.tsx` 直下に `TodayScreen`) だったが、PR-1.4 から画面が複数になる。

選定基準:

1. **time-to-device 最優先** ([ADR-0007](./0007-expo-react-native-stack.md))。Expo Go で完結する範囲は維持。
2. **Phase 2 でチェーン編集画面が増える前提**。画面が 4-5 個に成長することを見越す。
3. **コード上で「どの画面が存在するか」が一目で分かる構造**。レビューワー (自分含む) が新しい Phase に入ったとき迷わない。
4. **既存の `App.tsx` / `TodayScreen` / domain 層を破壊しない**。データ層は [ADR-0001](./0001-chain-data-model.md) の正準を維持。

## 検討した選択肢

- **案A（採用）**: **`expo-router`** (file-based routing)。`app/` 配下のファイル構造がそのままルーティングになる。Expo SDK 54 の新規プロジェクトのデフォルト。Bottom Tabs / Stack / Modal を子レイアウトで宣言。
- **案B（却下）**: **`@react-navigation/native` + `@react-navigation/bottom-tabs`** (命令的)。`NavigationContainer` の中に `BottomTabNavigator` を JSX で組む従来パターン。
- **案C（却下）**: **画面切替を `useState` で自前管理**。ナビライブラリなし。`view: 'today' | 'list'` の単純切替。
- **案D（却下）**: **`expo-router` の Stack を使い、Tabs は使わない**（Today から push でチェーン一覧を開く）。

## 決定

案A を採用する。具体的に以下を固定する:

1. **`expo-router` を導入**。`package.json` の `main` を `expo-router/entry` に書き換え、`app.json` の `plugins` に `expo-router` を追加。`scheme` を `knockon` で固定。
2. **`app/` ディレクトリ構造**:
   - `app/_layout.tsx`: 全アプリ共通のルートレイアウト（`SafeAreaProvider` / `StatusBar` / `SystemUI.setBackgroundColorAsync`）。
   - `app/(tabs)/_layout.tsx`: Bottom Tabs 設定（Today / チェーン）。
   - `app/(tabs)/index.tsx`: Today 画面。`src/TodayScreen` を呼ぶ。
   - `app/(tabs)/chains.tsx`: チェーン一覧画面。`src/ChainListScreen` を呼ぶ。
3. **データ層と presentation の分離維持**: 起動時の DB 初期化 + シード投入は `app/_layout.tsx` で 1 回だけ行う（singleton 想定、[ADR-0008](./0008-test-strategy-ts-jest-bettersqlite.md) の DB ハンドル singleton と整合）。各画面は domain 層 + repository を直接呼んで描画。
4. **`App.tsx` は削除**。`expo-router/entry` がエントリポイントになる。
5. **Phase 2 で画面が増える場合は `app/` 配下にファイルを足すだけ**。`app/chain/[id].tsx` のような動的ルートも自然に追加可能。
6. これは v1 確定事項。覆す場合は本 ADR を `superseded` にする新規 ADR が必要。

## 理由

- **time-to-device を維持**: `expo-router` は SDK 54 の Expo Go に同梱されており、Dev Build 不要 ([ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) 早期検証ゲート遵守)。
- **画面構造がファイル構造で見える**: 案B の命令的ナビは `NavigationContainer` 内の JSX を追わないと画面構成が分からない。`expo-router` なら `ls app/` でアプリの画面一覧が見える。Phase 2 で画面が増えるほど効果が出る。
- **SDK 54 の標準**: Expo SDK 53 から `expo-router` が新規プロジェクトのデフォルト。長期的に `@react-navigation` 直叩きより推奨経路にあり、ドキュメント・コミュニティサポートも厚い。
- **`@react-navigation` をラップしているだけ**: `expo-router` 内部は `@react-navigation` を使っている。後で「やはり命令的に書きたい」と判断した場合、ラップを剥がして案B 相当に降りるのはそれほど大きなコストではない（ただし `app/` ディレクトリ廃止になる）。
- **案C を却下する理由**: `useState` 切替は Phase 1.4 だけなら成立するが、Phase 2 でモーダル / ネストルート / 戻る動線が出てきた瞬間に破綻する。Phase 1 で「ナビライブラリを後で入れる」を選ぶと PR-1.4 の作業が二度手間になる。
- **案D を却下する理由**: Stack だけで Today → 一覧をプッシュする構成は、Phase 2 で画面数が増えると深いスタックになり「戻るたびに毎回 Today に戻る」体験が苦しい。Bottom Tabs で並列に置く方が、複数画面を行き来する Phase 2 までの拡張に強い。

トレードオフ:
- 既存 `App.tsx` を削除して `app/` ディレクトリへ移行するコストが発生する（PR-1.4 着手時に 1 回だけ）。
- `expo-router/entry` がエントリポイントになるため、`main: node_modules/expo/AppEntry.js` を書き換える必要がある。SDK 54 公式が推奨する書き換えなので追従コストは小さい。
- jest-expo のテスト構成で `expo-router` のモック設定が必要になる可能性。最初の RN コンポーネントテストは `TodayScreen.test.tsx` のように画面コンポーネント単体を直接テストしているため、ルーティングを跨ぐテストを書かない限り影響しない。
- ファイルベース命名のため `app/(tabs)/chains.tsx` のような括弧入りディレクトリ名 (route group) が初見で読みにくい。慣れの問題。

## 想定される影響

- **同 PR で同期更新が必要**:
  - `package.json`: `main` を `expo-router/entry` に変更、`expo-router` を依存追加
  - `app.json`: `plugins` に `expo-router` を追加、`scheme: "knockon"` を追加
  - `App.tsx` を削除
  - `app/` ディレクトリ新設
  - [CLAUDE.md](../../CLAUDE.md) §技術スタック / §ディレクトリ構成に `expo-router` を 1 行追記
- **Phase 1.4 着手時の作業**: `expo install expo-router react-native-screens react-native-safe-area-context` (後 2 つは依存、すでに `safe-area-context` は導入済み)。Bottom Tabs アイコンは `@expo/vector-icons` (Expo Go 同梱) を使う。
- **既存 ADR との整合**: [0007](./0007-expo-react-native-stack.md) (Expo 採用) / [0006](./0006-phase1-completion-and-scope-narrowing.md) (早期検証ゲート) と整合。supersede 関係なし。
- **後で覆すコスト**: `app/` ディレクトリを削除して `App.tsx` + `@react-navigation` の命令的構成に戻すコストは、Phase 1 規模 (画面 2-3 個) なら 1 日で済む。Phase 2 以降になると画面が増えるほど移行コストが上がる。覆す場合は本 ADR を `superseded` にする新規 ADR が必要。
- **K-009 適用**: 本 PR は `expo install expo-router` で `package.json` / `app.json` / (場合により) `babel.config.js` の複数ファイルが書き換わる典型ケース。4 ファイル diff チェックを徹底する。
