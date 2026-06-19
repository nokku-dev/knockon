import type { Action, IsoDate, Node } from './domain';
import { resolveActionForDate } from './domain';

// Issue #169 / ADR-0042: 夜の達成サマリ通知 (night summary push)。
//
// 設計の要点:
// - 送信時刻 21:00 (= 夜のリフレクション窓、 就寝前の見直しに間に合う)。
//   Duolingo / Streaks / Habitica など習慣アプリの evening reminder と整合。
// - 通知 ID は per-chain (`chain-{id}`) と衝突しない `'night-summary'` 固定。
// - 本文 (formatNightSummaryBody) は 4 象限分岐:
//   - N>0 / M>0: 「今日は N 個アクションを達成済み。M 個の達成チャンスがあります。」
//   - N>0 / M=0: 「今日は N 個アクションを達成済み。お疲れさまでした。」
//   - N=0 / M>0: 「M 個の達成チャンスがあります。」 (達成 0 を指差さない)
//   - N=0 / M=0: null (= 通知出さない判断)
//   反 streak / Celebrate 主 (CLAUDE.md §Augmentation / DESIGN-SYSTEM §0) と整合。
// - 単位「個アクション」「個」は ADR-0041 (`累計 N 個達成`) の語彙体系と統一。

export const NIGHT_SUMMARY_HOUR = 21;
export const NIGHT_SUMMARY_MINUTE = 0;
export const NIGHT_SUMMARY_NOTIFICATION_ID = 'night-summary';

// 1 チェーン分の「今日の fire ノード + 今日の達成 map」スナップショット。
// computeNightSummary は複数チェーンを合算して { achieved, remaining } を出す。
export type NightSummaryChainSnapshot = {
  nodes: ReadonlyArray<{ node: Node; action: Action }>;
  achievementsToday: Readonly<Record<string, boolean>>;
};

export type NightSummary = {
  achievedCount: number;
  remainingCount: number;
};

// 全 active チェーンを合算して「今日の達成数 N」「今日まだ達成可能なノード数 M」を派生。
// 除外ルール:
// - node.active === false (一時停止ノード): どちらにも算入しない
// - resolveActionForDate(action, today).kind === 'skip' (variant の休む日): どちらにも算入しない
// 残り (= fire ノード) のうち achievementsToday[nodeId] === true なら achieved、 そうでなければ remaining。
export const computeNightSummary = (
  chains: ReadonlyArray<NightSummaryChainSnapshot>,
  today: IsoDate,
): NightSummary => {
  let achievedCount = 0;
  let remainingCount = 0;
  for (const chain of chains) {
    for (const { node, action } of chain.nodes) {
      if (node.active === false) continue;
      const resolved = resolveActionForDate(action, today);
      if (resolved.kind !== 'fire') continue;
      if (chain.achievementsToday[node.id] === true) {
        achievedCount++;
      } else {
        remainingCount++;
      }
    }
  }
  return { achievedCount, remainingCount };
};

// 通知本文の 4 象限分岐。 N=0 / M=0 のときは null (= 通知出さない)。
// 文言は Issue #169 本文準拠 + Augmentation 原則 (= 達成 0 を指差さない)。
export const formatNightSummaryBody = (
  achievedCount: number,
  remainingCount: number,
): string | null => {
  if (achievedCount === 0 && remainingCount === 0) return null;
  if (achievedCount > 0 && remainingCount > 0) {
    return `今日は${achievedCount}個アクションを達成済み。${remainingCount}個の達成チャンスがあります。`;
  }
  if (achievedCount > 0) {
    return `今日は${achievedCount}個アクションを達成済み。お疲れさまでした。`;
  }
  // achievedCount === 0 && remainingCount > 0
  return `${remainingCount}個の達成チャンスがあります。`;
};
