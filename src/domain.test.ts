import type { Achievement, Chain } from './domain';
import { countAchievedNodesOn, isNodeAchievedOn, shouldSeed } from './domain';

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
