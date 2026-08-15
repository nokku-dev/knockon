import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  countSettlementStages,
  effectiveTodayIsoDate,
  localIsoTimestamp,
  nodeSettlementStage,
  settlementStageMovements,
} from './domain';
import type {
  Achievement,
  IsoDate,
  SettlementStage,
  SettlementStageCounts,
  SettlementStageMovements,
} from './domain';
import {
  getAction,
  listAchievementsForNodes,
  listChains,
  listNodes,
} from './repository';
import { getAppSettings } from './settingsRepository';
import { listRetractions } from './settlementRepository';
import { persistSettlementRetraction } from './trackedPersist';

// ADR-0047: ログ画面 = 定着ポートフォリオ。 旧「達成率ダッシュボード」(PR-Z2) を組み替え、
// active な全チェーンのノードを「これから / 育成中 / 定着」の 3 ステージに派生分類する。
// 達成率 (= 比率・ADR-0036 (−) 禁則) は撤去。 保存は事実のみ、 分類は表示時の派生関数
// (isNodeSettled / nodeSettlementStage、 派生値カラム禁止・ADR-0001 / K-006)。

// ポートフォリオ 1 行分。 chainId / nodeId は取り下げ導線が使う。 actionTitle / chainTitle は
// 表示用 (保存せず派生解決)。 stage は nodeSettlementStage の派生結果。
export type SettlementPortfolioNode = {
  chainId: string;
  nodeId: string;
  actionTitle: string;
  chainTitle: string;
  stage: SettlementStage;
};

export type AnalyticsData = {
  today: IsoDate;
  // 上部カウント (クロス断面スナップショット)。 定着 / もう少しで定着 / 育成中の 3 ステージ。
  counts: SettlementStageCounts;
  // 先週からの流入数 (定着入り / もう少しで定着入り・Celebrate フロー)。
  movements: SettlementStageMovements;
  nodes: SettlementPortfolioNode[];
  // #293: 取り下げ時の settlement_retracted (days_since_settled) を派生するために保持する。
  // 表示には使わない。 loadAnalytics が既に全期間分を集めているので追加の I/O は無い。
  achievements: readonly Achievement[];
};

const loadAnalytics = async (): Promise<AnalyticsData> => {
  const db = await getExpoSqliteClient();
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(new Date(), settings.resetTime);
  // ADR-0047: 定着判定 (latch) は取り下げ事実を参照する。 全件を 1 度だけ load。
  const retractions = await listRetractions(db);

  // active なチェーンだけ (stocked は休止中のため portfolio から除外、 Today と同じ方針)。
  const chains = await listChains(db, 'active');

  const portfolioNodes: SettlementPortfolioNode[] = [];
  // counts は全チェーン横断で数えるため、 全達成記録を貫通で貯める (nodeSettlementStage /
  // countSettlementStages は nodeId で filter するので混在しても混線しない)。
  const allRecords: Achievement[] = [];

  // K-010 同型の受容判断: chain 間逐次 (N=1 規模で体感問題なし)。 多チェーンで遅延が出たら
  // Promise.all + action 横断キャッシュへ。 定着 latch のため達成は全期間取得 (14D では不足)。
  for (const chain of chains) {
    // Today と同様、 一時停止 (active=false) ノードは portfolio から外す (= 外すが残す)。
    const nodes = (await listNodes(db, chain.id)).filter(
      (n) => n.active !== false,
    );
    const records = await listAchievementsForNodes(
      db,
      nodes.map((n) => n.id),
      undefined,
      today,
    );
    allRecords.push(...records);
    for (const node of nodes) {
      const action = await getAction(db, node.actionId);
      portfolioNodes.push({
        chainId: chain.id,
        nodeId: node.id,
        actionTitle: action?.title ?? '(不明なアクション)',
        chainTitle: chain.title,
        stage: nodeSettlementStage(records, retractions, node.id, today),
      });
    }
  }

  const allPortfolioNodeIds = portfolioNodes.map((n) => n.nodeId);
  const counts = countSettlementStages(
    allPortfolioNodeIds,
    allRecords,
    retractions,
    today,
  );
  // 先週 (7 日前) から定着 / もう少しで定着へ入った個数 (流入・Celebrate フロー)。
  const movements = settlementStageMovements(
    allPortfolioNodeIds,
    allRecords,
    retractions,
    today,
    7,
  );

  return {
    today,
    counts,
    movements,
    nodes: portfolioNodes,
    achievements: allRecords,
  };
};

export type UseAnalyticsDataResult = {
  data: AnalyticsData | null;
  error: string | null;
  loading: boolean;
  // ADR-0047: 定着ポートフォリオから定着を取り下げる。 楽観更新でノードを settled → growing に
  // 移し (取り下げ直後は isNodeSettled が false・過去タップが残るので growing 確定)、 counts も
  // settled--/growing++。 永続化は insertRetraction。 K-010 同型で rollback は入れない。
  retract: (nodeId: string) => Promise<void>;
};

export const useAnalyticsData = (): UseAnalyticsDataResult => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // タブを開くたびの読み込み表示 (スピナー) の煩わしさ解消。 初回だけ loading を出し、
  // 2 回目以降は前回データを見せたまま背景で再取得して差し替える (stale-while-revalidate)。
  const loadedOnceRef = useRef(false);
  // #293: retract は識別子を安定させたいので deps を空に保ちつつ、計測に要る today /
  // achievements を ref 経由で参照する (useDiscovery の previewRef と同型)。
  const dataRef = useRef<AnalyticsData | null>(null);
  dataRef.current = data;

  const retract = useCallback(async (nodeId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      let changed = false;
      const nodes = prev.nodes.map((n) => {
        if (n.nodeId === nodeId && n.stage === 'settled') {
          changed = true;
          return { ...n, stage: 'growing' as SettlementStage };
        }
        return n;
      });
      if (!changed) return prev;
      return {
        ...prev,
        nodes,
        counts: {
          ...prev.counts,
          settled: prev.counts.settled - 1,
          growing: prev.counts.growing + 1,
        },
      };
    });
    const snapshot = dataRef.current;
    try {
      const db = await getExpoSqliteClient();
      // #293: この導線は insertRetraction を直接呼んでおり settlement_retracted を
      // 送っていなかった (Today の長押しメニューだけが送っていた)。永続化と計測を
      // まとめた trackedPersist を通す。
      await persistSettlementRetraction(db, {
        nodeId,
        // #273: ローカル壁時計で保存する。domain.ts の lastRetractionDateForNode が
        // slice(0, 10) で日付部を取り、ローカル日付である達成日と比較するため、
        // UTC だと JST 00:00〜08:59 の取り下げが前日扱いになり定着判定が狂う。
        retractedAt: localIsoTimestamp(new Date()),
        today: snapshot?.today ?? effectiveTodayIsoDate(new Date(), '00:00'),
        achievements: snapshot?.achievements ?? [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // 初回のみスピナー。 2 回目以降は前回データを保持したまま背景更新 (キャッシュ的挙動)。
      if (!loadedOnceRef.current) setLoading(true);
      loadAnalytics()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError(null);
            loadedOnceRef.current = true;
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return { data, error, loading, retract };
};
