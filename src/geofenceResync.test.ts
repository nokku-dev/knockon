const mockAddEventListener = jest.fn();
const mockRemove = jest.fn();
jest.mock('react-native', () => ({
  AppState: { addEventListener: mockAddEventListener },
}));

const mockSyncGeofences = jest.fn(async () => ({
  started: false as const,
  reason: 'no-regions' as const,
}));
jest.mock('./geofencing', () => ({ syncGeofences: mockSyncGeofences }));

import { startGeofenceResyncOnForeground } from './geofenceResync';

beforeEach(() => {
  jest.clearAllMocks();
  mockAddEventListener.mockReturnValue({ remove: mockRemove });
});

// #301 follow-up: 常時権限を **後から iOS の設定で許可**しても、syncGeofences が
// 起動時とチェーン保存時にしか走らないため、アプリを再起動するまでジオフェンスが
// 登録されない。「一度拒否 → 後から設定で許可 → 通知が来ない」経路になる。
// 設定アプリから戻ってきた = foreground 復帰 で取り直す。
describe('startGeofenceResyncOnForeground (#301 follow-up)', () => {
  test('AppState の change を購読する', () => {
    startGeofenceResyncOnForeground();
    expect(mockAddEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  test('active に戻ったら syncGeofences を呼ぶ', async () => {
    startGeofenceResyncOnForeground();
    const handler = mockAddEventListener.mock.calls[0]![1] as (
      s: string,
    ) => void;
    handler('active');
    expect(mockSyncGeofences).toHaveBeenCalledTimes(1);
  });

  test.each(['background', 'inactive'])(
    '%s では呼ばない (前面に戻ったときだけ取り直す)',
    (state) => {
      startGeofenceResyncOnForeground();
      const handler = mockAddEventListener.mock.calls[0]![1] as (
        s: string,
      ) => void;
      handler(state);
      expect(mockSyncGeofences).not.toHaveBeenCalled();
    },
  );

  test('syncGeofences が失敗しても投げない (復帰時に落とさない)', () => {
    mockSyncGeofences.mockRejectedValueOnce(new Error('boom'));
    startGeofenceResyncOnForeground();
    const handler = mockAddEventListener.mock.calls[0]![1] as (
      s: string,
    ) => void;
    expect(() => handler('active')).not.toThrow();
  });

  test('返り値で購読を解除できる', () => {
    const stop = startGeofenceResyncOnForeground();
    stop();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
