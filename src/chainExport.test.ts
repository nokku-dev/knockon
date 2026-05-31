import type { Action, Anchor, Chain, Node } from './domain';
import { CHAIN_EXPORT_VERSION, exportChainsAsJson } from './chainExport';

// Issue #66: チェーンエクスポート。 「実際使っているチェーンを参考にテンプレ案を考える」
// ための JSON 出力。 シリアライズ結果は人間が読める / テンプレ参考用途で、 再 import を
// 前提とした形式ではない (= ID / createdAt 等の DB 固有値は含めない)。

const anchorWake: Anchor = {
  id: 'anchor-wake',
  title: '起床',
  kind: 'time',
  time: '07:00',
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const anchorDesk: Anchor = {
  id: 'anchor-desk',
  title: '机に座る',
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const actionWater: Action = {
  id: 'action-water',
  title: '水を飲む',
  variants: null,
  timerSeconds: null,
};

const actionStretch: Action = {
  id: 'action-stretch',
  title: 'ストレッチ',
  variants: null,
  timerSeconds: 1800,
};

const actionStudy: Action = {
  id: 'action-study',
  title: '勉強',
  variants: {
    mon: '英語',
    tue: '数学',
    wed: null,
    thu: '英語',
    fri: null,
    sat: null,
    sun: null,
  },
  timerSeconds: null,
};

const chainMorning: Chain = {
  id: 'chain-morning',
  title: '朝のルーティン',
  anchorId: anchorWake.id,
  status: 'active',
  createdAt: '2026-04-01T00:00:00.000Z',
};

const chainStudy: Chain = {
  id: 'chain-study',
  title: '学習',
  anchorId: anchorDesk.id,
  status: 'stocked',
  createdAt: '2026-04-02T00:00:00.000Z',
};

const nodesMorning: Node[] = [
  // 意図的に order_index を逆順で渡して、 ソート責務が export 側にあることを確認する
  { id: 'node-m1', chainId: chainMorning.id, orderIndex: 1, kind: 'action', actionId: actionStretch.id },
  { id: 'node-m0', chainId: chainMorning.id, orderIndex: 0, kind: 'action', actionId: actionWater.id },
];

const nodesStudy: Node[] = [
  { id: 'node-s0', chainId: chainStudy.id, orderIndex: 0, kind: 'action', actionId: actionStudy.id },
];

const NOW = new Date('2026-05-31T03:00:00.000Z');

describe('exportChainsAsJson (Issue #66)', () => {
  test('exportedAt / version / chains を含む top-level 形状', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning],
      anchors: [anchorWake],
      nodes: nodesMorning,
      actions: [actionWater, actionStretch],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toBe('2026-05-31T03:00:00.000Z');
    expect(parsed.version).toBe(CHAIN_EXPORT_VERSION);
    expect(Array.isArray(parsed.chains)).toBe(true);
  });

  test('chain 1 つに anchor + actions が紐付き、 actions は orderIndex 順', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning],
      anchors: [anchorWake],
      nodes: nodesMorning,
      actions: [actionWater, actionStretch],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains).toHaveLength(1);
    const c = parsed.chains[0];
    expect(c.title).toBe('朝のルーティン');
    expect(c.status).toBe('active');
    expect(c.anchor).toEqual({
      kind: 'time',
      title: '起床',
      time: '07:00',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    expect(c.actions).toEqual([
      { title: '水を飲む', variants: null, timerSeconds: null },
      { title: 'ストレッチ', variants: null, timerSeconds: 1800 },
    ]);
  });

  test('複数チェーンを active / stocked 両方含めて出力する', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning, chainStudy],
      anchors: [anchorWake, anchorDesk],
      nodes: [...nodesMorning, ...nodesStudy],
      actions: [actionWater, actionStretch, actionStudy],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains).toHaveLength(2);
    expect(parsed.chains.map((c: { title: string }) => c.title)).toEqual([
      '朝のルーティン',
      '学習',
    ]);
    expect(parsed.chains[1].status).toBe('stocked');
  });

  test('variant 付きアクションは variants をそのまま含める', () => {
    const json = exportChainsAsJson({
      chains: [chainStudy],
      anchors: [anchorDesk],
      nodes: nodesStudy,
      actions: [actionStudy],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains[0].actions[0].variants).toEqual({
      mon: '英語',
      tue: '数学',
      wed: null,
      thu: '英語',
      fri: null,
      sat: null,
      sun: null,
    });
  });

  test('ID / createdAt / anchorId は出力に含まれない (テンプレ参考用途、 再 import 想定なし)', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning],
      anchors: [anchorWake],
      nodes: nodesMorning,
      actions: [actionWater, actionStretch],
      now: NOW,
    });
    // 文字列レベルで DB 固有値が含まれないことを保証
    expect(json).not.toContain('chain-morning');
    expect(json).not.toContain('anchor-wake');
    expect(json).not.toContain('action-water');
    expect(json).not.toContain('node-m0');
    expect(json).not.toContain('createdAt');
    expect(json).not.toContain('anchorId');
  });

  test('チェーン 0 件でも壊れずに空配列を返す', () => {
    const json = exportChainsAsJson({
      chains: [],
      anchors: [],
      nodes: [],
      actions: [],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains).toEqual([]);
    expect(parsed.exportedAt).toBe('2026-05-31T03:00:00.000Z');
  });

  test('anchor が見つからないチェーンは出力からスキップ (DB 不整合に対する silent fallback)', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning, chainStudy],
      anchors: [anchorWake], // anchorDesk を意図的に欠落
      nodes: [...nodesMorning, ...nodesStudy],
      actions: [actionWater, actionStretch, actionStudy],
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains).toHaveLength(1);
    expect(parsed.chains[0].title).toBe('朝のルーティン');
  });

  test('action が見つからないノードは actions 配列からスキップ', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning],
      anchors: [anchorWake],
      nodes: nodesMorning,
      actions: [actionWater], // actionStretch を意図的に欠落
      now: NOW,
    });
    const parsed = JSON.parse(json);
    expect(parsed.chains[0].actions).toEqual([
      { title: '水を飲む', variants: null, timerSeconds: null },
    ]);
  });

  test('JSON は 2 スペース indent で整形される (人間可読性)', () => {
    const json = exportChainsAsJson({
      chains: [chainMorning],
      anchors: [anchorWake],
      nodes: nodesMorning,
      actions: [actionWater, actionStretch],
      now: NOW,
    });
    expect(json).toContain('\n  "exportedAt"');
    expect(json).toContain('\n  "chains"');
  });
});
