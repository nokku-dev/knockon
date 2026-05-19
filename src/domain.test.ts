import type { Achievement, Anchor, Chain, Node } from './domain';
import {
  countAchievedNodesOn,
  groupAchievementsByDate,
  isNodeAchievedOn,
  isTimeAnchorFiringNow,
  lastAchievedNodeIndex,
  shouldSeed,
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './domain';

describe('isNodeAchievedOn', () => {
  const achievements: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n3', date: '2026-05-17', achieved: true },
  ];

  test('記録がある日に達成済みなら true', () => {
    expect(isNodeAchievedOn(achievements, 'n1', '2026-05-18')).toBe(true);
  });

  test('記録があっても achieved=false なら false', () => {
    expect(isNodeAchievedOn(achievements, 'n2', '2026-05-18')).toBe(false);
  });

  test('記録がない日は false', () => {
    expect(isNodeAchievedOn(achievements, 'n1', '2026-05-17')).toBe(false);
  });

  test('該当ノードが存在しない場合は false', () => {
    expect(isNodeAchievedOn(achievements, 'unknown', '2026-05-18')).toBe(false);
  });
});

describe('countAchievedNodesOn (ゆるい連鎖判定の基礎: 各ノード独立に集計)', () => {
  const achievements: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n3', date: '2026-05-18', achieved: true },
  ];

  test('飛ばされたノード (n2) があっても後続 (n3) は独立に達成扱い', () => {
    expect(
      countAchievedNodesOn(achievements, ['n1', 'n2', 'n3'], '2026-05-18'),
    ).toBe(2);
  });

  test('空配列で 0', () => {
    expect(countAchievedNodesOn(achievements, [], '2026-05-18')).toBe(0);
  });

  test('別日付では 0', () => {
    expect(
      countAchievedNodesOn(achievements, ['n1', 'n2', 'n3'], '2026-05-17'),
    ).toBe(0);
  });
});

describe('shouldSeed (起動時シード判定: 既存チェーン 0 件のときだけ投入)', () => {
  const chain: Chain = {
    id: 'c1',
    title: '朝のルーティン',
    anchorId: 'a1',
    status: 'active',
    createdAt: '2026-05-18T00:00:00Z',
  };

  test('チェーンが 0 件なら true', () => {
    expect(shouldSeed([])).toBe(true);
  });

  test('チェーンが 1 件以上あれば false', () => {
    expect(shouldSeed([chain])).toBe(false);
  });
});

describe('toAchievementMap (該当日付の Achievement[] を nodeId→bool 化)', () => {
  const records: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n3', date: '2026-05-17', achieved: true },
  ];

  test('対象日付のみマップに入る', () => {
    expect(toAchievementMap(records, '2026-05-18')).toEqual({
      n1: true,
      n2: false,
    });
  });

  test('該当 0 件なら空オブジェクト', () => {
    expect(toAchievementMap(records, '2026-05-16')).toEqual({});
  });
});

describe('toggleAchievementInMap (純粋に反転コピーを返す)', () => {
  test('未登録 nodeId は false 起点で true に反転', () => {
    expect(toggleAchievementInMap({}, 'n1')).toEqual({ n1: true });
  });

  test('true → false に反転', () => {
    expect(toggleAchievementInMap({ n1: true }, 'n1')).toEqual({ n1: false });
  });

  test('false → true に反転、他キーは保持', () => {
    expect(toggleAchievementInMap({ n1: false, n2: true }, 'n1')).toEqual({
      n1: true,
      n2: true,
    });
  });

  test('元のオブジェクトは破壊しない', () => {
    const original = { n1: true };
    toggleAchievementInMap(original, 'n1');
    expect(original).toEqual({ n1: true });
  });
});

describe('todayIsoDate (Date → YYYY-MM-DD; ローカルタイムゾーンで切り出し)', () => {
  test('1 桁の月/日はゼロ埋めされる', () => {
    expect(todayIsoDate(new Date(2026, 0, 3, 12, 0, 0))).toBe('2026-01-03');
  });

  test('境界の月末', () => {
    expect(todayIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('lastAchievedNodeIndex (達成済みノード範囲モデル: ADR-0010)', () => {
  const node = (id: string, orderIndex: number): Node => ({
    id,
    chainId: 'c1',
    orderIndex,
    kind: 'action',
    actionId: `act-${id}`,
  });
  const nodes: Node[] = [node('n1', 0), node('n2', 1), node('n3', 2)];

  test('全ノード未達 → -1 (スパイン --grow 範囲なし)', () => {
    expect(lastAchievedNodeIndex(nodes, {})).toBe(-1);
  });

  test('n1 のみ達成 → 0 (anchor → n1 が --grow)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true })).toBe(0);
  });

  test('n1, n2 達成 → 1 (anchor → n2 が --grow)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true, n2: true })).toBe(1);
  });

  test('飛ばし達成 (n1 と n3 のみ) → 2 (達成済みノード範囲モデル: n3 まで線が繋がる)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true, n3: true })).toBe(2);
  });

  test('n3 のみ達成 (アンカー → n3 まで全部 --grow / 途中 n1 n2 未達でも繋がる)', () => {
    expect(lastAchievedNodeIndex(nodes, { n3: true })).toBe(2);
  });

  test('全ノード達成 → nodes.length - 1 (スパイン全域 --grow)', () => {
    expect(
      lastAchievedNodeIndex(nodes, { n1: true, n2: true, n3: true }),
    ).toBe(2);
  });

  test('achieved=false (明示的未達記録) は達成扱いしない', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: false })).toBe(-1);
  });
});

describe('isTimeAnchorFiringNow (時刻アンカーの今日発火判定)', () => {
  const timeAnchor = (time: string | null): Anchor => ({
    id: 'a1',
    title: '起床',
    kind: 'time',
    time,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  });
  const behaviorAnchor: Anchor = {
    id: 'a2',
    title: '起床',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };

  test('kind=time, 現在時刻 ≥ anchor.time → true', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 8, 0)),
    ).toBe(true);
  });

  test('kind=time, 現在時刻 = anchor.time ぴったり → true', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 7, 30)),
    ).toBe(true);
  });

  test('kind=time, 現在時刻 < anchor.time → false', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 7, 0)),
    ).toBe(false);
  });

  test('kind=behavior は常に false (時刻アンカーではない)', () => {
    expect(
      isTimeAnchorFiringNow(behaviorAnchor, new Date(2026, 4, 19, 23, 59)),
    ).toBe(false);
  });

  test('time が null なら false', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor(null), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
  });

  test('time が不正フォーマットなら false (defensive)', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('abc'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
    expect(
      isTimeAnchorFiringNow(timeAnchor('25:30'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:99'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
  });
});

describe('groupAchievementsByDate (14D ウィンドウ用 API 受口: 日付別 nodeId→bool マップ)', () => {
  const records: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n1', date: '2026-05-19', achieved: true },
    { nodeId: 'n3', date: '2026-05-19', achieved: true },
  ];

  test('日付ごとに nodeId→bool に分かれる', () => {
    expect(groupAchievementsByDate(records)).toEqual({
      '2026-05-18': { n1: true, n2: false },
      '2026-05-19': { n1: true, n3: true },
    });
  });

  test('空配列 → 空オブジェクト', () => {
    expect(groupAchievementsByDate([])).toEqual({});
  });
});
