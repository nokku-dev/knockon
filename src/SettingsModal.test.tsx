import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SettingsModal } from './SettingsModal';

const noopProps = {
  onClose: () => {},
  onSave: () => {},
} as const;

describe('SettingsModal (ADR-0028 PR-DD)', () => {
  test('open=false なら何もレンダリングしない', () => {
    const { queryByText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText } = render(
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
    const { getByLabelText, rerender } = render(
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
      <SettingsModal
        open={true}
        resetTime="00:00"
        themeMode="light"
        onSave={jest.fn()}
        onClose={() => {}}
      />,
    );
    expect(
      getByLabelText('テーマカラー Light').props.accessibilityState.selected,
    ).toBe(true);
  });
});
