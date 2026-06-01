import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { adoptChainDraft } from './bundleAdoption';
import type { IdGen } from './bundleAdoption';
import { getExpoSqliteClient } from './db.expo';
import {
  buildBundleForGoal,
  buildBundleForMoment,
  buildChainDraftFromSelection,
  listGoals,
  listMoments,
} from './discovery';
import type { BundlePreview } from './discovery';
import { goalLabel, momentLabel } from './discoveryLabels';
import type { Link, Module } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import { listLinks, listModules } from './repository';

// #70b (#70/#71): discovery フローの状態 hook。catalog をロードし、扉選択 (moment/goal/おまかせ)
// → 束プレビュー → リンク選択トグル → 採用 (live 永続化) を駆動する。
//
// 純粋ロジックは discovery.ts (テスト済み) / 採用永続化は bundleAdoption.adoptChainDraft
// (テスト済み) に委譲し、本 hook は React 状態とそれらの配線のみ持つ (codebase 規約:
// hook は薄いラッパ、純粋部分を .ts に出して ts-jest でテスト)。
//
// idGen は bundleAdoption が必須化した受け皿 (ids.ts = expo-crypto を UI 層で注入、K-007)。
const defaultIdGen: IdGen = {
  anchor: newAnchorId,
  chain: newChainId,
  action: newActionId,
  node: newNodeId,
};

// 「おまかせ」が着地する既定 moment (目的の無い人向けの底、SPEC §4)。
// 朝は最も普遍的な起点アンカー。
const OMAKASE_MOMENT = 'morning';

export type DiscoveryDoor =
  | { kind: 'moment'; value: string }
  | { kind: 'goal'; value: string };

export type UseDiscoveryResult = {
  loading: boolean;
  error: string | null;
  // 索引 (扉) の選択肢
  moments: string[];
  goals: string[];
  // 現在開いている束 (扉未選択なら null)
  door: DiscoveryDoor | null;
  preview: BundlePreview | null;
  selectedLinkIds: Set<string>;
  // 索引操作
  openMoment: (moment: string) => void;
  openGoal: (goal: string) => void;
  openOmakase: () => void;
  closeBundle: () => void;
  // 採用前トグル編集
  toggleLink: (linkId: string) => void;
  // 採用確認用: 現在の選択でできるチェーン (position 昇順のアクション名列)
  selectedActionTitles: string[];
  // 採用 (live 永続化)。成功時は新 chainId、失敗時は null。
  adopt: (now: string) => Promise<string | null>;
  adopting: boolean;
};

const titleForDoor = (door: DiscoveryDoor): string =>
  door.kind === 'moment' ? momentLabel(door.value) : goalLabel(door.value);

export const useDiscovery = (idGen: IdGen = defaultIdGen): UseDiscoveryResult => {
  const [modules, setModules] = useState<Module[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [door, setDoor] = useState<DiscoveryDoor | null>(null);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
  const [adopting, setAdopting] = useState(false);

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
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const moments = useMemo(() => listMoments(modules), [modules]);
  const goals = useMemo(() => listGoals(modules), [modules]);

  const preview = useMemo<BundlePreview | null>(() => {
    if (!door) return null;
    const title = titleForDoor(door);
    return door.kind === 'moment'
      ? buildBundleForMoment(modules, links, door.value, title)
      : buildBundleForGoal(modules, links, door.value, title);
  }, [door, modules, links]);

  // 扉を開いたら既定選択集合 (starter×defaultOn) を初期選択にする。
  const openBundle = useCallback(
    (next: DiscoveryDoor) => {
      const title = titleForDoor(next);
      const p =
        next.kind === 'moment'
          ? buildBundleForMoment(modules, links, next.value, title)
          : buildBundleForGoal(modules, links, next.value, title);
      setSelectedLinkIds(new Set(p.defaultSelectedLinkIds));
      setDoor(next);
    },
    [modules, links],
  );

  const openMoment = useCallback(
    (moment: string) => openBundle({ kind: 'moment', value: moment }),
    [openBundle],
  );
  const openGoal = useCallback(
    (goal: string) => openBundle({ kind: 'goal', value: goal }),
    [openBundle],
  );
  const openOmakase = useCallback(
    () => openBundle({ kind: 'moment', value: OMAKASE_MOMENT }),
    [openBundle],
  );

  const closeBundle = useCallback(() => {
    setDoor(null);
    setSelectedLinkIds(new Set());
  }, []);

  const toggleLink = useCallback((linkId: string) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }, []);

  const selectedActionTitles = useMemo(
    () =>
      buildChainDraftFromSelection(
        links,
        Array.from(selectedLinkIds),
        door ? titleForDoor(door) : '',
      ).nodes.map((n) => n.actionTitle),
    [links, selectedLinkIds, door],
  );

  // adopt 中に door が変わっても安定参照するため最新値を ref に持つ。
  const linksRef = useRef(links);
  linksRef.current = links;
  const doorRef = useRef(door);
  doorRef.current = door;

  const adopt = useCallback(
    async (now: string): Promise<string | null> => {
      const currentDoor = doorRef.current;
      if (!currentDoor) return null;
      const draft = buildChainDraftFromSelection(
        linksRef.current,
        Array.from(selectedLinkIds),
        titleForDoor(currentDoor),
      );
      if (draft.nodes.length === 0) {
        setError('アクションを 1 つ以上選んでください');
        return null;
      }
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const chainId = await adoptChainDraft(db, draft, now, idGen);
        return chainId;
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
        return null;
      } finally {
        setAdopting(false);
      }
    },
    [selectedLinkIds, idGen],
  );

  return {
    loading,
    error,
    moments,
    goals,
    door,
    preview,
    selectedLinkIds,
    openMoment,
    openGoal,
    openOmakase,
    closeBundle,
    toggleLink,
    selectedActionTitles,
    adopt,
    adopting,
  };
};
