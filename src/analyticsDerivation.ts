import type { Achievement, Action, IsoDate, Node } from './domain';
import {
  isNodeAchievedOn,
  recentDateRange,
  resolveActionForDate,
} from './domain';
import type { Metric } from './metricsRepository';
import type { MetricKind } from './metricKindsRepository';

// PR-Z2 (ADR-0024 §3b) 達成率ダッシュボード用の派生集計関数群。
//
// 設計指針:
// - 全て純粋関数 (DB / UI / 状態管理から独立、 K-007)
// - 派生値は保存しない (ADR-0001) — 表示時に毎回計算する
// - variant 適用日を分母から「除外」する (= variant null の曜日は「対象日が来てない」
//   と扱う)。 これにより低頻度 variant (月のみ等) でも公平な達成率になる
// - streak / 連勝記録は計算しない (反 streak 原則、 DESIGN-SYSTEM §0)

// 単一ノードの 14D 集計。 applicableDays = variant 適用された日数、
// achievedDays = そのうち達成された日数。 後者 / 前者 で達成率。
export type NodeStats = {
  achievedDays: number;
  applicableDays: number;
};

export const nodeAchievementStats = (
  achievements: readonly Achievement[],
  nodeId: string,
  action: Action,
  today: IsoDate,
  windowDays: number,
): NodeStats => {
  const dates = recentDateRange(today, windowDays);
  let achievedDays = 0;
  let applicableDays = 0;
  // achievements を Map 化 (該当 nodeId のみ、 date -> achieved)。 O(N + W) に抑える。
  const achievedDateSet = new Set<IsoDate>();
  for (const a of achievements) {
    if (a.nodeId === nodeId && a.achieved) achievedDateSet.add(a.date);
  }
  for (const date of dates) {
    const resolved = resolveActionForDate(action, date);
    if (resolved.kind === 'skip') continue;
    applicableDays++;
    if (achievedDateSet.has(date)) achievedDays++;
  }
  return { achievedDays, applicableDays };
};

// 1 つのチェーン分の集計 (全ノードの sum)。 action 解決失敗ノードは完全スキップ
// (FK CASCADE 整備済みだが念のため堅牢化、 dailyChainAchievementSeries と整合)。
export type ChainStats = {
  achievedDays: number;
  applicableDays: number;
};

export const chainAchievementStats = (
  achievements: readonly Achievement[],
  nodes: readonly Node[],
  actionMap: ReadonlyMap<string, Action>,
  today: IsoDate,
  windowDays: number,
): ChainStats => {
  let achievedDays = 0;
  let applicableDays = 0;
  for (const node of nodes) {
    const action = actionMap.get(node.actionId);
    if (!action) continue; // 解決失敗ノードはスキップ
    const stats = nodeAchievementStats(
      achievements,
      node.id,
      action,
      today,
      windowDays,
    );
    achievedDays += stats.achievedDays;
    applicableDays += stats.applicableDays;
  }
  return { achievedDays, applicableDays };
};

// 折れ線グラフ用の日別系列。 14D × {date, achievedNodes, applicableNodes}。
// achievedNodes / applicableNodes で当日の達成率 (UI 側で計算、 ここは生の数だけ)。
// applicableNodes=0 (全ノード variant null) の日も含める (= 「対象日が来てない」可視化)。
export type DailyChainPoint = {
  date: IsoDate;
  achievedNodes: number;
  applicableNodes: number;
};

export const dailyChainAchievementSeries = (
  achievements: readonly Achievement[],
  nodes: readonly Node[],
  actionMap: ReadonlyMap<string, Action>,
  today: IsoDate,
  windowDays: number,
): DailyChainPoint[] => {
  const dates = recentDateRange(today, windowDays);
  // achievements を nodeId -> date set に集約 (O(records) で 1 回だけ走らせる)。
  const achievedByNode = new Map<string, Set<IsoDate>>();
  for (const a of achievements) {
    if (!a.achieved) continue;
    let set = achievedByNode.get(a.nodeId);
    if (!set) {
      set = new Set();
      achievedByNode.set(a.nodeId, set);
    }
    set.add(a.date);
  }
  return dates.map((date) => {
    let applicableNodes = 0;
    let achievedNodes = 0;
    for (const node of nodes) {
      const action = actionMap.get(node.actionId);
      if (!action) continue; // 解決失敗ノードはスキップ (chainAchievementStats と整合)
      const resolved = resolveActionForDate(action, date);
      if (resolved.kind === 'skip') continue;
      applicableNodes++;
      if (achievedByNode.get(node.id)?.has(date)) achievedNodes++;
    }
    return { date, achievedNodes, applicableNodes };
  });
};

// ── #63: 日々の詳細ビュー (選んだ 1 日のスナップショット) ──
// 集計 (達成率) ではなく「その日に何が起きたか」を表示時派生で組み立てる。
// streak は出さない / マイナスは赤くしない (反 streak / Celebrate 主、 DESIGN-SYSTEM §0)。

// 選んだ日における 1 ノードの状態。
// - skipped: その日は variant null で「休む日」(達成対象外)
// - achieved: 達成記録が true (skipped のときは無視して表示側で「—」)
export type DayNodeStatus = {
  nodeId: string;
  label: string; // その日の variant 解決後ラベル
  achieved: boolean;
  skipped: boolean;
};

// チェーンのノード列を、選んだ日のステータス列に変換する (純粋)。
export const dayNodeStatuses = (
  date: IsoDate,
  nodes: readonly Pick<Node, 'id' | 'actionId'>[],
  actionsById: Readonly<Record<string, Action>>,
  achievements: readonly Achievement[],
): DayNodeStatus[] =>
  nodes.map((node) => {
    const action = actionsById[node.actionId];
    if (!action) {
      return { nodeId: node.id, label: '', achieved: false, skipped: false };
    }
    const resolved = resolveActionForDate(action, date);
    return {
      nodeId: node.id,
      label: resolved.label,
      achieved: isNodeAchievedOn(achievements, node.id, date),
      skipped: resolved.kind === 'skip',
    };
  });

// 選んだ日に記録されたメトリクス (key ごとにラベル/単位を付与)。
// recorded_at は 'YYYY-MM-DDTHH:MM:SS' 前提で日付プレフィックス一致で抽出。
export type DayMetricEntry = {
  key: string;
  label: string;
  unit: string;
  value: number;
};

export const metricsOnDate = (
  metrics: readonly Metric[],
  kinds: readonly MetricKind[],
  date: IsoDate,
): DayMetricEntry[] => {
  const kindByKey = new Map(kinds.map((k) => [k.key, k]));
  return metrics
    .filter((m) => m.recordedAt.slice(0, 10) === date)
    .map((m) => {
      const kind = kindByKey.get(m.metricKey);
      return {
        key: m.metricKey,
        label: kind?.label ?? m.metricKey,
        unit: kind?.unit ?? '',
        value: m.value,
      };
    });
};

// ── #115 (ADR-0037): 達成マトリクス (ノード × 日付の俯瞰) ──
// 分析タブの「日付チップで 1 日ずつ」を、複数日を一度に俯瞰できるマトリクスに置き換える。
// 反 streak / Celebrate 主 (DESIGN-SYSTEM §0 / ADR-0004 / ADR-0037) を守るため、 セルは
// **二値** (達成 / 未達 / 休む日) のみ。 段階塗り率・連続日数の数字や色強調・赤は持たない。
// 派生のみ (ADR-0001) — windowDates 分を毎回計算し保存しない。dayNodeStatuses と同じ
// variant 解決 (resolveActionForDate) を日付ごとに適用する。

export type DateMatrixCell = {
  date: IsoDate;
  achieved: boolean;
  skipped: boolean; // variant null の休む日 (= 達成対象外)
};

export type DateMatrixNodeRow = {
  nodeId: string;
  label: string; // 行見出し用。 最新日の variant 解決ラベル (variant で揺れても代表 1 つ)
  cells: DateMatrixCell[]; // windowDates と同順 (= 昇順、 最新が末尾)
};

export type DateMatrixChainGroup = {
  chainId: string;
  chainTitle: string;
  nodes: DateMatrixNodeRow[];
};

export const dateMatrixForWindow = (
  windowDates: readonly IsoDate[],
  chains: readonly {
    chainId: string;
    chainTitle: string;
    nodes: readonly Pick<Node, 'id' | 'actionId'>[];
  }[],
  actionsById: Readonly<Record<string, Action>>,
  achievements: readonly Achievement[],
): DateMatrixChainGroup[] =>
  chains.map((chain) => ({
    chainId: chain.chainId,
    chainTitle: chain.chainTitle,
    nodes: chain.nodes.map((node) => {
      const action = actionsById[node.actionId];
      const cells = windowDates.map((date): DateMatrixCell => {
        if (!action) return { date, achieved: false, skipped: false };
        const resolved = resolveActionForDate(action, date);
        return {
          date,
          achieved: isNodeAchievedOn(achievements, node.id, date),
          skipped: resolved.kind === 'skip',
        };
      });
      const lastDate = windowDates[windowDates.length - 1];
      const label =
        action && lastDate
          ? resolveActionForDate(action, lastDate).label
          : (action?.title ?? '');
      return { nodeId: node.id, label, cells };
    }),
  }));
