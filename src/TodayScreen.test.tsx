import { fireEvent, render } from '@testing-library/react-native';

// @gorhom/bottom-sheet は reanimated worklet を要求するため jest 環境では mock 化。
// PR-AA: BottomSheet を「children 透過」モックに変更し、 Sheet 内コンテンツ
// (= 編集ボタン / ChainDetail) を test で検証可能に。 既存テストは Sheet を
// 開かない (= openChain=null で内部 ternary が null) ので影響なし。
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(
      ({ children }: { children?: React.ReactNode }) => children ?? null,
    ),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
      children ?? null,
  };
});

import type { TodayNode } from './ChainDetail';
import type { AchievementMap, Anchor, Chain, Node } from './domain';
import { TodayScreen } from './TodayScreen';
import type { TodayChainData } from './useTodayData';

const buildChain = (id: string, title: string): Chain => ({
  id,
  title,
  anchorId: `${id}-anchor`,
  status: 'active',
  createdAt: '2026-05-24',
});

const buildAnchor = (id: string, title: string): Anchor => ({
  id,
  title,
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

const buildNode = (id: string, idx: number, actionId: string): Node => ({
  id,
  chainId: 'c1',
  orderIndex: idx,
  kind: 'action',
  actionId,
});

const fireNode = (id: string, label: string): TodayNode => ({
  node: buildNode(id, 0, `act-${id}`),
  action: { id: `act-${id}`, title: label, variants: null, timerSeconds: null },
  label,
  kind: 'fire',
});

const buildChainData = (
  id: string,
  title: string,
  nodes: TodayNode[],
  achievements: AchievementMap = {},
  completionStreakDays = 0,
): TodayChainData => ({
  chain: buildChain(id, title),
  anchor: buildAnchor(`${id}-anchor`, '起点'),
  nodes,
  achievements,
  anchorFiredToday: false,
  recentAchievements: [],
  nodeIdsEstablished: new Set<string>(),
  completionStreakDays,
});

describe('TodayScreen (PR-X / マルチチェーン + Bottom Sheet)', () => {
  test('chains 0 件 → 空メッセージ表示', () => {
    const { getByText } = render(
      <TodayScreen chains={[]} onToggleNode={() => {}} />,
    );
    expect(getByText(/アクティブなチェーンがありません/)).toBeTruthy();
  });

  test('chains 複数 → 各 ChainCard のタイトルが表示される', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [
        fireNode('n1', '水を飲む'),
        fireNode('n2', 'ストレッチ'),
      ]),
      buildChainData('c2', '就寝前', [fireNode('n3', '歯磨き')]),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('就寝前')).toBeTruthy();
  });

  test('PR-AA: チェーンカードタップ → Sheet ヘッダーに「編集」ボタン → タップで onEditChain が呼ばれる', () => {
    const onEditChain = jest.fn();
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
    ];
    const { getByLabelText } = render(
      <TodayScreen
        chains={chains}
        onToggleNode={() => {}}
        onEditChain={onEditChain}
      />,
    );
    // ChainCard をタップして Sheet を開く
    fireEvent.press(getByLabelText(/朝のルーティン を開く/));
    // 編集ボタンが表示される
    const editBtn = getByLabelText('このチェーンを編集');
    fireEvent.press(editBtn);
    expect(onEditChain).toHaveBeenCalledWith('c1');
  });

  test('PR-AA: onEditChain 未指定なら編集ボタンは表示されない (発見性 = 親が動線を持っている時のみ)', () => {
    const chains: TodayChainData[] = [
      buildChainData('c1', '朝のルーティン', [fireNode('n1', '水を飲む')]),
    ];
    const { getByLabelText, queryByLabelText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    fireEvent.press(getByLabelText(/朝のルーティン を開く/));
    expect(queryByLabelText('このチェーンを編集')).toBeNull();
  });

  test('Issue #103: 連続達成日数が >= 1 ならカードに小さく表示される', () => {
    const chains: TodayChainData[] = [
      buildChainData(
        'c1',
        '朝のルーティン',
        [fireNode('n1', '水を飲む')],
        {},
        5,
      ),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(getByText('5 日連続')).toBeTruthy();
  });

  test('Issue #103: 連続達成 0 → 何も表示しない (反 streak: 切れたら指差さない)', () => {
    const chains: TodayChainData[] = [
      buildChainData(
        'c1',
        '朝のルーティン',
        [fireNode('n1', '水を飲む')],
        {},
        0,
      ),
    ];
    const { queryByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(queryByText(/日連続/)).toBeNull();
  });

  test('Issue #103: 連続達成 >=14 → "14+ 日連続" 表示 (ウィンドウ上限 cap)', () => {
    const chains: TodayChainData[] = [
      buildChainData(
        'c1',
        '朝のルーティン',
        [fireNode('n1', '水を飲む')],
        {},
        14,
      ),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    expect(getByText('14+ 日連続')).toBeTruthy();
  });

  test('進捗 0/N と N/N の表示が区別される', () => {
    const chains: TodayChainData[] = [
      // 0/2 (未達成)
      buildChainData('c1', 'チェーン A', [
        fireNode('na1', 'アクション 1'),
        fireNode('na2', 'アクション 2'),
      ]),
      // 2/2 (全達成 → ✓ バッジ)
      buildChainData(
        'c2',
        'チェーン B',
        [fireNode('nb1', 'B1'), fireNode('nb2', 'B2')],
        { nb1: true, nb2: true },
      ),
    ];
    const { getByText } = render(
      <TodayScreen chains={chains} onToggleNode={() => {}} />,
    );
    // 全達成チェーンは ✓ バッジ
    expect(getByText('✓ 達成')).toBeTruthy();
  });
});
