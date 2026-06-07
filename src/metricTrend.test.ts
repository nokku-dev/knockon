import { derivedDailyMetricPoints } from './metricTrend';
import type { Metric } from './metricsRepository';

// #110: メトリクスの日別遷移グラフ用、 records の集約を pure 関数で隔離 (K-007)。
// 1 日複数記録は latest (= recorded_at 降順で先頭) を採用、 該当日無しは null。

const mkMetric = (
  recordedAt: string,
  value: number,
  id = `m-${recordedAt}-${value}`,
): Metric => ({
  id,
  metricKey: 'weight',
  value,
  recordedAt,
  source: 'manual',
});

describe('derivedDailyMetricPoints (#110)', () => {
  test('日付配列の順序で 1 日 1 点を返す (記録のある日のみ value、 無い日は null)', () => {
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const records: Metric[] = [
      mkMetric('2026-06-01T09:00:00', 72.5),
      mkMetric('2026-06-03T08:00:00', 72.1),
    ];
    const points = derivedDailyMetricPoints(records, dates);
    expect(points).toEqual([
      { date: '2026-06-01', value: 72.5 },
      { date: '2026-06-02', value: null },
      { date: '2026-06-03', value: 72.1 },
    ]);
  });

  test('同日複数記録は recorded_at 最大 (= 最新) を採用する', () => {
    const dates = ['2026-06-01'];
    const records: Metric[] = [
      mkMetric('2026-06-01T07:00:00', 72.5),
      mkMetric('2026-06-01T09:00:00', 72.2), // ← 採用される
      mkMetric('2026-06-01T08:00:00', 72.4),
    ];
    const points = derivedDailyMetricPoints(records, dates);
    expect(points).toEqual([{ date: '2026-06-01', value: 72.2 }]);
  });

  test('records が空でも dates 分の null 点を返す (= グラフ側で件数判定可能)', () => {
    const dates = ['2026-06-01', '2026-06-02'];
    const points = derivedDailyMetricPoints([], dates);
    expect(points).toEqual([
      { date: '2026-06-01', value: null },
      { date: '2026-06-02', value: null },
    ]);
  });

  test('dates の範囲外の record は無視する', () => {
    const dates = ['2026-06-02', '2026-06-03'];
    const records: Metric[] = [
      mkMetric('2026-06-01T09:00:00', 70.0), // ← 範囲外
      mkMetric('2026-06-02T09:00:00', 72.0),
    ];
    const points = derivedDailyMetricPoints(records, dates);
    expect(points).toEqual([
      { date: '2026-06-02', value: 72.0 },
      { date: '2026-06-03', value: null },
    ]);
  });
});
