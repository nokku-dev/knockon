---
id: 0031
date: 2026-06-01
project: knockon
tags: [ux, scope, data-model, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# onboarding (初回ルート) の 7 ステップ実装と通知拒否フォールバックの確定

## 文脈

Issue #72: テンプレ onboarding (状態扉 7 ステップ + 通知拒否フォールバック)。SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §5。

> 補足 (#106 / [ADR-0035](./0035-onboarding-action-selection.md)): 本 ADR では step 4 を「固定セット (starter×defaultOn) 一括採用」としたが、ADR-0035 で **アクション選択式** に改定した (starter モジュールのアクションを既定 ON で取捨選択)。それ以外の構造 (7 ステップ / 通知拒否フォールバック / onboarding_completed ゲート / 2 本目は既定セット) は本 ADR のまま不変。

discovery (#70/#71, [ADR-0030](./0030-template-module-link-data-model.md)) で「テンプレ束を選んで採用する」フローは整った。onboarding は「初回起動でアプリを最初に触る瞬間」を、状態ゴール扉だけに絞った 1 画面 1 決定の連続で設計する。

load-bearing な前提が 2 つある (SPEC §5): **アンカー時刻設定** と **通知許可**。どちらか欠けるとチェーンが自動発火せず「初日に死ぬ」。一方で SPEC §8 で「通知拒否時のフォールバック (アプリ内アラーム / 手動起動)」が未解決事項として残っていた。

## 検討した選択肢

### 通知拒否フォールバック (SPEC §8 の宿題)

- **案A: Today 常時表示をフォールバックとする (採用)**
  - [ADR-0020](./0020-deprecate-manual-firing-concept.md) で確定済みの「Today を開けば active チェーンが全部並び、ノードタップだけで運用が成立する」を正式なフォールバックとする。
  - onboarding の通知ステップで拒否されたら「通知が無くても Today を開けば実行できる」と明示するだけ。新規インフラ不要。
- **案B: アプリ内アラーム機構を新規実装**
  - アプリ起動中のみ動くリマインダ。却下理由: バックグラウンドで鳴らせない構造的制約があり、「初日に死なない」要件を満たさない。実装コストに対して便益が薄い。
- **案C: 両方 (明示 + 簡易アラーム)**
  - 却下理由: 案A で要件 (初日に発火経路がある) が満たされる。アラームは Phase 2 以降に観測してから判断 (= K-001「実リスクに触れない作業を増やさない」)。

### 初回判定 (新規ユーザーだけ onboarding へ)

- **案A: app_settings に onboarding_completed フラグ + 既存ユーザーは migration で 1 (採用)**
  - 新規ユーザー (`user_version=0` 経路) は SCHEMA_SQL の DEFAULT 0 で起動 → /onboarding へ誘導。
  - 既存ユーザー (ALTER 経路) は MIGRATIONS[8] で `UPDATE ... SET onboarding_completed = 1` = 既にチェーンを持っているので onboarding を出さない。
- **案B: チェーン 0 件かどうかで判定**
  - 却下理由: 「全チェーンを削除した既存ユーザー」が onboarding に落ちる誤爆。意図 (= 一度通したか) と乖離。明示フラグの方が状態が 1 つに定まる。

### 2 本目 (もう一方の moment) のアンカー時刻

- **案A: デフォルト時刻で採用し、調整は採用後のチェーン編集に委ねる (採用)**
  - onboarding の floor は 1 チェーン。2 本目は opt-in なので時刻設定ステップを増やさず、`DEFAULT_ANCHOR_TIMES` で採用する。
- **案B: 2 本目も時刻設定ステップを通す**
  - 却下理由: ステップが増え「1 画面 1 決定の連続」が冗長になる。2 本目は任意追加なので、まず動くものを入れて編集に回す方が K-031 (初日に折れさせない) と整合。

## 決定

**通知拒否フォールバック = 案A (Today 常時表示)**、**初回判定 = 案A (onboarding_completed フラグ)**、**2 本目 = 案A (デフォルト時刻)** を採用。

- 純粋ドメイン層 `src/onboarding.ts`: 7 ステップ順序 (`ONBOARDING_STEPS`) / 進捗 (`stepProgress`) / 線形遷移 (`nextStep` / `prevStep`) / 朝夜 2 択 (`ONBOARDING_MOMENTS` / `otherMoment`) / デフォルト時刻 (`DEFAULT_ANCHOR_TIMES`) / 時刻アンカー付き採用ドラフト生成 (`buildOnboardingAdoption`)。すべて DB/UI 非依存 (K-007)。
- `adoptChainDraft` に `anchorSpec` 引数を追加 (省略時は従来の behavior アンカー = discovery 無変更)。onboarding は `{ kind: 'time', time }` を渡す = load-bearing な「アンカー時刻」。
- `app_settings.onboarding_completed` を SCHEMA_VERSION = 8 で追加。新規 DEFAULT 0 / 既存ユーザーは MIGRATIONS[8] で 1。
- 画面: presentation `OnboardingScreen` (props 駆動・RTL テスト可) + hook `useOnboarding` (catalog ロード / 採用 / 通知許可 / 完了フラグ書込) + route `app/onboarding.tsx`。
- ゲート: `app/_layout.tsx` で起動時に `onboarding_completed=false` なら `/onboarding` に replace 遷移。完了 (`complete()`) でフラグ true → `/(tabs)` に replace。

## 理由

- **フォールバックを Today 常時表示に寄せる**: ADR-0020 で既に「通知に依存しない運用」が核として確定している。onboarding はそれを言語化するだけでよく、新規機構を増やすのは設計の重複 (K-004 同型: 測りやすい付随機能でゲートを汚さない)。
- **明示フラグ + 既存ユーザー skip**: ゲートは「一度通したか」という app 動作設定軸の状態。観測データ ([ADR-0001](./0001-chain-data-model.md) の 3 軸) ではないので `app_settings` ([ADR-0028](./0028-app-settings-and-reset-time.md)) に置く (K-015 同型の軸別追加)。
- **取得失敗時は onboardingCompleted=true 扱い**: 起動 race / DB 異常で既存ユーザーを onboarding に閉じ込めない安全側 fallback (K-024 同型の silent fallback 受容)。

## 想定される影響

- **schema invariants (K-006)**: `app_settings` のカラム列挙テストに `onboarding_completed` を追加。MIGRATIONS[8] の既存ユーザー保全 (= 1 初期化) を `repository.test.ts` で機械検証。
- **MIGRATIONS[8]**: ALTER ADD COLUMN + UPDATE の 2 文。CHECK 制約は ALTER で後付け不可なため列宣言に含める ([MIGRATIONS[6]](./0029-theme-mode-light-dark-auto.md) と同型)。
- **通知スケジュール**: onboarding の通知許可ステップで granted なら `syncAllNotifications()` を呼び、採用済み active チェーン分を一括スケジュール (= 1 回で両チェーン分、SPEC §5 step 6)。
- **空状態 / アンドゥの多重 (SPEC §8 残り)**: 本 ADR では扱わない (#74 / #73 のスコープ)。本 ADR は §8 のうち「通知拒否フォールバック」のみ解決。

## 関連

- SPEC [docs/template-modules-spec.md](../template-modules-spec.md) §5 (onboarding) / §8 (通知拒否フォールバックを解決済みに更新)。
- [ADR-0020](./0020-deprecate-manual-firing-concept.md): Today 常時表示 = フォールバックの根拠。
- [ADR-0030](./0030-template-module-link-data-model.md): 採用ロジック (discovery) を onboarding が再利用する。
- [ADR-0028](./0028-app-settings-and-reset-time.md): onboarding_completed を置く app_settings 軸。
- [CLAUDE.md §Augmentation 原則](../../CLAUDE.md) / K-031: 初日に折れさせない (最小核採用)。
