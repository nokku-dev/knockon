import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MetricKindsEditor } from './MetricKindsEditor';
import type { MetricKind } from './metricKindsRepository';

// Issue #183: ステータスバーかぶり修正で `useSafeAreaInsets` を導入したため、
// provider 不在で throw する。 既存テストも provider 配下でレンダリングする。
const renderWithInsets = (
  ui: React.ReactElement,
  top = 0,
): ReturnType<typeof render> =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top, right: 0, bottom: 0, left: 0 },
        frame: { x: 0, y: 0, width: 320, height: 640 },
      }}
    >
      {ui}
    </SafeAreaProvider>,
  );

const builtinKinds: MetricKind[] = [
  {
    id: 'k1',
    key: 'weight',
    label: '体重',
    unit: 'kg',
    orderIndex: 0,
    isBuiltin: true,
  },
  {
    id: 'k2',
    key: 'mood',
    label: '気分',
    unit: '点',
    orderIndex: 1,
    isBuiltin: false,
  },
];

const noopProps = {
  onClose: () => {},
  onAdd: () => {},
  onUpdate: () => {},
  onDelete: () => {},
};

describe('MetricKindsEditor (ADR-0026 PR-CC)', () => {
  test('open=false なら何もレンダリングしない', () => {
    const { queryByText } = renderWithInsets(
      <MetricKindsEditor open={false} kinds={builtinKinds} {...noopProps} />,
    );
    expect(queryByText('メトリクス種別')).toBeNull();
  });

  test('open=true で全種別の表示名 + 単位を表示 (key 表示は撤去 / #184)', () => {
    const { getByText, getByLabelText, queryByText } = renderWithInsets(
      <MetricKindsEditor open={true} kinds={builtinKinds} {...noopProps} />,
    );
    // 各種別の編集ボタン accessibilityLabel から存在確認 (text は inline 子要素で分解されるため)
    expect(getByLabelText('体重 を編集')).toBeTruthy();
    expect(getByText(/kg/)).toBeTruthy();
    expect(getByLabelText('気分 を編集')).toBeTruthy();
    // key 表示は撤去
    expect(queryByText(/key:/)).toBeNull();
  });

  test('builtin に「(初期)」バッジ表示、 user 追加分には表示しない', () => {
    const { getAllByText } = renderWithInsets(
      <MetricKindsEditor open={true} kinds={builtinKinds} {...noopProps} />,
    );
    expect(getAllByText('(初期)')).toHaveLength(1); // 体重 (builtin) のみ
  });

  test('「+ 種別を追加」 → フォーム表示 + 「追加」で onAdd 呼び出し (key 入力なし / #184)', () => {
    const onAdd = jest.fn();
    const { getByLabelText, queryByLabelText } = renderWithInsets(
      <MetricKindsEditor
        open={true}
        kinds={builtinKinds}
        {...noopProps}
        onAdd={onAdd}
      />,
    );
    fireEvent.press(getByLabelText('種別を追加'));
    fireEvent.changeText(getByLabelText('表示名'), '集中時間');
    fireEvent.changeText(getByLabelText('単位'), '分');
    // key 入力欄は存在しない
    expect(queryByLabelText('key')).toBeNull();
    fireEvent.press(getByLabelText('新規種別保存'));
    expect(onAdd).toHaveBeenCalledWith('集中時間', '分');
  });

  test('編集ボタン押下 → 入力欄に既存値、 保存で onUpdate 呼び出し (key は不変 / #184)', () => {
    const onUpdate = jest.fn();
    const { getByLabelText, queryByLabelText } = renderWithInsets(
      <MetricKindsEditor
        open={true}
        kinds={builtinKinds}
        {...noopProps}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.press(getByLabelText('体重 を編集'));
    expect(getByLabelText('表示名').props.value).toBe('体重');
    // key 入力欄は存在しない
    expect(queryByLabelText('key')).toBeNull();
    fireEvent.changeText(getByLabelText('表示名'), '体重 (朝)');
    fireEvent.press(getByLabelText('種別保存'));
    // patch には key を含めない (= 既存 key を変えない)
    expect(onUpdate).toHaveBeenCalledWith('k1', {
      label: '体重 (朝)',
      unit: 'kg',
    });
  });

  test('削除ボタン → Alert 表示 → 「削除する」確定で onDelete 呼び出し', () => {
    const onDelete = jest.fn();
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        // 「削除する」(buttons[1]) の onPress を即実行
        const del = buttons?.[1];
        del?.onPress?.();
      });
    const { getByLabelText } = renderWithInsets(
      <MetricKindsEditor
        open={true}
        kinds={builtinKinds}
        {...noopProps}
        onDelete={onDelete}
      />,
    );
    fireEvent.press(getByLabelText('気分 を削除'));
    expect(alertSpy).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith(builtinKinds[1]);
    alertSpy.mockRestore();
  });

  test('builtin 削除時の Alert メッセージに「Notion 連携」警告が含まれる', () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const { getByLabelText } = renderWithInsets(
      <MetricKindsEditor open={true} kinds={builtinKinds} {...noopProps} />,
    );
    fireEvent.press(getByLabelText('体重 を削除')); // builtin
    expect(alertSpy.mock.calls[0]?.[1]).toMatch(/Notion 連携/);
    alertSpy.mockRestore();
  });

  // Issue #183: メトリクス種別編集画面の最上部 (閉じる / 種別 行) が Android のステータスバーに
  // 被って「閉じる」を押せないバグ。 SettingsModal Issue #57 と同型の修正 (useSafeAreaInsets で
  // topbar に paddingTop を確保)。
  test('Issue #183: top inset > 0 のとき topbar の paddingTop が inset 分だけ広がる', () => {
    const { getByTestId } = renderWithInsets(
      <MetricKindsEditor open={true} kinds={builtinKinds} {...noopProps} />,
      47,
    );
    const topbar = getByTestId('metric-kinds-editor-topbar');
    const flat = StyleSheet.flatten(topbar.props.style);
    expect(flat.paddingTop).toBeGreaterThanOrEqual(47);
  });

  test('Issue #183: top inset = 0 でも topbar は最低限の paddingTop を保つ (既存挙動の互換)', () => {
    const { getByTestId } = renderWithInsets(
      <MetricKindsEditor open={true} kinds={builtinKinds} {...noopProps} />,
      0,
    );
    const topbar = getByTestId('metric-kinds-editor-topbar');
    const flat = StyleSheet.flatten(topbar.props.style);
    expect(flat.paddingTop).toBeGreaterThanOrEqual(12);
  });

  test('空文字 (表示名 / 単位 のどちらか空) では追加されない', () => {
    const onAdd = jest.fn();
    const { getByLabelText } = renderWithInsets(
      <MetricKindsEditor
        open={true}
        kinds={[]}
        {...noopProps}
        onAdd={onAdd}
      />,
    );
    fireEvent.press(getByLabelText('種別を追加'));
    // label のみ入力、 unit 空
    fireEvent.changeText(getByLabelText('表示名'), 'foo');
    fireEvent.press(getByLabelText('新規種別保存'));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
