import type { Achievement, Action, Node } from './domain';
import {
  chainAchievementStats,
  dailyChainAchievementSeries,
  nodeAchievementStats,
} from './analyticsDerivation';

const buildNode = (id: string, actionId: string): Node => ({
  id,
  chainId: 'c1',
  orderIndex: 0,
  kind: 'action',
  actionId,
});

const buildAction = (id: string, title = id): Action => ({
  id,
  title,
  variants: null,
});

const buildVariantAction = (
  id: string,
  variants: Action['variants'],
): Action => ({
  id,
  title: id,
  variants,
});

describe('nodeAchievementStats (PR-Z2 / variant-aware ノード単位達成率の中間集計)', () => {
  test('variant=null 毎日発火、 14D 中 10 日達成 → {applicableDays: 14, achievedDays: 10}', () => {
    const action = buildAction('a1');
    const achievements: Achievement[] = Array.from({ length: 10 }, (_, i) => {
      const day = String(10 + i).padStart(2, '0');
      return { nodeId: 'n1', date: `2026-05-${day}`, achieved: true };
    });
    expect(
      nodeAchievementStats(achievements, 'n1', action, '2026-05-19', 14),
    ).toEqual({ achievedDays: 10, applicableDays: 14 });
  });

  test('variant 月火水のみ → 14D 中 monthly 適用日のみ分母 (variant null 日は除外)', () => {
    // 5/6 (水) から 5/19 (火) までの 14D。
    // 月: 5/11, 5/18 (2 日)
    // 火: 5/12, 5/19 (2 日)
    // 水: 5/6, 5/13 (2 日)
    // → applicableDays = 6
    const action = buildVariantAction('a1', {
      mon: '胸',
      tue: '足',
      wed: '背',
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    });
    const achievements: Achievement[] = [
      { nodeId: 'n1', date: '2026-05-11', achieved: true }, // 月 = 適用 + 達成
      { nodeId: 'n1', date: '2026-05-12', achieved: true }, // 火 = 適用 + 達成
      { nodeId: 'n1', date: '2026-05-13', achieved: false }, // 水 = 適用 + 未達
      { nodeId: 'n1', date: '2026-05-14', achieved: true }, // 木 = 非適用 (variant null) → 集計から除外
    ];
    expect(
      nodeAchievementStats(achievements, 'n1', action, '2026-05-19', 14),
    ).toEqual({ achievedDays: 2, applicableDays: 6 });
  });

  test('該当ノードなしなら {achievedDays: 0, applicableDays: 14}', () => {
    const action = buildAction('a1');
    expect(
      nodeAchievementStats([], 'n1', action, '2026-05-19', 14),
    ).toEqual({ achievedDays: 0, applicableDays: 14 });
  });

  test('全曜日 null variant (完全休眠) → applicableDays=0', () => {
    const action = buildVariantAction('a1', {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    });
    expect(
      nodeAchievementStats([], 'n1', action, '2026-05-19', 14),
    ).toEqual({ achievedDays: 0, applicableDays: 0 });
  });
});

describe('chainAchievementStats (PR-Z2 / チェーン全体の集計 = 全ノードの sum)', () => {
  test('2 ノード × 14D 全達成 → {achievedDays: 28, applicableDays: 28}', () => {
    const nodes: Node[] = [buildNode('n1', 'a1'), buildNode('n2', 'a2')];
    const actionMap: ReadonlyMap<string, Action> = new Map([
      ['a1', buildAction('a1')],
      ['a2', buildAction('a2')],
    ]);
    const allAchieved = (nodeId: string): Achievement[] =>
      Array.from({ length: 14 }, (_, i) => {
        const day = String(6 + i).padStart(2, '0');
        return { nodeId, date: `2026-05-${day}`, achieved: true };
      });
    expect(
      chainAchievementStats(
        [...allAchieved('n1'), ...allAchieved('n2')],
        nodes,
        actionMap,
        '2026-05-19',
        14,
      ),
    ).toEqual({ achievedDays: 28, applicableDays: 28 });
  });

  test('1 ノード variant 月火水 (6 日適用) + 1 ノード毎日 (14 日適用) → applicableDays=20', () => {
    const nodes: Node[] = [buildNode('n1', 'a1'), buildNode('n2', 'a2')];
    const actionMap: ReadonlyMap<string, Action> = new Map([
      [
        'a1',
        buildVariantAction('a1', {
          mon: '胸',
          tue: '足',
          wed: '背',
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        }),
      ],
      ['a2', buildAction('a2')],
    ]);
    expect(
      chainAchievementStats([], nodes, actionMap, '2026-05-19', 14),
    ).toEqual({ achievedDays: 0, applicableDays: 20 });
  });

  test('action 解決失敗ノードはスキップ (堅牢性)', () => {
    const nodes: Node[] = [
      buildNode('n1', 'a1'),
      buildNode('n2', 'missing-action'),
    ];
    const actionMap: ReadonlyMap<string, Action> = new Map([
      ['a1', buildAction('a1')],
    ]);
    expect(
      chainAchievementStats([], nodes, actionMap, '2026-05-19', 14),
    ).toEqual({ achievedDays: 0, applicableDays: 14 });
  });
});

describe('dailyChainAchievementSeries (PR-Z2 / 日別折れ線グラフ用の達成率推移)', () => {
  test('windowDays=3 → 3 日分の {date, achievedRate, applicableNodes} を返す', () => {
    const nodes: Node[] = [buildNode('n1', 'a1'), buildNode('n2', 'a2')];
    const actionMap: ReadonlyMap<string, Action> = new Map([
      ['a1', buildAction('a1')],
      ['a2', buildAction('a2')],
    ]);
    const achievements: Achievement[] = [
      { nodeId: 'n1', date: '2026-05-17', achieved: true }, // 1/2
      { nodeId: 'n1', date: '2026-05-18', achieved: true }, // 2/2 (with n2)
      { nodeId: 'n2', date: '2026-05-18', achieved: true },
      { nodeId: 'n2', date: '2026-05-19', achieved: true }, // 1/2
    ];
    const series = dailyChainAchievementSeries(
      achievements,
      nodes,
      actionMap,
      '2026-05-19',
      3,
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({
      date: '2026-05-17',
      achievedNodes: 1,
      applicableNodes: 2,
    });
    expect(series[1]).toEqual({
      date: '2026-05-18',
      achievedNodes: 2,
      applicableNodes: 2,
    });
    expect(series[2]).toEqual({
      date: '2026-05-19',
      achievedNodes: 1,
      applicableNodes: 2,
    });
  });

  test('variant 適用なしの日は applicableNodes=0', () => {
    const nodes: Node[] = [buildNode('n1', 'a1')];
    const actionMap: ReadonlyMap<string, Action> = new Map([
      [
        'a1',
        buildVariantAction('a1', {
          mon: '胸',
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        }),
      ],
    ]);
    // 5/18 = 月 = 適用、 5/19 = 火 = 非適用
    const series = dailyChainAchievementSeries(
      [],
      nodes,
      actionMap,
      '2026-05-19',
      2,
    );
    expect(series).toEqual([
      { date: '2026-05-18', achievedNodes: 0, applicableNodes: 1 },
      { date: '2026-05-19', achievedNodes: 0, applicableNodes: 0 },
    ]);
  });

  test('空チェーン (nodes=0) → 全日 applicableNodes=0', () => {
    const series = dailyChainAchievementSeries(
      [],
      [],
      new Map(),
      '2026-05-19',
      3,
    );
    expect(series).toEqual([
      { date: '2026-05-17', achievedNodes: 0, applicableNodes: 0 },
      { date: '2026-05-18', achievedNodes: 0, applicableNodes: 0 },
      { date: '2026-05-19', achievedNodes: 0, applicableNodes: 0 },
    ]);
  });
});
