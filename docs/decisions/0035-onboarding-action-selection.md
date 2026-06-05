---
id: 0035
date: 2026-06-01
project: knockon
tags: [ux, scope]
status: accepted
supersedes: []
superseded-by: []
---

# onboarding の step 4 をアクション選択式に変更

## 文脈

Issue #106 (Graft capture 由来): 「テンプレートをアクション別の最小単位まで落とし込み、オンボーディングではその中からアクションを選ぶ形にしたい」。

着手時の現状調査で 2 点が判明した:
1. **テンプレ catalog は既に link = アクション最小単位**。例「朝ごはん」も `朝食準備` / `朝食` / `食器を水につける` の個別リンクに分解済み (v0 catalog §9)。データ構造は既に細分化されている。
2. onboarding の step 4 (スタータープレビュー) は **固定セット (starter×defaultOn) を一括採用** していて、ユーザーがアクションを個別に選べなかった ([ADR-0031](./0031-onboarding-first-run-route.md))。

= 実質の要望は「onboarding でアクションを取捨選択できるようにする」。issue の「粒度が粗い」という体感は、データ粒度ではなく **固定セットを丸ごと採用する onboarding 体験** に起因していた。

## 検討した選択肢

### 選択範囲 (ユーザー判断で確定)

- **採用: starter モジュールのアクションのみ・既定 ON + トグル**
  - その moment の starter モジュールのアクションを一覧表示し、既定で starter×defaultOn を ON。要らないものを外せる。最小核から始めつつ取捨選択可。
  - 追加 (非 starter) モジュールは onboarding に出さず、採用後に編集 UI で足す ([ADR-0032](./0032-edit-ui-two-layer-chips.md))。
- 却下: その moment の全アクション (starter+追加) を出す — 初回の選択肢が多く摩擦増 ([K-031](../../KNOWLEDGE.md) 初日に折れさせない)。
- 却下: モジュール選択 → アクション選択の 2 段 — onboarding が重くなる。

### データ構造 (catalog 粒度)

- **採用: 現状維持 (構造変更なし)**。全 16 モジュール / 50 リンクをレビューした結果、リンクは既にアクション最小単位で、束ねられた粗いリンクは無かった。issue の「細分化」はデータ側では既に達成済み。

## 決定

- 純粋ドメイン `onboarding.ts`: `buildOnboardingAdoptionFromSelection(links, selectedLinkIds, time, title)` を追加。discovery の `buildChainDraftFromSelection` を時刻アンカーで包む (採用前トグル編集の結果を時刻アンカー付きで採用)。
- `useOnboarding`: `selectedLinkIds` state を持ち、`selectMoment` で starter×defaultOn を初期選択 (`buildBundleForMoment`)。`previewModules` (starter モジュールの選択リスト) + `toggleLink` を公開。`adoptFirst` は選択集合で採用。
- `OnboardingScreen` step 4: 読み取り専用プレビューから、モジュール見出し + チェックボックス行の **選択リスト** に変更。CTA は「これで始める (N)」で選択数を表示、0 件は disabled。
- 2 本目 (もう一方の moment) は引き続き既定セット採用 ([ADR-0031](./0031-onboarding-first-run-route.md) 踏襲、調整は編集 UI)。

## 理由

- **starter のみ・既定 ON**: 「最小核から始める」(K-031) と「自分に合った組み合わせを選べる」(#106) の両立。discovery の束プレビューと同じ選択モデルを再利用し、概念を増やさない。
- **catalog は触らない**: 既にアクション最小単位。fabricate した分割はプロダクト価値を生まないため行わない。
- **2 本目は既定のまま**: floor は 1 本 (ADR-0031)。2 本目は opt-in の付け足しで、細かい選択は編集 UI に委ねて onboarding を軽く保つ。

## 想定される影響

- ADR-0031 の step 4 (「固定セット一括採用」) を本 ADR が更新する (片側リンク回避: ADR-0031 §step4 は本 ADR で選択式に改定、K-005)。それ以外の onboarding 構造 (7 ステップ / 通知拒否フォールバック / onboarding_completed ゲート) は不変。
- 正準データ / スキーマ変更なし。採用結果は従来同様 chain/node/action/anchor のみ。
- catalog 粒度は今回維持。将来「粗い」と感じる箇所が出たら link 分割で対応 (データ移行不要)。

## 関連

- [ADR-0031](./0031-onboarding-first-run-route.md): onboarding 初回ルート (本 ADR が step 4 を改定)。
- [ADR-0030](./0030-template-module-link-data-model.md): catalog = module/link (link = アクション単位の根拠)。
- [ADR-0032](./0032-edit-ui-two-layer-chips.md): 追加モジュールは採用後に編集 UI で足す。
- [K-031](../../KNOWLEDGE.md): 最小核から始める / 初日に折れさせない。
