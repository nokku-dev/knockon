import { readFileSync } from 'fs';
import { join } from 'path';

// Issue #236 / 提案 #228 §5 Expo 統合段階:
// `eas build --profile preview --platform ios` が警告なしで通ることを検証するには
// eas.json の `build.preview.ios` が定義されている必要がある (未定義だと
// EAS が platform 設定なしで reject する)。
// Apple Developer 未加入で preview を回すため simulator=true でロックする
// (実 iOS 端末での配布は production + submit 経路で行う、playbook §2 参照)。

describe('eas.json build.preview.ios', () => {
  const easJson = JSON.parse(
    readFileSync(join(__dirname, '..', 'eas.json'), 'utf8'),
  ) as {
    build?: {
      preview?: {
        ios?: { simulator?: boolean };
      };
    };
  };

  test('build.preview.ios が定義されている (iOS preview build を有効化)', () => {
    expect(easJson.build?.preview?.ios).toBeDefined();
  });

  test('build.preview.ios.simulator が true (Apple Developer 不要の Simulator ビルド)', () => {
    expect(easJson.build?.preview?.ios?.simulator).toBe(true);
  });
});
