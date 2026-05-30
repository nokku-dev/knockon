import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SettingsModal } from './SettingsModal';

const noopProps = {
  onClose: () => {},
  onSave: () => {},
};

describe('SettingsModal (ADR-0028 PR-DD)', () => {
  test('open=false なら何もレンダリングしない', () => {
    const { queryByText } = render(
      <SettingsModal open={false} resetTime="00:00" {...noopProps} />,
    );
    expect(queryByText('設定')).toBeNull();
  });

  test('open=true で既存の resetTime が time input に反映される', () => {
    const { getByLabelText } = render(
      <SettingsModal open={true} resetTime="03:30" {...noopProps} />,
    );
    expect(getByLabelText('リセット時刻 時').props.value).toBe('03');
    expect(getByLabelText('リセット時刻 分').props.value).toBe('30');
  });

  test('時刻を編集 → 「保存」で onSave に HH:MM が渡る + onClose が呼ばれる', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <SettingsModal
        open={true}
        resetTime="00:00"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.changeText(getByLabelText('リセット時刻 時'), '4');
    fireEvent.changeText(getByLabelText('リセット時刻 分'), '15');
    fireEvent.press(getByLabelText('設定を保存'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('04:15'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('範囲外 (時=25) は保存時に clamp (23) される', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText } = render(
      <SettingsModal
        open={true}
        resetTime="00:00"
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.changeText(getByLabelText('リセット時刻 時'), '25');
    fireEvent.changeText(getByLabelText('リセット時刻 分'), '70');
    fireEvent.press(getByLabelText('設定を保存'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('23:59'));
  });

  test('「閉じる」で onClose のみ呼び出し (onSave は呼ばれない)', () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const { getByLabelText } = render(
      <SettingsModal
        open={true}
        resetTime="00:00"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText('設定を閉じる'));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
