import appJson from '../app.json';

import { PRODUCT_NAME } from './productName';

// ADR-0056: 表示名は Title Case (`Knockon`)。
// app.json の expo.name (ホーム画面のアイコン名 / Android app_name) と、コード内で
// 使う PRODUCT_NAME は **同じ文字列**でなければならない。片方だけ変わると
// 「アイコンは Knockon なのに通知は knockon」のような不一致が出る。
describe('プロダクト表示名 (ADR-0056)', () => {
  test('PRODUCT_NAME が Title Case', () => {
    expect(PRODUCT_NAME).toBe('Knockon');
  });

  test('app.json の expo.name と一致する (二重 truth source を値で担保)', () => {
    expect(appJson.expo.name).toBe(PRODUCT_NAME);
  });

  test('⚠ slug / bundleIdentifier は小文字のまま (user-facing ではない)', () => {
    // ADR-0056 §決定3: リポジトリ名 / slug / バンドル ID / コード識別子は knockon。
    // 表示名を変えたついでにこれらを大文字化すると、EAS プロジェクトの同一性や
    // App Store のバンドル ID が壊れる。
    expect(appJson.expo.slug).toBe('knockon');
    expect(appJson.expo.ios.bundleIdentifier).toBe('co.nokku.knockon');
    expect(appJson.expo.android.package).toBe('co.nokku.knockon');
  });
});
