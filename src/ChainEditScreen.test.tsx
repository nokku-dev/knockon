import { fireEvent, render } from '@testing-library/react-native';

import { ChainEditScreen } from './ChainEditScreen';
import type { Action } from './domain';
import type { ChainEditDraft } from './useChainEdit';

const baseDraft = (): ChainEditDraft => ({
  chainId: 'c1',
  isNew: true,
  title: '',
  status: 'active',
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
    { id: 'n1', isNew: false, actionId: 'act1', actionTitle: '水を飲む', actionVariants: null, active: true },
    { id: 'n2', isNew: false, actionId: 'act2', actionTitle: 'ストレッチ', actionVariants: null, active: true },
    { id: 'n3', isNew: false, actionId: 'act3', actionTitle: '机に向かう', actionVariants: null, active: false },
  ],
});

const noopProps = {
  availableActions: [] as Action[],
  saving: false,
  locationPermission: 'undetermined' as const,
  locating: false,
  onSetTitle: () => {},
  onSetStatus: () => {},
  onSetAnchorKind: () => {},
  onSetAnchorTime: () => {},
  onSetAnchorLocation: () => {},
  onSetAnchorRadius: () => {},
  onFetchLocation: async () => null,
  onAddExistingAction: () => {},
  onAddNewAction: () => {},
  onRemoveNode: () => {},
  onToggleNodeActive: () => {},
  undoCount: 0,
  onUndo: () => {},
  onUndoDismiss: () => {},
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

  test('新規モードではステータス切替 UI が表示されない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(queryByLabelText('アクティブにする')).toBeNull();
    expect(queryByLabelText('一時休止にする')).toBeNull();
  });

  test('編集モードではステータス切替 UI が表示される', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByLabelText('アクティブにする')).toBeTruthy();
    expect(getByLabelText('一時休止にする')).toBeTruthy();
  });

  test('「一時休止にする」押下で onSetStatus("stocked")', () => {
    const onSetStatus = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        onSetStatus={onSetStatus}
      />,
    );
    fireEvent.press(getByLabelText('一時休止にする'));
    expect(onSetStatus).toHaveBeenCalledWith('stocked');
  });

  test('現在の status (active) のオプションが selected', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} />,
    );
    expect(getByLabelText('アクティブにする').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('一時休止にする').props.accessibilityState).toEqual({
      selected: false,
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

  test('ON/OFF トグル押下で onToggleNodeActive が該当 nodeId で呼ばれる', () => {
    const onToggleNodeActive = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        onToggleNodeActive={onToggleNodeActive}
      />,
    );
    // n1 は active=true → 「一時停止」アクション
    fireEvent.press(getByLabelText('水を飲む を一時停止'));
    expect(onToggleNodeActive).toHaveBeenCalledWith('n1');
    // n3 は active=false → 「再開」アクション
    fireEvent.press(getByLabelText('机に向かう を再開'));
    expect(onToggleNodeActive).toHaveBeenCalledWith('n3');
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

  test('既存アクションリストから選択で onAddExistingAction', () => {
    const onAddExistingAction = jest.fn();
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null },
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

  test('onDelete 未指定 (新規モード) では「このチェーンを削除」が表示されない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(queryByLabelText('このチェーンを削除')).toBeNull();
  });

  test('onDelete 指定 (編集モード) では「このチェーンを削除」が表示される + 押下で onDelete', () => {
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

  test('saving=true のとき「このチェーンを削除」が disabled になる', () => {
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

  test('onAddNodesFromTemplate 未指定では「+ テンプレから追加」ボタンが表示されない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(queryByLabelText('テンプレから追加')).toBeNull();
  });

  test('テンプレ選択 → 全件 追加 で onAddNodesFromTemplate が (template, 全アクション) で呼ばれる', () => {
    const onAddNodesFromTemplate = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onAddNodesFromTemplate={onAddNodesFromTemplate}
      />,
    );
    fireEvent.press(getByLabelText('テンプレから追加'));
    fireEvent.press(getByLabelText('テンプレ「朝のルーティン」を開く'));
    fireEvent.press(getByLabelText('6件を追加'));
    expect(onAddNodesFromTemplate).toHaveBeenCalledTimes(1);
    const [template, titles] = onAddNodesFromTemplate.mock.calls[0];
    expect(template.id).toBe('morning-routine');
    expect(titles).toEqual(template.actions);
  });

  test('テンプレ選択 → 一部のみチェック → 追加 で選択 subset が渡る', () => {
    const onAddNodesFromTemplate = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onAddNodesFromTemplate={onAddNodesFromTemplate}
      />,
    );
    fireEvent.press(getByLabelText('テンプレから追加'));
    fireEvent.press(getByLabelText('テンプレ「朝のルーティン」を開く'));
    fireEvent.press(getByLabelText('アクション「水を飲む」'));
    fireEvent.press(getByLabelText('アクション「朝食器を浸け置き」'));
    fireEvent.press(getByLabelText('4件を追加'));
    expect(onAddNodesFromTemplate).toHaveBeenCalledTimes(1);
    const [template, titles] = onAddNodesFromTemplate.mock.calls[0];
    expect(template.id).toBe('morning-routine');
    expect(titles).toEqual([
      '筋トレ',
      'シャワー時に洗濯スタート',
      'ロボ掃除機を起動',
      'ウォーキング',
    ]);
  });

  test('onDeleteAction 未指定 (新規モード) では既存チップに × が表示されない', () => {
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null },
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
      { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null },
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

  test('onSaveAction 指定で鉛筆ボタンが出る + 押下で ActionEditor モーダルが開く', () => {
    const existingActions: Action[] = [
      { id: 'act1', title: '水を飲む', variants: null, timerSeconds: null },
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
    expect(getByLabelText('アクション保存')).toBeTruthy();
  });

  test('variant 設定済みアクションのチップに有効曜日バッジが表示される', () => {
    const existingActions: Action[] = [
      {
        id: 'act-workout',
        title: '筋トレ',
        variants: {
          mon: '胸トレ',
          tue: '足トレ',
          wed: '背中トレ',
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        },
        timerSeconds: null,
      },
    ];
    const { getByLabelText, getByText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        availableActions={existingActions}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    expect(getByText('月火水')).toBeTruthy();
    expect(getByLabelText('variant: 月火水')).toBeTruthy();
  });
});

describe('ChainEditScreen — undo (#94)', () => {
  test('undoCount=0 のとき undo バーは出ない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={draftWithNodes()} {...noopProps} undoCount={0} />,
    );
    expect(queryByLabelText('削除を元に戻す')).toBeNull();
  });

  test('undoCount>0 で undo バーが出て、タップで onUndo', () => {
    const onUndo = jest.fn();
    const { getByLabelText, getByText } = render(
      <ChainEditScreen
        draft={draftWithNodes()}
        {...noopProps}
        undoCount={2}
        onUndo={onUndo}
      />,
    );
    expect(getByText('2件を削除しました')).toBeTruthy();
    fireEvent.press(getByLabelText('削除を元に戻す'));
    expect(onUndo).toHaveBeenCalled();
  });
});
