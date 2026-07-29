import { useCallback, useEffect, useMemo, useState } from 'react';

import { adoptChainDraft } from './bundleAdoption';
import type { IdGen } from './bundleAdoption';
import {
  allItemKeys,
  buildRecommendedPreview,
} from './categoryDiscovery';
import type { AdoptItem, CategoryPreview } from './categoryDiscovery';
import { getExpoSqliteClient } from './db.expo';
import { momentLabel } from './discoveryLabels';
import type { Category, CatalogAction, RecommendedItem } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import {
  DEFAULT_ANCHOR_TIMES,
  RECOMMENDED_CATEGORY_ID,
  buildOnboardingAdoption,
  buildOnboardingAdoptionFromSelection,
  nextStep,
  otherMoment,
  prevStep,
} from './onboarding';
import type { OnboardingMoment, OnboardingStep } from './onboarding';
import { requestNotificationPermission, syncAllNotifications } from './notifications';
import {
  listCatalogActions,
  listCategories,
  listRecommendedItems,
} from './repository';
import { track } from './analytics';
import { ANCHOR_KIND, CHAIN_SOURCE } from './analyticsEvents';
import { updateAppSettings } from './settingsRepository';

// #72 (SPEC §5): onboarding フローの状態 hook。catalog をロードし、状態ゴール扉だけを
// 通る 7 ステップ (welcome → moment → anchorTime → preview → second → notify → done) を
// 駆動する。純粋ロジックは onboarding.ts / discovery.ts、採用永続化は adoptChainDraft に
// 委譲し、本 hook は React 状態と副作用 (DB / 通知許可) の配線のみ持つ (codebase 規約)。
//
// idGen は adoptChainDraft が必須化した受け皿 (ids.ts = expo-crypto を hook 層で注入、K-007)。
const defaultIdGen: IdGen = {
  anchor: newAnchorId,
  chain: newChainId,
  action: newActionId,
  node: newNodeId,
};

export type UseOnboardingResult = {
  loading: boolean;
  error: string | null;
  step: OnboardingStep;
  firstMoment: OnboardingMoment | null;
  secondMoment: OnboardingMoment | null;
  time: string;
  // ADR-0039 (#155): おすすめ朝/夜カテゴリのアクションを選択式に。previewItems = 選べる行、
  // selectedKeys = 採用する集合 (既定 = 全選択)、toggleItem で取捨選択。
  previewItems: AdoptItem[];
  selectedKeys: Set<string>;
  toggleItem: (key: string) => void;
  adoptedTimes: string[];
  notifyDecided: 'granted' | 'denied' | null;
  adopting: boolean;
  firstChainId: string | null;
  back: () => void;
  start: () => void;
  selectMoment: (m: OnboardingMoment) => void;
  changeTime: (time: string) => void;
  confirmTime: () => void;
  adoptFirst: (now: string) => Promise<void>;
  addSecond: (now: string) => Promise<void>;
  skipSecond: () => void;
  requestNotify: () => Promise<void>;
  skipNotify: () => void;
  complete: () => Promise<void>;
};

export const useOnboarding = (
  idGen: IdGen = defaultIdGen,
): UseOnboardingResult => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [actions, setActions] = useState<CatalogAction[]>([]);
  const [recommendedItems, setRecommendedItems] = useState<RecommendedItem[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [firstMoment, setFirstMoment] = useState<OnboardingMoment | null>(null);
  const [time, setTime] = useState<string>(DEFAULT_ANCHOR_TIMES.morning);
  const [adoptedTimes, setAdoptedTimes] = useState<string[]>([]);
  const [notifyDecided, setNotifyDecided] = useState<'granted' | 'denied' | null>(
    null,
  );
  const [adopting, setAdopting] = useState(false);
  const [firstChainId, setFirstChainId] = useState<string | null>(null);
  // ADR-0039 (#155): 1 本目で採用するアイテム集合 (selectMoment で全選択を初期化)。
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        const [cats, acts, recs] = await Promise.all([
          listCategories(db),
          listCatalogActions(db),
          listRecommendedItems(db),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setActions(acts);
        setRecommendedItems(recs);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const secondMoment = useMemo(
    () => (firstMoment ? otherMoment(firstMoment) : null),
    [firstMoment],
  );

  // moment → おすすめカテゴリのプレビューを組む純粋計算 (categoryDiscovery 再利用)。
  const buildMomentPreview = useCallback(
    (m: OnboardingMoment): CategoryPreview | null => {
      const category = categories.find(
        (c) => c.id === RECOMMENDED_CATEGORY_ID[m],
      );
      if (!category) return null;
      return buildRecommendedPreview(category, recommendedItems, actions);
    },
    [categories, recommendedItems, actions],
  );

  // 1 本目プレビュー (選択リストの素材) = 選んだ moment のおすすめカテゴリ。
  const firstPreview = useMemo<CategoryPreview | null>(
    () => (firstMoment ? buildMomentPreview(firstMoment) : null),
    [firstMoment, buildMomentPreview],
  );

  const previewItems = useMemo<AdoptItem[]>(
    () => firstPreview?.items ?? [],
    [firstPreview],
  );

  const back = useCallback(() => setStep((s) => prevStep(s)), []);
  const start = useCallback(() => setStep('moment'), []);
  const selectMoment = useCallback(
    (m: OnboardingMoment) => {
      setFirstMoment(m);
      setTime(DEFAULT_ANCHOR_TIMES[m]);
      // 既定選択 = 全アイテム (おすすめは完成ルーティン。要らないものは外せる、ADR-0039)。
      const p = buildMomentPreview(m);
      setSelectedKeys(new Set(p ? allItemKeys(p) : []));
      setStep('anchorTime');
    },
    [buildMomentPreview],
  );

  const toggleItem = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const changeTime = useCallback((t: string) => setTime(t), []);
  const confirmTime = useCallback(() => setStep('preview'), []);

  // 1 本目を採用 (選択アクション + 時刻アンカー) → second へ。
  const adoptFirst = useCallback(
    async (now: string) => {
      if (!firstMoment || !firstPreview) return;
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const { draft, anchor } = buildOnboardingAdoptionFromSelection(
          firstPreview,
          selectedKeys,
          time,
          momentLabel(firstMoment),
        );
        if (draft.nodes.length === 0) {
          setError('アクションを 1 つ以上選んでください');
          return;
        }
        const chainId = await adoptChainDraft(db, draft, now, idGen, anchor);
        track('chain_created', {
          source: CHAIN_SOURCE.onboarding,
          node_count: draft.nodes.length,
          // オンボーディングの候補は全てテンプレ由来。
          nodes_from_template: draft.nodes.length,
          anchor_kind: ANCHOR_KIND.time,
        });
        setFirstChainId(chainId);
        setAdoptedTimes((prev) => [...prev, time]);
        setStep('second');
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
      } finally {
        setAdopting(false);
      }
    },
    [firstPreview, firstMoment, time, selectedKeys, idGen],
  );

  // もう一方 (other moment) のおすすめをデフォルト時刻で全採用 → notify へ。
  // 2 本目の時刻調整は onboarding に出さず、採用後にチェーン編集で行う前提 (floor は 1 本)。
  const addSecond = useCallback(
    async (now: string) => {
      if (!secondMoment) {
        setStep('notify');
        return;
      }
      const secondPreview = buildMomentPreview(secondMoment);
      if (!secondPreview) {
        setStep('notify');
        return;
      }
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const secondTime = DEFAULT_ANCHOR_TIMES[secondMoment];
        const { draft, anchor } = buildOnboardingAdoption(
          secondPreview,
          secondTime,
          momentLabel(secondMoment),
        );
        if (draft.nodes.length > 0) {
          await adoptChainDraft(db, draft, now, idGen, anchor);
          track('chain_created', {
            source: CHAIN_SOURCE.onboarding,
            node_count: draft.nodes.length,
            nodes_from_template: draft.nodes.length,
            anchor_kind: ANCHOR_KIND.time,
          });
          setAdoptedTimes((prev) => [...prev, secondTime]);
        }
        setStep('notify');
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
      } finally {
        setAdopting(false);
      }
    },
    [buildMomentPreview, secondMoment, idGen],
  );

  const skipSecond = useCallback(() => setStep('notify'), []);

  // 通知許可をリクエスト。許可なら全 active チェーン分をスケジュール → done。
  // 拒否なら notify に留まり、Today 常時表示のフォールバックを表示する (SPEC §8 / ADR-0020)。
  const requestNotify = useCallback(async () => {
    try {
      const granted = await requestNotificationPermission();
      setNotifyDecided(granted ? 'granted' : 'denied');
      if (granted) {
        await syncAllNotifications().catch(() => undefined);
        setStep('done');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通知設定に失敗しました');
      setNotifyDecided('denied');
    }
  }, []);

  const skipNotify = useCallback(() => setStep('done'), []);

  const complete = useCallback(async () => {
    // ADR-0053: オンボーディング完走は最初の関門。チェーンを 1 本も採用せずに
    // 抜けた場合を skipped として区別する (採用数そのものは chain_created を
    // source=onboarding で数えれば出るので、ここでは持たない)。
    track('onboarding_completed', { skipped: adoptedTimes.length === 0 });
    try {
      const db = await getExpoSqliteClient();
      await updateAppSettings(db, { onboardingCompleted: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '完了状態の保存に失敗しました');
    }
  }, [adoptedTimes]);

  return {
    loading,
    error,
    step,
    firstMoment,
    secondMoment,
    time,
    previewItems,
    selectedKeys,
    toggleItem,
    adoptedTimes,
    notifyDecided,
    adopting,
    firstChainId,
    back,
    start,
    selectMoment,
    changeTime,
    confirmTime,
    adoptFirst,
    addSecond,
    skipSecond,
    requestNotify,
    skipNotify,
    complete,
  };
};
