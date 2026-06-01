import { buildV0Catalog } from './catalogSeed';
import {
  DEFAULT_ANCHOR_TIMES,
  ONBOARDING_MOMENTS,
  ONBOARDING_STEPS,
  buildOnboardingAdoption,
  nextStep,
  otherMoment,
  prevStep,
  stepProgress,
} from './onboarding';
import type { Link, Module } from './domain';

// #72 (SPEC docs/template-modules-spec.md §5): onboarding の純粋ドメイン層。
// ステップ進行・moment 分岐・時刻アンカー付き採用ドラフトを DB/UI 非依存で検証する (K-007)。

describe('onboarding steps — 7 ステップの順序と進捗 (#72)', () => {
  test('SPEC §5 の 7 ステップが定義順で並ぶ', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'moment',
      'anchorTime',
      'preview',
      'second',
      'notify',
      'done',
    ]);
  });

  test('stepProgress は 1-origin の現在位置と総数を返す', () => {
    expect(stepProgress('welcome')).toEqual({ current: 1, total: 7 });
    expect(stepProgress('preview')).toEqual({ current: 4, total: 7 });
    expect(stepProgress('done')).toEqual({ current: 7, total: 7 });
  });

  test('nextStep / prevStep は線形に隣へ移動し、両端で飽和する', () => {
    expect(nextStep('welcome')).toBe('moment');
    expect(nextStep('done')).toBe('done'); // 末尾で飽和
    expect(prevStep('moment')).toBe('welcome');
    expect(prevStep('welcome')).toBe('welcome'); // 先頭で飽和
  });
});

describe('onboarding moment — 朝/夜の 2 択と分岐 (#72)', () => {
  test('提示する moment は朝/夜の 2 つ', () => {
    expect(ONBOARDING_MOMENTS).toEqual(['morning', 'night']);
  });

  test('otherMoment は朝↔夜を反転する (もう一方の束)', () => {
    expect(otherMoment('morning')).toBe('night');
    expect(otherMoment('night')).toBe('morning');
  });

  test('各 moment にデフォルトアンカー時刻がある', () => {
    expect(DEFAULT_ANCHOR_TIMES.morning).toBe('07:00');
    expect(DEFAULT_ANCHOR_TIMES.night).toBe('22:00');
  });
});

describe('buildOnboardingAdoption — moment+時刻 → 時刻アンカー付きドラフト (#72)', () => {
  const modules: Module[] = [
    {
      id: 't-mod-morning',
      name: '朝',
      color: '#111',
      moment: ['morning'],
      goal: ['health'],
      source: 'official',
      kind: 'normal',
      orderIndex: 0,
    },
  ];
  const links: Link[] = [
    {
      id: 't-lnk-1',
      title: '歯磨き',
      moduleId: 't-mod-morning',
      defaultOn: true,
      position: 0,
      source: 'official',
      timerSeconds: null,
      starter: true,
    },
    {
      id: 't-lnk-2',
      title: 'サプリ',
      moduleId: 't-mod-morning',
      defaultOn: false, // 追加リンク → 採用されない
      position: 1,
      source: 'official',
      timerSeconds: null,
      starter: true,
    },
  ];

  test('starter×defaultOn のリンクが採用ドラフトになる', () => {
    const { draft } = buildOnboardingAdoption(modules, links, 'morning', '07:30', '朝');
    expect(draft.title).toBe('朝');
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['歯磨き']);
  });

  test('指定時刻の時刻アンカー (kind=time) を伴う', () => {
    const { anchor } = buildOnboardingAdoption(modules, links, 'morning', '07:30', '朝');
    expect(anchor).toEqual({ kind: 'time', time: '07:30' });
  });

  test('v0 catalog の朝束で 1 つ以上のノードを採用できる', () => {
    const { modules: cm, links: cl } = buildV0Catalog();
    const { draft, anchor } = buildOnboardingAdoption(cm, cl, 'morning', '06:00', '朝');
    expect(draft.nodes.length).toBeGreaterThan(0);
    expect(anchor.time).toBe('06:00');
  });
});
