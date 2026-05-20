import { useCallback, useEffect, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Action, Anchor, Chain, Node } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
  requestLocationPermission,
} from './location';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import {
  getAction,
  getAnchor,
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
  listActions,
  listNodes,
  reorderNodes,
  updateAnchor,
  updateChain,
  updateNode,
} from './repository';

// チェーン編集画面のドラフト状態。
// 既存チェーンの場合は load 時に初期値を入れる。新規作成は空の初期値。
export type EditableNode = {
  id: string; // 既存なら nodes.id、新規なら一時 ID
  isNew: boolean; // true なら save 時に INSERT、false なら必要に応じて UPDATE
  actionId: string;
  actionTitle: string; // ActionPicker で表示するため
};

export type EditableAnchor = {
  id: string;
  title: string;
  kind: Anchor['kind'];
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
};

export type ChainEditDraft = {
  chainId: string;
  isNew: boolean;
  title: string;
  anchor: EditableAnchor;
  nodes: EditableNode[];
};

const newDraft = (): ChainEditDraft => {
  const anchorId = newAnchorId();
  return {
    chainId: newChainId(),
    isNew: true,
    title: '',
    anchor: {
      id: anchorId,
      title: '起点',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    },
    nodes: [],
  };
};

const loadExisting = async (chainId: string): Promise<ChainEditDraft | null> => {
  const db = await getExpoSqliteClient();
  // chain 取得は listChains 経由 (id 単発取得はないので filter する)
  const allChains = await (await import('./repository')).listChains(db);
  const chain = allChains.find((c) => c.id === chainId);
  if (!chain) return null;
  const anchor = await getAnchor(db, chain.anchorId);
  if (!anchor) return null;
  const nodes = await listNodes(db, chain.id);
  const nodeRows: EditableNode[] = await Promise.all(
    nodes.map(async (n) => {
      const act = await getAction(db, n.actionId);
      return {
        id: n.id,
        isNew: false,
        actionId: n.actionId,
        actionTitle: act?.title ?? '',
      };
    }),
  );
  return {
    chainId: chain.id,
    isNew: false,
    title: chain.title,
    anchor: {
      id: anchor.id,
      title: anchor.title,
      kind: anchor.kind,
      time: anchor.time,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      radiusMeters: anchor.radiusMeters,
    },
    nodes: nodeRows,
  };
};

export type UseChainEditResult = {
  draft: ChainEditDraft | null;
  availableActions: Action[];
  error: string | null;
  loading: boolean;
  saving: boolean;
  setTitle: (title: string) => void;
  // 起点アンカー編集 (inline in ChainEditScreen)
  setAnchorKind: (kind: Anchor['kind']) => void;
  setAnchorTime: (time: string) => void;
  setAnchorLocation: (latitude: number, longitude: number) => void;
  setAnchorRadius: (radiusMeters: number) => void;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  fetchCurrentLocation: () => Promise<CurrentPosition | null>;
  // ノード編集
  addNodeFromExistingAction: (actionId: string, actionTitle: string) => void;
  addNodeFromNewAction: (actionTitle: string) => Promise<void>;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, direction: 'up' | 'down') => void;
  save: () => Promise<boolean>;
};

const buildAnchorFromDraft = (e: EditableAnchor): Anchor => ({
  id: e.id,
  title: e.title,
  kind: e.kind,
  time: e.time,
  latitude: e.latitude,
  longitude: e.longitude,
  radiusMeters: e.radiusMeters,
});

export const useChainEdit = (
  chainId: string | null, // null なら新規作成モード
): UseChainEditResult => {
  const [draft, setDraft] = useState<ChainEditDraft | null>(null);
  const [availableActions, setAvailableActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionStatus>('undetermined');
  const [locating, setLocating] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        const actions = await listActions(db);
        let next: ChainEditDraft | null = null;
        if (chainId == null) {
          next = newDraft();
        } else {
          next = await loadExisting(chainId);
          if (!next) {
            if (!cancelled) setError('チェーンが見つかりません');
            return;
          }
        }
        const permission = await getLocationPermissionStatus();
        if (!cancelled) {
          setDraft(next);
          setAvailableActions(actions);
          setLocationPermission(permission);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [chainId]);

  const setTitle = useCallback((title: string) => {
    setDraft((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  // ============ Anchor setters (inline anchor editor) ============

  const setAnchorKind = useCallback((kind: Anchor['kind']) => {
    setDraft((prev) => {
      if (!prev) return prev;
      // kind 切替時に他 kind の値は残す (PR #16 でユーザー判断: kind 切替時に
      // 前回値を保持)。kind=place 切替時に radius が未設定なら 100m デフォルト。
      const next: ChainEditDraft = { ...prev, anchor: { ...prev.anchor, kind } };
      if (kind === 'place' && next.anchor.radiusMeters == null) {
        next.anchor = { ...next.anchor, radiusMeters: 100 };
      }
      return next;
    });
  }, []);

  const setAnchorTime = useCallback((time: string) => {
    setDraft((prev) =>
      prev ? { ...prev, anchor: { ...prev.anchor, time } } : prev,
    );
  }, []);

  const setAnchorLocation = useCallback((latitude: number, longitude: number) => {
    setDraft((prev) =>
      prev
        ? { ...prev, anchor: { ...prev.anchor, latitude, longitude } }
        : prev,
    );
  }, []);

  const setAnchorRadius = useCallback((radiusMeters: number) => {
    setDraft((prev) =>
      prev ? { ...prev, anchor: { ...prev.anchor, radiusMeters } } : prev,
    );
  }, []);

  const fetchCurrentLocation = useCallback(
    async (): Promise<CurrentPosition | null> => {
      setLocating(true);
      try {
        let permission = locationPermission;
        if (permission !== 'granted') {
          permission = await requestLocationPermission();
          if (mountedRef.current) setLocationPermission(permission);
        }
        if (permission !== 'granted') return null;
        return await getCurrentPosition();
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        if (mountedRef.current) setLocating(false);
      }
    },
    [locationPermission],
  );

  const addNodeFromExistingAction = useCallback(
    (actionId: string, actionTitle: string) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: EditableNode = {
          id: newNodeId(),
          isNew: true,
          actionId,
          actionTitle,
        };
        return { ...prev, nodes: [...prev.nodes, next] };
      });
    },
    [],
  );

  const addNodeFromNewAction = useCallback(
    async (actionTitle: string) => {
      const trimmed = actionTitle.trim();
      if (trimmed.length === 0) return;
      try {
        const db = await getExpoSqliteClient();
        const action: Action = {
          id: newActionId(),
          title: trimmed,
          variants: null,
        };
        await insertAction(db, action);
        if (!mountedRef.current) return;
        setAvailableActions((prev) => [...prev, action]);
        setDraft((prev) => {
          if (!prev) return prev;
          const next: EditableNode = {
            id: newNodeId(),
            isNew: true,
            actionId: action.id,
            actionTitle: action.title,
          };
          return { ...prev, nodes: [...prev.nodes, next] };
        });
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [],
  );

  const removeNode = useCallback((nodeId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, nodes: prev.nodes.filter((n) => n.id !== nodeId) };
    });
  }, []);

  const moveNode = useCallback((nodeId: string, direction: 'up' | 'down') => {
    setDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.nodes.findIndex((n) => n.id === nodeId);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.nodes.length) return prev;
      const next = [...prev.nodes];
      const [moved] = next.splice(idx, 1);
      if (!moved) return prev;
      next.splice(target, 0, moved);
      return { ...prev, nodes: next };
    });
  }, []);

  // チェーンドラフトを DB に永続化。新規ならすべて INSERT、既存なら差分 UPDATE +
  // 並び替えを reorderNodes で安全に処理。タイトル空はエラー。
  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    if (draft.title.trim().length === 0) {
      setError('チェーンタイトルを入力してください');
      return false;
    }
    if (draft.nodes.length === 0) {
      setError('ノードを 1 つ以上追加してください');
      return false;
    }
    setSaving(true);
    try {
      const db = await getExpoSqliteClient();
      const anchor = buildAnchorFromDraft(draft.anchor);
      if (draft.isNew) {
        await insertAnchor(db, anchor);
        const chain: Chain = {
          id: draft.chainId,
          title: draft.title.trim(),
          anchorId: draft.anchor.id,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        await insertChain(db, chain);
        for (let i = 0; i < draft.nodes.length; i++) {
          const n = draft.nodes[i]!;
          const node: Node = {
            id: n.id,
            chainId: draft.chainId,
            orderIndex: i,
            kind: 'action',
            actionId: n.actionId,
          };
          await insertNode(db, node);
        }
      } else {
        // 編集モード: anchor / chain は UPDATE、ノードは新規 INSERT + 既存 reorder
        await updateAnchor(db, anchor);
        const existingChain: Chain = {
          id: draft.chainId,
          title: draft.title.trim(),
          anchorId: draft.anchor.id,
          status: 'active',
          createdAt: '', // updateChain は createdAt を触らないので任意値
        };
        await updateChain(db, existingChain);
        // 新規ノードを INSERT (orderIndex は後で reorderNodes でまとめて整える)
        for (const n of draft.nodes) {
          if (n.isNew) {
            const node: Node = {
              id: n.id,
              chainId: draft.chainId,
              orderIndex: -1, // 仮値 (直後に reorderNodes で上書き)
              kind: 'action',
              actionId: n.actionId,
            };
            await insertNode(db, node);
          } else {
            // 既存ノードの actionId 変更がありえる (将来用)。orderIndex は reorderNodes 任せ
            const node: Node = {
              id: n.id,
              chainId: draft.chainId,
              orderIndex: -1,
              kind: 'action',
              actionId: n.actionId,
            };
            await updateNode(db, node);
          }
        }
        await reorderNodes(
          db,
          draft.chainId,
          draft.nodes.map((n) => n.id),
        );
      }
      return true;
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [draft]);

  return {
    draft,
    availableActions,
    error,
    loading,
    saving,
    setTitle,
    setAnchorKind,
    setAnchorTime,
    setAnchorLocation,
    setAnchorRadius,
    locationPermission,
    locating,
    fetchCurrentLocation,
    addNodeFromExistingAction,
    addNodeFromNewAction,
    removeNode,
    moveNode,
    save,
  };
};
