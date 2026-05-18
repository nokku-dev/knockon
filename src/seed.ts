import type { DbClient } from './db';
import type { Achievement, Action, Anchor, Chain, Node } from './domain';
import {
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
  recordAchievement,
} from './repository';

export type Seed = {
  anchor: Anchor;
  actions: Action[];
  chain: Chain;
  nodes: Node[];
  initialAchievements: Achievement[];
};

export const buildPersonalChainSeed = (
  createdAt: string = new Date().toISOString(),
): Seed => {
  const anchor: Anchor = {
    id: 'anchor-wake',
    title: '起床',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };

  const actions: Action[] = [
    { id: 'action-water', title: '水を飲む', variants: null },
    { id: 'action-stretch', title: 'ストレッチ', variants: null },
    { id: 'action-desk', title: '机に向かう', variants: null },
  ];

  const chain: Chain = {
    id: 'chain-morning',
    title: '朝のルーティン',
    anchorId: anchor.id,
    status: 'active',
    createdAt,
  };

  const nodes: Node[] = actions.map((action, index) => ({
    id: `node-${index}`,
    chainId: chain.id,
    orderIndex: index,
    kind: 'action',
    actionId: action.id,
  }));

  return { anchor, actions, chain, nodes, initialAchievements: [] };
};

export const seed = async (db: DbClient, payload: Seed): Promise<void> => {
  await insertAnchor(db, payload.anchor);
  for (const action of payload.actions) {
    await insertAction(db, action);
  }
  await insertChain(db, payload.chain);
  for (const node of payload.nodes) {
    await insertNode(db, node);
  }
  for (const achievement of payload.initialAchievements) {
    await recordAchievement(db, achievement);
  }
};
