import {
  allItemKeys,
  buildChainDraftFromCategorySelection,
} from './categoryDiscovery';
import type { CategoryPreview } from './categoryDiscovery';
import type { ChainDraft } from './domain';

// #72 (SPEC docs/template-modules-spec.md §5): onboarding (初回ルート) の純粋ドメイン層。
// 状態ゴール扉だけを通る 1 画面 1 決定の連続を、ステップ順 / moment 分岐 /
// 採用ドラフト生成の純粋関数として実装する (DB/UI 非依存、K-007)。
// 採用の永続化は bundleAdoption.adoptChainDraft、画面状態は useOnboarding (hook) の責務。

// SPEC §5 の 7 ステップ。進捗インジケータ・戻る導線はこの順序から導出する。
export type OnboardingStep =
  | 'welcome' // 1. Welcome (1 行)
  | 'moment' // 2. 最初のモーメント (朝/夜)
  | 'anchorTime' // 3. アンカー時刻
  | 'preview' // 4. スタータープレビュー → これで始める (= 1 本目採用)
  | 'second' // 5. もう一方も? (opt-in 継続、floor は 1 チェーン)
  | 'notify' // 6. 通知許可 (投資後・理由付き)
  | 'done'; // 7. 完了 + 「明日◯時に起動」+ 今すぐ 1 回試す

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'moment',
  'anchorTime',
  'preview',
  'second',
  'notify',
  'done',
];

export const stepProgress = (
  step: OnboardingStep,
): { current: number; total: number } => ({
  current: ONBOARDING_STEPS.indexOf(step) + 1,
  total: ONBOARDING_STEPS.length,
});

// 線形に隣のステップへ。両端では飽和する (= 先頭で prev / 末尾で next は自身)。
// second=「いいえ」でも notify へ進むだけなので分岐は不要 (1 本目は preview で採用済み、
// floor は 1 チェーン)。second=「はい」の 2 本目採用は副作用なので hook が担う。
export const nextStep = (step: OnboardingStep): OnboardingStep => {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)];
};

export const prevStep = (step: OnboardingStep): OnboardingStep => {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(i - 1, 0)];
};

// onboarding が提示する moment は朝/夜の 2 つ (SPEC §5 step 2)。
// 昼 (noon) は discovery の横断軸で拾える前提で onboarding には出さない。
export type OnboardingMoment = 'morning' | 'night';

export const ONBOARDING_MOMENTS: readonly OnboardingMoment[] = ['morning', 'night'];

export const otherMoment = (m: OnboardingMoment): OnboardingMoment =>
  m === 'morning' ? 'night' : 'morning';

// 各 moment のデフォルトアンカー時刻 (step 3 の初期値)。ユーザーが調整する前提の汎用値
// (= 自分の実 export 05:30/21:30 ではなく初日に折れない汎用デフォルト、K-031)。
export const DEFAULT_ANCHOR_TIMES: Record<OnboardingMoment, string> = {
  morning: '07:00',
  night: '22:00',
};

// ADR-0039 (#155): onboarding は「おすすめ朝/夜」カテゴリを 1 本目/2 本目として採用する。
// moment (朝/夜) → おすすめカテゴリ id の対応 (seed の固定 id、categoryCatalogSeed)。
// onboarding は朝/夜の完成ルーティン (おすすめカテゴリ) に特化するため id 結合を許容する。
export const RECOMMENDED_CATEGORY_ID: Record<OnboardingMoment, string> = {
  morning: 'cat-rec-morning',
  night: 'cat-rec-night',
};

// onboarding の採用は「時刻アンカー」を伴う点が discovery (= behavior アンカー) と異なる。
// load-bearing な要件: アンカー時刻が無いとチェーンが発火しない (SPEC §5)。
export type OnboardingAnchorSpec = { kind: 'time'; time: string };

export type OnboardingAdoption = {
  draft: ChainDraft;
  anchor: OnboardingAnchorSpec;
};

// プレビュー (おすすめカテゴリ) を全選択 + 時刻 → 採用ドラフト + 時刻アンカー。
// 2 本目 (もう一方の moment) の既定全採用に使う (選択なしの一括採用)。
export const buildOnboardingAdoption = (
  preview: CategoryPreview,
  time: string,
  title: string,
): OnboardingAdoption => ({
  draft: buildChainDraftFromCategorySelection(
    preview,
    new Set(allItemKeys(preview)),
    title,
  ),
  anchor: { kind: 'time', time },
});

// #106: ユーザーが選んだアイテム集合 + 時刻 → 採用ドラフト + 時刻アンカー。
// 1 本目 onboarding でおすすめカテゴリのアクションを個別選択した結果を採用する。
export const buildOnboardingAdoptionFromSelection = (
  preview: CategoryPreview,
  selectedKeys: ReadonlySet<string>,
  time: string,
  title: string,
): OnboardingAdoption => ({
  draft: buildChainDraftFromCategorySelection(preview, selectedKeys, title),
  anchor: { kind: 'time', time },
});
