import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
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

// Issue #66: チェーンエクスポートは DB (db.expo) + Share.share を統合する。
// テストでは DB クライアントを mock し、 「export ボタン押下で Share.share に
// シリアライズ済み JSON が渡る」ところまで検証する。
jest.mock('./db.expo', () => ({
  getExpoSqliteClient: jest.fn(async () => ({
    run: jest.fn(),
    all: jest.fn(),
  })),
}));

jest.mock('./repository', () => ({
  listChains: jest.fn(async () => [
    {
      id: 'chain-morning',
      title: '朝のルーティン',
      anchorId: 'anchor-wake',
      status: 'active',
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ]),
  listActions: jest.fn(async () => [
    { id: 'action-water', title: '水を飲む', variants: null, timerSeconds: null },
  ]),
  getAnchor: jest.fn(async () => ({
    id: 'anchor-wake',
    title: '起床',
    kind: 'time',
    time: '07:00',
    latitude: null,
    longitude: null,
    radiusMeters: null,
  })),
  listNodes: jest.fn(async () => [
    {
      id: 'node-m0',
      chainId: 'chain-morning',
      orderIndex: 0,
      kind: 'action',
      actionId: 'action-water',
    },
  ]),
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

describe('SettingsLauncher — チェーンエクスポート (Issue #66)', () => {
  test('export ボタンタップで Share.share に JSON 文字列が渡される', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.dismissedAction });
    const { getByLabelText } = renderWithInsets(<SettingsLauncher />);
    fireEvent.press(getByLabelText('設定を開く'));
    fireEvent.press(getByLabelText('チェーンをエクスポート'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const callArg = shareSpy.mock.calls[0]![0] as { message: string };
    expect(typeof callArg.message).toBe('string');
    const parsed = JSON.parse(callArg.message);
    expect(parsed.version).toBe(1);
    expect(parsed.chains).toHaveLength(1);
    expect(parsed.chains[0].title).toBe('朝のルーティン');
    expect(parsed.chains[0].actions).toEqual([
      { title: '水を飲む', variants: null, timerSeconds: null },
    ]);
    shareSpy.mockRestore();
  });
});
