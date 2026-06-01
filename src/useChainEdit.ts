import { useCallback, useEffect, useRef, useState } from 'react';

import { CUSTOM_INBOX_MODULE_ID } from './catalogSeed';
import { getExpoSqliteClient } from './db.expo';
import type { Action, Anchor, ChainStatus, Module, VariantMap } from './domain';
import { reinsertByIndex, validatePromotion } from './editLayout';
import type { RemovedEntry } from './editLayout';
import {
  newActionId,
  newAnchorId,
  newChainId,
  newModuleId,
  newNodeId,
} from './ids';
import {
  getCurrentPosition,
  getLocationPermissionStatus,
  requestLocationPermission,
} from './location';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import { persistChainDraft, validateChainDraft } from './chainEditPersist';
import type { TemplateChain } from './templateChains';
import {
  cancelNotificationForChain,
  scheduleNotificationForChain,
} from './notifications';
import {
  deleteAction as deleteActionRepo,
  deleteChain as deleteChainRepo,
  getAction,
  getAnchor,
  insertAction,
  insertModule,
  listActions,
  listChains,
  listModules,
  listNodes,
  updateAction as updateActionRepo,
} from './repository';

// チェーン編集画面のドラフト状態。
// 既存チェーンの場合は load 時に初期値を入れる。新規作成は空の初期値。
export type EditableNode = {
  id: string; // 既存なら nodes.id、新規なら一時 ID
  isNew: boolean; // true なら save 時に INSERT、false なら必要に応じて UPDATE
  actionId: string;
  actionTitle: string; // ChainEditScreen の NodeEditorRow 表示用
  // Phase 2 variant: NodeEditorRow にバッジ (例: 月火水) を出すために保持。
  // updateAction で同期更新される。
  actionVariants: VariantMap | null;
  // #73 (SPEC §6): 所属モジュール (チップ層 / C 案ラベル / source 別削除に使う)。
  // テンプレ採用ノードは catalog 由来、手作り/追加は custom inbox。null = 未所属。
  moduleId: string | null;
  // #73 (SPEC §6): ON/OFF = 一時停止。true = 通常 (Today に出る) / false = 停止。
  active: boolean;
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
  // Phase 2 前倒し-2: チェーンステータス (active = 通常 / stocked = 一時休止)。
  // stocked のチェーンは Today に出ず、 チェーン一覧の「休止中」タブから戻せる。
  // 新規作成時は 'active'、 編集時は既存値を引き継ぐ。
  status: ChainStatus;
  anchor: EditableAnchor;
  nodes: EditableNode[];
};

const newDraft = (): ChainEditDraft => {
  const anchorId = newAnchorId();
  return {
    chainId: newChainId(),
    isNew: true,
    title: '',
    status: 'active',
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
        actionVariants: act?.variants ?? null,
        moduleId: n.moduleId ?? null,
        active: n.active !== false, // 既存 (undefined) は通常表示
      };
    }),
  );
  return {
    chainId: chain.id,
    isNew: false,
    title: chain.title,
    status: chain.status,
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
  // #73: モジュールメタ (チップ層 / 行のカラーストライプ / source 別削除に使う)。
  modules: Module[];
  error: string | null;
  loading: boolean;
  saving: boolean;
  setTitle: (title: string) => void;
  // Phase 2 前倒し-2: ステータス切替 (active / stocked)。
  setStatus: (status: ChainStatus) => void;
  // 起点アンカー編集 (inline in ChainEditScreen)
  setAnchorKind: (kind: Anchor['kind']) => void;
  setAnchorTime: (time: string) => void;
  setAnchorLocation: (latitude: number, longitude: number) => void;
  setAnchorRadius: (radiusMeters: number) => void;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  fetchCurrentLocation: () => Promise<CurrentPosition | null>;
  // ノード編集
  // #95: moduleId = 追加先モジュール (振り分けピッカーで選択)。省略時は custom inbox。
  addNodeFromExistingAction: (
    actionId: string,
    actionTitle: string,
    moduleId?: string,
  ) => void;
  addNodeFromNewAction: (actionTitle: string, moduleId?: string) => Promise<void>;
  // PR-Y1 (ADR-0023): テンプレチェーンを選んで末尾にフラット追加。
  // 各アクションを新規 INSERT (= 既存 actions と重複しても別物として扱う) +
  // ノードを末尾に追加。
  addNodesFromTemplate: (template: TemplateChain) => Promise<void>;
  removeNode: (nodeId: string) => void;
  // #94 (SPEC §6/§8): モジュールの一括外し (該当 module の全ノードを draft から外す)。
  detachModule: (moduleId: string) => void;
  // #94: 直近の削除/外し/一括外しを元に戻す。undoCount = 戻せるノード数 (0 = 戻せない)。
  undoCount: number;
  undoRemoval: () => void;
  clearUndo: () => void;
  // #73 (SPEC §6): ノードの ON/OFF (一時停止) を切り替える (draft 上のトグル、保存で永続化)。
  toggleNodeActive: (nodeId: string) => void;
  // #93 (SPEC §6): 選択ノード (custom inbox) を user モジュールに昇格。
  // モジュールは即 DB INSERT、ノードの所属付替えは draft 反映 (保存で永続化)。
  promoteToModule: (
    nodeIds: readonly string[],
    name: string,
    color: string,
  ) => Promise<void>;
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
  // アクション更新 (タイトル + variant)。
  // 成功時は availableActions の該当 entry を更新 + draft.nodes の actionTitle も連動。
  updateAction: (action: Action) => Promise<boolean>;
};


export const useChainEdit = (
  chainId: string | null, // null なら新規作成モード
): UseChainEditResult => {
  const [draft, setDraft] = useState<ChainEditDraft | null>(null);
  const [availableActions, setAvailableActions] = useState<Action[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionStatus>('undetermined');
  const [locating, setLocating] = useState(false);
  // #94: 直近の削除/外し/一括外しの退避 (直近 1 操作のみ・新しい削除で上書き)。
  const [undo, setUndo] = useState<RemovedEntry<EditableNode>[] | null>(null);
  const mountedRef = useRef(true);
  // 削除系で「現在の draft」を参照するための ref (setState updater 内で副作用を起こさない)。
  const draftRef = useRef<ChainEditDraft | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        const actions = await listActions(db);
        const mods = await listModules(db);
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
          setModules(mods);
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

  const setStatus = useCallback((status: ChainStatus) => {
    setDraft((prev) => (prev ? { ...prev, status } : prev));
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
    (actionId: string, actionTitle: string, moduleId: string = CUSTOM_INBOX_MODULE_ID) => {
      setDraft((prev) => {
        if (!prev) return prev;
        // availableActions から variant を引いて NodeEditorRow のバッジ表示に渡す
        const found = availableActions.find((a) => a.id === actionId);
        const next: EditableNode = {
          id: newNodeId(),
          isNew: true,
          actionId,
          actionTitle,
          actionVariants: found?.variants ?? null,
          // #73/#95: 「+追加」したノードの所属先。振り分けピッカーで選択 (省略時 custom inbox)。
          moduleId,
          active: true,
        };
        return { ...prev, nodes: [...prev.nodes, next] };
      });
    },
    [availableActions],
  );

  const addNodeFromNewAction = useCallback(
    async (actionTitle: string, moduleId: string = CUSTOM_INBOX_MODULE_ID) => {
      const trimmed = actionTitle.trim();
      if (trimmed.length === 0) return;
      try {
        const db = await getExpoSqliteClient();
        const action: Action = {
          id: newActionId(),
          title: trimmed,
          variants: null,
          timerSeconds: null,
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
            actionVariants: action.variants,
            moduleId,
            active: true,
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

  // PR-Y1 (ADR-0023): テンプレチェーンを末尾追加。
  // 各アクションを新規 INSERT (= 重複名を許容、 「胸トレ」が複数生まれてもよい)
  // → 新規 EditableNode をまとめて末尾に追加。
  const addNodesFromTemplate = useCallback(
    async (template: TemplateChain) => {
      try {
        const db = await getExpoSqliteClient();
        const newActions: Action[] = [];
        for (const actionTitle of template.actions) {
          const trimmed = actionTitle.trim();
          if (trimmed.length === 0) continue;
          const action: Action = {
            id: newActionId(),
            title: trimmed,
            variants: null,
            timerSeconds: null,
          };
          await insertAction(db, action);
          newActions.push(action);
        }
        if (!mountedRef.current) return;
        setAvailableActions((prev) => [...prev, ...newActions]);
        setDraft((prev) => {
          if (!prev) return prev;
          const appended: EditableNode[] = newActions.map((action) => ({
            id: newNodeId(),
            isNew: true,
            actionId: action.id,
            actionTitle: action.title,
            actionVariants: null,
            moduleId: CUSTOM_INBOX_MODULE_ID,
            active: true,
          }));
          return { ...prev, nodes: [...prev.nodes, ...appended] };
        });
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [],
  );

  // #94: 単一ノードの削除/外し。元の index とノードを退避して undo 可能にする。
  const removeNode = useCallback((nodeId: string) => {
    const cur = draftRef.current;
    if (!cur) return;
    const index = cur.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return;
    setUndo([{ node: cur.nodes[index]!, index }]);
    setDraft((prev) =>
      prev ? { ...prev, nodes: prev.nodes.filter((n) => n.id !== nodeId) } : prev,
    );
  }, []);

  // #94: モジュール一括外し。該当 module の全ノードを退避して draft から外す。
  const detachModule = useCallback((moduleId: string) => {
    const cur = draftRef.current;
    if (!cur) return;
    const entries: RemovedEntry<EditableNode>[] = [];
    cur.nodes.forEach((n, index) => {
      if ((n.moduleId ?? null) === moduleId) entries.push({ node: n, index });
    });
    if (entries.length === 0) return;
    setUndo(entries);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            nodes: prev.nodes.filter((n) => (n.moduleId ?? null) !== moduleId),
          }
        : prev,
    );
  }, []);

  // #94: 直近の削除/外しを元の位置に復元 (reinsertByIndex)。
  const undoRemoval = useCallback(() => {
    if (!undo) return;
    setDraft((prev) =>
      prev ? { ...prev, nodes: reinsertByIndex(prev.nodes, undo) } : prev,
    );
    setUndo(null);
  }, [undo]);

  const clearUndo = useCallback(() => setUndo(null), []);

  // #73: ON/OFF トグル (draft 上で active を反転、保存時に updateNodeActive で永続化)。
  const toggleNodeActive = useCallback((nodeId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, active: !n.active } : n,
        ),
      };
    });
  }, []);

  // #93: 選択ノードを user モジュールに昇格。モジュールを即 INSERT (FK + チップ表示のため)、
  // ノードの module_id 付替えは draft に反映し保存で永続化 (新規ノードは insertNode、
  // 既存ノードは updateNodeModule、 chainEditPersist 参照)。
  // orderIndex は official(0..) と custom inbox(9999) の間に置く (5000)。
  const promoteToModule = useCallback(
    async (nodeIds: readonly string[], name: string, color: string) => {
      const validationError = validatePromotion(name, nodeIds.length);
      if (validationError) {
        setError(validationError);
        return;
      }
      const moduleId = newModuleId();
      const module: Module = {
        id: moduleId,
        name: name.trim(),
        color,
        moment: [],
        goal: [],
        source: 'user',
        kind: 'normal',
        orderIndex: 5000,
      };
      try {
        const db = await getExpoSqliteClient();
        await insertModule(db, module);
        if (!mountedRef.current) return;
        setModules((prev) => [...prev, module]);
        const idSet = new Set(nodeIds);
        setDraft((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  idSet.has(n.id) ? { ...n, moduleId } : n,
                ),
              }
            : prev,
        );
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [],
  );

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

  // アクション更新 (タイトル + variant)。失敗時は false、 setError は呼ぶ。
  // availableActions と draft.nodes の actionTitle (= ChainEditScreen 表示用) を同期更新。
  //
  // K-010 受容判断:
  // - DB 書き込み → 成功時のみ setState、 楽観更新ではないため rollback 不要。
  // - setAvailableActions と setDraft は別 setState なので両方反映の間に 1 フレーム
  //   ズレる可能性あり。 React batching で同 tick 内に反映される想定だが、 Phase 1
  //   N=1 規模で UI block が起きないため受容。
  // - 同 actionId への並列 updateAction 呼び出しは UX 動線上発生しない (鉛筆 → モーダル
  //   閉じるまで再オープン不可) ため race を受容。
  const updateAction = useCallback(
    async (action: Action): Promise<boolean> => {
      try {
        const db = await getExpoSqliteClient();
        await updateActionRepo(db, action);
        if (mountedRef.current) {
          setAvailableActions((prev) =>
            prev.map((a) => (a.id === action.id ? action : a)),
          );
          // ChainEditScreen の NodeEditorRow が actionTitle / actionVariants
          // を表示しているため、同じ actionId を持つ draft.nodes の両方を更新する。
          setDraft((prev) =>
            prev
              ? {
                  ...prev,
                  nodes: prev.nodes.map((n) =>
                    n.actionId === action.id
                      ? {
                          ...n,
                          actionTitle: action.title,
                          actionVariants: action.variants,
                        }
                      : n,
                  ),
                }
              : prev,
          );
        }
        return true;
      } catch (e: unknown) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return false;
      }
    },
    [],
  );

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
      // 通知 cancel (拒否されていても no-op で安全)。
      await cancelNotificationForChain(draft.chainId).catch(() => undefined);
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
      // 保存成功後に通知を再スケジュール (時刻アンカー + active のときだけ実発火、
      // 他の条件は scheduleNotificationForChain 内で no-op)。
      // 通知の権限拒否や Expo SDK エラーで save 自体を失敗にしたくないため catch で握り潰す。
      const anchorForNotify: Anchor = {
        id: draft.anchor.id,
        title: draft.anchor.title,
        kind: draft.anchor.kind,
        time: draft.anchor.time,
        latitude: draft.anchor.latitude,
        longitude: draft.anchor.longitude,
        radiusMeters: draft.anchor.radiusMeters,
      };
      await scheduleNotificationForChain(
        {
          id: draft.chainId,
          title: draft.title.trim(),
          anchorId: draft.anchor.id,
          status: draft.status,
          createdAt: '',
        },
        anchorForNotify,
      ).catch(() => undefined);
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
    modules,
    error,
    loading,
    saving,
    setTitle,
    setStatus,
    setAnchorKind,
    setAnchorTime,
    setAnchorLocation,
    setAnchorRadius,
    locationPermission,
    locating,
    fetchCurrentLocation,
    addNodeFromExistingAction,
    addNodeFromNewAction,
    addNodesFromTemplate,
    removeNode,
    detachModule,
    undoCount: undo?.length ?? 0,
    undoRemoval,
    clearUndo,
    toggleNodeActive,
    promoteToModule,
    reorderNodes,
    save,
    deleteChain,
    deleteAction,
    updateAction,
  };
};
