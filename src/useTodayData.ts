import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import {
  countSettlementStages,
  effectiveTodayIsoDate,
  isAnchorFiringToday,
  isNodeSettled,
  isPlaceAnchorFiringNow,
  isTimeAnchorFiringNow,
  localIsoTimestamp,
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
  SettlementRetraction,
} from './domain';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
} from './location';
import {
  countAchievedBefore,
  getAction,
  getAnchor,
  listAchievementsForNodes,
  listAllAchievements,
  listAllNodeIds,
  listAnchorFiringsForDate,
  listChains,
  listNodes,
  recordAnchorFiring,
} from './repository';
import { getAppSettings, updateAppSettings } from './settingsRepository';
import { listRetractions } from './settlementRepository';
import {
  persistNodeAchievement,
  persistSettlementRetraction,
} from './trackedPersist';
import type { TodayNode } from './ChainDetail';

// 1 つの active チェーン分の Today データ。
export type TodayChainData = {
  chain: Chain;
  anchor: Anchor;
  nodes: TodayNode[];
  achievements: AchievementMap;
  // ADR-0012: アンカー発火イベントモデル (時刻/場所共通の 1 日 1 回不可逆)。
  anchorFiredToday: boolean;
  // ADR-0047: このチェーンのノード群の「今日以前・全期間」達成履歴 (派生値の元データ)。
  // 定着 latch (isNodeSettled) は数ヶ月前の定着窓も参照するため 14D では不足 → 全期間保持。
  // 楽観更新時に nodeIdsSettled を再計算するために保持。 永続化はしない。
  achievementHistory: readonly Achievement[];
  // ADR-0047: 定着 (settled) 済みノード ID の集合 (派生値・latch)。 取り下げ以降に 14D 窓で
  // 10 日以上を満たした窓が過去に一度でも存在すれば定着 (isNodeSettled)。 星ドット (ADR-0050)
  // の表示に使う。 楽観更新時は achievementHistory + retractions 経由で再計算。
  nodeIdsSettled: ReadonlySet<string>;
};

// Today 画面全体の状態。 ADR-0020 で「手動発火」概念を廃止、 active な全チェーンを
// 並べる方針 ([ADR-0021](docs/decisions/0021-today-multichain-bottom-sheet.md))。
export type TodayData = {
  today: IsoDate;
  chains: TodayChainData[];
  // ADR-0047: 全ノードの定着取り下げ事実 (正準 5 軸目)。 定着判定 (isNodeSettled) の
  // 引数。 アプリ全体で 1 度だけ load し、 楽観更新 (retractSettlement) で追記する。
  retractions: readonly SettlementRetraction[];
  // ADR-0050 (2026-07-07): アプリ全体の定着ノード数 (派生・latch)。 Today 見出しに「定着 N 個」
  // を出す (旧「累計 N 個達成」を置換)。 定着は 10 日以上の積み上げが要るため日内に増減せず、
  // タップの楽観更新対象ではない (次 focus で反映)。
  settledCount: number;
  // #165 立ち上げチェックリストのマイルストーン (first/ten-achievement) 用の実タップ通算
  // (今日より前)。 見出しには出さない。 表示側で今日の実達成を足す。
  achievedBeforeToday: number;
  // #165 (ADR-0042 P1): 立ち上げチェックリストの表示判定に使う app_settings 由来の値。
  // onboarding 完了済みか (= まだ onboarding 中は出さない)、dismiss 時刻 (null = 未 dismiss)、
  // 「アクションを 1 つ追加した」フラグ。チェーン数・通算達成数は chains / achievedBeforeToday
  // から表示側でライブ算出する (楽観更新で即反映される)。
  onboardingCompleted: boolean;
  checklistDismissedAt: string | null;
  checklistAddedAction: boolean;
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
  retractions: readonly SettlementRetraction[],
): Promise<TodayChainData | null> => {
  const db = await getExpoSqliteClient();
  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;

  // #73 (SPEC §6): 一時停止 (active=false) のノードは Today に出さない (= 外すが残す)。
  const nodes = (await listNodes(db, chain.id)).filter((n) => n.active !== false);
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
  // ADR-0047: 定着 (settled) は latch (取り下げ以降に 14D 窓で 10 日達成した窓が過去に
  // 一度でも存在すれば定着)。 latch 判定は 14D 窓では不足する (数ヶ月前に定着し直近タップが
  // 無いノードを取りこぼす) ため、 このノード群の全期間達成を取得して isNodeSettled に渡す。
  // fromDate を省くと全期間取得。 N=1 では行数は年単位でも数百程度で無視できる。
  // 表示系 (toAchievementMap = 今日 / matrix = 7D / スパイン = 14D) は同じ配列を内部で
  // 日付フィルタして使う (単一の真実ソース)。 today 以前に限定 (未来の record は派生に含めない)。
  const records = await listAchievementsForNodes(
    db,
    validNodes.map((n) => n.node.id),
    undefined,
    today,
  );
  const nodeIdsSettled = new Set<string>();
  for (const n of validNodes) {
    if (isNodeSettled(records, retractions, n.node.id, today)) {
      nodeIdsSettled.add(n.node.id);
    }
  }
  // ADR-0012: 既存の発火 record があれば「今日発火済み」確定。
  const todayFirings = await listAnchorFiringsForDate(db, anchor.id, today);
  const alreadyFired = isAnchorFiringToday(todayFirings, anchor.id, today);

  // 時刻アンカーは loadChainForToday の中で発火判定 + record 投入まで完結。
  let anchorFiredToday = alreadyFired;
  if (!alreadyFired && isTimeAnchorFiringNow(anchor, now)) {
    // ADR-0055: 時刻アンカーの発火判定は Today の focus 時にしか走らない = 前景経路。
    await recordAnchorFiring(db, {
      anchorId: anchor.id,
      date: today,
      source: 'foreground',
    });
    anchorFiredToday = true;
  }

  return {
    chain,
    anchor,
    nodes: validNodes,
    achievements: toAchievementMap(records, today),
    anchorFiredToday,
    achievementHistory: records,
    nodeIdsSettled,
  };
};

const loadToday = async (): Promise<TodayData> => {
  const db = await getExpoSqliteClient();
  const chains = await listChains(db, 'active');
  const now = new Date();
  // ADR-0028: リセット時刻 (設定可) を考慮した「今日」。 デフォルト '00:00' で既存挙動互換。
  const settings = await getAppSettings(db);
  const today = effectiveTodayIsoDate(now, settings.resetTime);
  // ADR-0047: 定着取り下げ事実を 1 度だけ全件 load し、 各チェーンの定着判定に渡す
  // (isNodeSettled はノード別に最新取り下げで解釈する)。
  const retractions = await listRetractions(db);
  // ADR-0020: 全 active チェーンを並べる (旧コードの chains[0] バグを修正)。
  const loaded = await Promise.all(
    chains.map((c) => loadChainForToday(c, today, now, retractions)),
  );
  const valid = loaded.filter((x): x is TodayChainData => x !== null);
  // ADR-0050 (2026-07-07): Today 見出しは累計 (#142 / #205 effective) をやめ「定着 N 個」を出す
  // (ユーザー判断: Celebrate の主役を「定着個数」に)。 定着数はアプリ全体 (active / 非 active
  // 問わず全ノード) の派生カウント。 定着 latch は数ヶ月前の窓も参照するため全ノード・全達成を
  // load して countSettlementStages で派生。 K-010 受容: N=1 で件数少なく体感問題なし。
  const allNodeIds = await listAllNodeIds(db);
  const allAchievements = await listAllAchievements(db, today);
  const settledCount = countSettlementStages(
    allNodeIds,
    allAchievements,
    retractions,
    today,
  ).settled;
  // #165 立ち上げチェックリスト用の実タップ通算 (first/ten-achievement マイルストーン)。
  // 見出しには出さない (見出しは settledCount)。 実タップベースの SQL COUNT。
  const achievedBeforeToday = await countAchievedBefore(db, today);
  // 表示順: 時刻アンカー (time 昇順) → place (createdAt 昇順) → behavior (createdAt 昇順)
  // (PR feat/chain-sort-by-anchor-time、 ユーザー判断)
  return {
    today,
    chains: sortChainsForDisplay(valid),
    retractions,
    settledCount,
    achievedBeforeToday,
    onboardingCompleted: settings.onboardingCompleted,
    checklistDismissedAt: settings.checklistDismissedAt,
    checklistAddedAction: settings.checklistAddedAction,
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
  // #165 (ADR-0042 P1): 立ち上げチェックリストを閉じる。dismiss 時刻を app_settings に
  // 永続化し、 ローカル state を即時更新 (= タップで即座に消える楽観更新)。
  dismissChecklist: () => Promise<void>;
  // ADR-0047: 定着を「取り下げる」観測事実を記録。 システムは降格させず本人だけが取り下げる
  // (マイナスを指差さない / Augmentation)。 取り下げ以降は再び実タップで定着バーを満たすまで
  // 育成中に戻る。 楽観更新で当該ノードを即 nodeIdsSettled から外す。
  retractSettlement: (chainId: string, nodeId: string) => Promise<void>;
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
                  // ADR-0055: Today の focus 復帰時の GPS 距離判定 = 前景経路。
                  // この経路は通知を出さない (ジオフェンス経路との違い)。
                  source: 'foreground',
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
  // achievementHistory + nodeIdsSettled も同時に再計算 (定着到達 / 解除を即時反映、
  // ★ 星の表示切替が当該タップで起きる、 ADR-0047 latch)。
  //
  // 計算量 (K-010 受容判断の明示): 1 タップで以下のコピーが走る:
  //   - target.achievementHistory.map(...) → 全期間 × 全ノード = 数十〜数百件規模 (Phase 1 N=1)
  //   - new Set(target.nodeIdsSettled) → ノード数規模
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
      const hadTodayRecord = target.achievementHistory.some(
        (r) => r.nodeId === nodeId && r.date === data.today,
      );
      const nextHistory: readonly Achievement[] = hadTodayRecord
        ? target.achievementHistory.map((r) =>
            r.nodeId === nodeId && r.date === data.today
              ? { ...r, achieved: nextAchieved }
              : r,
          )
        : [
            ...target.achievementHistory,
            { nodeId, date: data.today, achieved: nextAchieved },
          ];
      // 定着判定再計算: 対象ノードのみ集合に add/delete (他ノードは変化なし)。
      // ADR-0047: 定着 (latch) を再計算。 タップで 10 日目の窓が成立すれば add、 取り下げ済みで
      // 未再定着なら false のまま。 未タップに戻して窓が崩れれば delete (派生は履歴に忠実)。
      const wasSettled = target.nodeIdsSettled.has(nodeId);
      const nowSettled = isNodeSettled(
        nextHistory,
        data.retractions,
        nodeId,
        data.today,
      );
      const nextSettled = new Set(target.nodeIdsSettled);
      if (nowSettled) {
        nextSettled.add(nodeId);
      } else {
        nextSettled.delete(nodeId);
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
                      achievementHistory: nextHistory,
                      nodeIdsSettled: nextSettled,
                    }
                  : c,
              ),
            }
          : prev,
      );
      try {
        const db = await getExpoSqliteClient();
        // #293: 永続化と計測は trackedPersist にまとめてある (hook 側で track を
        // 書くと入口が増えたときに漏れる。タイマー経由の達成が実際に漏れていた)。
        await persistNodeAchievement(db, {
          nodeId,
          date: data.today,
          achieved: nextAchieved,
          nodePosition: target.nodes.findIndex((n) => n.node.id === nodeId),
          chainNodeCount: target.nodes.length,
          historyAfter: nextHistory,
          retractions: data.retractions,
          wasSettled,
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
      const hadTodayRecord = target.achievementHistory.some(
        (r) => r.nodeId === nodeId && r.date === data.today,
      );
      const nextHistory: readonly Achievement[] = hadTodayRecord
        ? target.achievementHistory.map((r) =>
            r.nodeId === nodeId && r.date === data.today
              ? { ...r, achieved }
              : r,
          )
        : [
            ...target.achievementHistory,
            { nodeId, date: data.today, achieved },
          ];
      // ADR-0047: 定着 (latch) を再計算。 タップで 10 日目の窓が成立すれば add、 取り下げ済みで
      // 未再定着なら false のまま。 未タップに戻して窓が崩れれば delete (派生は履歴に忠実)。
      // #293: wasSettled は node_settled を「到達の瞬間」だけ送るために要る。
      const wasSettled = target.nodeIdsSettled.has(nodeId);
      const nextSettled = new Set(target.nodeIdsSettled);
      if (isNodeSettled(nextHistory, data.retractions, nodeId, data.today)) {
        nextSettled.add(nodeId);
      } else {
        nextSettled.delete(nodeId);
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
                      achievementHistory: nextHistory,
                      nodeIdsSettled: nextSettled,
                    }
                  : c,
              ),
            }
          : prev,
      );
      try {
        const db = await getExpoSqliteClient();
        // #293: タイマー完了経由の達成が node_completed / node_settled を送っていなかった
        // (タイマーで達成した回数が計測上ゼロに見えていた)。trackedPersist に一本化する。
        await persistNodeAchievement(db, {
          nodeId,
          date: data.today,
          achieved,
          nodePosition: target.nodes.findIndex((n) => n.node.id === nodeId),
          chainNodeCount: target.nodes.length,
          historyAfter: nextHistory,
          retractions: data.retractions,
          wasSettled,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  // #165 (ADR-0042 P1): チェックリストを dismiss する。楽観更新でローカル state に
  // 時刻を入れて即時非表示にし、 非同期で app_settings に永続化 (handleToggle と同型の
  // K-010 受容判断)。永続化失敗は error state に出すが UI は閉じたままにする
  // (= 次の focus で再 load され、 失敗していれば再表示されるので silent には握り潰さない)。
  const dismissChecklist = useCallback(async () => {
    const dismissedAt = localIsoTimestamp(new Date());
    setData((prev) =>
      prev ? { ...prev, checklistDismissedAt: dismissedAt } : prev,
    );
    try {
      const db = await getExpoSqliteClient();
      await updateAppSettings(db, { checklistDismissedAt: dismissedAt });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // ADR-0047: 定着を「取り下げる」。 取り下げ時刻を観測事実として記録し、 楽観更新で当該
  // ノードを即 nodeIdsSettled から外す (取り下げ以降に達成が無ければ isNodeSettled は false)。
  // 取り下げは日付粒度で最新を採用するが、 retracted_at は秒精度で保存 (同日再定着の窓境界を
  // 厳密にするため)。 K-010 と同型の受容判断で rollback は入れない (失敗は次 focus で再 load)。
  const retractSettlement = useCallback(
    async (chainId: string, nodeId: string) => {
      if (!data) return;
      const target = data.chains.find((c) => c.chain.id === chainId);
      if (!target) return;
      const retraction: SettlementRetraction = {
        nodeId,
        // #273: 上記 useAnalyticsData と同じ理由でローカル壁時計。
        retractedAt: localIsoTimestamp(new Date()),
      };
      const nextRetractions = [...data.retractions, retraction];
      const nextSettled = new Set(target.nodeIdsSettled);
      if (
        isNodeSettled(
          target.achievementHistory,
          nextRetractions,
          nodeId,
          data.today,
        )
      ) {
        nextSettled.add(nodeId);
      } else {
        nextSettled.delete(nodeId);
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              retractions: [...prev.retractions, retraction],
              chains: prev.chains.map((c) =>
                c.chain.id === chainId
                  ? { ...c, nodeIdsSettled: nextSettled }
                  : c,
              ),
            }
          : prev,
      );
      try {
        const db = await getExpoSqliteClient();
        // #293: ログ画面側の取り下げ導線が settlement_retracted を送っていなかった。
        // 両方の入口が同じ関数を通るようにして、送信を呼び出し側の責任にしない。
        await persistSettlementRetraction(db, {
          nodeId,
          retractedAt: retraction.retractedAt,
          today: data.today,
          achievements: target.achievementHistory,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [data],
  );

  return {
    data,
    error,
    loading,
    handleToggle,
    markNodeAchieved,
    dismissChecklist,
    retractSettlement,
  };
};
