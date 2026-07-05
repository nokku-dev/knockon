import type {
  Category,
  CatalogAction,
  ChainDraft,
  RecommendedItem,
} from './domain';

// ADR-0039 (#155): 新カテゴリモデルの discovery 純粋ドメイン層。
// 旧 discovery.ts (module/link・moment/goal 軸) を置換する新軸版で、catalog
// (categories / catalog_actions / recommended_items) → 採用候補プレビュー /
// ChainDraft への変換を DB/UI 非依存の純粋関数として実装する (K-007)。
//
// カテゴリ2型を 1 つの正規化形 (AdoptItem / CategoryPreview) に畳んで、画面・hook が
// genre / recommended を同じ構造で扱えるようにする:
// - genre        各アクションを 1 件ずつ (key = actionId)。表示順 = position。
// - recommended  genre アクションを順序つきで重複参照 (key = recommended_item.id)。
//                同じアクションが複数回出るため、トグル単位は item (action ではない)。
// 採用は「カテゴリ選択 → 初期全選択 → 外したいものを外す」(ADR-0039)。

// 採用候補の 1 アイテム (genre/recommended 共通の正規化形)。
export type AdoptItem = {
  key: string; // トグル単位の一意キー。genre = actionId / recommended = item.id。
  actionId: string;
  title: string;
  timerSeconds: number | null;
};

export type CategoryPreview = {
  category: Category;
  items: AdoptItem[]; // 表示順 (genre = position / recommended = item position・重複あり)。
};

// genre カテゴリのみを orderIndex 昇順で返す (索引のジャンル別セクション)。
export const listGenreCategories = (
  categories: readonly Category[],
): Category[] =>
  categories
    .filter((c) => c.type === 'genre')
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

// recommended カテゴリのみを orderIndex 昇順で返す (索引のおすすめセクション)。
export const listRecommendedCategories = (
  categories: readonly Category[],
): Category[] =>
  categories
    .filter((c) => c.type === 'recommended')
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

// genre カテゴリ → プレビュー。所属アクションを position 昇順で AdoptItem 化する。
// #191: `defaultOn=false` (旧「(任意)」ラベル対象) は「意味が伝わりにくい」ため
// プレビューから除外する。DB 側の defaultOn 列は保持 (後で判断を覆せる余地を残す)。
export const buildGenrePreview = (
  category: Category,
  actions: readonly CatalogAction[],
): CategoryPreview => {
  const items = actions
    .filter((a) => a.categoryId === category.id && a.defaultOn)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (a): AdoptItem => ({
        key: a.id,
        actionId: a.id,
        title: a.title,
        timerSeconds: a.timerSeconds,
      }),
    );
  return { category, items };
};

// recommended カテゴリ → プレビュー。順序つきアイテムを position 昇順で並べ、
// 参照先 genre アクションのタイトル/タイマーを解決する (重複参照 OK)。
export const buildRecommendedPreview = (
  category: Category,
  items: readonly RecommendedItem[],
  actions: readonly CatalogAction[],
): CategoryPreview => {
  const actionById = new Map(actions.map((a) => [a.id, a]));
  const previewItems = items
    .filter((i) => i.categoryId === category.id)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i): AdoptItem | null => {
      const action = actionById.get(i.actionId);
      if (!action) return null; // 参照先が無い壊れたアイテムはスキップ (FK 上は起きない)。
      return {
        key: i.id,
        actionId: action.id,
        title: action.title,
        timerSeconds: action.timerSeconds,
      };
    })
    .filter((i): i is AdoptItem => i !== null);
  return { category, items: previewItems };
};

// プレビューの全アイテムキー (採用時の初期全選択集合、ADR-0039)。
export const allItemKeys = (preview: CategoryPreview): string[] =>
  preview.items.map((i) => i.key);

// 選択キー集合 → ChainDraft。プレビューの表示順を保ったまま、選択されたアイテムだけを
// ノードに変換する (recommended の重複・順序を保持)。採用ノードは由来参照を持たない
// (moduleId 省略、ADR-0039 §決定 / 編集 UI 移行トラックで再検討)。
export const buildChainDraftFromCategorySelection = (
  preview: CategoryPreview,
  selectedKeys: ReadonlySet<string>,
  title: string,
): ChainDraft => ({
  title,
  nodes: preview.items
    .filter((i) => selectedKeys.has(i.key))
    .map((i) => ({
      actionTitle: i.title,
      timerSeconds: i.timerSeconds,
    })),
});
