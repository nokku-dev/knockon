import { fireEvent, render } from '@testing-library/react-native';

import { PromoteModulePanel } from './PromoteModulePanel';
import { PROMOTE_COLORS } from './editLayout';

const candidates = [
  { nodeId: 'n1', title: '朝食準備' },
  { nodeId: 'n2', title: '朝ごはん' },
  { nodeId: 'n3', title: 'コーヒー' },
];

describe('PromoteModulePanel (#93)', () => {
  test('候補アクションが表示される', () => {
    const { getByText } = render(
      <PromoteModulePanel candidates={candidates} onPromote={() => {}} onCancel={() => {}} />,
    );
    expect(getByText('朝食準備')).toBeTruthy();
    expect(getByText('コーヒー')).toBeTruthy();
  });

  test('未選択 / 名前空のとき昇格ボタンが disabled', () => {
    const { getByLabelText } = render(
      <PromoteModulePanel candidates={candidates} onPromote={() => {}} onCancel={() => {}} />,
    );
    expect(getByLabelText('昇格する').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  test('複数選択 + 命名 + 色選択で onPromote が選択 nodeId・名前・色で呼ばれる', () => {
    const onPromote = jest.fn();
    const { getByLabelText } = render(
      <PromoteModulePanel candidates={candidates} onPromote={onPromote} onCancel={() => {}} />,
    );
    fireEvent.press(getByLabelText('朝食準備'));
    fireEvent.press(getByLabelText('朝ごはん'));
    fireEvent.changeText(getByLabelText('モジュール名'), '朝食まわり');
    fireEvent.press(getByLabelText('色 2'));
    fireEvent.press(getByLabelText('昇格する'));
    expect(onPromote).toHaveBeenCalledWith(['n1', 'n2'], '朝食まわり', PROMOTE_COLORS[1]);
  });

  test('チェックボックスの選択状態が反映される', () => {
    const { getByLabelText } = render(
      <PromoteModulePanel candidates={candidates} onPromote={() => {}} onCancel={() => {}} />,
    );
    expect(getByLabelText('コーヒー').props.accessibilityState).toEqual({
      checked: false,
    });
    fireEvent.press(getByLabelText('コーヒー'));
    expect(getByLabelText('コーヒー').props.accessibilityState).toEqual({
      checked: true,
    });
  });

  test('閉じるで onCancel', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <PromoteModulePanel candidates={candidates} onPromote={() => {}} onCancel={onCancel} />,
    );
    fireEvent.press(getByText('閉じる'));
    expect(onCancel).toHaveBeenCalled();
  });
});
