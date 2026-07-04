import type { DbClient } from './db';
import type { Category, CatalogAction, RecommendedItem } from './domain';
import {
  seedCatalogAction,
  seedCategory,
  seedRecommendedItem,
} from './repository';

// ADR-0039 (#154): v0 カタログ (新カテゴリモデル)。module(テーマ束) 廃止 →
// ジャンル別カテゴリ(9) + おすすめカテゴリ(2)。旧 catalogSeed.ts (modules/links) と
// 並行追加 (catalog/live 分離は継承)。consumer 移行は別トラック。
//
// 持ち方: TS 中間定義を純粋関数 buildV0CategoryCatalog で Category[] /
// CatalogAction[] / RecommendedItem[] に展開する。投入は initSchema 末尾で
// seedCategoryCatalog を毎起動呼び出し (固定 ID + INSERT OR IGNORE で冪等)。
//
// スコープ外 (後続トラック):
// - 採用フロー (個別アクション選択 → live nodes/actions 生成) と live 由来参照カラム
// - onboarding / discovery / 編集 UI の新カテゴリモデル対応
// - 色の a11y 最終調整 (#74 と同型) / ユーザー作成カテゴリ (source='user')

// カテゴリ色。暫定パレット (後続トラックで a11y 調整)。色のみに依存しない
// (ラベル併用) 設計は UI 側で担保するため、ここは識別用の仮色。
const CATEGORY_COLORS = {
  health: '#4FB0AE',
  skincare: '#C9849E',
  exercise: '#5B8DEF',
  meal: '#E0A24C',
  grooming: '#7C9CBF',
  chores: '#8B9EB0',
  reflection: '#9B87C4',
  bath: '#4F8DB0',
  study: '#6FAE5B',
  recommendMorning: '#E8A33D',
  recommendNight: '#5B6B9B',
} as const;

type GenreActionDef = {
  id: string;
  title: string;
  defaultOn: boolean; // ● = true / 「(任意)」= false
  timerSeconds?: number;
};

type GenreCategoryDef = {
  id: string;
  name: string;
  color: string;
  actions: GenreActionDef[];
};

type RecommendedCategoryDef = {
  id: string;
  name: string;
  color: string;
  actionIds: string[]; // genre アクションを順序つきで重複参照 (ADR-0039)
};

// ジャンル別カテゴリ (9)。ADR-0039 §決定の v0 カタログ。「(任意)」= defaultOn false。
export const V0_GENRE_CATEGORIES: readonly GenreCategoryDef[] = [
  {
    id: 'cat-hydration-health',
    name: '水分・健康',
    color: CATEGORY_COLORS.health,
    actions: [
      { id: 'act-brush-teeth', title: '歯磨き', defaultOn: true },
      { id: 'act-drink-water', title: '水を飲む', defaultOn: true },
      { id: 'act-medication', title: '服薬', defaultOn: true },
      { id: 'act-weigh', title: '体重測定', defaultOn: false },
      { id: 'act-supplement', title: 'サプリ', defaultOn: false },
    ],
  },
  {
    id: 'cat-skincare',
    name: 'スキンケア',
    color: CATEGORY_COLORS.skincare,
    actions: [
      { id: 'act-face-wash', title: '洗顔', defaultOn: true },
      { id: 'act-skincare', title: 'スキンケア', defaultOn: true },
      { id: 'act-sunscreen', title: '日焼け止め', defaultOn: false },
    ],
  },
  {
    id: 'cat-exercise',
    name: '運動',
    color: CATEGORY_COLORS.exercise,
    actions: [
      { id: 'act-stretch', title: 'ストレッチ', defaultOn: true },
      { id: 'act-walking', title: 'ウォーキング', defaultOn: true },
      { id: 'act-workout', title: '筋トレ', defaultOn: false },
      { id: 'act-drink-protein', title: 'プロテイン摂取', defaultOn: true },
      { id: 'act-light-walk', title: '軽い散歩', defaultOn: true },
    ],
  },
  {
    id: 'cat-meal',
    name: '食事',
    color: CATEGORY_COLORS.meal,
    actions: [
      { id: 'act-prep-meal', title: '食事準備', defaultOn: true },
      { id: 'act-meal', title: '食事', defaultOn: true },
    ],
  },
  {
    id: 'cat-grooming',
    name: '身支度',
    color: CATEGORY_COLORS.grooming,
    actions: [
      { id: 'act-shower', title: 'シャワー', defaultOn: true },
      { id: 'act-get-dressed', title: '着替え', defaultOn: true },
      { id: 'act-style-hair', title: 'ヘアセット', defaultOn: false },
      { id: 'act-dry-hair', title: 'ヘアドライ', defaultOn: false },
    ],
  },
  {
    id: 'cat-chores',
    name: '家事',
    color: CATEGORY_COLORS.chores,
    actions: [
      { id: 'act-clean', title: '掃除', defaultOn: true },
      { id: 'act-laundry', title: '洗濯', defaultOn: true },
      { id: 'act-take-out-trash', title: 'ゴミ捨て', defaultOn: true },
      { id: 'act-wash-dishes', title: '食器洗い', defaultOn: true },
      { id: 'act-put-away-dishes', title: '食器収納', defaultOn: false },
      { id: 'act-fold-laundry', title: '洗濯物たたみ', defaultOn: false },
    ],
  },
  {
    id: 'cat-reflection',
    name: '内省・計画',
    color: CATEGORY_COLORS.reflection,
    actions: [
      { id: 'act-journal', title: 'ジャーナル', defaultOn: true },
      { id: 'act-todo-today', title: '予定整理', defaultOn: true },
      { id: 'act-read', title: '読書', defaultOn: true },
      { id: 'act-meditate', title: '瞑想', defaultOn: true },
    ],
  },
  {
    id: 'cat-bath',
    name: '入浴',
    color: CATEGORY_COLORS.bath,
    actions: [{ id: 'act-bath', title: '入浴', defaultOn: true }],
  },
  {
    id: 'cat-study',
    name: '学習',
    color: CATEGORY_COLORS.study,
    actions: [
      { id: 'act-study', title: '勉強', defaultOn: true },
      { id: 'act-language', title: '語学', defaultOn: true },
      {
        id: 'act-online-course',
        title: 'オンライン学習',
        defaultOn: true,
      },
      { id: 'act-review-notes', title: 'ノート復習', defaultOn: true },
    ],
  },
];

// おすすめカテゴリ (2)。genre アクションを順序つきで重複参照 (ADR-0039)。
export const V0_RECOMMENDED_CATEGORIES: readonly RecommendedCategoryDef[] = [
  {
    id: 'cat-rec-morning',
    name: '朝のおすすめ',
    color: CATEGORY_COLORS.recommendMorning,
    actionIds: [
      'act-brush-teeth',
      'act-face-wash',
      'act-skincare',
      'act-drink-water',
      'act-stretch',
      'act-prep-meal',
      'act-meal',
      'act-todo-today',
    ],
  },
  {
    id: 'cat-rec-night',
    name: '夜のおすすめ',
    color: CATEGORY_COLORS.recommendNight,
    actionIds: [
      'act-prep-meal',
      'act-meal',
      'act-wash-dishes',
      'act-bath',
      'act-skincare',
      'act-dry-hair',
      'act-read',
      'act-journal',
      'act-brush-teeth',
    ],
  },
];

export type V0CategoryCatalog = {
  categories: Category[];
  actions: CatalogAction[];
  recommendedItems: RecommendedItem[];
};

// 中間定義を Category[] / CatalogAction[] / RecommendedItem[] に展開する純粋関数
// (DB / 副作用なし、K-007)。
// - orderIndex: genre カテゴリを先に 0.. で連番、続けて recommended を連番。
// - CatalogAction.position: カテゴリ内通し番号。
// - RecommendedItem.position: recommended カテゴリ内通し番号。id は category+index で一意化。
export const buildV0CategoryCatalog = (): V0CategoryCatalog => {
  const categories: Category[] = [];
  const actions: CatalogAction[] = [];
  const recommendedItems: RecommendedItem[] = [];
  let orderIndex = 0;

  for (const def of V0_GENRE_CATEGORIES) {
    categories.push({
      id: def.id,
      name: def.name,
      type: 'genre',
      color: def.color,
      source: 'official',
      orderIndex: orderIndex++,
    });
    def.actions.forEach((action, position) => {
      actions.push({
        id: action.id,
        title: action.title,
        categoryId: def.id,
        defaultOn: action.defaultOn,
        position,
        source: 'official',
        timerSeconds: action.timerSeconds ?? null,
      });
    });
  }

  for (const def of V0_RECOMMENDED_CATEGORIES) {
    categories.push({
      id: def.id,
      name: def.name,
      type: 'recommended',
      color: def.color,
      source: 'official',
      orderIndex: orderIndex++,
    });
    def.actionIds.forEach((actionId, position) => {
      recommendedItems.push({
        id: `${def.id}-${position}`,
        categoryId: def.id,
        actionId,
        position,
      });
    });
  }

  return { categories, actions, recommendedItems };
};

// catalog を DB に投入する。固定 ID + INSERT OR IGNORE で冪等 (毎起動呼び出し可)。
// 投入順: categories → catalog_actions (FK→categories) → recommended_items
// (FK→categories + catalog_actions)。FK 制約を満たすため依存順を守る。
export const seedCategoryCatalog = async (db: DbClient): Promise<void> => {
  const { categories, actions, recommendedItems } = buildV0CategoryCatalog();
  for (const category of categories) {
    await seedCategory(db, category);
  }
  for (const action of actions) {
    await seedCatalogAction(db, action);
  }
  for (const item of recommendedItems) {
    await seedRecommendedItem(db, item);
  }
};
