import appJson from '../app.json';

// Issue #234 / 提案 #228: app.json のアイコン系フィールドを機械的に固定する。
// K-006 (ハードガードレールのテスト固定) と同じ精神で、 EAS Build が
// iOS/Android アイコンを生成するために必要な設定が欠落・改名されないことを CI で守る。
//
// PNG 実体の存在・寸法・alpha 有無は Issue #233 (src/appIconPng.test.ts) 側で担保する。
// 本ファイルは app.json の参照パスと backgroundColor のみを対象とする。

describe('app.json アイコン設定 (Issue #234)', () => {
  const expo = appJson.expo;

  test('expo.icon が assets/icon.png を指している', () => {
    expect(expo.icon).toBe('./assets/icon.png');
  });

  test('expo.ios.icon が assets/icon.png を指している', () => {
    expect(expo.ios.icon).toBe('./assets/icon.png');
  });

  test('expo.android.adaptiveIcon.foregroundImage が assets/adaptive-icon.png を指している', () => {
    expect(expo.android.adaptiveIcon.foregroundImage).toBe(
      './assets/adaptive-icon.png'
    );
  });

  test('expo.android.adaptiveIcon.backgroundColor が --bg (#16161A) と一致する', () => {
    // DESIGN-SYSTEM.md §1 の `--bg` (Dark 既定) と揃える (提案 #228 §4)。
    // 単色 bg アイコン + backgroundColor 一致で Superellipse / adaptive マスクでも
    // 境界が浮かない。
    expect(expo.android.adaptiveIcon.backgroundColor).toBe('#16161A');
  });
});
