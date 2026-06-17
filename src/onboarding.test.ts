import type { CategoryPreview } from './categoryDiscovery';
import {
  DEFAULT_ANCHOR_TIMES,
  ONBOARDING_MOMENTS,
  ONBOARDING_STEPS,
  RECOMMENDED_CATEGORY_ID,
  buildOnboardingAdoption,
  buildOnboardingAdoptionFromSelection,
  nextStep,
  otherMoment,
  prevStep,
  stepProgress,
} from './onboarding';

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

  test('moment → おすすめカテゴリ id の対応 (ADR-0039)', () => {
    expect(RECOMMENDED_CATEGORY_ID.morning).toBe('cat-rec-morning');
    expect(RECOMMENDED_CATEGORY_ID.night).toBe('cat-rec-night');
  });
});

// おすすめカテゴリのプレビュー fixture (genre アクションを順序つきで参照、ADR-0039)。
const previewFixture = (): CategoryPreview => ({
  category: {
    id: 'cat-rec-morning',
    name: '朝のおすすめ',
    type: 'recommended',
    color: '#111',
    source: 'official',
    orderIndex: 0,
  },
  items: [
    {
      key: 'r-0',
      actionId: 'act-brush-teeth',
      title: '歯磨き',
      timerSeconds: null,
      optional: false,
    },
    {
      key: 'r-1',
      actionId: 'act-face-wash',
      title: '洗顔',
      timerSeconds: null,
      optional: false,
    },
  ],
});

describe('buildOnboardingAdoption — おすすめ全採用 + 時刻アンカー (#155)', () => {
  test('プレビュー全アイテムが順序つきで採用ドラフトになる', () => {
    const { draft } = buildOnboardingAdoption(previewFixture(), '07:30', '朝');
    expect(draft.title).toBe('朝');
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['歯磨き', '洗顔']);
  });

  test('指定時刻の時刻アンカー (kind=time) を伴う', () => {
    const { anchor } = buildOnboardingAdoption(previewFixture(), '07:30', '朝');
    expect(anchor).toEqual({ kind: 'time', time: '07:30' });
  });

  test('採用ノードは actionTitle / timerSeconds のみ (由来参照なし、ADR-0040)', () => {
    const { draft } = buildOnboardingAdoption(previewFixture(), '07:30', '朝');
    expect(
      draft.nodes.every(
        (n) => Object.keys(n).sort().join() === 'actionTitle,timerSeconds',
      ),
    ).toBe(true);
  });
});

describe('buildOnboardingAdoptionFromSelection — 選択アクション → 採用 (#155)', () => {
  test('選んだアイテムだけが表示順でドラフトになる', () => {
    const { draft } = buildOnboardingAdoptionFromSelection(
      previewFixture(),
      new Set(['r-1']),
      '07:30',
      '朝',
    );
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['洗顔']);
  });

  test('複数選択は表示順で並ぶ + 時刻アンカーを伴う', () => {
    const { draft, anchor } = buildOnboardingAdoptionFromSelection(
      previewFixture(),
      new Set(['r-1', 'r-0']),
      '07:30',
      '朝',
    );
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['歯磨き', '洗顔']);
    expect(anchor).toEqual({ kind: 'time', time: '07:30' });
  });

  test('選択ゼロは空ドラフト', () => {
    const { draft } = buildOnboardingAdoptionFromSelection(
      previewFixture(),
      new Set(),
      '07:30',
      '朝',
    );
    expect(draft.nodes).toEqual([]);
  });
});
