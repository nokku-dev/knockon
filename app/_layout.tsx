import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSchema } from '../src/db';
import { getExpoSqliteClient } from '../src/db.expo';
import { InAppNotificationToast } from '../src/InAppNotificationToast';
import { syncAllNotifications } from '../src/notifications';
import { extractChainIdFromResponse } from '../src/notificationsDeeplink';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';

type ToastState = { chainId: string; title: string; body: string };

void SystemUI.setBackgroundColorAsync(COLOR_BG);

// foreground 中の通知は OS バナーも通知センターも出さず、 アプリ内 Toast 一本に
// (PR-1.5b-3 ユーザー判断)。 setNotificationHandler は foreground 受信時のみ
// 呼ばれるので、 background での通知挙動には影響しない。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const router = useRouter();
  // cold start で通知タップから起動された場合、 最後の response が取れる。
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ADR-0014: 起動時の自動シード投入は廃止。チェーン CRUD で自分で作る前提。
        // 初回起動時はチェーン 0 件の空状態で、Today / チェーン一覧の empty state
        // → 「+ 新規作成」誘導で開始する。
        const db = await getExpoSqliteClient();
        await initSchema(db);
        // 起動時に通知を全 active チェーンと整合させる (drift 解消の safety net、 PR-1.5b-2)。
        // 通知関係のエラーは起動を止めない (権限拒否や Expo SDK 制限の影響を分離)。
        await syncAllNotifications().catch(() => undefined);
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

  // PR-1.5b-3 通知タップ → Today ディープリンク。
  // (a) アプリ実行中 (foreground / background) に通知タップ → listener が拾う
  // (b) cold start (通知タップで起動) → useLastNotificationResponse が initial value で拾う
  // どちらも router.push で /(tabs) に遷移 + ?openChainId=... を渡して TodayScreen に
  // Bottom Sheet を自動 open させる。
  useEffect(() => {
    if (!ready) return;
    const chainId = extractChainIdFromResponse(lastResponse);
    if (chainId) {
      router.push({ pathname: '/(tabs)', params: { openChainId: chainId } });
    }
  }, [ready, lastResponse, router]);

  useEffect(() => {
    if (!ready) return;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const chainId = extractChainIdFromResponse(response);
        if (chainId) {
          router.push({
            pathname: '/(tabs)',
            params: { openChainId: chainId },
          });
        }
      },
    );
    return () => subscription.remove();
  }, [ready, router]);

  // foreground 中の通知受信を listen して in-app Toast 表示 (PR-1.5b-3 ユーザー判断)。
  // setNotificationHandler の shouldShowBanner=false だけだと Android で
  // channel importance に応じて OS バナーが出続けるケースがあるため、
  // 受信時に Notifications.dismissNotificationAsync で OS 通知を即時消去する。
  useEffect(() => {
    if (!ready) return;
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        if (data && typeof data === 'object' && typeof data.chainId === 'string') {
          setToast({
            chainId: data.chainId,
            title: notification.request.content.title ?? '',
            body: notification.request.content.body ?? '',
          });
        }
        // OS の heads-up / banner を出さないよう即時消去 (foreground 中のみ).
        void Notifications.dismissNotificationAsync(
          notification.request.identifier,
        ).catch(() => undefined);
      },
    );
    return () => subscription.remove();
  }, [ready]);

  return (
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
          <>
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
            {toast && (
              <InAppNotificationToast
                key={`${toast.chainId}-${toast.title}`}
                title={toast.title}
                body={toast.body}
                onPress={() => {
                  const targetChainId = toast.chainId;
                  setToast(null);
                  router.push({
                    pathname: '/(tabs)',
                    params: { openChainId: targetChainId },
                  });
                }}
                onDismiss={() => setToast(null)}
              />
            )}
          </>
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
