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

  test('hideSelector=true で対象セレクタを隠す (編集時に効かない UI を出さない / K-030)', () => {
    const { queryByLabelText, getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        initialContent="既存メモ"
        hideSelector
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    // 本文と保存は出るが、対象セレクタ (なし / チェーンチップ) は出ない。
    expect(getByLabelText('メモ本文')).toBeTruthy();
    expect(getByLabelText('保存')).toBeTruthy();
    expect(queryByLabelText('対象なし (汎用メモ)')).toBeNull();
    expect(queryByLabelText('朝のチェーン を選択')).toBeNull();
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

  // Issue #200: 編集モーダル内に「このメモを削除」ボタンを配置 (発見性向上 + 長押し撤去)。
  // `hideSelector` と別軸の prop (`onDelete`) で表示制御する (K-030 permission/state 分離)。
  test('onDelete 未指定なら「このメモを削除」ボタンを表示しない (作成モード / #200)', () => {
    const { queryByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(queryByLabelText('このメモを削除')).toBeNull();
  });

  test('onDelete 指定時のみ「このメモを削除」ボタンを表示する (編集モード / #200)', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        initialContent="既存メモ"
        hideSelector
        onCancel={() => {}}
        onSubmit={() => {}}
        onDelete={onDelete}
      />,
    );
    expect(getByLabelText('このメモを削除')).toBeTruthy();
  });

  test('削除ボタンをタップすると onDelete が発火する (#200)', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <NoteComposeModal
        open
        chainOptions={CHAIN_OPTIONS}
        initialContent="既存メモ"
        hideSelector
        onCancel={() => {}}
        onSubmit={() => {}}
        onDelete={onDelete}
      />,
    );
    fireEvent.press(getByLabelText('このメモを削除'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
