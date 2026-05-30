---
id: 0029
date: 2026-05-30
project: knockon
tags: [ux, design, data-model, scope]
status: accepted
supersedes: []
superseded-by: []
---

# テーマカラー Light/Dark + Auto (OS 追従) のユーザー設定化

## 文脈

Issue #53: 「設定画面のテーマカラー選択に Light/Dark 自動切替を追加」。

これまで knockon の UI 色は dark 固定 (`app.json: userInterfaceStyle: 'dark'` / `src/tokens.ts` は dark 値のみ export) で、 [DESIGN-SYSTEM v0.2 §1](../../DESIGN-SYSTEM.md) では Light 列も定義していたが「Light テーマ / 動的テーマ切替は v1 非スコープ」と明示していた。 [PLAN.md §出荷後レイヤー](../../PLAN.md) でも「テーマ」は出荷後レイヤー扱い。

[ADR-0028](./0028-app-settings-and-reset-time.md) で `app_settings` シングルトン行 + ALTER ベース migration (ADR-0027) の枠組みが揃ったため、 「app-wide な動作設定軸の追加コスト」が極小化された。 ユーザー Issue で「OS 設定 (Light/Dark) に追従して欲しい」要望が顕在化したタイミングで、 v1 非スコープ宣言を覆して取り込む。

ただし本 PR の blast radius を抑える観点で、 個別コンポーネント (17 ファイル) の Light レンダリング対応は別 PR に切り出す (= 検証期間 [ADR-0022](./0022-phase-1-completion-and-verification-operation.md) 中の regression リスク低減)。 本 PR は **theme 軸の確立 + system-level (native root bg / StatusBar) の reactive 反映 + 設定 UI** に絞る。

## 検討した選択肢

- **案A: theme_mode を `app_settings` に追加 + ThemeProvider 経由で reactive 反映 (採用)**
  - `app_settings.theme_mode` (`'auto' | 'light' | 'dark'`, default `'auto'`) を MIGRATIONS[6] で ALTER TABLE ADD COLUMN。
  - `src/theme.ts` (純粋関数) に `LIGHT_PALETTE` / `DARK_PALETTE` / `resolveColorScheme(themeMode, osScheme)` を定義。
  - `src/themeContext.tsx` の `ThemeProvider` が root layout で `useColorScheme()` (RN の OS 検知 hook) + DB の `themeMode` を組み合わせて palette を派生。
  - 個別コンポーネントの token 参照 (`COLOR_*` from `tokens.ts`) は本 PR では touch しない (= 17 ファイルの blast radius 回避)。 system-level (= `SystemUI.setBackgroundColorAsync` + `StatusBar` style) のみ resolved scheme に追従。
  - コンポーネント単位の Light レンダリング対応は別 PR で段階移行 (= 各画面ごとに `useTheme()` 経由化)。
- **案B: 1 PR で全 17 コンポーネントを `useTheme()` 経由化**
  - Issue の受け入れ条件「OS 設定に応じてテーマが自動切替わる」を 1 PR で完結。
  - 却下理由: 17 ファイル全体の `StyleSheet.create` を `useMemo` 化 + `useTheme()` 注入の機械的 refactor は ~3000 行の diff になり、 検証期間 ([ADR-0022](./0022-phase-1-completion-and-verification-operation.md)) 中の regression リスクが大きい。 段階移行に分割して 1 画面ずつ確認する方が安全。
- **案C: `userInterfaceStyle: 'automatic'` を app.json に設定するだけ**
  - Expo の native level で OS 追従。 DB に保存しない。
  - 却下理由: (a) ユーザーが「Auto / Light / Dark」を選べない (= OS 追従固定)、 (b) 既存ユーザーへの一括 native 反映だけで JS-side の `COLOR_*` (dark hard-code) と乖離する (= 案 B と同じ blast radius 問題が dark のままで顕在化しない隠れバグになる)、 (c) Issue の受け入れ条件「テーマ選択 UI」を満たさない。
- **案D: `AsyncStorage` で theme_mode を持つ**
  - 却下理由: ADR-0028 で `app_settings` シングルトン行を確立したばかり (= 別永続層に分岐する反復は避ける)。

## 決定

**案A** を採用。

### 実装サマリ

1. **DB schema**: `app_settings` テーブルに `theme_mode TEXT NOT NULL DEFAULT 'auto' CHECK(theme_mode IN ('auto', 'light', 'dark'))` を追加。 `SCHEMA_VERSION = 6`、 `MIGRATIONS[6]` で ALTER TABLE ADD COLUMN (ADR-0027 ALTER 経路)。
2. **`src/settingsRepository.ts`**: `ThemeMode` type 追加。 `getAppSettings` / `updateAppSettings` を themeMode round-trip 対応。 `DEFAULT_THEME_MODE = 'auto'`。
3. **`src/theme.ts`** (新規、 純粋関数): `LIGHT_PALETTE` / `DARK_PALETTE` (DESIGN-SYSTEM v0.2 §1 の Light/Dark 列値)、 `resolveColorScheme(themeMode, osScheme)`、 `paletteFor(scheme)`。 K-007 ドメイン純度維持のため RN / DB に依存しない。
4. **`src/themeContext.tsx`** (新規、 RN 依存): `ThemeProvider` + `useTheme()`。 themeMode + osScheme から palette を派生して Context で配る。
5. **`app/_layout.tsx`**: 起動時に `app_settings.theme_mode` を read → `useColorScheme()` で OS scheme 購読 → `useEffect([themeMode, osScheme])` で `SystemUI.setBackgroundColorAsync(palette.bg)` + StatusBar style を反映 → `ThemeProvider` で配下に palette / `setThemeMode` を提供。
6. **`src/SettingsModal.tsx`**: テーマカラー segmented picker UI (Auto / Light / Dark) を追加。 props を `{ resetTime, themeMode, onSave({ resetTime, themeMode }) }` に拡張。
7. **`app/(tabs)/chains.tsx`**: `useTheme()` で themeMode / setThemeMode を取得して SettingsModal に props 渡し。 `onSave` 内で `useSettings.updateResetTime` + `useTheme().setThemeMode` を順に呼ぶ。

### 非スコープ (本 PR で実装しない、 follow-up)

- 個別コンポーネント (17 ファイル) を `useTheme()` 経由 + `useMemo` で StyleSheet 構築する refactor。 これは別 PR で段階的に進める。 本 PR 時点で `theme === 'light'` を選んでも見た目は dark のまま (= system-level の native root bg と StatusBar style のみ light に切替わる) で、 受け入れ条件「OS 設定に応じてテーマが自動切替わる」は **部分達成**。 完全達成は follow-up PR の積み上げで実現する。

## 理由

- **`app_settings` 軸を再利用**: ADR-0028 で確立した「app 動作設定軸 (= 観測データ軸ではない)」の最初の継続事例。 [ADR-0001](./0001-chain-data-model.md) §決定4 の「正準データは `(ノード, 日付, bool)` のみ」は **ノード達成側** の不変条件で、 themeMode は app 動作設定軸として別カテゴリ ([ADR-0028](./0028-app-settings-and-reset-time.md) §想定される影響 K-015 同型)。 ADR-0001 §決定4 への影響なし。
- **ALTER ベース migration の 2 件目**: ADR-0027 の ALTER 経路が「reset_time に続いて theme_mode を非破壊で追加」の reusability を実証する 2 件目の事例。 検証期間 ([ADR-0022](./0022-phase-1-completion-and-verification-operation.md)) 中のユーザーデータ (チェーン / メトリクス) は保全される。
- **palette の派生計算**: `resolveColorScheme(themeMode, osScheme)` は純粋関数で、 DB に「派生値 (= 現在の resolved scheme)」を保存しない (= [ADR-0001](./0001-chain-data-model.md) §決定4 派生値非保存原則と一貫)。
- **OS scheme reactive 購読**: RN の `useColorScheme()` は内部で `Appearance.addChangeListener` を購読 → OS 設定変更で auto re-render。 `useEffect([themeMode, osScheme])` で副作用 (`SystemUI.setBackgroundColorAsync`) を反映 → Issue 受け入れ条件「OS 設定変更時にリアルタイムで反映される」を満たす (system-level に関しては)。
- **blast radius 制御**: 17 コンポーネントの一括 refactor (案B) は検証期間中の regression リスクが大きい。 案A は theme **軸** だけ確立してコンポーネント refactor は段階移行。 受け入れ条件 #2 / #3 は system-level 部分のみ満たすが、 個別コンポーネントの follow-up で完成する。
- **K-007 純度維持**: `theme.ts` は純粋関数のみ。 RN / DB 依存は `themeContext.tsx` に分離。 `import` グラフで純度が確認できる。
- **K-006 不変条件テスト**: `app_settings` カラム集合 (id / reset_time / theme_mode) + MIGRATIONS[6] の ALTER 動作を `repository.test.ts` で機械検証。

## 想定される影響

- **K-015 (全称禁則の軸別拡張)**: 「正準データは X のみ」全称条文は **ノード達成側の話** という解釈を継続。 `app_settings.theme_mode` は app 動作設定軸として共存。 ADR-0028 と同型の「軸別追加」パターンの 2 件目。
- **K-009 (Expo 依存変更時の 4 ファイル diff)**: 本 PR は `expo install` を使わないので該当しない (= 既存依存だけで実装、 `useColorScheme` は RN core、 `SystemUI` は既存依存)。
- **DESIGN-SYSTEM v0.2 §1**: 「Light テーマ / 動的テーマ切替は v1 非スコープ」のコメントは矛盾するので削除 + 「Light / Dark / Auto 切替可 (ADR-0029)」に書き換え。
- **PLAN.md §出荷後レイヤー**: 「テーマ」項目は出荷前に取り込む判断。 PLAN を 1 行更新 (出荷後リストから除外 + 「ADR-0029 で v1 に取り込み」を追記)。
- **SPEC.md**: theme 設定は SPEC 本文には未記載 (= 表示の細部であり「保存は事実、解釈は関数」の原則と独立)。 ADR で残せば十分、 SPEC 修正は不要。
- **次の follow-up PR**: 17 コンポーネントを `useTheme()` 経由化する PR を 1 画面ずつ刻む (例: PR-EE-1 _layout / SettingsModal 自身、 PR-EE-2 TodayScreen、 PR-EE-3 ChainDetail、 ...)。 個別画面ごとに実機検証で確認可能。
- **将来の設定追加**: ALTER 経路の 3 件目以降も同パターン (MIGRATIONS[N] に ALTER 1 行 + settingsRepository round-trip + UI picker)。

## 関連

- [ADR-0001](./0001-chain-data-model.md): 正準データの「軸」概念。 app 動作設定軸の 2 件目 (K-015 軸別拡張パターン)。
- [ADR-0027](./0027-non-destructive-migration.md): ALTER ベース migration。 本 PR で 2 件目の ALTER step ([MIGRATIONS[6]](../../src/db.ts)) を実装。
- [ADR-0028](./0028-app-settings-and-reset-time.md): `app_settings` シングルトン行 + reset_time。 本 PR で同じ軸に theme_mode を追加。
- [DESIGN-SYSTEM.md §1](../../DESIGN-SYSTEM.md): Light/Dark カラートークン定義 (本 PR で v1 採用)。
