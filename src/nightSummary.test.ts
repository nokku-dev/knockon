import type { Action, Node } from './domain';
import {
  computeNightSummary,
  formatNightSummaryBody,
  NIGHT_SUMMARY_HOUR,
  NIGHT_SUMMARY_MINUTE,
  NIGHT_SUMMARY_NOTIFICATION_ID,
} from './nightSummary';

// テスト用のヘルパー: variant なしのアクション (毎日 fire)
const makeAction = (
  id: string,
  variants: Action['variants'] = null,
): Action => ({
  id,
  title: `action-${id}`,
  variants,
  timerSeconds: null,
});

// テスト用のヘルパー: アクティブなノード (active=true デフォルト)
const makeNode = (
  id: string,
  actionId: string,
  active: boolean | undefined = undefined,
): Node => ({
  id,
  chainId: 'c1',
  orderIndex: 0,
  kind: 'action',
  actionId,
  ...(active === undefined ? {} : { active }),
});

describe('NIGHT_SUMMARY 定数 (Issue #169 / ADR-0042)', () => {
  test('送信時刻は 21:00 (= 夜のリフレクション窓)', () => {
    expect(NIGHT_SUMMARY_HOUR).toBe(21);
    expect(NIGHT_SUMMARY_MINUTE).toBe(0);
  });

  test('通知 ID は per-chain と衝突しない一意な識別子', () => {
    expect(NIGHT_SUMMARY_NOTIFICATION_ID).toBe('night-summary');
    // per-chain 識別子 (`chain-{id}`) と prefix が異なる
    expect(NIGHT_SUMMARY_NOTIFICATION_ID.startsWith('chain-')).toBe(false);
  });
});

describe('computeNightSummary (Issue #169)', () => {
  const today = '2026-06-20';

  test('全ノード達成済み: achievedCount=全件, remainingCount=0', () => {
    const summary = computeNightSummary(
      [
        {
          nodes: [
            { node: makeNode('n1', 'a1'), action: makeAction('a1') },
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
          ],
          achievementsToday: { n1: true, n2: true },
        },
      ],
      today,
    );
    expect(summary).toEqual({ achievedCount: 2, remainingCount: 0 });
  });

  test('一部達成: achievedCount=達成数, remainingCount=fire かつ未達', () => {
    const summary = computeNightSummary(
      [
        {
          nodes: [
            { node: makeNode('n1', 'a1'), action: makeAction('a1') },
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
            { node: makeNode('n3', 'a3'), action: makeAction('a3') },
          ],
          achievementsToday: { n1: true },
        },
      ],
      today,
    );
    expect(summary).toEqual({ achievedCount: 1, remainingCount: 2 });
  });

  test('未達成 false エントリも remainingCount に算入される', () => {
    const summary = computeNightSummary(
      [
        {
          nodes: [
            { node: makeNode('n1', 'a1'), action: makeAction('a1') },
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
          ],
          achievementsToday: { n1: false, n2: false },
        },
      ],
      today,
    );
    expect(summary).toEqual({ achievedCount: 0, remainingCount: 2 });
  });

  test('variant の skip 曜日のノードはどちらにも算入されない', () => {
    // 2026-06-20 は土曜日 (sat)。 sun と mon だけ string、 sat は null → skip
    const variants = {
      mon: 'do',
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: 'do',
    };
    const summary = computeNightSummary(
      [
        {
          nodes: [
            { node: makeNode('n1', 'a1'), action: makeAction('a1', variants) },
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
          ],
          achievementsToday: {},
        },
      ],
      today,
    );
    // n1 は skip なので 0、 n2 だけ fire で remaining=1
    expect(summary).toEqual({ achievedCount: 0, remainingCount: 1 });
  });

  test('active=false の停止ノードはどちらにも算入されない', () => {
    const summary = computeNightSummary(
      [
        {
          nodes: [
            {
              node: makeNode('n1', 'a1', false),
              action: makeAction('a1'),
            },
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
          ],
          achievementsToday: { n1: true, n2: true },
        },
      ],
      today,
    );
    // n1 は停止 (active=false) なので除外、 n2 は達成済 → achieved=1, remaining=0
    expect(summary).toEqual({ achievedCount: 1, remainingCount: 0 });
  });

  test('複数チェーン: 全チェーン合算', () => {
    const summary = computeNightSummary(
      [
        {
          nodes: [
            { node: makeNode('n1', 'a1'), action: makeAction('a1') },
          ],
          achievementsToday: { n1: true },
        },
        {
          nodes: [
            { node: makeNode('n2', 'a2'), action: makeAction('a2') },
            { node: makeNode('n3', 'a3'), action: makeAction('a3') },
          ],
          achievementsToday: { n2: true },
        },
      ],
      today,
    );
    expect(summary).toEqual({ achievedCount: 2, remainingCount: 1 });
  });

  test('チェーン 0 件: 両方 0', () => {
    expect(computeNightSummary([], today)).toEqual({
      achievedCount: 0,
      remainingCount: 0,
    });
  });
});

describe('formatNightSummaryBody (Issue #169)', () => {
  test('N>0 / M>0: 達成 + チャンス両方を提示 (issue 本文準拠)', () => {
    expect(formatNightSummaryBody(2, 3)).toBe(
      '今日は2個アクションを達成済み。3個の達成チャンスがあります。',
    );
  });

  test('N>0 / M=0: チャンスは出さず祝福で締める (反 streak / Celebrate 主)', () => {
    expect(formatNightSummaryBody(5, 0)).toBe(
      '今日は5個アクションを達成済み。お疲れさまでした。',
    );
  });

  test('N=0 / M>0: チャンスだけ提示 (達成 0 を指差さない)', () => {
    expect(formatNightSummaryBody(0, 4)).toBe(
      '4個の達成チャンスがあります。',
    );
  });

  test('N=0 / M=0: null (= 通知出さない判断)', () => {
    expect(formatNightSummaryBody(0, 0)).toBeNull();
  });
});
