import { act, renderHook, waitFor } from '@testing-library/react-native';

// Issue #133: addNodesFromTemplate に selectedActionTitles オプション引数を追加
// (省略時は全アクション = 後方互換、指定時は title 完全一致でフィルタ + テンプレ順保持)。
//
// useChainEdit は DB / location / 通知 / ID 生成に依存するため、
// 本テストでは下記を mock し「テンプレ取り込みのフィルタ挙動」のみを検証する。

jest.mock('./db.expo', () => ({
  getExpoSqliteClient: jest.fn(async () => ({
    exec: jest.fn(),
    run: jest.fn(),
    all: jest.fn(),
  })),
}));

jest.mock('./repository', () => ({
  // 新規モード (chainId = null) では loadExisting は呼ばれないが、
  // 初期 useEffect で listActions は呼ばれる。
  listActions: jest.fn(async () => []),
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
// 個別 ID は assertion で見ないので、 一意性のみ担保すればよい。
jest.mock('./ids', () => {
  let counter = 0;
  return {
    newChainId: jest.fn(() => `chain-${++counter}`),
    newNodeId: jest.fn(() => `node-${++counter}`),
    newActionId: jest.fn(() => `action-${++counter}`),
    newAnchorId: jest.fn(() => `anchor-${++counter}`),
    newModuleId: jest.fn(() => `module-${++counter}`),
  };
});

import { useChainEdit } from './useChainEdit';
import type { TemplateChain } from './templateChains';

const TEMPLATE: TemplateChain = {
  id: 'tpl-test',
  title: 'テスト用テンプレ',
  actions: ['水を飲む', 'ストレッチ', '机に向かう', 'コーヒー'],
};

describe('useChainEdit.addNodesFromTemplate (Issue #133)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selectedActionTitles 省略 → テンプレの全アクションが末尾に追加される (後方互換)', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addNodesFromTemplate(TEMPLATE);
    });

    const titles = result.current.draft!.nodes.map((n) => n.actionTitle);
    expect(titles).toEqual(['水を飲む', 'ストレッチ', '机に向かう', 'コーヒー']);
  });

  test('selectedActionTitles 指定 → 一致するアクションだけがテンプレ順で追加される', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // 配列の並びをテンプレ順と入れ替えても、 追加順序はテンプレ順 (= '水を飲む' →
      // '机に向かう') になることを担保する。
      await result.current.addNodesFromTemplate(TEMPLATE, ['机に向かう', '水を飲む']);
    });

    const titles = result.current.draft!.nodes.map((n) => n.actionTitle);
    expect(titles).toEqual(['水を飲む', '机に向かう']);
  });
});
