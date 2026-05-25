import { fireEvent, render } from '@testing-library/react-native';

import { MetricInputModal } from './MetricInputModal';

describe('MetricInputModal', () => {
  test('open=false なら何もレンダリングしない (Modal visible=false)', () => {
    const { queryByText } = render(
      <MetricInputModal
        open={false}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(queryByText('メトリクスを記録')).toBeNull();
  });

  test('open=true なら kind タブ + 入力 + アクションが表示', () => {
    const { getByText, getByLabelText } = render(
      <MetricInputModal open={true} onCancel={() => {}} onSubmit={() => {}} />,
    );
    expect(getByText('メトリクスを記録')).toBeTruthy();
    expect(getByLabelText('体重 を選択')).toBeTruthy();
    expect(getByLabelText('運動 を選択')).toBeTruthy();
    expect(getByLabelText('睡眠 を選択')).toBeTruthy();
    expect(getByLabelText('体重 の値')).toBeTruthy();
    expect(getByLabelText('保存')).toBeTruthy();
    expect(getByLabelText('キャンセル')).toBeTruthy();
  });

  test('kind タブ切替で input の accessibility ラベルが更新される', () => {
    const { getByLabelText } = render(
      <MetricInputModal open={true} onCancel={() => {}} onSubmit={() => {}} />,
    );
    expect(getByLabelText('体重 の値')).toBeTruthy();
    fireEvent.press(getByLabelText('運動 を選択'));
    expect(getByLabelText('運動 の値')).toBeTruthy();
  });

  test('保存タップ → onSubmit に (key, value) で呼ばれ → onCancel も呼ばれる (close)', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByLabelText } = render(
      <MetricInputModal
        open={true}
        initialKind="weight"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByLabelText('体重 の値'), '72.5');
    await fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).toHaveBeenCalledWith('weight', 72.5);
    expect(onCancel).toHaveBeenCalled();
  });

  test('保存タップ + 値が NaN / 負数 → onSubmit 呼ばれない (簡易バリデーション)', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <MetricInputModal open={true} onCancel={() => {}} onSubmit={onSubmit} />,
    );
    // 空 → parseFloat('') = NaN
    await fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).not.toHaveBeenCalled();
    // 負数
    fireEvent.changeText(getByLabelText('体重 の値'), '-1');
    await fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('initialKind を指定すれば最初からその kind が選択', () => {
    const { getByLabelText } = render(
      <MetricInputModal
        open={true}
        initialKind="sleep_hours"
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    // 睡眠 が selected=true、 input ラベルも 睡眠 のもの
    expect(getByLabelText('睡眠 の値')).toBeTruthy();
  });

  test('キャンセルタップで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByLabelText } = render(
      <MetricInputModal open={true} onCancel={onCancel} onSubmit={() => {}} />,
    );
    fireEvent.press(getByLabelText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
