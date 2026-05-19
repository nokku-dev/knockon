import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSchema } from '../src/db';
import { getExpoSqliteClient } from '../src/db.expo';
import { shouldSeed } from '../src/domain';
import { listChains } from '../src/repository';
import { buildPersonalChainSeed, seed } from '../src/seed';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';

void SystemUI.setBackgroundColorAsync(COLOR_BG);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getExpoSqliteClient();
        await initSchema(db);
        const existing = await listChains(db, 'active');
        if (shouldSeed(existing)) {
          await seed(db, buildPersonalChainSeed());
        }
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
            name="anchor/[chainId]"
            options={{ presentation: 'modal' }}
          />
        </Stack>
      )}
    </SafeAreaProvider>
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
