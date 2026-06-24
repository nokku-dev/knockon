import { fireEvent, render } from '@testing-library/react-native';

import { NoteComposeModal } from './NoteComposeModal';
import type { NoteChainOption } from './useNotesData';

const CHAIN_OPTIONS: NoteChainOption[] = [
  {
    chainId: 'chain-1',
    chainTitle: '朝のチェーン',
    nodes: [
      { nodeId: 'node-1', actionTitle: '水を飲む' },
      { nodeId: 'node-2', actionTitle: 'ストレッチ' },
    ],
  },
];

describe('NoteComposeModal (ADR-0044)', () => {
  test('open=false なら何もレンダリングしない', () => {
    const { queryByLabelText } = render(
      <NoteComposeModal
        open={false}
        chainOptions={CHAIN_OPTIONS}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(queryByLabelText('メモ入力')).toBeNull();
  });

  test('本文を入力して保存すると nodeId=null (汎用) で onSubmit が呼ばれる', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByLabelText('メモ本文'), '思いついたこと');
    fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).toHaveBeenCalledWith(null, '思いついたこと');
  });

  test('空メモは保存されない (onSubmit を呼ばない)', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByLabelText('メモ本文'), '   ');
    fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('チェーン → アクションを選択して保存すると該当 nodeId で onSubmit が呼ばれる', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByLabelText('メモ本文'), 'ストレッチについて');
    fireEvent.press(getByLabelText('朝のチェーン を選択'));
    fireEvent.press(getByLabelText('ストレッチ を選択'));
    fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).toHaveBeenCalledWith('node-2', 'ストレッチについて');
  });

  test('initialNodeId 指定で開くと対象が選択済み (= Today 長押し導線)', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        initialNodeId="node-1"
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    // チェーン / アクションが選択済みの状態で開く → そのまま本文入力 → 保存で node-1。
    fireEvent.changeText(getByLabelText('メモ本文'), '水分メモ');
    fireEvent.press(getByLabelText('保存'));
    expect(onSubmit).toHaveBeenCalledWith('node-1', '水分メモ');
  });
});
