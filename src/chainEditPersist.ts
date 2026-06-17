import type { DbClient } from './db';
import type { Anchor, Chain } from './domain';
import {
  deleteNode,
  insertAnchor,
  insertChain,
  insertNode,
  listNodes,
  reorderNodes,
  updateAnchor,
  updateChain,
  updateNodeAction,
  updateNodeActive,
} from './repository';
import type { ChainEditDraft, EditableAnchor } from './useChainEdit';

// React 非依存にして ts-jest で testable な純粋 async ロジックを集約。
// useChainEdit hook から呼ばれる。

const buildAnchorFromDraft = (e: EditableAnchor): Anchor => ({
  id: e.id,
  title: e.title,
  kind: e.kind,
  time: e.time,
  latitude: e.latitude,
  longitude: e.longitude,
  radiusMeters: e.radiusMeters,
});

// ドラフトのバリデーション。問題なしなら null、エラーありなら文言を返す純粋関数。
// 沈黙の失敗を防ぐため kind ごとに必要フィールドの欠落を弾く (PR #20 review C-2)。
export const validateChainDraft = (draft: ChainEditDraft): string | null => {
  if (draft.title.trim().length === 0) {
    return 'チェーンタイトルを入力してください';
  }
  if (draft.nodes.length === 0) {
    return 'ノードを 1 つ以上追加してください';
  }
  if (draft.anchor.kind === 'time') {
    if (!draft.anchor.time || !/^\d{2}:\d{2}$/.test(draft.anchor.time)) {
      return '時刻アンカーの時刻を設定してください';
    }
  }
  if (draft.anchor.kind === 'place') {
    if (draft.anchor.latitude == null || draft.anchor.longitude == null) {
      return '場所アンカーは現在地を取得してください';
    }
    if (draft.anchor.radiusMeters == null) {
      return '場所アンカーの半径を設定してください';
    }
  }
  return null;
};

// チェーンドラフトを DB に永続化する純粋 async 関数 (useChainEdit.save から
// 分離して unit test 可能にした、PR #20 review C-1/M-1)。
// 新規モード: anchor + chain + nodes を順序通り INSERT (orderIndex = i)。
// 編集モード: anchor / chain UPDATE → 既存ノード action_id 更新 → 新規ノード
// 一意な大負値 orderIndex で INSERT → reorderNodes で最終並び確定。
// 「全ノードを同じ orderIndex=-1 にする」と UNIQUE(chain_id, order_index) で
// 衝突して保存失敗するため、新規ノードごとに -1000 - i で一意化する (K-019)。
export const persistChainDraft = async (
  db: DbClient,
  draft: ChainEditDraft,
): Promise<void> => {
  const anchor = buildAnchorFromDraft(draft.anchor);
  if (draft.isNew) {
    await insertAnchor(db, anchor);
    const chain: Chain = {
      id: draft.chainId,
      title: draft.title.trim(),
      anchorId: draft.anchor.id,
      status: draft.status,
      createdAt: new Date().toISOString(),
    };
    await insertChain(db, chain);
    for (let i = 0; i < draft.nodes.length; i++) {
      const n = draft.nodes[i]!;
      await insertNode(db, {
        id: n.id,
        chainId: draft.chainId,
        orderIndex: i,
        kind: 'action',
        actionId: n.actionId,
        // #73: ON/OFF を live に保存する (これがないと保存で停止状態が失われる)。
        active: n.active,
      });
    }
    return;
  }

  // 編集モード
  await updateAnchor(db, anchor);
  await updateChain(db, {
    id: draft.chainId,
    title: draft.title.trim(),
    anchorId: draft.anchor.id,
    status: draft.status,
    // updateChain SQL は createdAt を SET しないので任意の placeholder
    createdAt: '',
  });

  // バグ修正: draft から消えたノードを DB から DELETE する。
  // これがないと reorderNodes 時に「draft にない既存ノードが古い order_index を
  // 持ったまま」になり、 UNIQUE(chain_id, order_index) で衝突する
  // (PR-1.7 系の実装漏れ、 検証期間中のバグ報告で発覚)。
  const existingNodes = await listNodes(db, draft.chainId);
  const draftIds = new Set(draft.nodes.map((n) => n.id));
  for (const existing of existingNodes) {
    if (!draftIds.has(existing.id)) {
      await deleteNode(db, existing.id);
    }
  }

  // 既存ノードの action_id / ON-OFF (active) を更新 (order_index は触らない、衝突回避)。
  for (const n of draft.nodes) {
    if (!n.isNew) {
      await updateNodeAction(db, n.id, n.actionId);
      await updateNodeActive(db, n.id, n.active);
    }
  }

  // 新規ノードを INSERT。UNIQUE 衝突回避のため一意な大負値で。
  let newCounter = 0;
  for (const n of draft.nodes) {
    if (n.isNew) {
      await insertNode(db, {
        id: n.id,
        chainId: draft.chainId,
        orderIndex: -1000 - newCounter,
        kind: 'action',
        actionId: n.actionId,
        active: n.active,
      });
      newCounter += 1;
    }
  }

  // 全ノードの最終並び順 (0..n-1) を reorderNodes で確定
  await reorderNodes(
    db,
    draft.chainId,
    draft.nodes.map((n) => n.id),
  );
};
