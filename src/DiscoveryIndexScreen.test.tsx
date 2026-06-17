import { fireEvent, render } from '@testing-library/react-native';

import { DiscoveryIndexScreen } from './DiscoveryIndexScreen';
import type { Category } from './domain';

const cat = (
  id: string,
  name: string,
  type: Category['type'],
  orderIndex: number,
): Category => ({
  id,
  name,
  type,
  color: '#888',
  source: 'official',
  orderIndex,
});

const baseProps = {
  recommendedCategories: [
    cat('cat-rec-morning', '朝のおすすめ', 'recommended', 9),
    cat('cat-rec-night', '夜のおすすめ', 'recommended', 10),
  ],
  genreCategories: [
    cat('cat-hydration-health', '水分・健康', 'genre', 0),
    cat('cat-exercise', '運動', 'genre', 2),
  ],
  onOpenCategory: () => {},
  onCancel: () => {},
};

describe('DiscoveryIndexScreen (ADR-0039 新カテゴリモデル)', () => {
  test('おすすめ / ジャンル別カテゴリ名が表示される', () => {
    const { getByText } = render(<DiscoveryIndexScreen {...baseProps} />);
    expect(getByText('朝のおすすめ')).toBeTruthy();
    expect(getByText('夜のおすすめ')).toBeTruthy();
    expect(getByText('水分・健康')).toBeTruthy();
    expect(getByText('運動')).toBeTruthy();
  });

  test('旧 moment/goal 扉・おまかせは表示しない', () => {
    const { queryByText } = render(<DiscoveryIndexScreen {...baseProps} />);
    expect(queryByText('おまかせ')).toBeNull();
  });

  test('おすすめカテゴリタップで onOpenCategory が該当カテゴリで呼ばれる', () => {
    const onOpenCategory = jest.fn();
    const { getByLabelText } = render(
      <DiscoveryIndexScreen {...baseProps} onOpenCategory={onOpenCategory} />,
    );
    fireEvent.press(getByLabelText('朝のおすすめを見る'));
    expect(onOpenCategory).toHaveBeenCalledWith(baseProps.recommendedCategories[0]);
  });

  test('ジャンル別カテゴリタップで onOpenCategory が該当カテゴリで呼ばれる', () => {
    const onOpenCategory = jest.fn();
    const { getByLabelText } = render(
      <DiscoveryIndexScreen {...baseProps} onOpenCategory={onOpenCategory} />,
    );
    fireEvent.press(getByLabelText('運動を見る'));
    expect(onOpenCategory).toHaveBeenCalledWith(baseProps.genreCategories[1]);
  });

  test('キャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <DiscoveryIndexScreen {...baseProps} onCancel={onCancel} />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
