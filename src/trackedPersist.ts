import { track } from './analytics';
import { SETTLEMENT_DEFINITION_VERSION } from './analyticsEvents';
import type { DbClient } from './db';
import { daysToSettle, isNodeSettled } from './domain';
import type { Achievement, IsoDate, SettlementRetraction } from './domain';
import { recordAchievement } from './repository';
import { insertRetraction } from './settlementRepository';

// #293: 正準事実の書き込みと、その計測を **同じ場所** に置く層。
//
// 背景: イベント送信を各呼び出し側 (hook) に書いていたため、同じ操作に入口が
// 2 つある箇所で片方だけ送信が漏れていた。
//   - 定着取り下げ: Today の長押しメニューは送る / ログ画面の定着ポートフォリオは送らない
//   - 達成: タップ (handleToggle) は送る / タイマー完了 (markNodeAchieved) は送らない
// どちらも **漏れても何も落ちない** (計測が静かに減るだけ) ため、実データを見るまで
// 気付けない。個別に足すだけでは入口が増えるたびに再発する。
//
// よって「書き忘れうる場所」を無くす: 永続化とイベント送信をここに閉じ込め、
// 生の `recordAchievement` / `insertRetraction` を hook から直接呼ばせない。
// この規約は散文ではなく `trackedPersist.test.ts` の全走査ガードで強制する
// (除外は dev seed と定義元のみ)。
//
// ⚠ 送信は **永続化が成功した後** に行う。ADR-0053 の「観測した事実を送る」に照らすと、
// 書き込みが失敗した操作は事実として成立していない。旧実装は setData の直後・DB 書き込みの
// 前に送っており、書き込み失敗時にもイベントだけが飛んでいた。
//
// ⚠ dev seed (`seed.ts` / `screenshotSeed.ts`) はここを通さない。ダミーデータの投入で
// 計測イベントを送ってはいけないため、生の関数を直接呼ぶ側が正しい。

export type NodeAchievementWrite = {
  nodeId: string;
  date: IsoDate;
  achieved: boolean;
  // node_completed のプロパティ。チェーン内のどこで詰まるかを見るための位置情報
  // (記録内容ではないので SafeValue = number に収まる)。
  nodePosition: number;
  chainNodeCount: number;
  // 楽観更新後の達成履歴。定着判定 (is_settled / days_to_settle) をここから派生する。
  // 呼び出し側が UI 用に既に組んでいるものをそのまま渡す。
  historyAfter: readonly Achievement[];
  retractions: readonly SettlementRetraction[];
  // この書き込みの **前** に定着していたか。「到達した瞬間」だけ node_settled を送るため。
  wasSettled: boolean;
};

export const persistNodeAchievement = async (
  db: DbClient,
  input: NodeAchievementWrite,
): Promise<void> => {
  await recordAchievement(db, {
    nodeId: input.nodeId,
    date: input.date,
    achieved: input.achieved,
  });
  // ADR-0053: **達成にしたときだけ** 送る (取り消しは送らない — 悪シグナルのイベントは
  // 作らず、良シグナルの不在としてクエリ側で定義する方針)。
  if (!input.achieved) return;
  // is_settled は呼び出し側から受け取らず、履歴から派生し直す (呼び出し側が
  // 誤った値を渡す余地を作らない。純関数なので同じ入力なら同じ結果)。
  const nowSettled = isNodeSettled(
    input.historyAfter,
    input.retractions,
    input.nodeId,
    input.date,
  );
  track('node_completed', {
    node_position: input.nodePosition,
    chain_node_count: input.chainNodeCount,
    is_settled: nowSettled,
  });
  // 定着は派生値なので「到達した瞬間」はこの差分でしか観測できない。
  if (!input.wasSettled && nowSettled) {
    track('node_settled', {
      days_to_settle: daysToSettle(input.historyAfter, input.nodeId, input.date),
      definition_version: SETTLEMENT_DEFINITION_VERSION,
    });
  }
};

export type SettlementRetractionWrite = {
  nodeId: string;
  retractedAt: string;
  today: IsoDate;
  // days_since_settled の派生元。当該ノードの達成履歴を渡す。
  achievements: readonly Achievement[];
};

export const persistSettlementRetraction = async (
  db: DbClient,
  input: SettlementRetractionWrite,
): Promise<void> => {
  await insertRetraction(db, {
    nodeId: input.nodeId,
    retractedAt: input.retractedAt,
  });
  // ADR-0053: 取り下げはユーザーの明示的な操作 = 観測した事実 (ADR-0047 の正準軸)。
  // 「定着まで行ったが維持できなかった」の量を見る。
  track('settlement_retracted', {
    days_since_settled: daysToSettle(
      input.achievements,
      input.nodeId,
      input.today,
    ),
  });
};
