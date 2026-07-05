import { Alert } from 'react-native';
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

  // Issue #200: 削除導線を編集モーダル内のボタンに集約 (発見性向上 + 意味論対称化)。
  describe('メモ削除フロー (#200)', () => {
    it('カードをタップすると編集モーダルが開き、そこに「このメモを削除」が出る', () => {
      const { getByText, getByLabelText } = render(
        <ResearchScreen
          notes={[makeNote({ content: '既存メモ' })]}
          chainOptions={CHAIN_OPTIONS}
          onAddNote={noop}
          onEditNote={noop}
          onDeleteNote={noop}
        />,
      );
      fireEvent.press(getByText('既存メモ'));
      expect(getByLabelText('このメモを削除')).toBeTruthy();
    });

    it('作成モード (FAB 起点) では「このメモを削除」を表示しない', () => {
      const { getByLabelText, queryByLabelText } = render(
        <ResearchScreen
          notes={[]}
          chainOptions={CHAIN_OPTIONS}
          onAddNote={noop}
          onEditNote={noop}
          onDeleteNote={noop}
        />,
      );
      fireEvent.press(getByLabelText('メモを追加'));
      expect(queryByLabelText('このメモを削除')).toBeNull();
    });

    it('削除ボタン → Alert 表示 → 「削除」確定で onDeleteNote が呼び出される', () => {
      const onDeleteNote = jest.fn();
      const alertSpy = jest
        .spyOn(Alert, 'alert')
        .mockImplementation((_title, _msg, buttons) => {
          // buttons[0] = キャンセル (style='cancel'), buttons[1] = 削除 (style='destructive')。
          const destructive = buttons?.[1];
          destructive?.onPress?.();
        });
      const { getByText, getByLabelText } = render(
        <ResearchScreen
          notes={[makeNote({ id: 'note-del', content: '消すメモ' })]}
          chainOptions={CHAIN_OPTIONS}
          onAddNote={noop}
          onEditNote={noop}
          onDeleteNote={onDeleteNote}
        />,
      );
      fireEvent.press(getByText('消すメモ'));
      fireEvent.press(getByLabelText('このメモを削除'));
      expect(alertSpy).toHaveBeenCalled();
      expect(onDeleteNote).toHaveBeenCalledWith('note-del');
      alertSpy.mockRestore();
    });

    // 回帰防止: カード長押しでの削除経路は撤去済み。 長押しで削除が発火しないことを固定する。
    // (Today アクション長押し = メモ作成 と意味論を対称化するため #200 で削除経路を 1 本化)。
    it('カード長押しでは削除 Alert が発火しない (長押し撤去の回帰防止)', () => {
      const alertSpy = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);
      const { getByText } = render(
        <ResearchScreen
          notes={[makeNote({ content: '長押ししてみる' })]}
          chainOptions={CHAIN_OPTIONS}
          onAddNote={noop}
          onEditNote={noop}
          onDeleteNote={noop}
        />,
      );
      // React Native Testing Library の longPress イベント。 撤去後は何も起きない。
      fireEvent(getByText('長押ししてみる'), 'longPress');
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });
});
