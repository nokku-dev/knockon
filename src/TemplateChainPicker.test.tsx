import { fireEvent, render } from '@testing-library/react-native';

import { TemplateChainPicker } from './TemplateChainPicker';
import type { TemplateChain } from './templateChains';

const templates: ReadonlyArray<TemplateChain> = [
  { id: 't1', title: '朝のルーティン', actions: ['水を飲む', 'ストレッチ'] },
  { id: 't2', title: '筋トレ', actions: ['ウォームアップ', 'メイン', 'クールダウン'] },
];

describe('TemplateChainPicker (2-step)', () => {
  // ===== Step 1: テンプレ一覧 =====

  test('step1: templates のタイトルとアクション数が表示される', () => {
    const { getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('朝のルーティン')).toBeTruthy();
    expect(getByText('筋トレ')).toBeTruthy();
    expect(getByText('2 ノード')).toBeTruthy();
    expect(getByText('3 ノード')).toBeTruthy();
  });

  test('step1: テンプレタップでは onSelect は呼ばれない (step 2 に進むだけ)', () => {
    // 旧仕様 (1-step) では「タップ = 即追加」だったが、 #305 で 2-step 化。
    // テンプレタップは「中身を確認するために開く」アクションになり、 onSelect は
    // step 2 の「追加」ボタンでのみ呼ばれる。
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('step1: キャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });

  // ===== Step 2: アクション個別選択 =====

  test('step2: テンプレを開くとアクション一覧が表示される', () => {
    const { getByLabelText, getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    // step 2 では templates list ではなく、 開いたテンプレのアクション 3 件が並ぶ
    expect(getByText('ウォームアップ')).toBeTruthy();
    expect(getByText('メイン')).toBeTruthy();
    expect(getByText('クールダウン')).toBeTruthy();
  });

  test('step2: 初期は全アクションが選択済み (旧仕様の「全件追加」と互換)', () => {
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    expect(
      getByLabelText('アクション「ウォームアップ」').props.accessibilityState
        ?.checked,
    ).toBe(true);
    expect(
      getByLabelText('アクション「メイン」').props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      getByLabelText('アクション「クールダウン」').props.accessibilityState
        ?.checked,
    ).toBe(true);
  });

  test('step2: アクションタップで個別に選択トグルできる', () => {
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    // 「メイン」を外す
    fireEvent.press(getByLabelText('アクション「メイン」'));
    expect(
      getByLabelText('アクション「メイン」').props.accessibilityState?.checked,
    ).toBe(false);
    // 再度タップで戻る
    fireEvent.press(getByLabelText('アクション「メイン」'));
    expect(
      getByLabelText('アクション「メイン」').props.accessibilityState?.checked,
    ).toBe(true);
  });

  test('step2: 「追加」ボタンは選択件数を反映する', () => {
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    // 初期 = 3 件選択済み
    expect(getByLabelText('3件を追加')).toBeTruthy();
    fireEvent.press(getByLabelText('アクション「メイン」'));
    expect(getByLabelText('2件を追加')).toBeTruthy();
  });

  test('step2: 「追加」で onSelect が選択済みアクションだけで呼ばれる', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    // 「メイン」だけ外す → 残り 2 件
    fireEvent.press(getByLabelText('アクション「メイン」'));
    fireEvent.press(getByLabelText('2件を追加'));
    expect(onSelect).toHaveBeenCalledWith(templates[1], [
      'ウォームアップ',
      'クールダウン',
    ]);
  });

  test('step2: 全件選択のまま追加すると template.actions と等価のリストで呼ばれる', () => {
    // 旧仕様 (1-step・タップ即追加) との行動的な互換: 初期状態でそのまま「追加」を
    // 押せば、 元の「テンプレタップで全アクション追加」と同じ結果になる。
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    fireEvent.press(getByLabelText('3件を追加'));
    expect(onSelect).toHaveBeenCalledWith(templates[1], [
      ...templates[1].actions,
    ]);
  });

  test('step2: 全解除 → 「追加」は disabled (0 件追加は無意味)', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    fireEvent.press(getByLabelText('全解除'));
    const addBtn = getByLabelText('0件を追加');
    expect(addBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(addBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('step2: 全選択/全解除トグルが動く', () => {
    const { getByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    // 初期: 全件選択中 → ボタンは「全解除」
    fireEvent.press(getByLabelText('全解除'));
    expect(
      getByLabelText('アクション「ウォームアップ」').props.accessibilityState
        ?.checked,
    ).toBe(false);
    // 全部外れたのでボタンは「全選択」に切り替わる
    fireEvent.press(getByLabelText('全選択'));
    expect(
      getByLabelText('アクション「ウォームアップ」').props.accessibilityState
        ?.checked,
    ).toBe(true);
    expect(
      getByLabelText('アクション「クールダウン」').props.accessibilityState
        ?.checked,
    ).toBe(true);
  });

  test('step2: 「戻る」で step 1 に戻る (選択状態は破棄)', () => {
    const onSelect = jest.fn();
    const { getByLabelText, queryByLabelText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    fireEvent.press(getByLabelText('アクション「メイン」')); // 1 件外す
    fireEvent.press(getByLabelText('テンプレ一覧に戻る'));
    // step 1 に戻った: テンプレカードが見えてアクション行が消える
    expect(getByLabelText('テンプレ「筋トレ」を開く')).toBeTruthy();
    expect(queryByLabelText('アクション「メイン」')).toBeNull();
    // 再オープン: 選択状態はリセット (全件選択に戻る)
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    expect(
      getByLabelText('アクション「メイン」').props.accessibilityState?.checked,
    ).toBe(true);
  });

  test('step2: キャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByLabelText, getByText } = render(
      <TemplateChainPicker
        templates={templates}
        onSelect={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByLabelText('テンプレ「筋トレ」を開く'));
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
