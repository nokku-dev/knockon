import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Issue #58: 各画面に設定画面へのナビゲーションボタンを追加。
// SettingsLauncher は (gear ボタン + SettingsModal + useSettings/useTheme) を
// 内包する presentational コンテナ。 各タブから 1 行で配置できる単一の入口。
//
// 内部で useSettings (= getExpoSqliteClient 起動) / useTheme (= ThemeProvider 必須)
// を呼ぶため、 ユニットテストでは両 hook を mock してそれらの環境依存を切り離す。
// @expo/vector-icons は expo-font に依存して jest-expo 環境で解決失敗するので
// ローカル Mock (Text node で代用)。
jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      React.createElement(RN.Text, null, `icon:${name}`),
  };
});

jest.mock('./useSettings', () => ({
  useSettings: () => ({
    settings: { resetTime: '00:00', themeMode: 'auto' },
    error: null,
    loading: false,
    updateResetTime: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('./themeContext', () => ({
  useTheme: () => ({
    themeMode: 'auto',
    resolvedScheme: 'dark',
    palette: {},
    setThemeMode: jest.fn(() => Promise.resolve()),
  }),
}));

import { SettingsLauncher } from './SettingsLauncher';

const renderWithInsets = (ui: React.ReactElement): ReturnType<typeof render> =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
        frame: { x: 0, y: 0, width: 320, height: 640 },
      }}
    >
      {ui}
    </SafeAreaProvider>,
  );

describe('SettingsLauncher (Issue #58)', () => {
  test('初期状態では設定モーダルは開いていない', () => {
    const { queryByText, getByLabelText } = renderWithInsets(
      <SettingsLauncher />,
    );
    // ボタンは存在する
    expect(getByLabelText('設定を開く')).toBeTruthy();
    // モーダルの「設定」見出しは未表示
    expect(queryByText('設定')).toBeNull();
  });

  test('設定ボタンをタップするとモーダルが開く (= 「設定」見出しが表示)', () => {
    const { getByLabelText, getByText } = renderWithInsets(<SettingsLauncher />);
    fireEvent.press(getByLabelText('設定を開く'));
    expect(getByText('設定')).toBeTruthy();
  });

  test('モーダル内の「閉じる」をタップするとモーダルが閉じる', () => {
    const { getByLabelText, queryByText } = renderWithInsets(
      <SettingsLauncher />,
    );
    fireEvent.press(getByLabelText('設定を開く'));
    expect(queryByText('設定')).toBeTruthy();
    fireEvent.press(getByLabelText('設定を閉じる'));
    expect(queryByText('設定')).toBeNull();
  });
});
