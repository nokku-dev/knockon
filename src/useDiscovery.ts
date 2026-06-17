import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { adoptChainDraft } from './bundleAdoption';
import type { IdGen } from './bundleAdoption';
import {
  allItemKeys,
  buildChainDraftFromCategorySelection,
  buildGenrePreview,
  buildRecommendedPreview,
  listGenreCategories,
  listRecommendedCategories,
} from './categoryDiscovery';
import type { CategoryPreview } from './categoryDiscovery';
import { getExpoSqliteClient } from './db.expo';
import type { Category, CatalogAction, RecommendedItem } from './domain';
import { newActionId, newAnchorId, newChainId, newNodeId } from './ids';
import {
  listCatalogActions,
  listCategories,
  listRecommendedItems,
} from './repository';

// ADR-0039 (#155): discovery フローの状態 hook (新カテゴリモデル)。catalog
// (categories / catalog_actions / recommended_items) をロードし、扉選択
// (genre / recommended カテゴリ) → アクションプレビュー → トグル → 採用 を駆動する。
//
// 純粋ロジックは categoryDiscovery.ts (テスト済み) / 採用永続化は
// bundleAdoption.adoptChainDraft (テスト済み) に委譲し、本 hook は React 状態と
// それらの配線のみ持つ (codebase 規約: hook は薄いラッパ)。
const defaultIdGen: IdGen = {
  anchor: newAnchorId,
  chain: newChainId,
  action: newActionId,
  node: newNodeId,
};

// 開いているカテゴリ (扉)。type は preview.category.type と一致するが、door だけで
// preview を導出できるよう categoryId を保持する。
export type DiscoveryDoor = { categoryId: string };

export type UseDiscoveryResult = {
  loading: boolean;
  error: string | null;
  // 索引 (扉) の選択肢
  recommendedCategories: Category[];
  genreCategories: Category[];
  // 現在開いているカテゴリ (扉未選択なら null)
  door: DiscoveryDoor | null;
  preview: CategoryPreview | null;
  selectedKeys: Set<string>;
  selectedCount: number;
  // 索引操作
  openCategory: (category: Category) => void;
  closeCategory: () => void;
  // 採用前トグル編集
  toggleItem: (key: string) => void;
  // 採用確認用: 現在の選択でできるチェーン (表示順のアクション名列)
  selectedActionTitles: string[];
  // 採用 (live 永続化)。成功時は新 chainId、失敗時は null。
  adopt: (now: string) => Promise<string | null>;
  adopting: boolean;
};

export const useDiscovery = (idGen: IdGen = defaultIdGen): UseDiscoveryResult => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [actions, setActions] = useState<CatalogAction[]>([]);
  const [recommendedItems, setRecommendedItems] = useState<RecommendedItem[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [door, setDoor] = useState<DiscoveryDoor | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [adopting, setAdopting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        const [cats, acts, recs] = await Promise.all([
          listCategories(db),
          listCatalogActions(db),
          listRecommendedItems(db),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setActions(acts);
        setRecommendedItems(recs);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendedCategories = useMemo(
    () => listRecommendedCategories(categories),
    [categories],
  );
  const genreCategories = useMemo(
    () => listGenreCategories(categories),
    [categories],
  );

  // door (categoryId) からプレビューを導出する純粋計算。genre / recommended で
  // builder を切り替える (category.type で判定)。
  const buildPreview = useCallback(
    (categoryId: string): CategoryPreview | null => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return null;
      return category.type === 'recommended'
        ? buildRecommendedPreview(category, recommendedItems, actions)
        : buildGenrePreview(category, actions);
    },
    [categories, actions, recommendedItems],
  );

  const preview = useMemo<CategoryPreview | null>(
    () => (door ? buildPreview(door.categoryId) : null),
    [door, buildPreview],
  );

  // 扉を開いたら全アイテムを初期選択にする (ADR-0039「カテゴリ選択時は初期全選択」)。
  const openCategory = useCallback(
    (category: Category) => {
      const p = buildPreview(category.id);
      setSelectedKeys(new Set(p ? allItemKeys(p) : []));
      setDoor({ categoryId: category.id });
    },
    [buildPreview],
  );

  const closeCategory = useCallback(() => {
    setDoor(null);
    setSelectedKeys(new Set());
  }, []);

  const toggleItem = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedActionTitles = useMemo(
    () =>
      preview
        ? preview.items
            .filter((i) => selectedKeys.has(i.key))
            .map((i) => i.title)
        : [],
    [preview, selectedKeys],
  );

  // adopt 中に door が変わっても安定参照するため最新値を ref に持つ。
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const adopt = useCallback(
    async (now: string): Promise<string | null> => {
      const currentPreview = previewRef.current;
      if (!currentPreview) return null;
      const draft = buildChainDraftFromCategorySelection(
        currentPreview,
        selectedKeys,
        currentPreview.category.name,
      );
      if (draft.nodes.length === 0) {
        setError('アクションを 1 つ以上選んでください');
        return null;
      }
      setAdopting(true);
      try {
        const db = await getExpoSqliteClient();
        const chainId = await adoptChainDraft(db, draft, now, idGen);
        return chainId;
      } catch (e) {
        setError(e instanceof Error ? e.message : '採用に失敗しました');
        return null;
      } finally {
        setAdopting(false);
      }
    },
    [selectedKeys, idGen],
  );

  return {
    loading,
    error,
    recommendedCategories,
    genreCategories,
    door,
    preview,
    selectedKeys,
    selectedCount: selectedKeys.size,
    openCategory,
    closeCategory,
    toggleItem,
    selectedActionTitles,
    adopt,
    adopting,
  };
};
