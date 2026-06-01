import {
  buildBundleForGoal,
  buildBundleForMoment,
  buildChainDraftFromSelection,
  listGoals,
  listMoments,
} from './discovery';
import type { Link, Module } from './domain';

// テスト専用カタログ (seed と非衝突の t- プレフィックス / K-033)。
// morning: A(starter, health) / B(additional, exercise)。night: C(starter, meal)。
const modules: Module[] = [
  {
    id: 't-mod-a',
    name: 'A',
    color: '#1',
    moment: ['morning'],
    goal: ['health'],
    source: 'official',
    kind: 'normal',
    orderIndex: 0,
  },
  {
    id: 't-mod-b',
    name: 'B',
    color: '#2',
    moment: ['morning'],
    goal: ['exercise'],
    source: 'official',
    kind: 'normal',
    orderIndex: 1,
  },
  {
    id: 't-mod-c',
    name: 'C',
    color: '#3',
    moment: ['night'],
    goal: ['meal'],
    source: 'official',
    kind: 'normal',
    orderIndex: 2,
  },
];

const mkLink = (
  over: Partial<Link> & Pick<Link, 'id' | 'moduleId' | 'position' | 'starter'>,
): Link => ({
  title: over.id,
  defaultOn: true,
  source: 'official',
  timerSeconds: null,
  ...over,
});

const links: Link[] = [
  // A (starter): a1(pos0, ●) / a2(pos2, ○ defaultOff)
  mkLink({ id: 't-lnk-a1', moduleId: 't-mod-a', position: 0, starter: true, title: 'A1' }),
  mkLink({
    id: 't-lnk-a2',
    moduleId: 't-mod-a',
    position: 2,
    starter: true,
    title: 'A2',
    defaultOn: false,
  }),
  // B (additional / starter=false): b1(pos1, ●)
  mkLink({ id: 't-lnk-b1', moduleId: 't-mod-b', position: 1, starter: false, title: 'B1' }),
  // C (night starter): c1(pos0, ●)
  mkLink({ id: 't-lnk-c1', moduleId: 't-mod-c', position: 0, starter: true, title: 'C1' }),
];

describe('listMoments / listGoals — 扉の選択肢導出', () => {
  test('listMoments はカタログに出現する moment を重複なく返す', () => {
    expect(listMoments(modules).sort()).toEqual(['morning', 'night']);
  });

  test('listGoals はカタログに出現する goal を重複なく返す', () => {
    expect(listGoals(modules).sort()).toEqual(['exercise', 'health', 'meal']);
  });
});

describe('buildBundleForMoment — 状態ゴール扉 (moment 縦)', () => {
  test('該当 moment のモジュールを starter / additional に分けて返す', () => {
    const bundle = buildBundleForMoment(modules, links, 'morning', '朝の束');
    expect(bundle.title).toBe('朝の束');
    expect(bundle.starterModules.map((m) => m.module.id)).toEqual(['t-mod-a']);
    expect(bundle.additionalModules.map((m) => m.module.id)).toEqual(['t-mod-b']);
  });

  test('各モジュールプレビューは所属リンクを position 昇順で持つ', () => {
    const bundle = buildBundleForMoment(modules, links, 'morning', '朝の束');
    const a = bundle.starterModules[0];
    expect(a.links.map((l) => l.id)).toEqual(['t-lnk-a1', 't-lnk-a2']);
    expect(a.isStarter).toBe(true);
  });

  test('既定選択集合は starter かつ defaultOn のリンクのみ (a1。a2 は defaultOff、b1 は additional)', () => {
    const bundle = buildBundleForMoment(modules, links, 'morning', '朝の束');
    expect(bundle.defaultSelectedLinkIds).toEqual(['t-lnk-a1']);
  });

  test('該当 moment が無ければ空の束', () => {
    const bundle = buildBundleForMoment(modules, links, 'noon', 'なし');
    expect(bundle.starterModules).toEqual([]);
    expect(bundle.additionalModules).toEqual([]);
    expect(bundle.defaultSelectedLinkIds).toEqual([]);
  });
});

describe('buildBundleForGoal — 成果ゴール扉 (goal 横断)', () => {
  test('該当 goal のモジュールを moment 横断で集める', () => {
    const bundle = buildBundleForGoal(modules, links, 'health', '健康');
    expect(bundle.starterModules.map((m) => m.module.id)).toEqual(['t-mod-a']);
    expect(bundle.additionalModules).toEqual([]);
    expect(bundle.defaultSelectedLinkIds).toEqual(['t-lnk-a1']);
  });
});

describe('buildChainDraftFromSelection — 採用前トグル編集の受け皿', () => {
  test('選択リンク集合から position 昇順でドラフトを組む', () => {
    // a1(pos0) と b1(pos1) を選択 → position 順に並ぶ
    const draft = buildChainDraftFromSelection(
      links,
      ['t-lnk-b1', 't-lnk-a1'],
      '混成',
    );
    expect(draft.title).toBe('混成');
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['A1', 'B1']);
    expect(draft.nodes.map((n) => n.moduleId)).toEqual(['t-mod-a', 't-mod-b']);
  });

  test('defaultOff のリンクも明示選択すれば採用される (トグル ON)', () => {
    const draft = buildChainDraftFromSelection(
      links,
      ['t-lnk-a1', 't-lnk-a2'],
      'A拡張',
    );
    // a1(pos0) → a2(pos2)
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['A1', 'A2']);
  });

  test('空選択なら空ドラフト', () => {
    const draft = buildChainDraftFromSelection(links, [], 'なし');
    expect(draft.nodes).toEqual([]);
  });

  test('存在しないリンク ID は無視する', () => {
    const draft = buildChainDraftFromSelection(
      links,
      ['t-lnk-a1', 't-lnk-nonexistent'],
      'X',
    );
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['A1']);
  });
});
