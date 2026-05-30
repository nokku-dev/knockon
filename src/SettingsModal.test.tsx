import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsModal } from './SettingsModal';

// Modal の content は React Tree 内で安全に inset を受け取れるよう、 親に
// SafeAreaProvider を要求する (`useSafeAreaInsets` は provider 不在で throw する)。
// 初期 metrics を渡せるので、 status bar 高さを simulate できる。
const renderWithInsets = (
  ui: React.ReactElement,
  top = 0,
): ReturnType<typeof render> =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top, right: 0, bottom: 0, left: 0 },
        frame: { x: 0, y: 0, width: 320, height: 640 },
      }}
    >
      {ui}
    </SafeAreaProvider>,
  );

const noopProps = {
  onClose: () => {},
  onSave: () => {},
} as const;

describe('SettingsModal (ADR-0028 PR-DD)', () => {
  test('open=false なら何もレンダリングしない', () => {
    const { queryByText } = renderWithInsets(
      <SettingsModal
        open={false}
        resetTime="00:00"
        themeMode="auto"
        {...noopProps}
      />,
    );
    expect(queryByText('設定')).toBeNull();
  });

  test('open=true で既存の resetTime が time input に反映される', () => {
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="03:30"
        themeMode="auto"
        {...noopProps}
      />,
    );
    expect(getByLabelText('リセット時刻 時').props.value).toBe('03');
    expect(getByLabelText('リセット時刻 分').props.value).toBe('30');
  });

  test('時刻を編集 → 「保存」で onSave に { resetTime, themeMode } が渡る + onClose が呼ばれる', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.changeText(getByLabelText('リセット時刻 時'), '4');
    fireEvent.changeText(getByLabelText('リセット時刻 分'), '15');
    fireEvent.press(getByLabelText('設定を保存'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        resetTime: '04:15',
        themeMode: 'auto',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('範囲外 (時=25) は保存時に clamp (23) される', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.changeText(getByLabelText('リセット時刻 時'), '25');
    fireEvent.changeText(getByLabelText('リセット時刻 分'), '70');
    fireEvent.press(getByLabelText('設定を保存'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        resetTime: '23:59',
        themeMode: 'auto',
      }),
    );
  });

  test('「閉じる」で onClose のみ呼び出し (onSave は呼ばれない)', () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText('設定を閉じる'));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

// ADR-0029 (Issue #53): テーマカラー picker。
describe('SettingsModal — テーマカラー picker (ADR-0029)', () => {
  test('open=true で themeMode=auto なら Auto ボタンが selected', () => {
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
    );
    expect(
      getByLabelText('テーマカラー Auto').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabelText('テーマカラー Light').props.accessibilityState.selected,
    ).toBe(false);
    expect(
      getByLabelText('テーマカラー Dark').props.accessibilityState.selected,
    ).toBe(false);
  });

  test('Auto / Light / Dark の 3 ボタンが radiogroup で表示される', () => {
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="dark"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
    );
    expect(getByLabelText('テーマカラー選択')).toBeTruthy();
    expect(getByLabelText('テーマカラー Auto')).toBeTruthy();
    expect(getByLabelText('テーマカラー Light')).toBeTruthy();
    expect(getByLabelText('テーマカラー Dark')).toBeTruthy();
    // dark が selected
    expect(
      getByLabelText('テーマカラー Dark').props.accessibilityState.selected,
    ).toBe(true);
  });

  test('Light ボタンをタップ → 「保存」で onSave に themeMode=light が渡る', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テーマカラー Light'));
    fireEvent.press(getByLabelText('設定を保存'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        resetTime: '00:00',
        themeMode: 'light',
      }),
    );
  });

  test('Dark を選んでも「閉じる」で保存されない (= ローカル選択は破棄)', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText('テーマカラー Dark'));
    fireEvent.press(getByLabelText('設定を閉じる'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('外部から themeMode prop が変わると picker の selected も追従する (再 open シミュレーション)', () => {
    const { getByLabelText, rerender } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
    );
    expect(
      getByLabelText('テーマカラー Auto').props.accessibilityState.selected,
    ).toBe(true);
    rerender(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, right: 0, bottom: 0, left: 0 },
          frame: { x: 0, y: 0, width: 320, height: 640 },
        }}
      >
        <SettingsModal
          open={true}
          resetTime="00:00"
          themeMode="light"
          onSave={jest.fn()}
          onClose={() => {}}
        />
      </SafeAreaProvider>,
    );
    expect(
      getByLabelText('テーマカラー Light').props.accessibilityState.selected,
    ).toBe(true);
  });
});

// Issue #57: 設定画面の最上部 (閉じる / 設定 / 保存 行) が Android のステータスバーに
// 被って操作できないバグ。 修正方針: useSafeAreaInsets で topbar に paddingTop を確保。
describe('SettingsModal — topbar safe area inset (Issue #57)', () => {
  test('top inset > 0 のとき topbar の paddingTop が inset 分だけ広がる', () => {
    const { getByTestId } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
      47,
    );
    const topbar = getByTestId('settings-modal-topbar');
    const flat = StyleSheet.flatten(topbar.props.style);
    expect(flat.paddingTop).toBeGreaterThanOrEqual(47);
  });

  test('top inset = 0 でも topbar は最低限の paddingTop を保つ (既存挙動の互換)', () => {
    const { getByTestId } = renderWithInsets(
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="auto"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
      0,
    );
    const topbar = getByTestId('settings-modal-topbar');
    const flat = StyleSheet.flatten(topbar.props.style);
    expect(flat.paddingTop).toBeGreaterThanOrEqual(12);
  });
});
