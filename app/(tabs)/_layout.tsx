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
          // ADR-0047: ログタブを定着ポートフォリオへ組み替え、 リリーススコープに復帰
          // (#194 / ADR-0045 の `href: null` 非表示を反転)。 達成率 (= 比率) から
          // 「定着 N・育成中 M」+ ステージ別一覧に変えたことでリリースに載せる価値が生まれた。
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
