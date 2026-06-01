import { fireEvent, render } from '@testing-library/react-native';

import { AdoptConfirmScreen } from './AdoptConfirmScreen';

const baseProps = {
  title: '朝',
  actionTitles: ['歯磨き', '白湯', '朝食'],
  adopting: false,
  onBack: () => {},
  onAdopt: () => {},
};

describe('AdoptConfirmScreen', () => {
  test('チェーンタイトルと position 順のノードが表示される', () => {
    const { getByText } = render(<AdoptConfirmScreen {...baseProps} />);
    expect(getByText('朝')).toBeTruthy();
    expect(getByText('歯磨き')).toBeTruthy();
    expect(getByText('白湯')).toBeTruthy();
    expect(getByText('朝食')).toBeTruthy();
  });

  test('「これで始める」で onAdopt が呼ばれる', () => {
    const onAdopt = jest.fn();
    const { getByLabelText } = render(
      <AdoptConfirmScreen {...baseProps} onAdopt={onAdopt} />,
    );
    fireEvent.press(getByLabelText('このチェーンで始める'));
    expect(onAdopt).toHaveBeenCalled();
  });

  test('採用中はボタンが「作成中…」になり onAdopt を発火しない', () => {
    const onAdopt = jest.fn();
    const { getByText, getByLabelText } = render(
      <AdoptConfirmScreen {...baseProps} adopting onAdopt={onAdopt} />,
    );
    expect(getByText('作成中…')).toBeTruthy();
    fireEvent.press(getByLabelText('このチェーンで始める'));
    expect(onAdopt).not.toHaveBeenCalled();
  });

  test('ノードが空なら採用ボタンは無効', () => {
    const onAdopt = jest.fn();
    const { getByLabelText } = render(
      <AdoptConfirmScreen {...baseProps} actionTitles={[]} onAdopt={onAdopt} />,
    );
    fireEvent.press(getByLabelText('このチェーンで始める'));
    expect(onAdopt).not.toHaveBeenCalled();
  });

  test('戻るで onBack が呼ばれる', () => {
    const onBack = jest.fn();
    const { getByText } = render(
      <AdoptConfirmScreen {...baseProps} onBack={onBack} />,
    );
    fireEvent.press(getByText('戻る'));
    expect(onBack).toHaveBeenCalled();
  });
});
