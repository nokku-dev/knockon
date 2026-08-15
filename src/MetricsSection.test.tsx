import { fireEvent, render } from '@testing-library/react-native';

import { MetricsSection } from './MetricsSection';
import { BUILTIN_METRIC_KINDS } from './metricKinds';
import type { MetricKind } from './metricKindsRepository';
import type { MetricSeries } from './useMetricsData';

// PR-CC: テスト fixture は BUILTIN_METRIC_KINDS から MetricKind 形式に変換 (id 含む完全形)。
const BUILTIN_AS_KINDS: readonly MetricKind[] = BUILTIN_METRIC_KINDS;

const buildSeries = (
  overrides: Partial<Record<string, { latest: number | null; count: number }>> = {},
): MetricSeries[] =>
  BUILTIN_AS_KINDS.map((kind) => {
    const o = overrides[kind.key];
    return {
      kind,
      latest: o?.latest != null
        ? {
            id: `m-${kind.key}`,
            metricKey: kind.key,
            value: o.latest,
            recordedAt: '2026-05-26T09:00:00',
            source: 'manual' as const,
          }
        : null,
      records14d: Array.from({ length: o?.count ?? 0 }, (_, i) => ({
        id: `r-${kind.key}-${i}`,
        metricKey: kind.key,
        value: o?.latest ?? 0,
        recordedAt: `2026-05-${20 + i}T09:00:00`,
        source: 'manual' as const,
      })),
    };
  });

describe('MetricsSection', () => {
  test('セクションタイトルと 3 種別 (体重 / 運動 / 睡眠) が表示される', () => {
    const { getByText } = render(
      <MetricsSection series={buildSeries()} onAddMetric={() => {}} />,
    );
    expect(getByText('メトリクス')).toBeTruthy();
    expect(getByText('体重')).toBeTruthy();
    expect(getByText('運動')).toBeTruthy();
    expect(getByText('睡眠')).toBeTruthy();
  });

  test('未入力 (latest=null) なら大きい数字を — 表示 (マイナス指差し UI なし)', () => {
    const { getAllByText } = render(
      <MetricsSection series={buildSeries()} onAddMetric={() => {}} />,
    );
    // 3 種別すべて未入力 → — が 3 つ
    expect(getAllByText('—')).toHaveLength(3);
  });

  test('latest が設定されていれば値 + 単位表示 / 整数は整数表示', () => {
    const { getByText } = render(
      <MetricsSection
        series={buildSeries({
          weight: { latest: 72.5, count: 3 },
          exercise_minutes: { latest: 30, count: 1 },
        })}
        onAddMetric={() => {}}
      />,
    );
    expect(getByText('72.5')).toBeTruthy();
    expect(getByText('30')).toBeTruthy(); // 整数は小数点なし
    expect(getByText(/14 日で 3 件記録/)).toBeTruthy();
    expect(getByText(/14 日で 1 件記録/)).toBeTruthy();
  });

  test('[+記録] ボタンが種別ごとに表示される', () => {
    const { getByLabelText } = render(
      <MetricsSection series={buildSeries()} onAddMetric={() => {}} />,
    );
    expect(getByLabelText('体重 を記録')).toBeTruthy();
    expect(getByLabelText('運動 を記録')).toBeTruthy();
    expect(getByLabelText('睡眠 を記録')).toBeTruthy();
  });

  test('[+記録] タップでモーダルが開く (タイトル: メトリクスを記録)', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <MetricsSection series={buildSeries()} onAddMetric={() => {}} />,
    );
    expect(queryByText('メトリクスを記録')).toBeNull();
    fireEvent.press(getByLabelText('体重 を記録'));
    expect(getByText('メトリクスを記録')).toBeTruthy();
  });

  // #110: 体重 (および同型のメトリクス) の日別遷移グラフ
  test('trendDates 未指定なら遷移グラフは描画しない (旧呼び出しの後方互換)', () => {
    const { queryAllByTestId } = render(
      <MetricsSection
        series={buildSeries({ weight: { latest: 72.5, count: 3 } })}
        onAddMetric={() => {}}
      />,
    );
    expect(queryAllByTestId('metric-trend-chart')).toHaveLength(0);
  });

  test('trendDates 指定 + 記録 2 件以上で遷移グラフが描画される', () => {
    const { queryAllByTestId } = render(
      <MetricsSection
        series={[
          {
            kind: BUILTIN_AS_KINDS[0]!, // weight
            latest: {
              id: 'm-1',
              metricKey: 'weight',
              value: 72.5,
              recordedAt: '2026-06-05T09:00:00',
              source: 'manual' as const,
            },
            records14d: [
              {
                id: 'r-1',
                metricKey: 'weight',
                value: 73.0,
                recordedAt: '2026-06-01T09:00:00',
                source: 'manual' as const,
              },
              {
                id: 'r-2',
                metricKey: 'weight',
                value: 72.5,
                recordedAt: '2026-06-05T09:00:00',
                source: 'manual' as const,
              },
            ],
          },
          ...BUILTIN_AS_KINDS.slice(1).map((kind) => ({
            kind,
            latest: null,
            records14d: [],
          })),
        ]}
        onAddMetric={() => {}}
        trendDates={[
          '2026-06-01',
          '2026-06-02',
          '2026-06-03',
          '2026-06-04',
          '2026-06-05',
        ]}
      />,
    );
    // weight 行に 1 つだけ描画される (他 2 種別は記録 0 件で非表示)
    expect(queryAllByTestId('metric-trend-chart')).toHaveLength(1);
  });
});
