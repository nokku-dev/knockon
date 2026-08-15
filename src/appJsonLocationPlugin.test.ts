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

  // 権限文言と実装を一致させる。**両方向に効く固定**であることが要点。
  //
  // 経緯: #291 は「実装がないのに到達検知を謳っている」を直した (文言を狭めた)。
  // #301 (Phase 1.6b) で OS ジオフェンスを実装したので、今度は**逆向きに**
  // 「実装したのに現在地取得としか書いていない」がずれになる。iOS は Info.plist の
  // 説明より広い用途で位置情報を使うアプリを審査で弾く (Guideline 5.1.1)。
  //
  // 文言は expo-location plugin の既定で 3 キーとも Info.plist に書かれる
  // (上のコメント参照) ので、キーの有無ではなく**内容**を実装に合わせる。
  describe('権限文言が実装と一致している (#291 → #301)', () => {
    test('locationWhenInUsePermission は現在地取得を説明している', () => {
      // 前景権限の用途は変わらない: 場所アンカー登録時の現在地取得 (AnchorEditor)。
      expect(locationOptions().locationWhenInUsePermission as string).toContain(
        '現在地',
      );
    });

    test.each([
      'locationAlwaysAndWhenInUsePermission',
      'locationAlwaysPermission',
    ])('%s が到達検知 (常時利用) を説明している', (key) => {
      // #301 で region monitoring を実装した = アプリを開いていない間も位置情報を
      // 使う。その用途を書いていないと、実装が説明より広くなる (#291 の逆向き)。
      expect(locationOptions()[key] as string).toContain('到達');
    });

    test('到達検知の文言と背景位置の有効化が食い違わない', () => {
      // ⚠ この 2 つは常に同時に成立/不成立でなければならない。片方だけ変えると
      // 「実装していない用途を要求する」(#291) か「説明より広く使う」のどちらかになる。
      const opts = locationOptions();
      const promisesArrival = (
        opts.locationAlwaysPermission as string
      ).includes('到達');
      const backgroundEnabled =
        opts.isIosBackgroundLocationEnabled === true &&
        opts.isAndroidBackgroundLocationEnabled === true;
      expect(promisesArrival).toBe(backgroundEnabled);
    });
  });

  test('バックグラウンド位置情報を有効化している (#301)', () => {
    // ⚠ **iOS では立てないと startGeofencingAsync が throw する。**
    // expo-location の LocationModule.swift が
    // `guard try taskManager.hasBackgroundModeEnabled("location")` で弾くため、
    // UIBackgroundModes に 'location' が必要 (Apple の region monitoring 自体は
    // background mode を要求しないが、expo の実装が要求する)。
    // Android は ACCESS_BACKGROUND_LOCATION の付与に必要。
    expect(locationOptions().isIosBackgroundLocationEnabled).toBe(true);
    expect(locationOptions().isAndroidBackgroundLocationEnabled).toBe(true);
  });
});
