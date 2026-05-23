import { fireEvent, render } from '@testing-library/react-native';

import { ChainEditScreen } from './ChainEditScreen';
import type { Action } from './domain';
import type { ChainEditDraft } from './useChainEdit';

const baseDraft = (): ChainEditDraft => ({
  chainId: 'c1',
  isNew: true,
  title: '',
  anchor: {
    id: 'a1',
    title: '起点',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  },
  nodes: [],
});

const draftWithNodes = (): ChainEditDraft => ({
  ...baseDraft(),
  isNew: false,
  title: '朝のルーティン',
  nodes: [
    { id: 'n1', isNew: false, actionId: 'act1', actionTitle: '水を飲む' },
    { id: 'n2', isNew: false, actionId: 'act2', actionTitle: 'ストレッチ' },
    { id: 'n3', isNew: false, actionId: 'act3', actionTitle: '机に向かう' },
  ],
});

const noopProps = {
  availableActions: [] as Action[],
  saving: false,
  locationPermission: 'undetermined' as const,
  locating: false,
  onSetTitle: () => {},
  onSetAnchorKind: () => {},
  onSetAnchorTime: () => {},
  onSetAnchorLocation: () => {},
  onSetAnchorRadius: () => {},
  onFetchLocation: async () => null,
  onAddExistingAction: () => {},
  onAddNewAction: () => {},
  onRemoveNode: () => {},
  onReorderNodes: () => {},
  onCancel: () => {},
  onSave: () => {},
};

describe('ChainEditScreen', () => {
  test('新規モードはタイトルが「チェーンを新規作成」', () => {
    const { getByText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(getByText('チェーンを新規作成')).toBeTruthy();
  });

  test('編集モードはタイトルが「チェーンを編集」', () => {
    const { getByText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByText('チェーンを編集')).toBeTruthy();
  });

  test('タイトル空 / ノード 0 件のとき保存ボタンが disabled', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(getByLabelText('保存').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  test('タイトルあり + ノード 1 件以上で保存ボタンが有効', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByLabelText('保存').props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  test('タイトル変更で onSetTitle が呼ばれる', () => {
    const onSetTitle = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onSetTitle={onSetTitle}
      />,
    );
    fireEvent.changeText(getByLabelText('チェーンタイトル'), '夜のルーティン');
    expect(onSetTitle).toHaveBeenCalledWith('夜のルーティン');
  });

  test('各ノードにドラッグハンドルが accessibilityLabel 付きで表示される', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByLabelText('水を飲む をドラッグして並び替え')).toBeTruthy();
    expect(getByLabelText('ストレッチ をドラッグして並び替え')).toBeTruthy();
    expect(getByLabelText('机に向かう をドラッグして並び替え')).toBeTruthy();
  });

  test('「長押しで並び替え」ヒントがノード有りのとき表示される', () => {
    const { getByText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByText('長押しで並び替え')).toBeTruthy();
  });

  test('ノード削除で onRemoveNode が該当 nodeId で呼ばれる', () => {
    const onRemoveNode = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        onRemoveNode={onRemoveNode}
      />,
    );
    fireEvent.press(getByLabelText('ストレッチ を削除'));
    expect(onRemoveNode).toHaveBeenCalledWith('n2');
  });

  test('「+ ノードを追加」 → ActionPicker が開く → 新しいアクション入力 + 追加で onAddNewAction', () => {
    const onAddNewAction = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onAddNewAction={onAddNewAction}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    fireEvent.changeText(getByLabelText('新しいアクション名'), '水を飲む');
    fireEvent.press(getByLabelText('新しいアクションを追加'));
    expect(onAddNewAction).toHaveBeenCalledWith('水を飲む');
  });

  test('onDelete 未指定 (新規モード) では「このチェーンを削除」が表示されない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(queryByLabelText('このチェーンを削除')).toBeNull();
  });

  test('onDelete 指定 (編集モード) では「このチェーンを削除」が表示される', () => {
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        onDelete={() => {}}
      />,
    );
    expect(getByLabelText('このチェーンを削除')).toBeTruthy();
  });

  test('「このチェーンを削除」押下で onDelete が呼ばれる', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        onDelete={onDelete}
      />,
    );
    fireEvent.press(getByLabelText('このチェーンを削除'));
    expect(onDelete).toHaveBeenCalled();
  });

  test('saving=true のとき「このチェーンを削除」が disabled になる (M-2)', () => {
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        saving
        onDelete={() => {}}
      />,
    );
    expect(getByLabelText('このチェーンを削除').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  test('既存アクションリストから選択で onAddExistingAction', () => {
    const onAddExistingAction = jest.fn();
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null },
    ];
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
        onAddExistingAction={onAddExistingAction}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    fireEvent.press(getByLabelText('既存アクション: 水を飲む'));
    expect(onAddExistingAction).toHaveBeenCalledWith('act1', '水を飲む');
  });

  test('onDeleteAction 未指定 (新規モード) では既存チップに × が表示されない', () => {
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null },
    ];
    const { getByLabelText, queryByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    expect(queryByLabelText('アクション「水を飲む」を削除')).toBeNull();
  });

  test('onDeleteAction 指定で既存チップに × ボタンが出る + 押下で onDeleteAction 呼び出し', () => {
    const onDeleteAction = jest.fn();
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null },
    ];
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
        onDeleteAction={onDeleteAction}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    fireEvent.press(getByLabelText('アクション「水を飲む」を削除'));
    expect(onDeleteAction).toHaveBeenCalledWith(existingActions[0]);
  });

  test('onSaveAction 未指定では既存チップに鉛筆ボタンが表示されない (Phase 2 variant)', () => {
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null },
    ];
    const { getByLabelText, queryByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    expect(queryByLabelText('アクション「水を飲む」を編集')).toBeNull();
  });

  test('onSaveAction 指定で鉛筆ボタンが出る + 押下で ActionEditor モーダルが開く', () => {
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null },
    ];
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
        onSaveAction={async () => true}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    fireEvent.press(getByLabelText('アクション「水を飲む」を編集'));
    // モーダル内の保存ボタンが現れる
    expect(getByLabelText('アクション保存')).toBeTruthy();
  });
});
