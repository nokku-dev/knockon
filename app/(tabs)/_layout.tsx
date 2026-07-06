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
          // ADR-0049: 研究 (メモ) タブをリリーススコープから除外 (href: null で非表示)。
          // 自動インサイトは未実装で、 手動メモ一覧はコア体験 (If-Then チェーン + Today) の
          // 外側のため、 ミニマルリリースに絞る (ADR-0045 と同型の非破壊・無移行の隠し)。
          // ルート/画面コード・notes データモデルは残す。 Today 長押しのメモ作成も残る
          // (書けるが一覧は再有効化まで見えない)。 出荷後は href: null を外す 1 行で復帰。
          href: null,
          title: '研究',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bulb-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
