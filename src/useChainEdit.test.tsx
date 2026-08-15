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
  // #269 (ADR-0053 §4): chain_deleted の total_completions 用。 deleteChain より
  // 前に呼ばれることが仕様なので、 各テストで mockResolvedValue で値を差し込む。
  countAchievementsForChain: jest.fn(async () => 0),
}));

// #269 (ADR-0053 §4): chain_deleted 送信を検証するため track を mock。
jest.mock('./analytics', () => ({
  track: jest.fn(),
}));

jest.mock('./location', () => ({
  getLocationPermissionStatus: jest.fn(async () => 'granted'),
  requestLocationPermission: jest.fn(async () => 'granted'),
  getCurrentPosition: jest.fn(async () => null),
  // #301: 常時権限。既定は「未決定」= 場所アンカー保存時に 1 度だけ聞く経路。
  getBackgroundLocationPermissionStatus: jest.fn(async () => 'undetermined'),
  requestBackgroundLocationPermission: jest.fn(async () => 'granted'),
}));

jest.mock('./notifications', () => ({
  cancelNotificationForChain: jest.fn(async () => undefined),
  scheduleNotificationForChain: jest.fn(async () => undefined),
}));

// #301: geofencing は expo-task-manager (native) を module scope で触るため mock する。
jest.mock('./geofencing', () => ({
  syncGeofences: jest.fn(async () => ({ started: false, reason: 'no-regions' })),
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
import { track } from './analytics';
import { syncGeofences } from './geofencing';
import {
  countAchievementsForChain,
  deleteChain as deleteChainRepo,
  getAnchor,
  listChains,
  listNodes,
} from './repository';

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

// #269 (ADR-0053 §4): chain_deleted 送信の検証。
// 既存チェーンの deleteChain 呼び出し時、 track が
// { age_days, total_completions } (どちらも number) で
// deleteChainRepo より前に呼ばれることを固定する。
describe('useChainEdit.deleteChain (#269 / ADR-0053 §4: chain_deleted)', () => {
  const CHAIN_ID = 'chain-existing-1';

  const setupExistingChain = (createdAt: string) => {
    (listChains as jest.Mock).mockResolvedValueOnce([
      {
        id: CHAIN_ID,
        title: '朝ルーティン',
        anchorId: 'anchor-1',
        status: 'active',
        createdAt,
      },
    ]);
    (getAnchor as jest.Mock).mockResolvedValueOnce({
      id: 'anchor-1',
      title: '起床',
      kind: 'behavior',
      time: null,
      latitude: null,
      longitude: null,
      radiusMeters: null,
    });
    (listNodes as jest.Mock).mockResolvedValueOnce([]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // 日付計算を deterministic にする (todayIsoDate(new Date()) が固定日を返す)。
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('deleteChain 成功で track("chain_deleted", { age_days, total_completions }) を送る', async () => {
    // 30 日前に作成、 過去に 12 回達成。
    setupExistingChain('2026-07-01T09:00:00');
    (countAchievementsForChain as jest.Mock).mockResolvedValueOnce(12);

    const { result } = renderHook(() => useChainEdit(CHAIN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.deleteChain();
    });
    expect(ok).toBe(true);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('chain_deleted', {
      age_days: 30,
      total_completions: 12,
    });
  });

  // #301: 消したチェーンの場所アンカーが OS の監視に残ると、存在しないチェーンの
  // 到達通知が飛ぶ。削除後に必ず全体一致を取り直す。
  test('deleteChain 成功後に syncGeofences を呼ぶ (監視に残さない)', async () => {
    setupExistingChain('2026-07-01T09:00:00');
    (countAchievementsForChain as jest.Mock).mockResolvedValueOnce(0);

    const { result } = renderHook(() => useChainEdit(CHAIN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.deleteChain();
    });

    expect(syncGeofences).toHaveBeenCalledTimes(1);
  });

  test('新規モードでは syncGeofences を呼ばない (DB に何も無い)', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.deleteChain();
    });
    expect(syncGeofences).not.toHaveBeenCalled();
  });

  test('total_completions は countAchievementsForChain の戻り値 (0 も送る)', async () => {
    // 作成直後 (age_days = 0) に削除、 達成 0 件。
    setupExistingChain('2026-07-31T00:00:00');
    (countAchievementsForChain as jest.Mock).mockResolvedValueOnce(0);

    const { result } = renderHook(() => useChainEdit(CHAIN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteChain();
    });

    expect(track).toHaveBeenCalledWith('chain_deleted', {
      age_days: 0,
      total_completions: 0,
    });
  });

  test('countAchievementsForChain は deleteChain (CASCADE) より前に呼ばれる', async () => {
    setupExistingChain('2026-07-24T00:00:00');

    const callOrder: string[] = [];
    (countAchievementsForChain as jest.Mock).mockImplementationOnce(async () => {
      callOrder.push('count');
      return 5;
    });
    (deleteChainRepo as jest.Mock).mockImplementationOnce(async () => {
      callOrder.push('delete');
    });

    const { result } = renderHook(() => useChainEdit(CHAIN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteChain();
    });

    // count → delete の順序が逆だと CASCADE で total_completions が常に 0 になる。
    expect(callOrder).toEqual(['count', 'delete']);
  });

  test('送るプロパティは全て number (SafeValue = number | boolean 制約)', async () => {
    setupExistingChain('2026-05-01T00:00:00');
    (countAchievementsForChain as jest.Mock).mockResolvedValueOnce(3);

    const { result } = renderHook(() => useChainEdit(CHAIN_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteChain();
    });

    const props = (track as jest.Mock).mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(typeof props.age_days).toBe('number');
    expect(typeof props.total_completions).toBe('number');
    // title / anchor などの文字列プロパティは送らない (K-002 / ADR-0053 §1)。
    for (const value of Object.values(props)) {
      expect(['number', 'boolean']).toContain(typeof value);
    }
  });

  test('新規モード (isNew = true) では track も deleteChainRepo も呼ばない', async () => {
    const { result } = renderHook(() => useChainEdit(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteChain();
    });

    expect(ok).toBe(false);
    expect(track).not.toHaveBeenCalled();
    expect(deleteChainRepo).not.toHaveBeenCalled();
    expect(countAchievementsForChain).not.toHaveBeenCalled();
  });
});
