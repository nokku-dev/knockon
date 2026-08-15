import { act, renderHook, waitFor } from '@testing-library/react-native';

// ADR-0047: 定着ライフサイクルの Today 配線を検証する。
// - 定着判定を isNodeEstablished (14D ローリング) から isNodeSettled (latch + 取り下げ) に置換
// - retractSettlement (取り下げ導線) で insertRetraction を呼び、 楽観更新で settled から外す
//
// useTodayData は DB / 位置情報 / 設定に依存するため、 下記を mock して
// 「定着派生 + 取り下げ楽観更新」のロジックだけを検証する (useChainEdit.test の方式)。

const mockListRetractions = jest.fn<Promise<unknown[]>, []>();
const mockInsertRetraction = jest.fn(
  async (
    _db: unknown,
    _retraction: { nodeId: string; retractedAt: string },
  ): Promise<void> => undefined,
);

jest.mock('./db.expo', () => ({
  getExpoSqliteClient: jest.fn(async () => ({
    exec: jest.fn(),
    run: jest.fn(),
    all: jest.fn(),
  })),
}));

jest.mock('./repository', () => {
  // 定着バーを満たす 10 日 (2026-04-01..10)。 wall-clock の today (>2026-04) から見て
  // latch 定着は維持される (ローリング版なら false になる対比、 domain.test と同型)。
  // jest.mock ファクトリ内に inline する (out-of-scope 変数参照禁止のため)。
  const tenDaysApril = Array.from(
    { length: 10 },
    (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`,
  ).map((date) => ({ nodeId: 'n1', date, achieved: true }));
  return {
  listChains: jest.fn(async () => [
    {
      id: 'c1',
      title: 'C1',
      anchorId: 'c1-anchor',
      status: 'active',
      createdAt: '2026-03-01',
    },
  ]),
  getAnchor: jest.fn(async () => ({
    id: 'c1-anchor',
    title: 'anchor',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  })),
  listNodes: jest.fn(async () => [
    { id: 'n1', chainId: 'c1', orderIndex: 0, kind: 'action', actionId: 'a1', active: true },
  ]),
  getAction: jest.fn(async () => ({
    id: 'a1',
    title: 'Action 1',
    variants: null,
    timerSeconds: null,
  })),
  listAchievementsForNodes: jest.fn(async () => tenDaysApril),
  listAnchorFiringsForDate: jest.fn(async () => []),
  recordAnchorFiring: jest.fn(async () => undefined),
  recordAchievement: jest.fn(async () => undefined),
  countAchievedBefore: jest.fn(async () => 0),
  // ADR-0047 追補: effective 累計用のアプリ全体ローダ。
  listAllNodeIds: jest.fn(async () => ['n1']),
  listAllAchievements: jest.fn(async () => tenDaysApril),
  };
});

jest.mock('./settlementRepository', () => ({
  listRetractions: () => mockListRetractions(),
  insertRetraction: (
    db: unknown,
    retraction: { nodeId: string; retractedAt: string },
  ) => mockInsertRetraction(db, retraction),
}));

jest.mock('./settingsRepository', () => ({
  getAppSettings: jest.fn(async () => ({
    resetTime: '00:00',
    themeMode: 'auto',
    onboardingCompleted: true,
    checklistDismissedAt: null,
    checklistAddedAction: false,
  })),
  updateAppSettings: jest.fn(async () => undefined),
}));

jest.mock('./location', () => ({
  getLocationPermissionStatus: jest.fn(async () => 'denied'),
  getCurrentPosition: jest.fn(async () => null),
}));

// useFocusEffect を通常の useEffect 相当に (expo-router 非依存で load を走らせる)。
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      // 本物の useFocusEffect と同じく「focus 時に 1 回」にする。cb を依存に入れると
      // 毎レンダーで再実行され、load が無限に走る。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => cb(), []);
    },
  };
});

import { useTodayData } from './useTodayData';

describe('useTodayData 定着配線 (ADR-0047)', () => {
  beforeEach(() => {
    mockListRetractions.mockReset();
    mockInsertRetraction.mockClear();
    mockListRetractions.mockResolvedValue([]);
  });

  it('取り下げが無ければ latch 定着したノードは nodeIdsSettled に入る', async () => {
    const { result } = renderHook(() => useTodayData());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const chain = result.current.data!.chains[0];
    expect(chain.nodeIdsSettled.has('n1')).toBe(true);
  });

  it('既に取り下げ済み (今日) なら latch 定着は派生上リセットされ nodeIdsSettled に入らない', async () => {
    // 取り下げ日 = 未来寄りの日付。 4 月の達成は取り下げ以前なので算入されない。
    mockListRetractions.mockResolvedValue([
      { nodeId: 'n1', retractedAt: '2026-06-01T00:00:00' },
    ]);
    const { result } = renderHook(() => useTodayData());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const chain = result.current.data!.chains[0];
    expect(chain.nodeIdsSettled.has('n1')).toBe(false);
  });

  it('retractSettlement で insertRetraction を呼び、 楽観更新で settled から外れる', async () => {
    const { result } = renderHook(() => useTodayData());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.chains[0].nodeIdsSettled.has('n1')).toBe(true);

    await act(async () => {
      await result.current.retractSettlement('c1', 'n1');
    });

    expect(mockInsertRetraction).toHaveBeenCalledTimes(1);
    const arg = mockInsertRetraction.mock.calls[0][1];
    expect(arg.nodeId).toBe('n1');
    expect(typeof arg.retractedAt).toBe('string');
    // 楽観更新: 取り下げ直後 (retractedAt = 今日) は 4 月達成が算入されず育成中に戻る。
    expect(result.current.data!.chains[0].nodeIdsSettled.has('n1')).toBe(false);
  });
});
