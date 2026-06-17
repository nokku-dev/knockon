import { fireEvent, render } from '@testing-library/react-native';

import { BundlePreviewScreen } from './BundlePreviewScreen';
import type { CategoryPreview } from './categoryDiscovery';

const preview: CategoryPreview = {
  category: {
    id: 'cat-hydration-health',
    name: '水分・健康',
    type: 'genre',
    color: '#4FB0AE',
    source: 'official',
    orderIndex: 0,
  },
  items: [
    {
      key: 'act-brush-teeth',
      actionId: 'act-brush-teeth',
      title: '歯磨き',
      timerSeconds: null,
      optional: false,
    },
    {
      key: 'act-weigh',
      actionId: 'act-weigh',
      title: '体重計',
      timerSeconds: null,
      optional: true,
    },
  ],
};

const baseProps = {
  preview,
  selectedKeys: new Set(['act-brush-teeth', 'act-weigh']),
  selectedCount: 2,
  onToggleItem: () => {},
  onBack: () => {},
  onNext: () => {},
};

describe('BundlePreviewScreen (ADR-0039 新カテゴリモデル)', () => {
  test('カテゴリ名と全アイテムが flat に表示される', () => {
    const { getByText } = render(<BundlePreviewScreen {...baseProps} />);
    expect(getByText('水分・健康')).toBeTruthy();
    expect(getByText('歯磨き')).toBeTruthy();
    expect(getByText('体重計')).toBeTruthy();
  });

  test('optional アイテムは「任意」タグを持つ', () => {
    const { getByText } = render(<BundlePreviewScreen {...baseProps} />);
    expect(getByText('任意')).toBeTruthy();
  });

  test('アイテムタップで onToggleItem が該当 key で呼ばれる', () => {
    const onToggleItem = jest.fn();
    const { getByLabelText } = render(
      <BundlePreviewScreen {...baseProps} onToggleItem={onToggleItem} />,
    );
    fireEvent.press(getByLabelText('歯磨き'));
    expect(onToggleItem).toHaveBeenCalledWith('act-brush-teeth');
  });

  test('選択アイテムは checkbox の checked 状態を持つ', () => {
    const { getByLabelText } = render(<BundlePreviewScreen {...baseProps} />);
    expect(getByLabelText('歯磨き').props.accessibilityState.checked).toBe(true);
  });

  test('CTA は選択数を表示し onNext を呼ぶ', () => {
    const onNext = jest.fn();
    const { getByLabelText, getByText } = render(
      <BundlePreviewScreen {...baseProps} onNext={onNext} />,
    );
    expect(getByText('2 個でチェーンを作る')).toBeTruthy();
    fireEvent.press(getByLabelText('採用確認へ進む'));
    expect(onNext).toHaveBeenCalled();
  });

  test('選択数 0 のとき CTA は無効で onNext を発火しない', () => {
    const onNext = jest.fn();
    const { getByLabelText } = render(
      <BundlePreviewScreen
        {...baseProps}
        selectedKeys={new Set()}
        selectedCount={0}
        onNext={onNext}
      />,
    );
    fireEvent.press(getByLabelText('採用確認へ進む'));
    expect(onNext).not.toHaveBeenCalled();
  });

  test('戻るで onBack が呼ばれる', () => {
    const onBack = jest.fn();
    const { getByText } = render(
      <BundlePreviewScreen {...baseProps} onBack={onBack} />,
    );
    fireEvent.press(getByText('戻る'));
    expect(onBack).toHaveBeenCalled();
  });
});
