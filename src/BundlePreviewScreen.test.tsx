import { fireEvent, render } from '@testing-library/react-native';

import { BundlePreviewScreen } from './BundlePreviewScreen';
import type { BundlePreview } from './discovery';
import type { Link, Module } from './domain';

const mkModule = (id: string, name: string): Module => ({
  id,
  name,
  color: '#4FB0AE',
  moment: ['morning'],
  goal: ['health'],
  source: 'official',
  kind: 'normal',
  orderIndex: 0,
});

const mkLink = (id: string, title: string, moduleId: string, starter: boolean): Link => ({
  id,
  title,
  moduleId,
  defaultOn: true,
  position: 0,
  source: 'official',
  timerSeconds: null,
  starter,
});

const preview: BundlePreview = {
  title: '朝',
  starterModules: [
    {
      module: mkModule('mod-s', '目覚め'),
      links: [
        mkLink('lnk-s1', '歯磨き', 'mod-s', true),
        mkLink('lnk-s2', '白湯', 'mod-s', true),
      ],
      isStarter: true,
    },
  ],
  additionalModules: [
    {
      module: mkModule('mod-a', '有酸素'),
      links: [mkLink('lnk-a1', 'ウォーキング', 'mod-a', false)],
      isStarter: false,
    },
  ],
  defaultSelectedLinkIds: ['lnk-s1', 'lnk-s2'],
};

const baseProps = {
  preview,
  selectedLinkIds: new Set(['lnk-s1', 'lnk-s2']),
  selectedCount: 2,
  onToggleLink: () => {},
  onBack: () => {},
  onNext: () => {},
};

describe('BundlePreviewScreen', () => {
  test('スターターモジュールは展開されリンクが表示される', () => {
    const { getByText } = render(<BundlePreviewScreen {...baseProps} />);
    expect(getByText('目覚め')).toBeTruthy();
    expect(getByText('歯磨き')).toBeTruthy();
    expect(getByText('白湯')).toBeTruthy();
  });

  test('追加モジュールは折りたたまれ、リンクは初期非表示', () => {
    const { getByText, queryByText } = render(
      <BundlePreviewScreen {...baseProps} />,
    );
    expect(getByText('有酸素')).toBeTruthy(); // ヘッダは見える
    expect(queryByText('ウォーキング')).toBeNull(); // リンクは折りたたみ
  });

  test('追加モジュールのヘッダタップでインライン展開しリンクが現れる', () => {
    const { getByLabelText, getByText } = render(
      <BundlePreviewScreen {...baseProps} />,
    );
    fireEvent.press(getByLabelText('モジュール「有酸素」を開く'));
    expect(getByText('ウォーキング')).toBeTruthy();
  });

  test('リンクタップで onToggleLink が該当 linkId で呼ばれる', () => {
    const onToggleLink = jest.fn();
    const { getByLabelText } = render(
      <BundlePreviewScreen {...baseProps} onToggleLink={onToggleLink} />,
    );
    fireEvent.press(getByLabelText('歯磨き'));
    expect(onToggleLink).toHaveBeenCalledWith('lnk-s1');
  });

  test('選択リンクは checkbox の checked 状態を持つ', () => {
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
        selectedLinkIds={new Set()}
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
