import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, Vibration, type AppStateStatus } from 'react-native';

// expo-notifications の scheduleNotificationAsync / cancelScheduledNotificationAsync
// を mock (test 環境では実際に通知を出さない、 sync 失敗も silently fallback)。
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve(undefined)),
}));

import { TimerScreen } from './TimerScreen';

describe('TimerScreen (ADR-0025 PR-BB)', () => {
  // Issue #86: AppState の listener を捕捉して foreground 復帰イベントを模擬する。
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  let appStateSpy: jest.SpyInstance | undefined;

  const triggerAppStateChange = (state: AppStateStatus) => {
    appStateListener?.(state);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    appStateListener = null;
    appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, cb) => {
        if (event === 'change') {
          appStateListener = cb as (state: AppStateStatus) => void;
        }
        return {
          remove: () => {
            appStateListener = null;
          },
        } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    appStateSpy?.mockRestore();
  });

  test('visible=false なら描画されない', () => {
    const { queryByLabelText } = render(
      <TimerScreen
        visible={false}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(queryByLabelText('残り時間')).toBeNull();
  });

  test('visible=true で残り時間 + アクション名表示 (mm:ss フォーマット)', () => {
    const { getByLabelText, getByText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={1800}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(getByText('読書')).toBeTruthy();
    // 1800 秒 = 30:00
    expect(getByLabelText('残り時間').props.children.join('')).toBe('30:00');
  });

  test('1 秒経過で残り時間が 1 秒減る', () => {
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={120}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(getByLabelText('残り時間').props.children.join('')).toBe('02:00');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:59');
  });

  test('カウント 0 → onComplete が呼ばれる (= 自動達成 ADR-0025 案 X)', () => {
    const onComplete = jest.fn();
    render(
      <TimerScreen
        visible={true}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={onComplete}
      />,
    );
    act(() => {
      // 余裕を持って 3 秒進める (1 個 interval reuse なので 2 秒で 0 到達後 effect 発火)
      jest.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('PR-BB レビュー Critical 2: 完了通知に data.kind === "timer-complete" が付与される (K-026 回避)', () => {
    const Notifications = require('expo-notifications');
    render(
      <TimerScreen
        visible={true}
        durationSeconds={1}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: { kind: 'timer-complete' },
        }),
      }),
    );
  });

  test('一時停止 → 時間が進まない、 再開 → 進む', () => {
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('タイマー一時停止'));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:00'); // 進まない
    fireEvent.press(getByLabelText('タイマー再開'));
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByLabelText('残り時間').props.children.join('')).toBe('00:58');
  });

  test('キャンセルタップで onCancel が呼ばれる (達成記録なし)', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={onCancel}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByLabelText('タイマーキャンセル'));
    expect(onCancel).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  // ===== Issue #86: バックグラウンドでもタイマーが動くようにする =====

  test('Issue #86: タイマー開始時に future-trigger で通知を事前スケジュール (background でも alarm が鳴る)', () => {
    const Notifications = require('expo-notifications');
    render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    // 開始時に 1 回 schedule される (= 60 秒後の future trigger)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.data).toEqual({ kind: 'timer-complete' });
    // trigger は null (= 即時) ではないこと = 未来時刻
    expect(call.trigger).not.toBeNull();
  });

  test('Issue #86: background 中に Date.now() が進み、 foreground 復帰で残り時間が再計算される', () => {
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={120}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(getByLabelText('残り時間').props.children.join('')).toBe('02:00');
    // 1 秒 advance (= 通常の interval tick)
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:59');
    // === background 模擬: setSystemTime で Date.now() のみ進める (interval は fire しない) ===
    act(() => {
      jest.setSystemTime(Date.now() + 30000);
    });
    // interval が止まっている場合、 表示は古いまま (01:59)
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:59');
    // foreground 復帰 (AppState 'active')
    act(() => {
      triggerAppStateChange('active');
    });
    // 残り時間が wall-clock 基準で再計算される: 120 - 1 - 30 = 89 秒 = 01:29
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:29');
  });

  test('Issue #86: background 中に完了時刻を超えていたら foreground 復帰で onComplete (= 自動達成)', () => {
    const onComplete = jest.fn();
    render(
      <TimerScreen
        visible={true}
        durationSeconds={5}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={onComplete}
      />,
    );
    // 5 秒のタイマーを 10 秒 background で過ぎる (= JS interval は止まったまま wall-clock だけ進む)
    act(() => {
      jest.setSystemTime(Date.now() + 10000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    // foreground 復帰で完了判定が走る
    act(() => {
      triggerAppStateChange('active');
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('Issue #86: キャンセル時にスケジュール済み通知をキャンセル', async () => {
    const Notifications = require('expo-notifications');
    const onCancel = jest.fn();
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={onCancel}
        onComplete={() => {}}
      />,
    );
    // schedule の Promise を解決させて notifIdRef を埋める
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(getByLabelText('タイマーキャンセル'));
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith('mock-notif-id');
    expect(onCancel).toHaveBeenCalled();
  });

  test('Issue #86: 一時停止で通知キャンセル、 再開で再スケジュール', async () => {
    const Notifications = require('expo-notifications');
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('タイマー一時停止'));
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith('mock-notif-id');
    fireEvent.press(getByLabelText('タイマー再開'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  // ===== Issue #116: 完了後も Modal 表示を維持 + 早期完了ボタン =====

  test('Issue #116: タイマー満了時に onCancel は呼ばれない (= Modal を閉じる責務は親に渡さない)', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();
    render(
      <TimerScreen
        visible={true}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={onCancel}
        onComplete={onComplete}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    // 旧挙動 (= 親が onComplete で setTimerState(null) し Modal を閉じる) を維持するため
    // onCancel を呼ぶ実装にはしない。 onCancel は明示的な「閉じる」「キャンセル」操作だけが発火させる。
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('Issue #116: タイマー満了時に完了表示 (= 「完了」ラベル) に切り替わる', () => {
    const { getByText, queryByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    // 完了 hint が表示される
    expect(getByText('完了')).toBeTruthy();
    // 「一時停止」「キャンセル」ボタンは消える
    expect(queryByLabelText('タイマー一時停止')).toBeNull();
    expect(queryByLabelText('タイマー再開')).toBeNull();
    expect(queryByLabelText('タイマーキャンセル')).toBeNull();
    // 代わりに「閉じる」ボタンが出る
    expect(queryByLabelText('タイマー画面を閉じる')).toBeTruthy();
  });

  test('Issue #116: 完了表示の「閉じる」タップで onCancel が呼ばれる (= Modal を閉じる、達成記録は親側で既記録)', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={onCancel}
        onComplete={onComplete}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('タイマー画面を閉じる'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('Issue #116: 早期完了ボタン押下で onComplete が呼ばれる + 完了表示に遷移する', () => {
    const onComplete = jest.fn();
    const { getByLabelText, queryByLabelText, getByText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={300}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={onComplete}
      />,
    );
    expect(getByLabelText('残り時間').props.children.join('')).toBe('05:00');
    fireEvent.press(getByLabelText('タイマー早期完了'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    // 完了表示に遷移
    expect(getByText('完了')).toBeTruthy();
    expect(queryByLabelText('タイマー早期完了')).toBeNull();
    expect(queryByLabelText('タイマー画面を閉じる')).toBeTruthy();
  });

  test('Issue #116: 早期完了ボタン押下で Vibration が走る', () => {
    const vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={300}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('タイマー早期完了'));
    expect(vibrateSpy).toHaveBeenCalled();
    vibrateSpy.mockRestore();
  });

  test('Issue #116: 早期完了ボタン押下で scheduled 通知がキャンセルされる (= 後から OS alarm が鳴らない)', async () => {
    const Notifications = require('expo-notifications');
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={300}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    // schedule の Promise を解決させて notifIdRef を埋める
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(getByLabelText('タイマー早期完了'));
    expect(
      Notifications.cancelScheduledNotificationAsync,
    ).toHaveBeenCalledWith('mock-notif-id');
  });

  test('Issue #116: 早期完了後にカウントダウンが残っていても再度 onComplete が発火しない', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={5}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByLabelText('タイマー早期完了'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    // 残り時間を超えて経過 → completedRef ガードで再発火しない
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('Issue #116: 完了表示状態で visible=false → true へ再オープンすると running 表示に戻る', () => {
    const { getByLabelText, queryByLabelText, rerender, getByText } = render(
      <TimerScreen
        visible={true}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(getByText('完了')).toBeTruthy();
    rerender(
      <TimerScreen
        visible={false}
        durationSeconds={2}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    rerender(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="瞑想"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    // running 表示に戻る (= 完了表示ではない)
    expect(queryByLabelText('タイマー画面を閉じる')).toBeNull();
    expect(getByLabelText('タイマー一時停止')).toBeTruthy();
    expect(getByLabelText('タイマー早期完了')).toBeTruthy();
    expect(getByLabelText('残り時間').props.children.join('')).toBe('01:00');
  });

  test('visible 再オープン時に残り時間が durationSeconds に戻る (=新しいタイマー)', () => {
    const { getByLabelText, rerender } = render(
      <TimerScreen
        visible={true}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(30000);
    });
    expect(getByLabelText('残り時間').props.children.join('')).toBe('00:30');
    // close → reopen
    rerender(
      <TimerScreen
        visible={false}
        durationSeconds={60}
        actionTitle="読書"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    rerender(
      <TimerScreen
        visible={true}
        durationSeconds={120}
        actionTitle="瞑想"
        onCancel={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(getByLabelText('残り時間').props.children.join('')).toBe('02:00');
  });
});
