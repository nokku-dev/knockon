import { fireEvent, render } from '@testing-library/react-native';

import { AnchorSettingsScreen } from './AnchorSettingsScreen';
import type { Anchor, Chain } from './domain';

const chain: Chain = {
  id: 'c1',
  title: '朝のルーティン',
  anchorId: 'a1',
  status: 'active',
  createdAt: '2026-05-19T00:00:00Z',
};

const behaviorAnchor: Anchor = {
  id: 'a1',
  title: '起床',
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
};

const timeAnchor: Anchor = {
  ...behaviorAnchor,
  kind: 'time',
  time: '08:15',
};

describe('AnchorSettingsScreen', () => {
  test('既存の時刻アンカーの値が初期値として入る', () => {
    const { getByLabelText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={timeAnchor}
        saving={false}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(getByLabelText('時').props.value).toBe('08');
    expect(getByLabelText('分').props.value).toBe('15');
  });

  test('behavior アンカーから開いた場合はデフォルト 07:30 が入る', () => {
    const { getByLabelText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        saving={false}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(getByLabelText('時').props.value).toBe('07');
    expect(getByLabelText('分').props.value).toBe('30');
  });

  test('保存ボタンタップで onSave が HH:MM 形式で呼ばれる', () => {
    const onSave = jest.fn();
    const { getByText, getByLabelText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        saving={false}
        onCancel={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.changeText(getByLabelText('時'), '6');
    fireEvent(getByLabelText('時'), 'blur');
    fireEvent.changeText(getByLabelText('分'), '5');
    fireEvent(getByLabelText('分'), 'blur');
    fireEvent.press(getByText('保存'));
    expect(onSave).toHaveBeenCalledWith('06:05');
  });

  test('キャンセルタップで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        saving={false}
        onCancel={onCancel}
        onSave={() => {}}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('saving=true のとき保存ボタンは「保存中…」表示', () => {
    const { getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        saving={true}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(getByText('保存中…')).toBeTruthy();
  });

  test('「通知は後送り」フォールバック説明が表示される', () => {
    const { getByText } = render(
      <AnchorSettingsScreen
        chain={chain}
        anchor={behaviorAnchor}
        saving={false}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(getByText('通知は後送り')).toBeTruthy();
  });
});
