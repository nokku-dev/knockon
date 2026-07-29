import appJson from '../app.json';

// Issue #254 (#253 洗い出し R-1): expo-location の config plugin 登録を機械的に固定する。
// K-006 (ハードガードレールのテスト固定) / src/appJsonIcon.test.ts と同じ精神。
//
// 背景: expo-location の config plugin は `expo-module.config.json` に宣言が無いため、
// app.json の `plugins` に明示登録しないと適用されない。適用されないと Info.plist に
// NSLocation* の usage description が入らず、 src/location.ts の
// requestLocationPermission() (AnchorEditor の「現在地を取得」から呼ばれる) の時点で
// iOS がアプリを即時終了する。 App Store 審査 Guideline 5.1.1 のリスクでもある。
// preview/development の iOS profile は simulator: true なので実機フローを通しておらず、
// この欠落は CI でしか守れない。
//
// node_modules/expo-location/plugin/build/withLocation.js の実装上、
// createPermissionsPlugin の既定値により **3 キーとも必ず Info.plist に書かれる**
// (未指定なら英語の既定文言 "Allow $(PRODUCT_NAME) to access your location")。
// よって 3 つとも日本語文言を明示する。

type PluginEntry = string | [string, Record<string, unknown>];

const plugins = appJson.expo.plugins as unknown as PluginEntry[];

const findPlugin = (name: string): PluginEntry | undefined =>
  plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));

// options は test 内で解決する (collection 時に throw させると「テストが赤い」ではなく
// 「suite が起動しない」になり、 何が壊れているか読み取れなくなるため)。
const locationOptions = (): Record<string, unknown> => {
  const entry = findPlugin('expo-location');
  return Array.isArray(entry) ? entry[1] : {};
};

describe('app.json expo-location plugin 設定 (Issue #254)', () => {
  test('plugins に expo-location が登録されている', () => {
    expect(findPlugin('expo-location')).toBeDefined();
  });

  test('expo-location が options 付きの配列形式で登録されている', () => {
    // 文字列単独登録だと英語の既定文言になるため、 options 付きであることを固定する。
    expect(Array.isArray(findPlugin('expo-location'))).toBe(true);
  });

  describe('権限文言 (docs/release/app-store-submission.md §1.4)', () => {
    test.each([
      'locationWhenInUsePermission',
      'locationAlwaysAndWhenInUsePermission',
      'locationAlwaysPermission',
    ])('%s が日本語の文言で指定されている', (key) => {
      const value = locationOptions()[key];
      expect(typeof value).toBe('string');
      expect(value as string).not.toBe('');
      // 既定の英語文言が漏れていないこと (審査で不自然に映るため)。
      expect(value as string).not.toContain('Allow $(PRODUCT_NAME)');
      // ひらがな / カタカナ / 漢字のいずれかを含む = 日本語であること。
      expect(value as string).toMatch(/[ぁ-んァ-ヶ一-龠]/);
    });
  });

  test('iOS のバックグラウンド位置情報は有効化しない', () => {
    // ADR-0003 / src/location.ts: v1 は前景位置取得のみ。 OS ジオフェンスによる
    // バックグラウンド発火は Phase 1.6b (未実装)。 ここで
    // isIosBackgroundLocationEnabled を立てると UIBackgroundModes に 'location' が
    // 入り、 実装していない常時位置利用を審査で説明できなくなる (スコープ拡張禁止)。
    expect(locationOptions().isIosBackgroundLocationEnabled).toBeUndefined();
    expect(locationOptions().isAndroidBackgroundLocationEnabled).toBeUndefined();
  });
});
