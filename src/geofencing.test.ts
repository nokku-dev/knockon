import type { Anchor, Chain } from './domain';

// expo 系はネイティブなので全て mock する (ts-jest / node env)。
const mockStartGeofencing = jest.fn(async () => undefined);
const mockStopGeofencing = jest.fn(async () => undefined);
const mockHasStartedGeofencing = jest.fn(async () => false);
const mockDefineTask = jest.fn();

jest.mock('expo-location', () => ({
  startGeofencingAsync: mockStartGeofencing,
  stopGeofencingAsync: mockStopGeofencing,
  hasStartedGeofencingAsync: mockHasStartedGeofencing,
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));
jest.mock('expo-task-manager', () => ({ defineTask: mockDefineTask }));

const mockGetBackgroundStatus = jest.fn(async () => 'granted');
jest.mock('./location', () => ({
  getBackgroundLocationPermissionStatus: mockGetBackgroundStatus,
}));

const mockPresentArrival = jest.fn(async () => undefined);
jest.mock('./notifications', () => ({
  presentPlaceArrivalNotification: mockPresentArrival,
}));

const mockGetExpoSqliteClient = jest.fn(async () => ({}));
jest.mock('./db.expo', () => ({
  getExpoSqliteClient: mockGetExpoSqliteClient,
}));

const mockListChains = jest.fn(async () => [] as Chain[]);
const mockGetAnchor = jest.fn(
  async (_db: unknown, _id: string) => null as Anchor | null,
);
const mockListAnchorFiringsForDate = jest.fn(async () => [] as unknown[]);
const mockRecordAnchorFiring = jest.fn(async () => undefined);
jest.mock('./repository', () => ({
  listChains: mockListChains,
  getAnchor: mockGetAnchor,
  listAnchorFiringsForDate: mockListAnchorFiringsForDate,
  recordAnchorFiring: mockRecordAnchorFiring,
}));

const mockGetAppSettings = jest.fn(async () => ({ resetTime: '00:00' }));
jest.mock('./settingsRepository', () => ({
  getAppSettings: mockGetAppSettings,
}));

import type { DbClient } from './db';
import { IOS_REGION_LIMIT } from './geofenceRegions';
import {
  GEOFENCE_TASK_NAME,
  handlePlaceArrival,
  syncGeofences,
} from './geofencing';

// ⚠ module scope の defineTask は **import 時に 1 回だけ**呼ばれる。
// beforeEach の clearAllMocks より前なので、ここで記録を捕まえておく。
const defineTaskCallsAtImport = [...mockDefineTask.mock.calls];

const db = {} as DbClient;
const NOW = new Date('2026-08-16T10:00:00');

const placeAnchor = (id: string, over: Partial<Anchor> = {}): Anchor => ({
  id,
  title: '会社',
  kind: 'place',
  time: null,
  latitude: 35.68,
  longitude: 139.76,
  radiusMeters: 100,
  ...over,
});

const chain = (id: string, anchorId: string, over: Partial<Chain> = {}): Chain => ({
  id,
  title: id,
  anchorId,
  status: 'active',
  createdAt: '2026-08-01T09:00:00',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBackgroundStatus.mockResolvedValue('granted');
  mockHasStartedGeofencing.mockResolvedValue(false);
  mockListAnchorFiringsForDate.mockResolvedValue([]);
  mockGetAppSettings.mockResolvedValue({ resetTime: '00:00' });
});

describe('handlePlaceArrival — 到達を正準の事実として 1 日 1 回だけ記録する (ADR-0012)', () => {
  test('未発火なら発火を記録し、そのアンカーの active チェーンに通知する', async () => {
    const anchor = placeAnchor('a1');
    mockGetAnchor.mockResolvedValue(anchor);
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);

    await handlePlaceArrival(db, 'a1', NOW);

    expect(mockRecordAnchorFiring).toHaveBeenCalledWith(db, {
      anchorId: 'a1',
      date: '2026-08-16',
    });
    expect(mockPresentArrival).toHaveBeenCalledTimes(1);
    expect(mockPresentArrival).toHaveBeenCalledWith(chain('c1', 'a1'), anchor);
  });

  test('今日すでに発火済みなら記録も通知もしない', async () => {
    // ジオフェンスは境界上で Enter を繰り返し投げてくる。これがないと通知が連発する。
    mockListAnchorFiringsForDate.mockResolvedValue([
      { anchorId: 'a1', date: '2026-08-16' },
    ]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);

    await handlePlaceArrival(db, 'a1', NOW);

    expect(mockRecordAnchorFiring).not.toHaveBeenCalled();
    expect(mockPresentArrival).not.toHaveBeenCalled();
  });

  test('アンカーが既に消えていたら記録も通知もしない', async () => {
    mockGetAnchor.mockResolvedValue(null);
    await handlePlaceArrival(db, 'gone', NOW);
    expect(mockRecordAnchorFiring).not.toHaveBeenCalled();
    expect(mockPresentArrival).not.toHaveBeenCalled();
  });

  test('同じアンカーを持つ active チェーンすべてに通知する', async () => {
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockListChains.mockResolvedValue([
      chain('c1', 'a1'),
      chain('c2', 'a1'),
      chain('c3', 'other'),
    ]);
    await handlePlaceArrival(db, 'a1', NOW);
    expect(mockPresentArrival).toHaveBeenCalledTimes(2);
  });

  test('リセット時刻の設定を反映した日付で記録する (ADR-0028)', async () => {
    // resetTime=03:00 なら 02:00 の到達は「昨日」に振り分けられる。
    mockGetAppSettings.mockResolvedValue({ resetTime: '03:00' });
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);

    await handlePlaceArrival(db, 'a1', new Date('2026-08-16T02:00:00'));

    expect(mockRecordAnchorFiring).toHaveBeenCalledWith(db, {
      anchorId: 'a1',
      date: '2026-08-15',
    });
  });
});

describe('syncGeofences — active な場所アンカーを OS に登録し直す', () => {
  test('権限があり region があれば登録し、件数を返す', async () => {
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));

    const result = await syncGeofences();

    expect(mockStartGeofencing).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, [
      {
        identifier: 'a1',
        latitude: 35.68,
        longitude: 139.76,
        radius: 100,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ]);
    expect(result).toEqual({
      started: true,
      regionCount: 1,
      droppedForLimit: 0,
    });
  });

  test('場所アンカーが無ければ監視を止めて no-regions を返す', async () => {
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1', { kind: 'time', time: '07:00' }));
    mockHasStartedGeofencing.mockResolvedValue(true);

    const result = await syncGeofences();

    expect(mockStopGeofencing).toHaveBeenCalledWith(GEOFENCE_TASK_NAME);
    expect(mockStartGeofencing).not.toHaveBeenCalled();
    expect(result).toEqual({ started: false, reason: 'no-regions' });
  });

  test('常時権限が無ければ登録せず permission-denied を返す (Always 拒否時のフォールバック)', async () => {
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockGetBackgroundStatus.mockResolvedValue('denied');

    const result = await syncGeofences();

    expect(mockStartGeofencing).not.toHaveBeenCalled();
    expect(result).toEqual({ started: false, reason: 'permission-denied' });
  });

  test('⚠ syncGeofences は権限を要求しない (ADR-0003 §決定 第 5 項: 再要求ループ禁止)', async () => {
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockGetBackgroundStatus.mockResolvedValue('undetermined');

    await syncGeofences();

    // location.ts の request 系を import すらしていないことを、読むだけで済ませる。
    const location = jest.requireMock('./location');
    expect(location.requestBackgroundLocationPermission).toBeUndefined();
    expect(mockGetBackgroundStatus).toHaveBeenCalled();
  });

  test('OS 側で失敗しても落ちず、started=false を返す (成功に潰さない)', async () => {
    mockListChains.mockResolvedValue([chain('c1', 'a1')]);
    mockGetAnchor.mockResolvedValue(placeAnchor('a1'));
    mockStartGeofencing.mockRejectedValueOnce(new Error('monitoring unavailable'));

    const result = await syncGeofences();

    expect(result).toEqual({ started: false, reason: 'unavailable' });
  });

  test('上限を超えた分は droppedForLimit で伝える (黙って捨てない)', async () => {
    const n = IOS_REGION_LIMIT + 2;
    mockListChains.mockResolvedValue(
      Array.from({ length: n }, (_, i) => chain(`c${i}`, `a${i}`)),
    );
    mockGetAnchor.mockImplementation(async (_db: unknown, id: string) =>
      placeAnchor(id),
    );

    const result = await syncGeofences();

    expect(result).toEqual({
      started: true,
      regionCount: IOS_REGION_LIMIT,
      droppedForLimit: 2,
    });
  });

  test('停止していないときに stop を呼ばない (hasStarted を見てから止める)', async () => {
    mockListChains.mockResolvedValue([]);
    mockHasStartedGeofencing.mockResolvedValue(false);
    await syncGeofences();
    expect(mockStopGeofencing).not.toHaveBeenCalled();
  });
});

describe('バックグラウンドタスクの登録', () => {
  test('module scope で GEOFENCE_TASK_NAME のタスクを defineTask している', () => {
    // OS がアプリを起こしたとき、この登録が済んでいないとタスクを解決できない。
    // import の副作用として登録されることを固定する。
    expect(defineTaskCallsAtImport).toEqual([
      [GEOFENCE_TASK_NAME, expect.any(Function)],
    ]);
  });
});
