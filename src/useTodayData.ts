import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  isAnchorFiringToday,
  isPlaceAnchorFiringNow,
  isTimeAnchorFiringNow,
  resolveActionForDate,
  sortChainsForDisplay,
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './domain';
import type { AchievementMap, Anchor, Chain, IsoDate } from './domain';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
} from './location';
import {
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listAnchorFiringsForDate,
  listChains,
  listNodes,
  recordAchievement,
  recordAnchorFiring,
} from './repository';
import type { TodayNode } from './ChainDetail';

// 1 つの active チェーン分の Today データ。
export type TodayChainData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  // ADR-0012: アンカー発火イベントモデル (時刻/場所共通の 1 日 1 回不可逆)。
  anchorFiredToday: boolean;
};

// Today 画面全体の状態。 ADR-0020 で「手動発火」概念を廃止、 active な全チェーンを
// 並べる方針 ([ADR-0021](docs/decisions/0021-today-multichain-bottom-sheet.md))。
export type TodayData = {
  today: IsoDate;
  chains: TodayChainData[];
};

// 場所アンカーの「今日まだ発火していないとき」のみ呼ぶ GPS 経由の発火検出。
// 範囲内なら true、範囲外 / 権限なし / エラーなら false。
const detectPlaceFiringByGps = async (anchor: Anchor): Promise<boolean> => {
  if (
    anchor.kind !== 'place' ||
    anchor.latitude == null ||
    anchor.longitude == null ||
    anchor.radiusMeters == null
  ) {
    return false;
  }
  try {
    const permission = await getLocationPermissionStatus();
    if (permission !== 'granted') return false;
    const pos = await getCurrentPosition();
    return isPlaceAnchorFiringNow(anchor, pos);
  } catch {
    return false;
  }
};

// 1 つの active チェーンを Today 表示用に解決する純粋 async ロジック。
const loadChainForToday = async (
  chain: Chain,
  today: IsoDate,
  now: Date,
): Promise<TodayChainData | null> => {
  const db = await getExpoSqliteClient();
  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;

  const nodes = await listNodes(db, chain.id);
  // Phase 2 variant: 各アクションを resolveActionForDate で今日の発火可否 + ラベルに解決。
  // kind='skip' のノードも除外せず TodayNode として残す (グレー表示用、 ユーザー
  // フィードバック「設定したのに表示されないと勘違いする」への対応)。
  const withActions = await Promise.all(
    nodes.map(async (node) => {
      const action = await getAction(db, node.actionId);
      if (!action) return null;
      const resolved = resolveActionForDate(action, today);
      return { node, action, label: resolved.label, kind: resolved.kind };
    }),
  );
  const validNodes = withActions.filter((x): x is TodayNode => x !== null);
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    today,
    today,
  );

  // ADR-0012: 既存の発火 record があれば「今日発火済み」確定。
  const todayFirings = await listAnchorFiringsForDate(db, anchor.id, today);
  const alreadyFired = isAnchorFiringToday(todayFirings, anchor.id, today);

  // 時刻アンカーは loadChainForToday の中で発火判定 + record 投入まで完結。
  let anchorFiredToday = alreadyFired;
  if (!alreadyFired && isTimeAnchorFiringNow(anchor, now)) {
    await recordAnchorFiring(db, { anchorId: anchor.id, date: today });
    anchorFiredToday = true;
  }

  return {
    chain,
    anchor,
    nodes: validNodes,
    achievements: toAchievementMap(records, today),
    anchorFiredToday,
  };
};

const loadToday = async (): Promise<TodayData> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
  const now = new Date();
  const today = todayIsoDate(now);
  // ADR-0020: 全 active チェーンを並べる (旧コードの chains[0] バグを修正)。
  const loaded = await Promise.all(
    chains.map((c) => loadChainForToday(c, today, now)),
  );
  const valid = loaded.filter((x): x is TodayChainData => x !== null);
  // 表示順: 時刻アンカー (time 昇順) → place (createdAt 昇順) → behavior (createdAt 昇順)
  // (PR feat/chain-sort-by-anchor-time、 ユーザー判断)
  return {
    today,
    chains: sortChainsForDisplay(valid),
  };
};

export type UseTodayDataResult = {
  data: TodayData | null;
  error: string | null;
  loading: boolean;
  handleToggle: (chainId: string, nodeId: string) => Promise<void>;
};

export const useTodayData = (): UseTodayDataResult => {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadToday()
        .then(async (d) => {
          if (cancelled) return;
          setData(d);
          setLoading(false);
          // 場所アンカーで今日まだ発火していないチェーンだけ GPS 取得 → 範囲内なら record。
          // 各チェーン独立に走らせる (Phase 2 N=2 で race を観測したら判断、 K-017 同型)。
          await Promise.all(
            d.chains.map(async (chainData) => {
              if (chainData.anchor.kind !== 'place') return;
              if (chainData.anchorFiredToday) return;
              const firing = await detectPlaceFiringByGps(chainData.anchor);
              if (cancelled || !firing) return;
              try {
                const db = await getExpoSqliteClient();
                await recordAnchorFiring(db, {
                  anchorId: chainData.anchor.id,
                  date: d.today,
                });
              } catch {
                // record 失敗時の rollback は K-010 同様に入れない。次の focus で再試行可能。
              }
              if (!cancelled) {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        chains: prev.chains.map((c) =>
                          c.chain.id === chainData.chain.id
                            ? { ...c, anchorFiredToday: true }
                            : c,
                        ),
                      }
                    : prev,
                );
              }
            }),
          );
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // 楽観更新: タップで UI を即時反転 → 非同期で永続化 (K-010 受容判断)。
  const handleToggle = useCallback(
    async (chainId: string, nodeId: string) => {
      if (!data) return;
      const target = data.chains.find((c) => c.chain.id === chainId);
      if (!target) return;
      const nextAchievements = toggleAchievementInMap(
        target.achievements,
        nodeId,
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              chains: prev.chains.map((c) =>
                c.chain.id === chainId
                  ? { ...c, achievements: nextAchievements }
                  : c,
              ),
            }
          : prev,
      );
      try {
        const db = await getExpoSqliteClient();
        await recordAchievement(db, {
          nodeId,
          date: data.today,
          achieved: nextAchievements[nodeId] ?? false,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  return { data, error, loading, handleToggle };
};
