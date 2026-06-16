import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { dateMatrixForWindow } from './analyticsDerivation';
import type { DateMatrixChainGroup } from './analyticsDerivation';
import { getExpoSqliteClient } from './db.expo';
import { effectiveTodayIsoDate, recentDateRange } from './domain';
import type { Action, IsoDate } from './domain';
import {
  getAction,
  listAchievementsForNodes,
  listChains,
  listNodes,
} from './repository';
import { getAppSettings } from './settingsRepository';

// #115 (ADR-0037): 分析タブの達成マトリクス用データ。 過去 60 日 (8 週) のノード × 日付を
// 一括ロードし、 dateMatrixForWindow (純粋) でマトリクス化する。
// - 集計 (達成率) は useAnalyticsData、 1 日詳細は useDayDetail の責務。 本 hook はマトリクス専用。
// - 派生のみ (ADR-0001): 達成記録から毎回計算し保存しない。 達成記録は 60 日範囲を 1 クエリ取得。
// - SPEC §3: Today / チェーン詳細の窓は 14D 維持。 60 日窓は本 UI に限る (分析面の例外)。

export const DATE_MATRIX_WINDOW_DAYS = 60;

export type UseDateMatrixResult = {
  today: IsoDate | null;
  dates: IsoDate[]; // 昇順 60 日 (最新が末尾)
  rows: DateMatrixChainGroup[];
  loading: boolean;
  error: string | null;
};

const loadDateMatrix = async (): Promise<{
  today: IsoDate;
  dates: IsoDate[];
  rows: DateMatrixChainGroup[];
}> => {
  const db = await getExpoSqliteClient();
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(new Date(), settings.resetTime);
  const dates = recentDateRange(today, DATE_MATRIX_WINDOW_DAYS); // 昇順
  const from = dates[0];
  const to = dates[dates.length - 1];

  const chains = await listChains(db, 'active');
  const groups = await Promise.all(
    chains.map(async (chain) => {
      // #73: 一時停止 (active=false) のノードはマトリクスにも出さない (Today と整合)。
      const nodes = (await listNodes(db, chain.id)).filter(
        (n) => n.active !== false,
      );
      return { chain, nodes };
    }),
  );

  // 全ノードの達成記録を 60 日範囲で 1 クエリ取得 (新規クエリ不要、 ADR-0001 派生のみ維持)。
  const allNodeIds = groups.flatMap((g) => g.nodes.map((n) => n.id));
  const achievements = await listAchievementsForNodes(db, allNodeIds, from, to);

  // action は actionId ごとに 1 度だけ解決 (重複はキャッシュ)。
  const actionsById: Record<string, Action> = {};
  for (const g of groups) {
    for (const node of g.nodes) {
      if (actionsById[node.actionId]) continue;
      const action = await getAction(db, node.actionId);
      if (action) actionsById[node.actionId] = action;
    }
  }

  const rows = dateMatrixForWindow(
    dates,
    groups.map((g) => ({
      chainId: g.chain.id,
      chainTitle: g.chain.title,
      nodes: g.nodes,
    })),
    actionsById,
    achievements,
  );
  return { today, dates, rows };
};

export const useDateMatrix = (): UseDateMatrixResult => {
  const [today, setToday] = useState<IsoDate | null>(null);
  const [dates, setDates] = useState<IsoDate[]>([]);
  const [rows, setRows] = useState<DateMatrixChainGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フォーカスのたびに再ロード (達成タップ後の反映)。 マトリクスは日付選択 state を
  // 持たない (1 日詳細は別 hook の責務) ため依存配列は空でよい。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const r = await loadDateMatrix();
          if (cancelled) return;
          setToday(r.today);
          setDates(r.dates);
          setRows(r.rows);
          setError(null);
        } catch (e: unknown) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return { today, dates, rows, loading, error };
};
