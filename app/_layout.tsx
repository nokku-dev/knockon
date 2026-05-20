import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSchema } from '../src/db';
import { getExpoSqliteClient } from '../src/db.expo';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';

void SystemUI.setBackgroundColorAsync(COLOR_BG);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ADR-0014: 起動時の自動シード投入は廃止。チェーン CRUD で自分で作る前提。
        // 初回起動時はチェーン 0 件の空状態で、Today / チェーン一覧の empty state
        // → 「+ 新規作成」誘導で開始する。
        const db = await getExpoSqliteClient();
        await initSchema(db);
        if (!cancelled) setReady(true);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    // GestureHandlerRootView は react-native-draggable-flatlist が要求 (ChainEditScreen
    // のノード DnD)。expo-router で暗黙ラップされるとされるが明示する方が確実。
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
      <StatusBar style="light" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLOR_BG },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chain/new"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="chain/[chainId]"
            options={{ presentation: 'modal' }}
          />
        </Stack>
      )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    color: COLOR_ACCENT,
    padding: 24,
  },
});
