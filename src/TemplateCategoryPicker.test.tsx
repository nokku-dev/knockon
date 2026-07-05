import { fireEvent, render } from '@testing-library/react-native';

import { TemplateCategoryPicker } from './TemplateCategoryPicker';
import type { CatalogAction, Category, RecommendedItem } from './domain';

// #168 (#155 follow-up): チェーン編集の「+ テンプレから追加」が新カテゴリモデル
// (genre / recommended) を扱う 2-step picker。 旧 TemplateChainPicker
// (BUILTIN_TEMPLATE_CHAINS) は撤去。

const cat = (
  id: string,
  name: string,
  type: Category['type'],
  orderIndex: number,
): Category => ({
  id,
  name,
  type,
  color: '#888',
  source: 'official',
  orderIndex,
});

const action = (
  id: string,
  title: string,
  categoryId: string,
  position: number,
  opts: { defaultOn?: boolean; timerSeconds?: number | null } = {},
): CatalogAction => ({
  id,
  title,
  categoryId,
  defaultOn: opts.defaultOn ?? true,
  position,
  source: 'official',
  timerSeconds: opts.timerSeconds ?? null,
});

const RECOMMENDED: Category[] = [
  cat('cat-rec-morning', '朝のおすすめ', 'recommended', 9),
];

const GENRE: Category[] = [
  cat('cat-hydration', '水分・健康', 'genre', 0),
  cat('cat-exercise', '運動', 'genre', 1),
];

const ACTIONS: CatalogAction[] = [
  action('act-drink-water', '水を飲む', 'cat-hydration', 0),
  action('act-brush-teeth', '歯磨き', 'cat-hydration', 1),
  action('act-weigh', '体重計', 'cat-hydration', 2, { defaultOn: false }),
  action('act-stretch', 'ストレッチ', 'cat-exercise', 0, { timerSeconds: 300 }),
  action('act-walk', 'ウォーキング', 'cat-exercise', 1),
];

const RECOMMENDED_ITEMS: RecommendedItem[] = [
  {
    id: 'cat-rec-morning-0',
    categoryId: 'cat-rec-morning',
    actionId: 'act-brush-teeth',
    position: 0,
  },
  {
    id: 'cat-rec-morning-1',
    categoryId: 'cat-rec-morning',
    actionId: 'act-drink-water',
    position: 1,
  },
  // 重複参照: 歯磨きを末尾でも再度
  {
    id: 'cat-rec-morning-2',
    categoryId: 'cat-rec-morning',
    actionId: 'act-brush-teeth',
    position: 2,
  },
];

const baseProps = {
  recommendedCategories: RECOMMENDED,
  genreCategories: GENRE,
  actions: ACTIONS,
  recommendedItems: RECOMMENDED_ITEMS,
};

describe('TemplateCategoryPicker — step 1 (索引)', () => {
  test('recommended カードと genre チップが並ぶ', () => {
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByLabelText('カテゴリ「朝のおすすめ」を開く')).toBeTruthy();
    expect(getByLabelText('カテゴリ「水分・健康」を開く')).toBeTruthy();
    expect(getByLabelText('カテゴリ「運動」を開く')).toBeTruthy();
  });

  test('カテゴリタップでは onSelect は呼ばれない (step 2 へ進むだけ)', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('キャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('TemplateCategoryPicker — step 2 (アクション個別選択)', () => {
  test('genre カテゴリを開くと defaultOn=true のアクションが position 順で並ぶ (#191)', () => {
    const { getByLabelText, queryByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「水分・健康」を開く'));
    expect(getByLabelText('アクション「水を飲む」')).toBeTruthy();
    expect(getByLabelText('アクション「歯磨き」')).toBeTruthy();
    // 「体重計」は defaultOn=false (旧「任意」) なので非表示 (#191)
    expect(queryByLabelText('アクション「体重計」')).toBeNull();
    // 別カテゴリのアクションは出ない
    expect(queryByLabelText('アクション「ストレッチ」')).toBeNull();
  });

  test('genre: 初期は全アイテム選択済み', () => {
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「水分・健康」を開く'));
    expect(
      getByLabelText('アクション「水を飲む」').props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      getByLabelText('アクション「歯磨き」').props.accessibilityState?.checked,
    ).toBe(true);
  });

  test('genre: 「任意」ラベルは表示されない (#191)', () => {
    const { getByLabelText, queryByText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「水分・健康」を開く'));
    expect(queryByText('任意')).toBeNull();
  });

  test('recommended カテゴリを開くと順序つき・重複ありで並ぶ', () => {
    const { getByLabelText, getAllByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「朝のおすすめ」を開く'));
    // 歯磨きが 2 回登場 (重複参照、key は item.id で別)
    expect(getAllByLabelText('アクション「歯磨き」').length).toBe(2);
    expect(getByLabelText('アクション「水を飲む」')).toBeTruthy();
  });

  test('「追加」ボタンは選択件数を反映する', () => {
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    // 初期 2 件選択 (ストレッチ + ウォーキング)
    expect(getByLabelText('2件を追加')).toBeTruthy();
    fireEvent.press(getByLabelText('アクション「ストレッチ」'));
    expect(getByLabelText('1件を追加')).toBeTruthy();
  });

  test('「追加」で onSelect が選択済みノード集合 (表示順) で呼ばれる', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    // ストレッチを外して残りウォーキング 1 件で「追加」
    fireEvent.press(getByLabelText('アクション「ストレッチ」'));
    fireEvent.press(getByLabelText('1件を追加'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [items] = onSelect.mock.calls[0];
    expect(items).toEqual([
      { actionTitle: 'ウォーキング', timerSeconds: null },
    ]);
  });

  test('「追加」は表示順 (カテゴリ内 position 昇順) を保つ', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「水分・健康」を開く'));
    // 「水を飲む」「歯磨き」の 2 件が defaultOn=true として表示され position 昇順で追加される
    // (「体重計」は #191 で非表示)
    fireEvent.press(getByLabelText('2件を追加'));
    const [items] = onSelect.mock.calls[0];
    expect(items.map((i: { actionTitle: string }) => i.actionTitle)).toEqual([
      '水を飲む',
      '歯磨き',
    ]);
  });

  test('「追加」は timerSeconds を保持する', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    fireEvent.press(getByLabelText('2件を追加'));
    const [items] = onSelect.mock.calls[0];
    // ストレッチは timerSeconds=300、 ウォーキングは null
    expect(items).toEqual([
      { actionTitle: 'ストレッチ', timerSeconds: 300 },
      { actionTitle: 'ウォーキング', timerSeconds: null },
    ]);
  });

  test('recommended: 重複参照を含めて選択数 = item 数 で渡る', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「朝のおすすめ」を開く'));
    // 初期 = 3 件 (歯磨き×2 + 水を飲む)
    fireEvent.press(getByLabelText('3件を追加'));
    const [items] = onSelect.mock.calls[0];
    expect(items.map((i: { actionTitle: string }) => i.actionTitle)).toEqual([
      '歯磨き',
      '水を飲む',
      '歯磨き',
    ]);
  });

  test('0 件のとき「追加」は disabled (0 件追加は無意味)', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={onSelect}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    fireEvent.press(getByLabelText('全解除'));
    const addBtn = getByLabelText('0件を追加');
    expect(addBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(addBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('全選択/全解除トグルが動く', () => {
    const { getByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    fireEvent.press(getByLabelText('全解除'));
    expect(
      getByLabelText('アクション「ストレッチ」').props.accessibilityState
        ?.checked,
    ).toBe(false);
    fireEvent.press(getByLabelText('全選択'));
    expect(
      getByLabelText('アクション「ストレッチ」').props.accessibilityState
        ?.checked,
    ).toBe(true);
    expect(
      getByLabelText('アクション「ウォーキング」').props.accessibilityState
        ?.checked,
    ).toBe(true);
  });

  test('「戻る」で step 1 に戻る (選択状態は破棄)', () => {
    const { getByLabelText, queryByLabelText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    fireEvent.press(getByLabelText('アクション「ストレッチ」')); // 外す
    fireEvent.press(getByLabelText('カテゴリ一覧に戻る'));
    expect(getByLabelText('カテゴリ「運動」を開く')).toBeTruthy();
    expect(queryByLabelText('アクション「ストレッチ」')).toBeNull();
    // 再オープン: 選択状態はリセット (全件選択に戻る)
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    expect(
      getByLabelText('アクション「ストレッチ」').props.accessibilityState
        ?.checked,
    ).toBe(true);
  });

  test('step 2 のキャンセルで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByLabelText, getByText } = render(
      <TemplateCategoryPicker
        {...baseProps}
        onSelect={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByLabelText('カテゴリ「運動」を開く'));
    fireEvent.press(getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
