import { render } from '@testing-library/react-native';

import { MetricTrendChart } from './MetricTrendChart';
import type { DailyMetricPoint } from './metricTrend';

// #110: 体重 (および同型のメトリクス) 日別遷移グラフのコンポーネントテスト。
// SVG レベルの詳細座標は確認しない (= 視覚 regression は実機 / Storybook で)。
// ここではガード条件のみ機械検証する:
// - 描画可能な点が < 2 なら何も描画しない (= 1 点では遷移にならない、 testID 不在)
// - 2 点以上あれば testID で識別できる (= マウントされている)

const makePoints = (
  values: ReadonlyArray<number | null>,
  startDate = '2026-06-01',
): DailyMetricPoint[] =>
  values.map((v, i) => {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, value: v };
  });

describe('MetricTrendChart (#110)', () => {
  test('描画可能な点が 0 件なら何も描画しない (null 返し)', () => {
    const { queryByTestId } = render(
      <MetricTrendChart points={makePoints([null, null, null])} />,
    );
    expect(queryByTestId('metric-trend-chart')).toBeNull();
  });

  test('描画可能な点が 1 件のみなら描画しない (= 遷移と呼べない)', () => {
    const { queryByTestId } = render(
      <MetricTrendChart points={makePoints([72.5, null, null])} />,
    );
    expect(queryByTestId('metric-trend-chart')).toBeNull();
  });

  test('描画可能な点が 2 件以上なら描画される (testID で識別)', () => {
    const { getByTestId } = render(
      <MetricTrendChart points={makePoints([72.5, 72.4, null, 72.1])} />,
    );
    expect(getByTestId('metric-trend-chart')).toBeTruthy();
  });

  test('全点同値 (min=max) でも描画される (中央 y 線として処理、 crash しない)', () => {
    const { getByTestId } = render(
      <MetricTrendChart points={makePoints([72.0, 72.0, 72.0])} />,
    );
    expect(getByTestId('metric-trend-chart')).toBeTruthy();
  });
});
