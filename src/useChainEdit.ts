import { useCallback, useEffect, useRef, useState } from 'react';

import { getExpoSqliteClient } from './db.expo';
import type { Action, Anchor } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
  requestLocationPermission,
} from './location';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import { persistChainDraft, validateChainDraft } from './chainEditPersist';
import {
  deleteAction as deleteActionRepo,
  deleteChain as deleteChainRepo,
  getAction,
  getAnchor,
  insertAction,
  listActions,
  listChains,
  listNodes,
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
  const allChains = await listChains(db);
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
  // react-native-reorderable-list の onReorder({from, to}) からそのまま受け取る形。
  // DnD ライブラリ依存度を最小にするため、from/to の単純な index 並び替えに限定。
  reorderNodes: (from: number, to: number) => void;
  save: () => Promise<boolean>;
  // チェーン削除 (編集モードのみ。新規モード = まだ DB に何もない、で呼ぶと false)。
  // 関連 nodes / achievements / anchor / anchor_firings は repository 側で
  // CASCADE + 同 TX で削除される (PR-1.8a)。
  deleteChain: () => Promise<boolean>;
  // アクション削除 (使用中は明示的なエラーで拒否)。
  // 成功時は availableActions から除去。失敗時は理由を返す (UI 側でメッセージ表示)。
  deleteAction: (
    actionId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};


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
      // 前回値を保持)。time / place 切替時にそれぞれのデフォルト値を入れて
      // 「kind 設定したのに time/lat が null で発火しない」沈黙の失敗を防ぐ
      // (PR #20 review C-2)。
      const next: ChainEditDraft = { ...prev, anchor: { ...prev.anchor, kind } };
      if (kind === 'time' && next.anchor.time == null) {
        next.anchor = { ...next.anchor, time: '07:30' };
      }
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

  const reorderNodes = useCallback((from: number, to: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      if (from === to) return prev;
      if (from < 0 || from >= prev.nodes.length) return prev;
      if (to < 0 || to >= prev.nodes.length) return prev;
      const next = [...prev.nodes];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return { ...prev, nodes: next };
    });
  }, []);

  // 削除は通常 10-50ms で完了するため saving フラグは出さない (deleteChain / save と
  // 非対称だが、即時 UX を優先して受容)。長くなるシグナルが出たら統一する。
  const deleteAction = useCallback(
    async (
      actionId: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const db = await getExpoSqliteClient();
        await deleteActionRepo(db, actionId);
        if (mountedRef.current) {
          setAvailableActions((prev) => prev.filter((a) => a.id !== actionId));
        }
        return { ok: true };
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e);
        return { ok: false, error };
      }
    },
    [],
  );

  const deleteChain = useCallback(async (): Promise<boolean> => {
    if (!draft || draft.isNew) return false;
    setSaving(true);
    try {
      const db = await getExpoSqliteClient();
      await deleteChainRepo(db, draft.chainId);
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

  // ドラフト永続化。validate → persistChainDraft の薄いラッパ。
  // バリデーション失敗 / DB エラーは false 戻りで AnchorRoute 側のエラーバナーに通知。
  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    const validationError = validateChainDraft(draft);
    if (validationError) {
      setError(validationError);
      return false;
    }
    setSaving(true);
    try {
      const db = await getExpoSqliteClient();
      await persistChainDraft(db, draft);
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
    reorderNodes,
    save,
    deleteChain,
    deleteAction,
  };
};
