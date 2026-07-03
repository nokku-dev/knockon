import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_LINE_BG,
} from '../../src/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLOR_BG,
          borderTopColor: COLOR_LINE_BG,
          borderTopWidth: 0.5,
        },
        tabBarActiveTintColor: COLOR_FG,
        tabBarInactiveTintColor: COLOR_FG_FAINT,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chains"
        options={{
          title: 'チェーン',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="link-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          // #194 (ADR-0045): 分析 (ログ) タブをリリーススコープから除外し、
          // ミニマルリリースに絞る。 href: null でタブバーから非表示にしつつ、
          // ルート/コード自体は残す (Today が analyticsDerivation を共有 /
          // 出荷後に無移行で再有効化できる)。 ADR-0024 の分析取り込みを部分的に覆す。
          href: null,
          // #175 (PR-A): 「分析」→「ログ」リネーム時のラベル。 再有効化時に使う。
          title: 'ログ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="research"
        options={{
          // #175 (PR-A): 研究タブ新設。 当面は固定文言の空スケルトン。
          title: '研究',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bulb-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
