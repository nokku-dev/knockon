import { fireEvent, render } from '@testing-library/react-native';

import { DiscoveryIndexScreen } from './DiscoveryIndexScreen';

const baseProps = {
  moments: ['morning', 'night'],
  goals: ['health', 'exercise'],
  onOpenMoment: () => {},
  onOpenGoal: () => {},
  onOpenOmakase: () => {},
  onCancel: () => {},
};

describe('DiscoveryIndexScreen', () => {
  test('moment / goal がラベルで表示される', () => {
    const { getByText } = render(<DiscoveryIndexScreen {...baseProps} />);
    expect(getByText('朝')).toBeTruthy();
    expect(getByText('夜')).toBeTruthy();
    expect(getByText('健康')).toBeTruthy();
    expect(getByText('運動')).toBeTruthy();
    expect(getByText('おまかせ')).toBeTruthy();
  });

  test('moment チップタップで onOpenMoment が該当値で呼ばれる', () => {
    const onOpenMoment = jest.fn();
    const { getByLabelText } = render(
      <DiscoveryIndexScreen {...baseProps} onOpenMoment={onOpenMoment} />,
    );
    fireEvent.press(getByLabelText('朝の束を見る'));
    expect(onOpenMoment).toHaveBeenCalledWith('morning');
  });

  test('goal チップタップで onOpenGoal が該当値で呼ばれる', () => {
    const onOpenGoal = jest.fn();
    const { getByLabelText } = render(
      <DiscoveryIndexScreen {...baseProps} onOpenGoal={onOpenGoal} />,
    );
    fireEvent.press(getByLabelText('運動の束を見る'));
    expect(onOpenGoal).toHaveBeenCalledWith('exercise');
  });

  test('おまかせタップで onOpenOmakase が呼ばれる', () => {
    const onOpenOmakase = jest.fn();
    const { getByLabelText } = render(
      <DiscoveryIndexScreen {...baseProps} onOpenOmakase={onOpenOmakase} />,
    );
    fireEvent.press(getByLabelText('おまかせの束を見る'));
    expect(onOpenOmakase).toHaveBeenCalled();
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
