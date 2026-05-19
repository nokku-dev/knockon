import { fireEvent, render } from '@testing-library/react-native';

import { ChainListScreen } from './ChainListScreen';
import type { Anchor, Chain } from './domain';
import type { ChainListItem } from './useChainListData';

const anchor = (id: string, title: string): Anchor => ({
  id,
  title,
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

const chain = (id: string, title: string, anchorId: string): Chain => ({
  id,
  title,
  anchorId,
  status: 'active',
  createdAt: '2026-05-19T00:00:00Z',
});

const items: ChainListItem[] = [
  {
    chain: chain('c1', '朝のルーティン', 'a1'),
    anchor: anchor('a1', '起床'),
    nodeCount: 3,
  },
  {
    chain: chain('c2', '夜のルーティン', 'a2'),
    anchor: anchor('a2', '就寝前'),
    nodeCount: 2,
  },
];

describe('ChainListScreen', () => {
  test('チェーンタイトル / 起点アンカー / ノード数が表示される', () => {
    const { getByText } = render(<ChainListScreen items={items} />);
    expect(getByText('チェーン')).toBeTruthy();
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('起床')).toBeTruthy();
    expect(getByText('3 ノード')).toBeTruthy();
    expect(getByText('夜のルーティン')).toBeTruthy();
    expect(getByText('就寝前')).toBeTruthy();
    expect(getByText('2 ノード')).toBeTruthy();
  });

  test('カードをタップすると onSelectChain が該当 chainId で呼ばれる', () => {
    const onSelectChain = jest.fn();
    const { getByLabelText } = render(
      <ChainListScreen items={items} onSelectChain={onSelectChain} />,
    );
    fireEvent.press(getByLabelText('朝のルーティン'));
    expect(onSelectChain).toHaveBeenCalledWith('c1');
  });

  test('items が空のとき空状態テキストが表示される', () => {
    const { getByText } = render(<ChainListScreen items={[]} />);
    expect(getByText('active チェーンがありません')).toBeTruthy();
  });
});
