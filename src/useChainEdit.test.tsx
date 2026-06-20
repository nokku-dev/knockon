import { act, renderHook, waitFor } from '@testing-library/react-native';

// #168 (#155 follow-up): addNodesFromCategory はカテゴリ picker から渡された
// アイテム集合 (title + timerSeconds、 表示順) を末尾追加する。 各アイテムを
// 新規 Action として INSERT し、 timerSeconds は catalog 由来をそのまま保つ。
//
// useChainEdit は DB / location / 通知 / ID 生成 / catalog ロードに依存するため、
// 本テストでは下記を mock し「カテゴリ取り込みの追加挙動」のみを検証する。

jest.mock('./db.expo', () => ({
  getExpoSqliteClient: jest.fn(async () => ({
    exec: jest.fn(),
    run: jest.fn(),
    all: jest.fn(),
  })),
}));

jest.mock('./repository', () => ({
  // 新規モード (chainId = null) では loadExisting は呼ばれないが、
  // 初期 useEffect で listActions / listCategories / listCatalogActions /
  // listRecommendedItems は呼ばれる。 本テストは picker 経由の取り込みのみ
  // 検証するため、 catalog は空でよい。
  listActions: jest.fn(async () => []),
  listCategories: jest.fn(async () => []),
  listCatalogActions: jest.fn(async () => []),
  listRecommendedItems: jest.fn(async () => []),
  listChains: jest.fn(async () => []),
  listNodes: jest.fn(async () => []),
  getAction: jest.fn(async () => null),
  getAnchor: jest.fn(async () => null),
  insertAction: jest.fn(async () => undefined),
  updateAction: jest.fn(async () => undefined),
  deleteAction: jest.fn(async () => undefined),
  deleteChain: jest.fn(async () => undefined),
}));

jest.mock('./location', () => ({
  getLocationPermissionStatus: jest.fn(async () => 'granted'),
  requestLocationPermission: jest.fn(async () => 'granted'),
  getCurrentPosition: jest.fn(async () => null),
}));

jest.mock('./notifications', () => ({
  cancelNotificationForChain: jest.fn(async () => undefined),
  scheduleNotificationForChain: jest.fn(async () => undefined),
}));

// ID 生成は expo-crypto に依存して jest 環境で失敗するため、 単純な順序付き文字列に差し替える。
jest.mock('./ids', () => {
  let counter = 0;
  return {
    newChainId: jest.fn(() => `chain-${++counter}`),
    newNodeId: jest.fn(() => `node-${++counter}`),
    newActionId: jest.fn(() => `action-${++counter}`),
    newAnchorId: jest.fn(() => `anchor-${++counter}`),
  };
});

import { useChainEdit } from './useChainEdit';
import type { TemplateCategoryPickerItem } from './TemplateCategoryPicker';

describe('useChainEdit.addNodesFromCategory (#168 / #155 follow-up)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('items の順序で末尾追加され、 actionTitle が node に反映される', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const items: TemplateCategoryPickerItem[] = [
      { actionTitle: '水を飲む', timerSeconds: null },
      { actionTitle: 'ストレッチ', timerSeconds: 300 },
      { actionTitle: '机に向かう', timerSeconds: null },
    ];

    await act(async () => {
      await result.current.addNodesFromCategory(items);
    });

    const titles = result.current.draft!.nodes.map((n) => n.actionTitle);
    expect(titles).toEqual(['水を飲む', 'ストレッチ', '机に向かう']);
  });

  test('timerSeconds は新規 Action に保存される (availableActions に反映)', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const items: TemplateCategoryPickerItem[] = [
      { actionTitle: 'ストレッチ', timerSeconds: 300 },
      { actionTitle: 'ウォーキング', timerSeconds: null },
    ];

    await act(async () => {
      await result.current.addNodesFromCategory(items);
    });

    const stretch = result.current.availableActions.find(
      (a) => a.title === 'ストレッチ',
    );
    const walk = result.current.availableActions.find(
      (a) => a.title === 'ウォーキング',
    );
    expect(stretch?.timerSeconds).toBe(300);
    expect(walk?.timerSeconds).toBeNull();
  });

  test('空タイトルはスキップされる (受容: 静かに飛ばす)', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const items: TemplateCategoryPickerItem[] = [
      { actionTitle: '   ', timerSeconds: null },
      { actionTitle: '水を飲む', timerSeconds: null },
    ];

    await act(async () => {
      await result.current.addNodesFromCategory(items);
    });

    const titles = result.current.draft!.nodes.map((n) => n.actionTitle);
    expect(titles).toEqual(['水を飲む']);
  });

  test('重複タイトルでも別 Action として INSERT される (= 名寄せはしない)', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const items: TemplateCategoryPickerItem[] = [
      { actionTitle: '歯磨き', timerSeconds: null },
      { actionTitle: '歯磨き', timerSeconds: null }, // 重複参照 (recommended の朝/夜末尾)
    ];

    await act(async () => {
      await result.current.addNodesFromCategory(items);
    });

    const nodes = result.current.draft!.nodes;
    expect(nodes).toHaveLength(2);
    // 別 Action ID で 2 ノードが追加される
    expect(nodes[0].actionId).not.toBe(nodes[1].actionId);
  });
});
