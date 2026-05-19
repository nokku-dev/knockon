import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  isAnchorFiringToday,
  isPlaceAnchorFiringNow,
  isTimeAnchorFiringNow,
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './domain';
import type { AchievementMap, Anchor, Chain } from './domain';
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
import type { TodayNode } from './TodayScreen';

export type TodayData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  today: string;
  // ADR-0012: アンカー発火イベントモデル。
  // 時刻/場所共通の「今日発火済み」フラグ。anchor_firings に record があるか
  // どうかで決まる。一度発火したら範囲を出る・時刻を巻き戻るなどしてもその日中は
  // 発火済み扱い。
  anchorFiredToday: boolean;
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

const loadToday = async (): Promise<TodayData | null> => {
  const db = await getExpoSqliteClient();

  const chains = await listChains(db, 'active');
  const chain = chains[0];
  if (!chain) return null;

  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;

  const nodes = await listNodes(db, chain.id);
  const withActions = await Promise.all(
    nodes.map(async (node) => {
      const action = await getAction(db, node.actionId);
      return action ? { node, action } : null;
    }),
  );
  const validNodes = withActions.filter((x): x is TodayNode => x !== null);
  const now = new Date();
  const today = todayIsoDate(now);
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    today,
    today,
  );

  // ADR-0012: 既存の発火 record があれば「今日発火済み」確定。
  // GPS / 時刻判定は不要 → loadToday の base で同期に判定できる。
  const todayFirings = await listAnchorFiringsForDate(db, anchor.id, today);
  const alreadyFired = isAnchorFiringToday(todayFirings, anchor.id, today);

  // 時刻アンカーは loadToday の中で発火判定 + record 投入まで完結。
  // (時刻判定は now 比較だけなので同期に終わる → UI block しない)
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
    today,
    anchorFiredToday,
  };
};

export type UseTodayDataResult = {
  data: TodayData | null;
  error: string | null;
  loading: boolean;
  handleToggle: (nodeId: string) => Promise<void>;
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
          if (cancelled || !d) {
            if (!cancelled) {
              setData(d);
              setLoading(false);
            }
            return;
          }
          setData(d);
          setLoading(false);
          // 場所アンカーで今日まだ発火していない場合のみ GPS 取得 → 範囲内なら record。
          // UI を block しないよう base 表示後に非同期で。一度発火したら以後の focus
          // 復帰時は loadToday 内で alreadyFired = true を見て GPS を skip する
          // (ADR-0012)。
          if (d.anchor.kind === 'place' && !d.anchorFiredToday) {
            const firing = await detectPlaceFiringByGps(d.anchor);
            if (cancelled || !firing) return;
            try {
              const db = await getExpoSqliteClient();
              await recordAnchorFiring(db, {
                anchorId: d.anchor.id,
                date: d.today,
              });
            } catch {
              // record 失敗時の rollback は K-010 同様に入れない。次の focus で再試行可能。
            }
            if (!cancelled) {
              setData((prev) =>
                prev ? { ...prev, anchorFiredToday: true } : prev,
              );
            }
          }
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

  // 楽観更新: タップで UI を即時反転 → 非同期で永続化。
  // Phase 1.2 では DB エラー時の rollback を入れない (SQLite ローカル同期書込で
  // ほぼ失敗しない前提)。実使用で乖離が観測されたら rollback or リトライを判断 (K-010)。
  const handleToggle = useCallback(
    async (nodeId: string) => {
      if (!data) return;
      const nextAchievements = toggleAchievementInMap(
        data.achievements,
        nodeId,
      );
      setData({ ...data, achievements: nextAchievements });
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
