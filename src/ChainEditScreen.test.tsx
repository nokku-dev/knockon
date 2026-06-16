import { fireEvent, render } from '@testing-library/react-native';

import { ChainEditScreen } from './ChainEditScreen';
import type { Action, Module } from './domain';
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
    { id: 'n1', isNew: false, actionId: 'act1', actionTitle: '水を飲む', actionVariants: null, moduleId: null, active: true },
    { id: 'n2', isNew: false, actionId: 'act2', actionTitle: 'ストレッチ', actionVariants: null, moduleId: null, active: true },
    { id: 'n3', isNew: false, actionId: 'act3', actionTitle: '机に向かう', actionVariants: null, moduleId: null, active: true },
  ],
});

const noopProps = {
  availableActions: [] as Action[],
  modules: [] as Module[],
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
  onDetachModule: () => {},
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

  test('「アクティブにする」押下で onSetStatus("active")', () => {
    const onSetStatus = jest.fn();
    const stockedDraft = { ...draftWithNodes(), status: 'stocked' as const };
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={stockedDraft}
        {...noopProps}
        onSetStatus={onSetStatus}
      />,
    );
    fireEvent.press(getByLabelText('アクティブにする'));
    expect(onSetStatus).toHaveBeenCalledWith('active');
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
    // #95: 追加先は既定で custom inbox。
    expect(onAddNewAction).toHaveBeenCalledWith('水を飲む', 'mod-custom-inbox');
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

  test('onAddNodesFromTemplate 未指定では「+ テンプレから追加」ボタンが表示されない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={baseDraft()} {...noopProps} />,
    );
    expect(queryByLabelText('テンプレから追加')).toBeNull();
  });

  test('onAddNodesFromTemplate 指定で「+ テンプレから追加」ボタンが表示される', () => {
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onAddNodesFromTemplate={() => {}}
      />,
    );
    expect(getByLabelText('テンプレから追加')).toBeTruthy();
  });

  test('テンプレ選択 → 全件 追加 で onAddNodesFromTemplate が (template, 全アクション) で呼ばれる', () => {
    // #305: TemplateChainPicker が 2-step 化されたため、 テンプレを開く → 「追加」を押す
    // の 2 段階で onAddNodesFromTemplate が呼ばれる。 初期は全件選択なので「追加」即
    // 押下の結果は旧 1-step (タップ即追加) と等価になる。
    const onAddNodesFromTemplate = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={baseDraft()}
        {...noopProps}
        onAddNodesFromTemplate={onAddNodesFromTemplate}
      />,
    );
    fireEvent.press(getByLabelText('テンプレから追加'));
    // BUILTIN_TEMPLATE_CHAINS[0] = morning-routine (アクション 6 件)
    fireEvent.press(getByLabelText('テンプレ「朝のルーティン」を開く'));
    fireEvent.press(getByLabelText('6件を追加'));
    expect(onAddNodesFromTemplate).toHaveBeenCalledTimes(1);
    const [template, titles] = onAddNodesFromTemplate.mock.calls[0];
    expect(template.id).toBe('morning-routine');
    expect(titles).toEqual(template.actions);
  });

  test('テンプレ選択 → 一部のみチェック → 追加 で選択 subset が渡る', () => {
    // #305: 2-step picker の中核 = アクション個別選択。 picker の subset がそのまま
    // onAddNodesFromTemplate に伝わることを ChainEditScreen レベルで担保する。
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
    // 「水を飲む」「朝食器を浸け置き」を外す → 残り 4 件
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
    expect(onAddExistingAction).toHaveBeenCalledWith('act1', '水を飲む', 'mod-custom-inbox');
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

  test('onSaveAction 未指定では既存チップに鉛筆ボタンが表示されない (Phase 2 variant)', () => {
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
    expect(queryByLabelText('アクション「水を飲む」を編集')).toBeNull();
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
    // モーダル内の保存ボタンが現れる
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

  test('variants=null のアクションには曜日バッジ (variant: ...) が表示されない', () => {
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
    expect(queryByLabelText(/^variant: /)).toBeNull();
  });
});

// #73 (SPEC §6): チップあり2層 + ON/OFF + source 別削除。
const modules: Module[] = [
  { id: 'mod-meal', name: '朝食', color: '#E0A24C', moment: ['morning'], goal: ['meal'], source: 'official', kind: 'normal', orderIndex: 0 },
  { id: 'mod-custom-inbox', name: 'カスタム', color: '#8B9EB0', moment: [], goal: [], source: 'user', kind: 'custom', orderIndex: 9999 },
];

const moduleDraft = (): ChainEditDraft => ({
  ...draftWithNodes(),
  nodes: [
    { id: 'n1', isNew: false, actionId: 'a1', actionTitle: '朝食準備', actionVariants: null, moduleId: 'mod-meal', active: true },
    { id: 'n2', isNew: false, actionId: 'a2', actionTitle: '朝ごはんを食べる', actionVariants: null, moduleId: 'mod-meal', active: true },
    { id: 'n3', isNew: false, actionId: 'a3', actionTitle: '自作メモ', actionVariants: null, moduleId: 'mod-custom-inbox', active: false },
  ],
});

describe('ChainEditScreen #73 — チップ層 / ON-OFF / source 別削除', () => {
  test('チップ層に採用中モジュールが count 付きで並ぶ', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    expect(getByLabelText('モジュール 朝食 (2) で絞り込む')).toBeTruthy();
    expect(getByLabelText('モジュール カスタム (1) で絞り込む')).toBeTruthy();
  });

  test('C 案ラベル: run 先頭ノードだけモジュール名を出す (自己修復)', () => {
    const { getAllByText, getByText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    // 朝食 run は n1/n2 連続 → 先頭 n1 だけ「朝食」ラベル。
    // ※チップ層にも各モジュール名が 1 つ出るため、run 先頭ラベル + チップ = 計 2 箇所。
    expect(getAllByText('朝食').length).toBe(2); // チップ + n1 (run 先頭)
    expect(getAllByText('カスタム').length).toBe(2); // チップ + n3 (run 先頭)
    // n2 は run 途中なのでモジュール名ラベルは出ない (アクション名のみ)
    expect(getByText('朝ごはんを食べる')).toBeTruthy();
  });

  test('ON/OFF トグル押下で onToggleNodeActive が該当 nodeId で呼ばれる', () => {
    const onToggleNodeActive = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onToggleNodeActive={onToggleNodeActive}
      />,
    );
    // n1 は active=true → 「一時停止」アクション
    fireEvent.press(getByLabelText('朝食準備 を一時停止'));
    expect(onToggleNodeActive).toHaveBeenCalledWith('n1');
    // n3 は active=false → 「再開」アクション
    fireEvent.press(getByLabelText('自作メモ を再開'));
    expect(onToggleNodeActive).toHaveBeenCalledWith('n3');
  });

  test('official モジュール由来ノードは削除ラベルが「チェーンから外す」(非破壊)', () => {
    const { getByLabelText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    expect(getByLabelText('朝食準備 をチェーンから外す')).toBeTruthy();
  });

  test('user (custom) モジュール由来ノードは削除ラベルが「削除」(破壊的)', () => {
    const onRemoveNode = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onRemoveNode={onRemoveNode}
      />,
    );
    fireEvent.press(getByLabelText('自作メモ を削除'));
    expect(onRemoveNode).toHaveBeenCalledWith('n3');
  });
});

describe('ChainEditScreen #95 — チップ絞り込み / 振り分けピッカー', () => {
  test('チップタップで該当モジュールのノードだけ表示 (絞り込み)', () => {
    const { getByLabelText, queryByText, getByText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    // 初期は全ノード表示
    expect(getByText('朝食準備')).toBeTruthy();
    expect(getByText('自作メモ')).toBeTruthy();
    // カスタムで絞り込み → 朝食モジュールのノードは消える
    fireEvent.press(getByLabelText('モジュール カスタム (1) で絞り込む'));
    expect(queryByText('朝食準備')).toBeNull();
    expect(getByText('自作メモ')).toBeTruthy();
  });

  test('絞り込み中チップ再タップで解除 (全ノードに戻る)', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    fireEvent.press(getByLabelText('モジュール カスタム (1) で絞り込む'));
    expect(queryByText('朝食準備')).toBeNull();
    fireEvent.press(getByLabelText('モジュール カスタム の絞り込みを解除'));
    expect(getByText('朝食準備')).toBeTruthy();
  });

  test('振り分けピッカー: 追加先モジュールを選んで追加すると その module_id で onAddNewAction', () => {
    const onAddNewAction = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onAddNewAction={onAddNewAction}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    // 追加先を「朝食」(mod-meal) に切替
    fireEvent.press(getByLabelText('追加先: 朝食'));
    fireEvent.changeText(getByLabelText('新しいアクション名'), 'ヨーグルト');
    fireEvent.press(getByLabelText('新しいアクションを追加'));
    expect(onAddNewAction).toHaveBeenCalledWith('ヨーグルト', 'mod-meal');
  });

  test('振り分け既定は custom inbox (追加先未選択なら custom inbox 所属)', () => {
    const onAddNewAction = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onAddNewAction={onAddNewAction}
      />,
    );
    fireEvent.press(getByLabelText('ノードを追加'));
    fireEvent.changeText(getByLabelText('新しいアクション名'), 'ヨーグルト');
    fireEvent.press(getByLabelText('新しいアクションを追加'));
    expect(onAddNewAction).toHaveBeenCalledWith('ヨーグルト', 'mod-custom-inbox');
  });
});

describe('ChainEditScreen #93 — カスタムモジュール化導線', () => {
  test('custom inbox ノードがあり onPromoteToModule 指定で「カスタムをモジュール化」が出る', () => {
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onPromoteToModule={() => {}}
      />,
    );
    // moduleDraft の n3 は custom inbox 所属 → 導線が出る
    expect(getByLabelText('カスタムをモジュール化')).toBeTruthy();
  });

  test('custom inbox ノードが無ければ導線は出ない', () => {
    // 全ノード official 所属の draft
    const officialOnly: ChainEditDraft = {
      ...moduleDraft(),
      nodes: [
        { id: 'n1', isNew: false, actionId: 'a1', actionTitle: '朝食準備', actionVariants: null, moduleId: 'mod-meal', active: true },
      ],
    };
    const { queryByLabelText } = render(
      <ChainEditScreen
        draft={officialOnly}
        {...noopProps}
        modules={modules}
        onPromoteToModule={() => {}}
      />,
    );
    expect(queryByLabelText('カスタムをモジュール化')).toBeNull();
  });

  test('onPromoteToModule 未指定なら導線は出ない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} />,
    );
    expect(queryByLabelText('カスタムをモジュール化')).toBeNull();
  });
});

describe('ChainEditScreen #94 — 一括外し / undo', () => {
  test('絞り込み中に「まとめて外す」で onDetachModule が該当 moduleId で呼ばれる', () => {
    const onDetachModule = jest.fn();
    const { getByLabelText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        onDetachModule={onDetachModule}
      />,
    );
    fireEvent.press(getByLabelText('モジュール 朝食 (2) で絞り込む'));
    fireEvent.press(getByLabelText('このモジュールをまとめて外す'));
    expect(onDetachModule).toHaveBeenCalledWith('mod-meal');
  });

  test('undoCount=0 のとき undo バーは出ない', () => {
    const { queryByLabelText } = render(
      <ChainEditScreen draft={moduleDraft()} {...noopProps} modules={modules} undoCount={0} />,
    );
    expect(queryByLabelText('削除を元に戻す')).toBeNull();
  });

  test('undoCount>0 で undo バーが出て、タップで onUndo', () => {
    const onUndo = jest.fn();
    const { getByLabelText, getByText } = render(
      <ChainEditScreen
        draft={moduleDraft()}
        {...noopProps}
        modules={modules}
        undoCount={2}
        onUndo={onUndo}
      />,
    );
    expect(getByText('2件を外しました')).toBeTruthy();
    fireEvent.press(getByLabelText('削除を元に戻す'));
    expect(onUndo).toHaveBeenCalled();
  });
});
