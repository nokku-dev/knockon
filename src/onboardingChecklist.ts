// 立ち上げチェックリスト (#165 / ADR-0042 P1) の純粋派生関数。
//
// onboarding 完了直後の Today 上部に「5 マイルストーン・全達成で自動非表示・dismiss 可」の
// チェックリストを出すための判定ロジック。DB / UI に依存しない純関数 (K-007)。判定はすべて
// 既存の正準データ (achievements / chains / 定着判定) から呼び出し側が集約したスカラを受け取って
// 行い、派生値は保存しない (ADR-0001 §決定4)。
//
// 設計の核 (ADR-0042 §2 / ADR-0036 +/- 判定基準): マイルストーンは **すべて「失われない指標」**
// (= 1 方向にしか進まない: 採用済み / 通算達成 / 定着) だけで構成する。連続日数・達成率・未達
// アラートのような「切れたら目減りする指標」は入れない (Celebrate 主 / 反 streak と整合)。

export type OnboardingMilestoneId =
  | 'first-chain'
  | 'first-achievement'
  | 'second-chain'
  | 'ten-achievements'
  | 'first-established';

export type ChecklistItem = {
  id: OnboardingMilestoneId;
  label: string;
  done: boolean;
};

// チェックリスト判定に必要な入力 (すべて呼び出し側が正準データから集約したスカラ)。
export type OnboardingChecklistInput = {
  // 1 本目のチェーンを採用したか (= onboarding 完了。採用は不可逆 = 失われない)。
  onboardingCompleted: boolean;
  // 現在 active なチェーン本数 (採用は不可逆方向)。
  activeChainCount: number;
  // 通算 (全期間) の達成ノード数。累積なので後戻りしない。
  totalAchievedCount: number;
  // 定着 (★) 判定済みノード数 (ADR-0024 の閾値)。1 度満たした事実として扱う。
  establishedNodeCount: number;
};

// 「通算 10 ノード達成」マイルストーンの閾値 (ADR-0042 §2.2)。
export const TEN_ACHIEVEMENTS_TARGET = 10;

// 5 マイルストーンを固定順で返す。順序は ADR-0042 §2.1 のモック準拠
// (採用 → 初達成 → 2 本目 → 通算 10 → 定着)。
export const computeOnboardingChecklist = (
  input: OnboardingChecklistInput,
): ChecklistItem[] => [
  {
    id: 'first-chain',
    label: '1 本目のチェーンを採用した',
    done: input.onboardingCompleted,
  },
  {
    id: 'first-achievement',
    label: 'はじめてのノードを達成した',
    done: input.totalAchievedCount >= 1,
  },
  {
    id: 'second-chain',
    label: '2 本目のチェーンを採用した',
    done: input.activeChainCount >= 2,
  },
  {
    id: 'ten-achievements',
    label: `通算 ${TEN_ACHIEVEMENTS_TARGET} ノード達成する`,
    done: input.totalAchievedCount >= TEN_ACHIEVEMENTS_TARGET,
  },
  {
    id: 'first-established',
    label: '定着 (★) を 1 つ獲得する',
    done: input.establishedNodeCount >= 1,
  },
];

// 全マイルストーン達成か。全達成で「オンボ導線の役目を終える」= 自動非表示の判定に使う。
export const isOnboardingChecklistComplete = (
  items: readonly ChecklistItem[],
): boolean => items.every((i) => i.done);

// チェックリストを表示すべきか。表示条件 (ADR-0042 §2.1):
//   - onboarding 完了済み (= まだ onboarding 中は出さない)
//   - ユーザーが dismiss していない
//   - 全マイルストーン未達 (全達成したら役目を終えて自動非表示)
export const shouldShowOnboardingChecklist = (
  input: OnboardingChecklistInput,
  dismissed: boolean,
): boolean => {
  if (!input.onboardingCompleted) return false;
  if (dismissed) return false;
  return !isOnboardingChecklistComplete(computeOnboardingChecklist(input));
};
