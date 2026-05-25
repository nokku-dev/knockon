import { fireEvent, render } from '@testing-library/react-native';

import { TemplateChainPicker } from './TemplateChainPicker';
import type { TemplateChain } from './templateChains';

const templates: ReadonlyArray<TemplateChain> = [
  { id: 't1', title: '朝のルーティン', actions: ['水を飲む', 'ストレッチ'] },
  { id: 't2', title: '筋トレ', actions: ['ウォームアップ', 'メイン', 'クールダウン'] },
];

describe('TemplateChainPicker', () => {
  test('templates のタイトルとアクション数が表示される', () => {
    const { getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('筋トレ')).toBeTruthy();
    expect(getByText('2 ノード')).toBeTruthy();
    expect(getByText('3 ノード')).toBeTruthy();
  });

  test('テンプレタップで onSelect が該当 template で呼ばれる', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を追加'));
    expect(onSelect).toHaveBeenCalledWith(templates[1]);
  });

  test('キャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
