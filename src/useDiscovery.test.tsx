import { act, renderHook, waitFor } from '@testing-library/react-native';

// #270 (ADR-0053 §4): discovery 画面 (発見 → 束プレビュー → 採用確認) 経由の
// チェーン採用で source=1 (discover) の chain_created を送ることを固定する。
//
// useDiscovery は DB / catalog ロード / bundleAdoption に依存するため、
// 本テストでは下記を mock し「採用時の track 送信」のみを検証する。

jest.mock('./db.expo', () => ({
  getExpoSqliteClient: jest.fn(async () => ({
    exec: jest.fn(),
    run: jest.fn(),
    all: jest.fn(),
  })),
}));

jest.mock('./repository', () => ({
  listCategories: jest.fn(async () => []),
  listCatalogActions: jest.fn(async () => []),
  listRecommendedItems: jest.fn(async () => []),
}));

// bundleAdoption.adoptChainDraft は永続化。track 送信の順序 (成功後) を検証したい
// ため、成功時は新 chainId、失敗時は throw で分岐させる。
jest.mock('./bundleAdoption', () => ({
  adoptChainDraft: jest.fn(async () => 'new-chain-1'),
}));

jest.mock('./analytics', () => ({
  track: jest.fn(),
}));

jest.mock('./ids', () => ({
  newChainId: jest.fn(() => 'chain-x'),
  newNodeId: jest.fn(() => 'node-x'),
  newActionId: jest.fn(() => 'action-x'),
  newAnchorId: jest.fn(() => 'anchor-x'),
}));

import { track } from './analytics';
import { adoptChainDraft } from './bundleAdoption';
import type { Category, CatalogAction } from './domain';
import {
  listCatalogActions,
  listCategories,
  listRecommendedItems,
} from './repository';
import { useDiscovery } from './useDiscovery';

const GENRE_CATEGORY: Category = {
  id: 'cat-morning',
  name: '朝の準備',
  type: 'genre',
  color: '#123456',
  source: 'official',
  orderIndex: 0,
};

const GENRE_ACTIONS: CatalogAction[] = [
  {
    id: 'act-water',
    title: '水を飲む',
    categoryId: 'cat-morning',
    defaultOn: true,
    position: 0,
    source: 'official',
    timerSeconds: null,
  },
  {
    id: 'act-stretch',
    title: 'ストレッチ',
    categoryId: 'cat-morning',
    defaultOn: true,
    position: 1,
    source: 'official',
    timerSeconds: 60,
  },
];

const setupCatalog = () => {
  (listCategories as jest.Mock).mockResolvedValueOnce([GENRE_CATEGORY]);
  (listCatalogActions as jest.Mock).mockResolvedValueOnce(GENRE_ACTIONS);
  (listRecommendedItems as jest.Mock).mockResolvedValueOnce([]);
};

describe('useDiscovery.adopt (#270 / ADR-0053 §4: chain_created source=1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (adoptChainDraft as jest.Mock).mockResolvedValue('new-chain-1');
  });

  test('採用成功時に track("chain_created") を source=discover(1) で送る', async () => {
    setupCatalog();
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 扉を開くと初期は全選択 (ADR-0039)。そのまま採用する。
    act(() => {
      result.current.openCategory(GENRE_CATEGORY);
    });

    let chainId: string | null = null;
    await act(async () => {
      chainId = await result.current.adopt('2026-08-01T09:00:00');
    });

    expect(chainId).toBe('new-chain-1');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('chain_created', {
      source: 1, // CHAIN_SOURCE.discover
      node_count: 2,
      // discovery は全アイテムがカタログ由来なので template と同数。
      nodes_from_template: 2,
      // discovery の採用は DEFAULT_ANCHOR_SPEC (kind='behavior') → ANCHOR_KIND.action(2)。
      anchor_kind: 2,
    });
  });

  test('選択を外すと node_count / nodes_from_template が減る', async () => {
    setupCatalog();
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.openCategory(GENRE_CATEGORY);
    });
    // 1 つ外して 1 個だけ採用。
    act(() => {
      result.current.toggleItem('act-stretch');
    });

    await act(async () => {
      await result.current.adopt('2026-08-01T09:00:00');
    });

    expect(track).toHaveBeenCalledWith('chain_created', {
      source: 1,
      node_count: 1,
      nodes_from_template: 1,
      anchor_kind: 2,
    });
  });

  test('全て外して空選択 (node_count=0) では track を呼ばない', async () => {
    setupCatalog();
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.openCategory(GENRE_CATEGORY);
    });
    act(() => {
      result.current.toggleItem('act-water');
      result.current.toggleItem('act-stretch');
    });

    let chainId: string | null = 'unset';
    await act(async () => {
      chainId = await result.current.adopt('2026-08-01T09:00:00');
    });

    expect(chainId).toBeNull();
    expect(track).not.toHaveBeenCalled();
    expect(adoptChainDraft).not.toHaveBeenCalled();
  });

  test('adoptChainDraft が失敗した場合は track を呼ばない', async () => {
    setupCatalog();
    (adoptChainDraft as jest.Mock).mockRejectedValueOnce(new Error('DB fail'));
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.openCategory(GENRE_CATEGORY);
    });

    let chainId: string | null = 'unset';
    await act(async () => {
      chainId = await result.current.adopt('2026-08-01T09:00:00');
    });

    expect(chainId).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  test('送るプロパティは全て number (SafeValue = number | boolean 制約)', async () => {
    setupCatalog();
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.openCategory(GENRE_CATEGORY);
    });
    await act(async () => {
      await result.current.adopt('2026-08-01T09:00:00');
    });

    const props = (track as jest.Mock).mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    // チェーン名 / アクション名 (記録内容) は送らない (K-002 / ADR-0053 §1)。
    for (const value of Object.values(props)) {
      expect(['number', 'boolean']).toContain(typeof value);
    }
  });
});
