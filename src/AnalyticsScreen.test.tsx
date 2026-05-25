import { render } from '@testing-library/react-native';

import type { Anchor, Chain } from './domain';
import { AnalyticsScreen } from './AnalyticsScreen';
import type { AnalyticsChainData } from './useAnalyticsData';

const buildChain = (id: string, title: string): Chain => ({
  id,
  title,
  anchorId: `${id}-anchor`,
  status: 'active',
  createdAt: '2026-05-24',
});

const buildAnchor = (id: string, title: string): Anchor => ({
  id,
  title,
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

const buildAnalyticsData = (
  id: string,
  title: string,
  achievedDays: number,
  applicableDays: number,
): AnalyticsChainData => ({
  chain: buildChain(id, title),
  anchor: buildAnchor(`${id}-anchor`, '起点'),
  nodeCount: 3,
  stats: { achievedDays, applicableDays },
  series: [
    { date: '2026-05-17', achievedNodes: 1, applicableNodes: 3 },
    { date: '2026-05-18', achievedNodes: 2, applicableNodes: 3 },
    { date: '2026-05-19', achievedNodes: 3, applicableNodes: 3 },
  ],
});

describe('AnalyticsScreen', () => {
  test('chains 0 件 → 空メッセージ表示', () => {
    const { getByText } = render(
      <AnalyticsScreen chains={[]} windowDays={14} />,
    );
    expect(getByText(/アクティブなチェーンがありません/)).toBeTruthy();
  });

  test('chains 複数 → 各チェーンの達成率 + タイトル表示', () => {
    const chains: AnalyticsChainData[] = [
      buildAnalyticsData('c1', '朝のルーティン', 10, 14),
      buildAnalyticsData('c2', '筋トレ', 4, 14),
    ];
    const { getByText } = render(
      <AnalyticsScreen chains={chains} windowDays={14} />,
    );
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('筋トレ')).toBeTruthy();
    // 10/14 = 71%, 4/14 = 29%
    expect(getByText('71%')).toBeTruthy();
    expect(getByText('29%')).toBeTruthy();
  });

  test('達成率の rounding は四捨五入 (10/14 ≈ 71.4 → 71%)', () => {
    const chains = [buildAnalyticsData('c1', 't', 10, 14)];
    const { getByText } = render(
      <AnalyticsScreen chains={chains} windowDays={14} />,
    );
    expect(getByText('71%')).toBeTruthy();
  });

  test('applicableDays=0 (全曜日 variant null など) → 0% 表示 (division-by-zero 防御)', () => {
    const chains = [buildAnalyticsData('c1', '休眠中', 0, 0)];
    const { getByText } = render(
      <AnalyticsScreen chains={chains} windowDays={14} />,
    );
    expect(getByText('0%')).toBeTruthy();
  });

  test('折れ線グラフ (LineChart) が各チェーンカードに表示される', () => {
    const chains: AnalyticsChainData[] = [
      buildAnalyticsData('c1', '朝のルーティン', 10, 14),
      buildAnalyticsData('c2', '筋トレ', 4, 14),
    ];
    const { getAllByTestId } = render(
      <AnalyticsScreen chains={chains} windowDays={14} />,
    );
    expect(getAllByTestId('line-chart')).toHaveLength(2);
  });

  test('カードに「N ノード」「N/M 日」メタ情報が表示される', () => {
    const chains = [buildAnalyticsData('c1', '朝のルーティン', 10, 14)];
    const { getByText } = render(
      <AnalyticsScreen chains={chains} windowDays={14} />,
    );
    // 「起点 · 3 ノード · 10 / 14 日」のような結合表示
    expect(getByText(/3 ノード/)).toBeTruthy();
    expect(getByText(/10 \/ 14 日/)).toBeTruthy();
  });

  test('windowDays が「過去 N 日の達成率」サブ見出しに反映', () => {
    const { getByText } = render(
      <AnalyticsScreen chains={[]} windowDays={14} />,
    );
    expect(getByText(/過去 14 日の達成率/)).toBeTruthy();
  });
});
