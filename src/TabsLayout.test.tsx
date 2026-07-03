import { render } from '@testing-library/react-native';

// #194: 分析 (ログ) タブをリリーススコープから除外する。
// タブバーからは非表示 (href: null) にしつつ、ルート/コード自体は残す
// (Today が analyticsDerivation を共有 / 出荷後に無移行で再有効化できる、ADR-0045)。
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

  it('分析 (ログ) タブは href: null でタブバーから非表示', () => {
    const analytics = screenCalls.find((c) => c.name === 'analytics');
    expect(analytics).toBeDefined();
    expect(analytics?.options?.href).toBeNull();
  });

  it('Today / チェーン / 研究 タブは可視 (href を潰さない)', () => {
    for (const name of ['index', 'chains', 'research']) {
      const opts = optionsFor(name);
      expect(opts).toBeDefined();
      expect(opts?.href).toBeUndefined();
    }
  });
});
