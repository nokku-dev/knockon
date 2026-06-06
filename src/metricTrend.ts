import type { IsoDate } from './domain';
import type { Metric } from './metricsRepository';

// #110: メトリクスの日別遷移グラフ用、 records の日次集約。
// pure 関数として隔離 (K-007 ドメイン純粋性、 DB/UI 依存無し)。
//
// 設計:
// - 1 日複数記録なら recorded_at 最大 (= 最新) を採用。 体重 / 運動 / 睡眠は
//   1 日 1 回前提だが、 複数記録ありえる場合は「直近の値が最も新しい状態を表す」
//   を採用する。
// - dates の範囲外の record は無視 (呼び出し側で 14D に絞らなくても良い API)。
// - 該当日に記録が無ければ value: null (= グラフ側で line を切る、 LineChart §4
//   と同じ「ギャップで線を切る」原則と整合)。

export type DailyMetricPoint = {
  date: IsoDate;
  value: number | null;
};

export const derivedDailyMetricPoints = (
  records: readonly Metric[],
  dates: readonly IsoDate[],
): DailyMetricPoint[] => {
  // date (YYYY-MM-DD) -> 採用済み Metric (recorded_at 最大のもの)
  const byDate = new Map<IsoDate, Metric>();
  const allowed = new Set(dates);
  for (const r of records) {
    const date = r.recordedAt.slice(0, 10);
    if (!allowed.has(date)) continue;
    const cur = byDate.get(date);
    if (!cur || r.recordedAt > cur.recordedAt) {
      byDate.set(date, r);
    }
  }
  return dates.map((d) => {
    const r = byDate.get(d);
    return { date: d, value: r ? r.value : null };
  });
};
