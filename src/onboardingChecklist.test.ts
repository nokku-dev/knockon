import {
  computeOnboardingChecklist,
  isOnboardingChecklistComplete,
  shouldShowOnboardingChecklist,
  TEN_ACHIEVEMENTS_TARGET,
  type OnboardingChecklistInput,
} from './onboardingChecklist';

// 全マイルストーン未達の素の状態 (= onboarding 直後)。
const base: OnboardingChecklistInput = {
  onboardingCompleted: true,
  activeChainCount: 1,
  totalAchievedCount: 0,
  addedAction: false,
};

describe('computeOnboardingChecklist (#165)', () => {
  test('5 マイルストーンを固定順で返す', () => {
    const items = computeOnboardingChecklist(base);
    expect(items.map((i) => i.id)).toEqual([
      'first-chain',
      'first-achievement',
      'second-chain',
      'ten-achievements',
      'added-action',
    ]);
  });

  test('onboarding 完了済みなら「1 本目のチェーンを採用」は done', () => {
    const items = computeOnboardingChecklist({ ...base, onboardingCompleted: true });
    expect(items.find((i) => i.id === 'first-chain')?.done).toBe(true);
  });

  test('onboarding 未完了なら「1 本目のチェーンを採用」は未達', () => {
    const items = computeOnboardingChecklist({ ...base, onboardingCompleted: false });
    expect(items.find((i) => i.id === 'first-chain')?.done).toBe(false);
  });

  test('通算 1 ノード以上で「はじめてのノードを達成」が done', () => {
    expect(
      computeOnboardingChecklist({ ...base, totalAchievedCount: 0 }).find(
        (i) => i.id === 'first-achievement',
      )?.done,
    ).toBe(false);
    expect(
      computeOnboardingChecklist({ ...base, totalAchievedCount: 1 }).find(
        (i) => i.id === 'first-achievement',
      )?.done,
    ).toBe(true);
  });

  test('active チェーンが 2 本以上で「2 本目のチェーンを採用」が done', () => {
    expect(
      computeOnboardingChecklist({ ...base, activeChainCount: 1 }).find(
        (i) => i.id === 'second-chain',
      )?.done,
    ).toBe(false);
    expect(
      computeOnboardingChecklist({ ...base, activeChainCount: 2 }).find(
        (i) => i.id === 'second-chain',
      )?.done,
    ).toBe(true);
  });

  test('通算達成が閾値 (10) 以上で「通算 10 ノード達成」が done', () => {
    expect(
      computeOnboardingChecklist({
        ...base,
        totalAchievedCount: TEN_ACHIEVEMENTS_TARGET - 1,
      }).find((i) => i.id === 'ten-achievements')?.done,
    ).toBe(false);
    expect(
      computeOnboardingChecklist({
        ...base,
        totalAchievedCount: TEN_ACHIEVEMENTS_TARGET,
      }).find((i) => i.id === 'ten-achievements')?.done,
    ).toBe(true);
  });

  test('アクション追加フラグが立つと「アクションを 1 つ追加した」が done', () => {
    expect(
      computeOnboardingChecklist({ ...base, addedAction: false }).find(
        (i) => i.id === 'added-action',
      )?.done,
    ).toBe(false);
    expect(
      computeOnboardingChecklist({ ...base, addedAction: true }).find(
        (i) => i.id === 'added-action',
      )?.done,
    ).toBe(true);
  });

  test('各 item は表示用ラベルを持つ (空でない)', () => {
    for (const item of computeOnboardingChecklist(base)) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

describe('isOnboardingChecklistComplete (#165)', () => {
  test('全マイルストーン達成で true', () => {
    const items = computeOnboardingChecklist({
      onboardingCompleted: true,
      activeChainCount: 2,
      totalAchievedCount: TEN_ACHIEVEMENTS_TARGET,
      addedAction: true,
    });
    expect(isOnboardingChecklistComplete(items)).toBe(true);
  });

  test('1 つでも未達なら false', () => {
    expect(isOnboardingChecklistComplete(computeOnboardingChecklist(base))).toBe(false);
  });
});

describe('shouldShowOnboardingChecklist (#165)', () => {
  test('onboarding 完了・未 dismiss・未完了 なら表示する', () => {
    expect(shouldShowOnboardingChecklist(base, false)).toBe(true);
  });

  test('onboarding 未完了なら表示しない (まだ onboarding 中)', () => {
    expect(
      shouldShowOnboardingChecklist({ ...base, onboardingCompleted: false }, false),
    ).toBe(false);
  });

  test('dismiss 済みなら表示しない', () => {
    expect(shouldShowOnboardingChecklist(base, true)).toBe(false);
  });

  test('全マイルストーン達成なら (未 dismiss でも) 自動的に表示しない', () => {
    const allDone: OnboardingChecklistInput = {
      onboardingCompleted: true,
      activeChainCount: 2,
      totalAchievedCount: TEN_ACHIEVEMENTS_TARGET,
      addedAction: true,
    };
    expect(shouldShowOnboardingChecklist(allDone, false)).toBe(false);
  });
});
