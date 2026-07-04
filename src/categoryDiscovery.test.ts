import {
  allItemKeys,
  buildChainDraftFromCategorySelection,
  buildGenrePreview,
  buildRecommendedPreview,
  listGenreCategories,
  listRecommendedCategories,
} from './categoryDiscovery';
import type { Category, CatalogAction, RecommendedItem } from './domain';

const cat = (
  id: string,
  type: Category['type'],
  orderIndex: number,
): Category => ({
  id,
  name: id,
  type,
  color: '#888',
  source: 'official',
  orderIndex,
});

const action = (
  id: string,
  categoryId: string,
  position: number,
  defaultOn = true,
): CatalogAction => ({
  id,
  title: `${id}-title`,
  categoryId,
  defaultOn,
  position,
  source: 'official',
  timerSeconds: null,
});

describe('categoryDiscovery — 索引の分割 (ADR-0039 #155)', () => {
  const categories: Category[] = [
    cat('g-b', 'genre', 1),
    cat('r-1', 'recommended', 9),
    cat('g-a', 'genre', 0),
  ];

  test('listGenreCategories は genre のみ orderIndex 昇順', () => {
    expect(listGenreCategories(categories).map((c) => c.id)).toEqual(['g-a', 'g-b']);
  });

  test('listRecommendedCategories は recommended のみ', () => {
    expect(listRecommendedCategories(categories).map((c) => c.id)).toEqual(['r-1']);
  });
});

describe('buildGenrePreview — genre カテゴリのプレビュー', () => {
  const category = cat('g', 'genre', 0);
  const actions: CatalogAction[] = [
    action('a2', 'g', 1, true),
    action('a1', 'g', 0, true),
    action('a-optional', 'g', 2, false), // 任意 (defaultOn=false) → #191 で非表示
    action('other', 'other-cat', 0, true), // 別カテゴリ → 除外
  ];

  test('所属アクションを position 昇順で AdoptItem 化 (key=actionId)', () => {
    const preview = buildGenrePreview(category, actions);
    expect(preview.items.map((i) => i.key)).toEqual(['a1', 'a2']);
    expect(preview.items.map((i) => i.actionId)).toEqual(['a1', 'a2']);
  });

  test('defaultOn=false (旧「任意」) アクションはプレビューから除外される (#191)', () => {
    const preview = buildGenrePreview(category, actions);
    expect(preview.items.some((i) => i.key === 'a-optional')).toBe(false);
  });

  test('別カテゴリのアクションは含まれない', () => {
    const preview = buildGenrePreview(category, actions);
    expect(preview.items.some((i) => i.key === 'other')).toBe(false);
  });
});

describe('buildRecommendedPreview — おすすめカテゴリのプレビュー (順序つき重複参照)', () => {
  const category = cat('r', 'recommended', 0);
  const actions: CatalogAction[] = [
    action('a-brush', 'g', 0),
    action('a-wash', 'g', 1),
  ];
  // 朝のおすすめ風: brush → wash → brush (歯磨きを末尾でも重複参照)
  const items: RecommendedItem[] = [
    { id: 'r-0', categoryId: 'r', actionId: 'a-brush', position: 0 },
    { id: 'r-1', categoryId: 'r', actionId: 'a-wash', position: 1 },
    { id: 'r-2', categoryId: 'r', actionId: 'a-brush', position: 2 },
    { id: 'other-0', categoryId: 'other', actionId: 'a-wash', position: 0 }, // 別カテゴリ → 除外
  ];

  test('順序つき・重複ありで AdoptItem 化 (key=item.id でトグル単位を分離)', () => {
    const preview = buildRecommendedPreview(category, items, actions);
    expect(preview.items.map((i) => i.key)).toEqual(['r-0', 'r-1', 'r-2']);
    // 歯磨き (a-brush) が 2 回出るが key が別なので別アイテム
    expect(preview.items.filter((i) => i.actionId === 'a-brush')).toHaveLength(2);
  });

  test('参照先 genre アクションのタイトル/タイマーを解決する', () => {
    const preview = buildRecommendedPreview(category, items, actions);
    expect(preview.items[0].title).toBe('a-brush-title');
  });

});

describe('allItemKeys / buildChainDraftFromCategorySelection', () => {
  const category = cat('g', 'genre', 0);
  const actions: CatalogAction[] = [
    action('a1', 'g', 0),
    action('a2', 'g', 1),
    action('a3', 'g', 2),
  ];
  const preview = buildGenrePreview(category, actions);

  test('allItemKeys は全アイテムキー (初期全選択集合)', () => {
    expect(allItemKeys(preview)).toEqual(['a1', 'a2', 'a3']);
  });

  test('選択キーで表示順を保ってドラフトに変換、由来参照は持たない', () => {
    const draft = buildChainDraftFromCategorySelection(
      preview,
      new Set(['a3', 'a1']),
      '朝',
    );
    expect(draft.title).toBe('朝');
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual(['a1-title', 'a3-title']);
    // ADR-0040: ChainDraftNode は actionTitle / timerSeconds のみ (由来参照なし)
    expect(draft.nodes.every((n) => Object.keys(n).sort().join() === 'actionTitle,timerSeconds')).toBe(true);
  });

  test('recommended の重複アイテムは選択された分だけ順序つきでノードになる', () => {
    const recCategory = cat('r', 'recommended', 0);
    const recActions: CatalogAction[] = [action('a-brush', 'g', 0)];
    const recItems: RecommendedItem[] = [
      { id: 'r-0', categoryId: 'r', actionId: 'a-brush', position: 0 },
      { id: 'r-1', categoryId: 'r', actionId: 'a-brush', position: 1 },
    ];
    const recPreview = buildRecommendedPreview(recCategory, recItems, recActions);
    const draft = buildChainDraftFromCategorySelection(
      recPreview,
      new Set(['r-0', 'r-1']),
      '朝のおすすめ',
    );
    // 同じアクションが 2 ノードになる (重複保持)
    expect(draft.nodes.map((n) => n.actionTitle)).toEqual([
      'a-brush-title',
      'a-brush-title',
    ]);
  });
});
