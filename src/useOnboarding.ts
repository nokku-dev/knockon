import { useCallback, useEffect, useMemo, useState } from 'react';

import { adoptChainDraft } from './bundleAdoption';
import type { IdGen } from './bundleAdoption';
import { getExpoSqliteClient } from './db.expo';
import { buildBundleForMoment } from './discovery';
import { momentLabel } from './discoveryLabels';
import type { Link, Module } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import {
  DEFAULT_ANCHOR_TIMES,
  buildOnboardingAdoption,
  buildOnboardingAdoptionFromSelection,
  nextStep,
  otherMoment,
  prevStep,
} from './onboarding';
import type { OnboardingMoment, OnboardingStep } from './onboarding';
import { requestNotificationPermission, syncAllNotifications } from './notifications';
import { listLinks, listModules } from './repository';
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

// #106: onboarding preview の選択リスト 1 モジュール分 (starter モジュールの行)。
export type OnboardingPreviewModule = {
  moduleId: string;
  moduleName: string;
  moduleColor: string;
  links: { id: string; title: string }[];
};

export type UseOnboardingResult = {
  loading: boolean;
  error: string | null;
  step: OnboardingStep;
  firstMoment: OnboardingMoment | null;
  secondMoment: OnboardingMoment | null;
  time: string;
  // #106: starter モジュールのアクションを選択式に。previewModules = 選べる行、
  // selectedLinkIds = 採用する集合 (既定 = starter×defaultOn)、toggleLink で取捨選択。
  previewModules: OnboardingPreviewModule[];
  selectedLinkIds: Set<string>;
  toggleLink: (linkId: string) => void;
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
  const [modules, setModules] = useState<Module[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
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
  // #106: 1 本目で採用するアクション集合 (selectMoment で starter×defaultOn を初期選択)。
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        const [mods, lks] = await Promise.all([listModules(db), listLinks(db)]);
        if (cancelled) return;
        setModules(mods);
        setLinks(lks);
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

  // #106: starter モジュールのプレビュー (選択リストの素材)。discovery の束プレビューを再利用。
  const bundle = useMemo(
    () =>
      firstMoment
        ? buildBundleForMoment(modules, links, firstMoment, momentLabel(firstMoment))
        : null,
    [modules, links, firstMoment],
  );

  const previewModules = useMemo<OnboardingPreviewModule[]>(() => {
    if (!bundle) return [];
    return bundle.starterModules.map((m) => ({
      moduleId: m.module.id,
      moduleName: m.module.name,
      moduleColor: m.module.color,
      links: m.links.map((l) => ({ id: l.id, title: l.title })),
    }));
  }, [bundle]);

  const back = useCallback(() => setStep((s) => prevStep(s)), []);
  const start = useCallback(() => setStep('moment'), []);
  const selectMoment = useCallback(
    (m: OnboardingMoment) => {
      setFirstMoment(m);
      setTime(DEFAULT_ANCHOR_TIMES[m]);
      // 既定選択 = starter×defaultOn (最小核から始める。要らないものは外せる)。
      const b = buildBundleForMoment(modules, links, m, momentLabel(m));
      setSelectedLinkIds(new Set(b.defaultSelectedLinkIds));
      setStep('anchorTime');
    },
    [modules, links],
  );

  const toggleLink = useCallback((linkId: string) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }, []);
  const changeTime = useCallback((t: string) => setTime(t), []);
  const confirmTime = useCallback(() => setStep('preview'), []);

  // 1 本目を採用 (選択アクション + 時刻アンカー) → second へ (#106)。
  const adoptFirst = useCallback(
    async (now: string) => {
      if (!firstMoment) return;
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const { draft, anchor } = buildOnboardingAdoptionFromSelection(
          links,
          Array.from(selectedLinkIds),
          time,
          momentLabel(firstMoment),
        );
        if (draft.nodes.length === 0) {
          setError('アクションを 1 つ以上選んでください');
          return;
        }
        const chainId = await adoptChainDraft(db, draft, now, idGen, anchor);
        setFirstChainId(chainId);
        setAdoptedTimes((prev) => [...prev, time]);
        setStep('second');
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
      } finally {
        setAdopting(false);
      }
    },
    [links, firstMoment, time, selectedLinkIds, idGen],
  );

  // もう一方 (other moment) をデフォルト時刻で採用 → notify へ。
  // 2 本目の時刻調整は onboarding に出さず、採用後にチェーン編集で行う前提 (floor は 1 本)。
  const addSecond = useCallback(
    async (now: string) => {
      if (!secondMoment) {
        setStep('notify');
        return;
      }
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const secondTime = DEFAULT_ANCHOR_TIMES[secondMoment];
        const { draft, anchor } = buildOnboardingAdoption(
          modules,
          links,
          secondMoment,
          secondTime,
          momentLabel(secondMoment),
        );
        if (draft.nodes.length > 0) {
          await adoptChainDraft(db, draft, now, idGen, anchor);
          setAdoptedTimes((prev) => [...prev, secondTime]);
        }
        setStep('notify');
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
      } finally {
        setAdopting(false);
      }
    },
    [modules, links, secondMoment, idGen],
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
    try {
      const db = await getExpoSqliteClient();
      await updateAppSettings(db, { onboardingCompleted: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '完了状態の保存に失敗しました');
    }
  }, []);

  return {
    loading,
    error,
    step,
    firstMoment,
    secondMoment,
    time,
    previewModules,
    selectedLinkIds,
    toggleLink,
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
