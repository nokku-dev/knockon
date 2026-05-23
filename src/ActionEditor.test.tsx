import { fireEvent, render } from '@testing-library/react-native';

import { ActionEditor } from './ActionEditor';
import type { Action } from './domain';

const simpleAction: Action = { id: 'act1', title: '筋トレ', variants: null };

const variantAction: Action = {
  id: 'act2',
  title: '筋トレ',
  variants: {
    mon: '胸トレ',
    tue: '足トレ',
    wed: '背中トレ',
    thu: null,
    fri: null,
    sat: null,
    sun: null,
  },
};

describe('ActionEditor', () => {
  test('タイトル変更 → 保存で onSave に新タイトルで呼ばれる', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      <ActionEditor action={simpleAction} onSave={onSave} onCancel={() => {}} />,
    );
    fireEvent.changeText(getByLabelText('アクションタイトル'), '筋トレ Lv2');
    fireEvent.press(getByLabelText('アクション保存'));
    expect(onSave).toHaveBeenCalledWith({
      ...simpleAction,
      title: '筋トレ Lv2',
      variants: null,
    });
  });

  test('タイトル空 → 保存ボタン disabled', () => {
    const { getByLabelText } = render(
      <ActionEditor
        action={simpleAction}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.changeText(getByLabelText('アクションタイトル'), '   ');
    expect(getByLabelText('アクション保存').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  test('variant ON 状態で開始 → variant 入力欄が 7 曜日分表示される', () => {
    const { getByLabelText } = render(
      <ActionEditor
        action={variantAction}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByLabelText('月曜日 variant')).toBeTruthy();
    expect(getByLabelText('日曜日 variant')).toBeTruthy();
  });

  test('variant OFF 状態 (variants=null) で開始 → 入力欄が非表示', () => {
    const { queryByLabelText } = render(
      <ActionEditor
        action={simpleAction}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(queryByLabelText('月曜日 variant')).toBeNull();
  });

  test('variant 編集 → 保存で onSave に新 variants で呼ばれる', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      <ActionEditor
        action={variantAction}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    fireEvent.changeText(getByLabelText('月曜日 variant'), '胸トレ強化');
    fireEvent.press(getByLabelText('アクション保存'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'act2',
        variants: expect.objectContaining({ mon: '胸トレ強化' }),
      }),
    );
  });

  test('variant 入力を空にする → 保存で variants[該当曜日]=null', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      <ActionEditor
        action={variantAction}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    fireEvent.changeText(getByLabelText('月曜日 variant'), '');
    fireEvent.press(getByLabelText('アクション保存'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: expect.objectContaining({ mon: null }),
      }),
    );
  });

  test('キャンセル → onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <ActionEditor
        action={simpleAction}
        onSave={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
