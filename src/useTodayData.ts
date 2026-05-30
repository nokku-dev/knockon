import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  effectiveTodayIsoDate,
  isAnchorFiringToday,
  isNodeEstablished,
  isPlaceAnchorFiringNow,
  isTimeAnchorFiringNow,
  recentDateRange,
  resolveActionForDate,
  sortChainsForDisplay,
  toAchievementMap,
  toggleAchievementInMap,
} from './domain';
import type {
  Achievement,
  AchievementMap,
  Anchor,
  Chain,
  IsoDate,
} from './domain';
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
import { getAppSettings } from './settingsRepository';
import type { TodayNode } from './ChainDetail';

// 1 つの active チェーン分の Today データ。
export type TodayChainData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  // ADR-0012: アンカー発火イベントモデル (時刻/場所共通の 1 日 1 回不可逆)。
  anchorFiredToday: boolean;
  // PR-Z1 (ADR-0024 §3a): 14D ウィンドウの達成記録 (派生値の元データ)。
  // 楽観更新時に nodeIdsEstablished を再計算するために保持。 永続化はしない。
  recentAchievements: readonly Achievement[];
  // PR-Z1 (ADR-0024 §3a): 定着判定済みノード ID の集合 (派生値)。 14D ウィンドウで
  // 10 日以上達成しているノードを派生計算。 楽観更新時は recentAchievements 経由で再計算。
  nodeIdsEstablished: ReadonlySet<string>;
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
  // PR-Z1 (ADR-0024 §3a): 定着判定のため 14D 範囲で記録取得。 today 単独取得から拡張。
  // 14D 取得を要求しているのは定着判定だけだが、 同じクエリでまとめて済ませる
  // (パフォーマンス影響: チェーン × 14 行 × ノード数、 N=1 規模で無視できる)。
  const recentWindow = recentDateRange(today, 14);
  const windowStart = recentWindow[0] ?? today;
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    windowStart,
    today,
  );
  const nodeIdsEstablished = new Set<string>();
  for (const n of validNodes) {
    if (isNodeEstablished(records, n.node.id, today)) {
      nodeIdsEstablished.add(n.node.id);
    }
  }

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
    recentAchievements: records,
    nodeIdsEstablished,
  };
};

const loadToday = async (): Promise<TodayData> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
  const now = new Date();
  // ADR-0028: リセット時刻 (設定可) を考慮した「今日」。 デフォルト '00:00' で既存挙動互換。
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(now, settings.resetTime);
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
  // PR-BB (ADR-0025): タイマー完了で「必ず達成にする」専用 API。
  // handleToggle は bool 反転 semantics なので、 タイマー完了で「既達成 → 未達成」に
  // 戻ってしまう罠を回避する (K-027 同型の semantics ミスマッチ防止)。
  markNodeAchieved: (
    chainId: string,
    nodeId: string,
    achieved: boolean,
  ) => Promise<void>;
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
  // PR-Z1: recentAchievements + nodeIdsEstablished も同時に再計算
  // (定着到達 / 解除を即時反映、 円→星マーカー切替が当該タップで起きる)。
  //
  // 計算量 (K-010 受容判断の明示): 1 タップで以下のコピーが走る:
  //   - target.recentAchievements.map(...) → 14D × 全ノード = 数十件規模 (Phase 1 N=1)
  //   - new Set(target.nodeIdsEstablished) → ノード数規模
  //   - setData の chains.map(...) → 全 active チェーン数
  // Phase 1 では体感影響なし。 PR-Z2 で windowDays が 31D に拡張 / 複数デバイス同期で
  // 並行操作が増えた段階で「functional update + Map 化」「タップキューイング」を
  // 判断する。 K-010 の同型ハマりを繰り返さないため数字を明文化しておく。
  const handleToggle = useCallback(
    async (chainId: string, nodeId: string) => {
      if (!data) return;
      const target = data.chains.find((c) => c.chain.id === chainId);
      if (!target) return;
      const nextAchievements = toggleAchievementInMap(
        target.achievements,
        nodeId,
      );
      const nextAchieved = nextAchievements[nodeId] ?? false;
      // recentAchievements: 今日の該当ノード record を更新 (なければ追加)。
      const hadTodayRecord = target.recentAchievements.some(
        (r) => r.nodeId === nodeId && r.date === data.today,
      );
      const nextRecent: readonly Achievement[] = hadTodayRecord
        ? target.recentAchievements.map((r) =>
            r.nodeId === nodeId && r.date === data.today
              ? { ...r, achieved: nextAchieved }
              : r,
          )
        : [
            ...target.recentAchievements,
            { nodeId, date: data.today, achieved: nextAchieved },
          ];
      // 定着判定再計算: 対象ノードのみ集合に add/delete (他ノードは変化なし)。
      const nextEstablished = new Set(target.nodeIdsEstablished);
      if (isNodeEstablished(nextRecent, nodeId, data.today)) {
        nextEstablished.add(nodeId);
      } else {
        nextEstablished.delete(nodeId);
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              chains: prev.chains.map((c) =>
                c.chain.id === chainId
                  ? {
                      ...c,
                      achievements: nextAchievements,
                      recentAchievements: nextRecent,
                      nodeIdsEstablished: nextEstablished,
                    }
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
          achieved: nextAchieved,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  // PR-BB (ADR-0025): タイマー完了で「必ず達成にする」用。 handleToggle と
  // 共通ロジックを extract したいところだが、 Phase 1 では明示的に分けて
  // 「toggle と markAchieved は別 semantics」を呼び出し側で意識させる方が安全。
  const markNodeAchieved = useCallback(
    async (chainId: string, nodeId: string, achieved: boolean) => {
      if (!data) return;
      const target = data.chains.find((c) => c.chain.id === chainId);
      if (!target) return;
      // 既に同じ状態なら何もしない (重複 record 防止 + 不要な setState 抑制)
      if ((target.achievements[nodeId] ?? false) === achieved) return;
      const nextAchievements: AchievementMap = {
        ...target.achievements,
        [nodeId]: achieved,
      };
      const hadTodayRecord = target.recentAchievements.some(
        (r) => r.nodeId === nodeId && r.date === data.today,
      );
      const nextRecent: readonly Achievement[] = hadTodayRecord
        ? target.recentAchievements.map((r) =>
            r.nodeId === nodeId && r.date === data.today
              ? { ...r, achieved }
              : r,
          )
        : [
            ...target.recentAchievements,
            { nodeId, date: data.today, achieved },
          ];
      const nextEstablished = new Set(target.nodeIdsEstablished);
      if (isNodeEstablished(nextRecent, nodeId, data.today)) {
        nextEstablished.add(nodeId);
      } else {
        nextEstablished.delete(nodeId);
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              chains: prev.chains.map((c) =>
                c.chain.id === chainId
                  ? {
                      ...c,
                      achievements: nextAchievements,
                      recentAchievements: nextRecent,
                      nodeIdsEstablished: nextEstablished,
                    }
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
          achieved,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  return { data, error, loading, handleToggle, markNodeAchieved };
};
