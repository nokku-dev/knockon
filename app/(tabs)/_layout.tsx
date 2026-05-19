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
    </Tabs>
  );
}
