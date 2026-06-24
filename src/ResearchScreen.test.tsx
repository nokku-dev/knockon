import { fireEvent, render } from '@testing-library/react-native';

import { ResearchScreen } from './ResearchScreen';
import type { NoteWithContext } from './notesRepository';
import type { NoteChainOption } from './useNotesData';

// ADR-0044 (#181): 研究タブは手動メモ一覧 + FAB に変更 (#175 / PR-A の空スケルトンから)。

const CHAIN_OPTIONS: NoteChainOption[] = [
  {
    chainId: 'chain-1',
    chainTitle: '朝のチェーン',
    nodes: [{ nodeId: 'node-1', actionTitle: '水を飲む' }],
  },
];

const noop = () => {};

const makeNote = (over: Partial<NoteWithContext>): NoteWithContext => ({
  id: 'note-1',
  nodeId: 'node-1',
  content: 'デフォルト本文',
  createdAt: '2026-06-24T09:00:00',
  updatedAt: '2026-06-24T09:00:00',
  chainId: 'chain-1',
  chainTitle: '朝のチェーン',
  actionTitle: '水を飲む',
  ...over,
});

describe('ResearchScreen', () => {
  it('メモが無いとき空文言と FAB を表示する', () => {
    const { getByText, getByLabelText } = render(
      <ResearchScreen
        notes={[]}
        chainOptions={CHAIN_OPTIONS}
        onAddNote={noop}
        onEditNote={noop}
        onDeleteNote={noop}
      />,
    );
    expect(getByText(/まだメモはありません/)).toBeTruthy();
    expect(getByLabelText('メモを追加')).toBeTruthy();
  });

  it('メモ本文と文脈ラベル (チェーン名 / アクション名) を表示する', () => {
    const { getByText } = render(
      <ResearchScreen
        notes={[makeNote({ content: '今日は調子が良い' })]}
        chainOptions={CHAIN_OPTIONS}
        onAddNote={noop}
        onEditNote={noop}
        onDeleteNote={noop}
      />,
    );
    expect(getByText('今日は調子が良い')).toBeTruthy();
    expect(getByText('朝のチェーン / 水を飲む')).toBeTruthy();
  });

  it('汎用メモ (nodeId null) は文脈ラベルが「汎用メモ」', () => {
    const { getByText } = render(
      <ResearchScreen
        notes={[
          makeNote({
            id: 'note-g',
            content: '全体メモ',
            nodeId: null,
            chainId: null,
            chainTitle: null,
            actionTitle: null,
          }),
        ]}
        chainOptions={CHAIN_OPTIONS}
        onAddNote={noop}
        onEditNote={noop}
        onDeleteNote={noop}
      />,
    );
    expect(getByText('汎用メモ')).toBeTruthy();
  });

  it('FAB をタップするとメモ作成 Modal が開く', () => {
    const { getByLabelText, queryByLabelText } = render(
      <ResearchScreen
        notes={[]}
        chainOptions={CHAIN_OPTIONS}
        onAddNote={noop}
        onEditNote={noop}
        onDeleteNote={noop}
      />,
    );
    expect(queryByLabelText('メモ入力')).toBeNull();
    fireEvent.press(getByLabelText('メモを追加'));
    expect(getByLabelText('メモ入力')).toBeTruthy();
  });
});
