import { render } from '@testing-library/react-native';

// ADR-0047: ログタブを定着ポートフォリオへ組み替え、 リリーススコープに復帰
// (#194 / ADR-0045 の href: null 非表示を反転)。 4 タブ (Today / チェーン / ログ / 研究)
// すべて可視であることを機械検証する。
// expo-router の Tabs.Screen に渡る props を記録して可視/非表示を機械検証する。

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => {
  const React = require('react');
  const calls: Array<{ name: string; options?: { href?: unknown } }> = [];
  const Tabs: any = ({ children }: any) =>
    React.createElement(React.Fragment, null, children);
  Tabs.Screen = (props: any) => {
    calls.push(props);
    return null;
  };
  return { Tabs, __screenCalls: calls };
});

// eslint-disable-next-line import/first
import * as ExpoRouter from 'expo-router';
// eslint-disable-next-line import/first
import TabsLayout from '../app/(tabs)/_layout';

const screenCalls = (ExpoRouter as unknown as {
  __screenCalls: Array<{ name: string; options?: { href?: unknown } }>;
}).__screenCalls;

function optionsFor(name: string) {
  return screenCalls.find((c) => c.name === name)?.options;
}

describe('TabsLayout タブ可視性 (#194)', () => {
  beforeEach(() => {
    screenCalls.length = 0;
    render(<TabsLayout />);
  });

  it('ログ (分析) タブは可視に復帰 (ADR-0047 で href: null を撤去)', () => {
    const analytics = screenCalls.find((c) => c.name === 'analytics');
    expect(analytics).toBeDefined();
    expect(analytics?.options?.href).toBeUndefined();
  });

  it('Today / チェーン / ログ / 研究 の 4 タブすべて可視 (href を潰さない)', () => {
    for (const name of ['index', 'chains', 'analytics', 'research']) {
      const opts = optionsFor(name);
      expect(opts).toBeDefined();
      expect(opts?.href).toBeUndefined();
    }
  });
});
