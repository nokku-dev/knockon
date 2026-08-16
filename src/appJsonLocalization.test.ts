import appJson from '../app.json';

// #288: App Store の「情報 > 言語」が **英語のみ** になっていた。
//
// 掲載情報（説明文・キーワード）は全文日本語、アプリ UI も日本語なのに、バンドル側の
// ローカライズ宣言が無く `CFBundleDevelopmentRegion` が既定の `$(DEVELOPMENT_LANGUAGE)`
// （= en）だったため、ストアが「英語アプリ」として表示していた。
// ストアの絞り込み・検索で日本語対応として扱われず、日本語の説明文を読んだユーザーが
// 「言語: 英語」で離脱する導線になっていた。
//
// ⚠ ここは `ios/` を直接触れない（Expo managed workflow / ADR-0007）ので app.json 経由。
// prebuild は毎回 `ios/` を再生成するため、**app.json に無い設定は消える**。
// K-006（ハードガードレールのテスト固定）/ appJsonIcon.test.ts / appJsonLocationPlugin.test.ts
// と同じ手口で機械固定する。
//
// ⚠ **`en` は宣言しない。** このアプリに英語 UI は一切無い（全文字列が日本語）。
// 英語対応を謳うと #291（実装していないジオフェンスを謳っていた）と同型の
// 「していないことを宣言する」状態になる。宣言は実態に一致させる。

const infoPlist = appJson.expo.ios.infoPlist as Record<string, unknown>;

describe('app.json のローカライズ宣言 (#288)', () => {
  test('CFBundleLocalizations が日本語のみを宣言している', () => {
    expect(infoPlist.CFBundleLocalizations).toEqual(['ja']);
  });

  test('CFBundleDevelopmentRegion が ja', () => {
    // 既定の `$(DEVELOPMENT_LANGUAGE)` は en に解決される。主言語を日本語にする。
    expect(infoPlist.CFBundleDevelopmentRegion).toBe('ja');
  });

  test('英語を宣言していない (実態に無い対応言語を謳わない)', () => {
    const locales = infoPlist.CFBundleLocalizations as string[];
    expect(locales).not.toContain('en');
    expect(infoPlist.CFBundleDevelopmentRegion).not.toBe('en');
  });

  test('既存の infoPlist 設定を壊していない', () => {
    // #288 の変更で ITSAppUsesNonExemptEncryption が落ちると輸出コンプライアンスの
    // 申告が変わる（app-store-submission.md §1.3）。同居していることを固定する。
    expect(infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});
