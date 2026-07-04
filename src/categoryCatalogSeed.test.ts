import { initSchema } from './db';
import { createBetterSqliteClient } from './db.bettersqlite';
import type { DbClient } from './db';
import {
  buildV0CategoryCatalog,
  seedCategoryCatalog,
  V0_GENRE_CATEGORIES,
  V0_RECOMMENDED_CATEGORIES,
} from './categoryCatalogSeed';
import {
  listCatalogActions,
  listCatalogActionsForCategory,
  listCategories,
  listRecommendedItems,
  listRecommendedItemsForCategory,
} from './repository';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

describe('buildV0CategoryCatalog — ADR-0039 カタログの純粋展開 (#154)', () => {
  test('カテゴリは genre 9 + recommended 2、全て official、orderIndex は 0..n-1 連番', () => {
    const { categories } = buildV0CategoryCatalog();
    const genre = categories.filter((c) => c.type === 'genre');
    const recommended = categories.filter((c) => c.type === 'recommended');
    expect(genre).toHaveLength(9);
    expect(recommended).toHaveLength(2);
    expect(categories.every((c) => c.source === 'official')).toBe(true);
    expect(categories.map((c) => c.orderIndex)).toEqual(
      categories.map((_, i) => i),
    );
  });

  test('全 catalog_action は 1 つの genre カテゴリに属す (orphan なし) / 全て official', () => {
    const { categories, actions } = buildV0CategoryCatalog();
    const genreIds = new Set(
      categories.filter((c) => c.type === 'genre').map((c) => c.id),
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => genreIds.has(a.categoryId))).toBe(true);
    expect(actions.every((a) => a.source === 'official')).toBe(true);
  });

  test('catalog_action の ID は一意 (各アクションは catalog 上 1 つ)', () => {
    const { actions } = buildV0CategoryCatalog();
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('defaultOn は「(任意)」を反映 (体重測定/サプリ/日焼け止め/筋トレ/髪系/食器収納/洗濯物たたみ = false)', () => {
    const { actions } = buildV0CategoryCatalog();
    const on = (id: string) => actions.find((a) => a.id === id)?.defaultOn;
    expect(on('act-brush-teeth')).toBe(true);
    expect(on('act-medication')).toBe(true); // ADR で「(任意)」なし → on
    expect(on('act-weigh')).toBe(false);
    expect(on('act-supplement')).toBe(false);
    expect(on('act-sunscreen')).toBe(false);
    expect(on('act-workout')).toBe(false);
    expect(on('act-style-hair')).toBe(false);
    expect(on('act-dry-hair')).toBe(false);
    expect(on('act-put-away-dishes')).toBe(false);
    expect(on('act-fold-laundry')).toBe(false);
  });

  test('学習カテゴリ (新設) が 4 アクションを持つ', () => {
    const { categories, actions } = buildV0CategoryCatalog();
    const study = categories.find((c) => c.id === 'cat-study');
    expect(study?.name).toBe('学習');
    const studyActions = actions.filter((a) => a.categoryId === 'cat-study');
    expect(studyActions.map((a) => a.title)).toEqual([
      '勉強',
      '語学',
      'オンライン学習',
      'ノート復習',
    ]);
  });

  test('追加アクション (水を飲む / 服薬 / 瞑想 / 軽い散歩) がカタログに存在する', () => {
    const { actions } = buildV0CategoryCatalog();
    const titles = new Set(actions.map((a) => a.title));
    expect(titles.has('水を飲む')).toBe(true);
    expect(titles.has('服薬')).toBe(true);
    expect(titles.has('瞑想')).toBe(true);
    expect(titles.has('軽い散歩')).toBe(true);
  });

  test('削除対象アクションがカタログに存在しない (コーヒー/白湯/お湯を沸かす/食器を水につける/プロテイン作る/5分掃除/風呂を沸かす/深呼吸)', () => {
    const { actions } = buildV0CategoryCatalog();
    const titles = new Set(actions.map((a) => a.title));
    for (const removed of [
      'コーヒーを淹れる',
      '白湯',
      'お湯を沸かす',
      '食器を水につける',
      'プロテイン作る',
      '5分掃除',
      '風呂を沸かす',
      '深呼吸',
    ]) {
      expect(titles.has(removed)).toBe(false);
    }
  });

  test('おすすめカテゴリは genre アクションを順序つきで参照する (朝の順序が spec 通り)', () => {
    const { actions, recommendedItems } = buildV0CategoryCatalog();
    const actionById = new Map(actions.map((a) => [a.id, a]));
    const morning = recommendedItems
      .filter((r) => r.categoryId === 'cat-rec-morning')
      .sort((a, b) => a.position - b.position);
    expect(morning.map((r) => actionById.get(r.actionId)?.title)).toEqual([
      '歯磨き',
      '洗顔',
      'スキンケア',
      '水を飲む',
      'ストレッチ',
      '食事準備',
      '食事',
      '予定整理',
    ]);
  });

  test('おすすめは重複参照 OK (歯磨きが朝/夜の両方から、夜の末尾でも参照される)', () => {
    const { actions, recommendedItems } = buildV0CategoryCatalog();
    const brushId = actions.find((a) => a.title === '歯磨き')!.id;
    const refsToBrush = recommendedItems.filter((r) => r.actionId === brushId);
    // 朝に 1 回 + 夜に 1 回 = 計 2 回参照される (catalog_action 自体は 1 つ)
    expect(refsToBrush).toHaveLength(2);
    const cats = new Set(refsToBrush.map((r) => r.categoryId));
    expect(cats.has('cat-rec-morning')).toBe(true);
    expect(cats.has('cat-rec-night')).toBe(true);
  });

  test('全 recommended_item の actionId は実在の genre アクションを指す (FK 整合)', () => {
    const { actions, recommendedItems } = buildV0CategoryCatalog();
    const actionIds = new Set(actions.map((a) => a.id));
    expect(recommendedItems.length).toBeGreaterThan(0);
    expect(recommendedItems.every((r) => actionIds.has(r.actionId))).toBe(true);
  });

  test('中間定義のカテゴリ ID / アクション ID は一意 (定義の重複なし)', () => {
    const genreIds = V0_GENRE_CATEGORIES.map((c) => c.id);
    const recIds = V0_RECOMMENDED_CATEGORIES.map((c) => c.id);
    const allCatIds = [...genreIds, ...recIds];
    expect(new Set(allCatIds).size).toBe(allCatIds.length);
    const actionIds = V0_GENRE_CATEGORIES.flatMap((c) =>
      c.actions.map((a) => a.id),
    );
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });
});

describe('seedCategoryCatalog — DB 投入 (#154)', () => {
  test('seed 後、カテゴリ / アクション / おすすめが DB から読み出せる', async () => {
    const db = await setup();
    const expected = buildV0CategoryCatalog();
    // initSchema 末尾で seedCategoryCatalog は実行済みだが、明示再呼び出しでも冪等。
    await seedCategoryCatalog(db);
    const categories = await listCategories(db);
    const actions = await listCatalogActions(db);
    expect(categories.filter((c) => c.source === 'official')).toHaveLength(
      expected.categories.length,
    );
    expect(actions.filter((a) => a.source === 'official')).toHaveLength(
      expected.actions.length,
    );
    await db.close?.();
  });

  test('listCatalogActionsForCategory で genre カテゴリの所属アクションを順序つきで取得できる', async () => {
    const db = await setup();
    const hydration = await listCatalogActionsForCategory(
      db,
      'cat-hydration-health',
    );
    expect(hydration.map((a) => a.title)).toEqual([
      '歯磨き',
      '水を飲む',
      '服薬',
      '体重測定',
      'サプリ',
    ]);
    await db.close?.();
  });

  test('listRecommendedItemsForCategory で夜のおすすめを順序つきで取得できる', async () => {
    const db = await setup();
    const actions = await listCatalogActions(db);
    const actionById = new Map(actions.map((a) => [a.id, a]));
    const night = await listRecommendedItemsForCategory(db, 'cat-rec-night');
    expect(night.map((r) => actionById.get(r.actionId)?.title)).toEqual([
      '食事準備',
      '食事',
      '食器洗い',
      '入浴',
      'スキンケア',
      'ヘアドライ',
      '読書',
      'ジャーナル',
      '歯磨き',
    ]);
    await db.close?.();
  });

  test('冪等性: seedCategoryCatalog を 2 回呼んでも重複しない (INSERT OR IGNORE)', async () => {
    const db = await setup();
    const expected = buildV0CategoryCatalog();
    await seedCategoryCatalog(db);
    await seedCategoryCatalog(db); // 2 回目
    const categories = await listCategories(db);
    const actions = await listCatalogActions(db);
    expect(categories.filter((c) => c.source === 'official')).toHaveLength(
      expected.categories.length,
    );
    expect(actions.filter((a) => a.source === 'official')).toHaveLength(
      expected.actions.length,
    );
    await db.close?.();
  });

  test('listRecommendedItems で全おすすめアイテムを取得できる (朝+夜の合計件数)', async () => {
    const db = await setup();
    const expected = buildV0CategoryCatalog();
    const items = await listRecommendedItems(db);
    expect(items).toHaveLength(expected.recommendedItems.length);
    // 全アイテムが実在の genre アクションを指す (FK 整合)
    const actions = await listCatalogActions(db);
    const actionIds = new Set(actions.map((a) => a.id));
    expect(items.every((i) => actionIds.has(i.actionId))).toBe(true);
    await db.close?.();
  });

  test('initSchema が seedCategoryCatalog を自動実行する (毎起動投入)', async () => {
    const db = await setup();
    const categories = await listCategories(db);
    expect(categories.filter((c) => c.source === 'official').length).toBe(
      buildV0CategoryCatalog().categories.length,
    );
    await db.close?.();
  });
});
