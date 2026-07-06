import type {
  Achievement,
  Action,
  IsoDate,
  Node,
  SettlementRetraction,
} from './domain';
import {
  isNodeAchievedOn,
  isNodeSettled,
  recentDateRange,
  resolveActionForDate,
} from './domain';

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

// ── #115 (ADR-0037): 達成マトリクス (ノード × 日付の俯瞰) ──
// 分析タブの達成記録を、複数日を一度に俯瞰できるマトリクスで表示する。
// (#128: 旧「日々の詳細」(#63 / ADR-0034) のチップ列 + 1 日スナップショットは、 マトリクスと
//  ノード状態が重複するため廃止。 dayNodeStatuses / metricsOnDate もそれと共に撤去した。)
// 反 streak / Celebrate 主 (DESIGN-SYSTEM §0 / ADR-0004 / ADR-0037) を守るため、 セルは
// **二値** (達成 / 未達 / 休む日) のみ。 段階塗り率・連続日数の数字や色強調・赤は持たない。
// 派生のみ (ADR-0001) — windowDates 分を毎回計算し保存しない。 日付ごとに variant 解決
// (resolveActionForDate) を適用する。

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

// #125 / ADR-0038: ノード単位の DateMatrixCell 列を返す純粋関数。 Today ChainDetail
// のアクション行右端に直近 7 日間 (ADR-0038 で正式化した「実行直前の振り返り窓」) の
// 達成グリフマトリクスを描画する用途で抽出した。
// dateMatrixForWindow (#115 / ADR-0037 の 60D 中期俯瞰窓) と同じ語彙 (達成 / 未達 / 休む日
// = variant null) を維持し、 チェーン単位のグループ化責務だけを上位に分離する形。
// 窓値 (= windowDates.length) は呼び出し側で固定する (ADR-0038 §決定 3「同じ目的に複数窓を
// 持たない」 — 7D は Today ChainDetail 専用、 14D / 60D は別目的)。
export const nodeDateMatrixCells = (
  windowDates: readonly IsoDate[],
  action: Action | undefined,
  nodeId: string,
  achievements: readonly Achievement[],
): DateMatrixCell[] =>
  windowDates.map((date): DateMatrixCell => {
    if (!action) return { date, achieved: false, skipped: false };
    const resolved = resolveActionForDate(action, date);
    return {
      date,
      achieved: isNodeAchievedOn(achievements, nodeId, date),
      skipped: resolved.kind === 'skip',
    };
  });

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
      const cells = nodeDateMatrixCells(windowDates, action, node.id, achievements);
      const lastDate = windowDates[windowDates.length - 1];
      const label =
        action && lastDate
          ? resolveActionForDate(action, lastDate).label
          : (action?.title ?? '');
      return { nodeId: node.id, label, cells };
    }),
  }));

// ADR-0047: 60D マトリクスの「定着バンド」用派生。 windowDates のうち「その日時点でノードが
// 定着 (latch) している」日付だけを返す (= 表示層で帯を敷く対象日)。 レコードは生成しない
// (K-002 / ADR-0001)。 latch 判定は数ヶ月前の定着窓も参照するため、 60D 窓ではなく全期間
// 達成履歴 (fullHistory) を渡す必要がある。 純粋関数 (isNodeSettled を各日について評価)。
// 注 (簡略化): retractions は「現在の最新取り下げ」で解釈するため、 取り下げより前の
// 過去に一度定着していた期間は帯を出さない (= 現在有効な定着スパンのみ帯にする)。 N=1 で
// 取り下げが稀なうちは実害なし。 厳密な履歴帯が要れば「as-of 取り下げ」に拡張する。
export const settledDatesForNode = (
  fullHistory: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  nodeId: string,
  windowDates: readonly IsoDate[],
): IsoDate[] =>
  windowDates.filter((date) =>
    isNodeSettled(fullHistory, retractions, nodeId, date),
  );
