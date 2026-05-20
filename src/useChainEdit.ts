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
  reorderNodes: (reorderedNodes: readonly EditableNode[]) => void;
  save: () => Promise<boolean>;
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

  // DnD でノードを丸ごと並び替え。draggable-flatlist の onDragEnd で得た
  // 新しい順序の EditableNode[] をそのまま受け取って draft.nodes に反映。
  // 並べ替え後の参照を維持することで library 側の settle アニメーションとの
  // 1 フレームずれを最小化 (PR-1.7a 実機検証で報告された「ドロップ後チラつき」対応)。
  const reorderNodes = useCallback((reorderedNodes: readonly EditableNode[]) => {
    setDraft((prev) =>
      prev ? { ...prev, nodes: [...reorderedNodes] } : prev,
    );
  }, []);

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
  };
};
