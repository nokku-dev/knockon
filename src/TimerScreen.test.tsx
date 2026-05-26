import { act, fireEvent, render } from '@testing-library/react-native';

// expo-notifications の scheduleNotificationAsync を mock (test 環境では実際に
// 通知を出さない、 sync 失敗も silently fallback)。
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
}));

import { TimerScreen } from './TimerScreen';

describe('TimerScreen (ADR-0025 PR-BB)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
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
      jest.advanceTimersByTime(2000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
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
