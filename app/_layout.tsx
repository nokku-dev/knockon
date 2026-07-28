import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSchema } from '../src/db';
import { getExpoSqliteClient } from '../src/db.expo';
import {
  isScreenshotDataSeeded,
  seedScreenshotData,
} from '../src/screenshotSeed';
import { InAppNotificationToast } from '../src/InAppNotificationToast';
import { syncAllNotifications } from '../src/notifications';
import { extractChainIdFromResponse } from '../src/notificationsDeeplink';
import {
  DEFAULT_THEME_MODE,
  getAppSettings,
  ThemeMode,
  updateAppSettings,
} from '../src/settingsRepository';
import { paletteFor, resolveColorScheme } from '../src/theme';
import { ThemeProvider } from '../src/themeContext';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';

type ToastState = { chainId: string; title: string; body: string };

// スクショ用ダミーデータの投入フラグ (dev 専用)。true にして起動すると、
// Today / チェーン / ログ / メトリクスが映えるサンプルデータを 1 度だけ投入する。
// 出荷ビルド前に必ず false に戻すこと (ADR-0014: 本番は自動 seed しない)。
const SEED_SCREENSHOT_DATA = true;

// ADR-0029 (Issue #53): 起動初期 (= settings DB 読み込み前) の native root bg は
// 既存挙動の COLOR_BG (dark) で塗る。 読み込み完了後に themeMode に応じた色で
// 上書きする (= useEffect 経由)。
void SystemUI.setBackgroundColorAsync(COLOR_BG);

// foreground 中の通知は OS バナーも通知センターも出さず、 アプリ内 Toast 一本に
// (PR-1.5b-3 ユーザー判断)。 setNotificationHandler は foreground 受信時のみ
// 呼ばれるので、 background での通知挙動には影響しない。
//
// PR-BB (ADR-0025) 例外: タイマー完了通知 (data.kind === 'timer-complete') は
// foreground 中も音を鳴らす (= タイマー画面のアラーム要件)。 K-026 (handler の
// 個別 sound 指定は global handler が勝つ) を回避するための分岐。
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isTimer =
      (notification.request.content.data as { kind?: string } | null)?.kind ===
      'timer-complete';
    return {
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: isTimer,
      shouldSetBadge: false,
    };
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [themeMode, setThemeModeState] =
    useState<ThemeMode>(DEFAULT_THEME_MODE);
  // #72 (SPEC §5): 初回ルート判定。app_settings.onboarding_completed=false の
  // 新規ユーザーだけ /onboarding へ誘導する。既存ユーザーは MIGRATIONS[8] で true 初期化。
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const router = useRouter();
  // cold start で通知タップから起動された場合、 最後の response が取れる。
  const lastResponse = Notifications.useLastNotificationResponse();
  // ADR-0029 (Issue #53): OS の colorScheme を購読 (reactive)。 themeMode='auto' のとき
  // OS 設定変更時にリアルタイムで再描画する。 RN の useColorScheme は内部で Appearance
  // change を listen する。
  const osScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ADR-0014: 起動時の自動シード投入は廃止。チェーン CRUD で自分で作る前提。
        // 初回起動時はチェーン 0 件の空状態で、Today / チェーン一覧の empty state
        // → 「+ 新規作成」誘導で開始する。
        const db = await getExpoSqliteClient();
        await initSchema(db);
        // スクショ用ダミーデータ投入 (dev 専用・出荷時は false に戻す)。
        // 初回だけ投入し、以降のホットリロード/再起動では既存を保つ (タップが消えない)。
        // 撮り直したいときは一度アプリのデータ削除 or フラグを false→true で再起動。
        if (SEED_SCREENSHOT_DATA && !(await isScreenshotDataSeeded(db))) {
          await seedScreenshotData(db);
        }
        // ADR-0029: themeMode を初回読み込み。 既存ユーザーは MIGRATIONS[6] で
        // default 'auto' になっている。 失敗しても起動は止めない (= silent fallback)。
        // 取得失敗時は onboardingCompleted=true 扱い (= 既存ユーザーを onboarding に
        // 閉じ込めない安全側 fallback)。
        const settings = await getAppSettings(db).catch(
          (): { themeMode: ThemeMode; onboardingCompleted: boolean } => ({
            themeMode: DEFAULT_THEME_MODE,
            onboardingCompleted: true,
          }),
        );
        if (!cancelled) {
          setThemeModeState(settings.themeMode);
          setNeedsOnboarding(!settings.onboardingCompleted);
        }
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

  // ADR-0029 follow-up (2026-07-07): Light テーマは ~27 画面が dark トークンを
  // ハードコードしており未対応 (段階移行が未完)。 デザインレビュー中は Dark 固定にする
  // (テーマ選択 UI も SettingsModal で非表示)。 移行完了時にこのフラグを false に戻せば
  // themeMode / OS 追従が復活する (完全に reversible)。
  const FORCE_DARK_FOR_REVIEW = true;
  const effectiveThemeMode: ThemeMode = FORCE_DARK_FOR_REVIEW ? 'dark' : themeMode;
  // ADR-0029: themeMode + OS scheme から palette を派生 → native root bg を反映。
  const resolvedScheme = resolveColorScheme(effectiveThemeMode, osScheme);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(paletteFor(resolvedScheme).bg);
  }, [resolvedScheme]);

  // ADR-0029: themeMode を更新 (DB 書き込み + ローカル state). 楽観更新ではなく
  // DB 完了後に state を更新する (= UI 上の picker 選択は SettingsModal 側のローカル
  // state で即時 feedback されるため、 ここの順序ずれは UX 影響が小さい)。
  const handleSetThemeMode = useCallback(async (next: ThemeMode) => {
    const db = await getExpoSqliteClient();
    await updateAppSettings(db, { themeMode: next });
    setThemeModeState(next);
  }, []);

  // #72: 新規ユーザーは onboarding へ誘導 (ready 後に 1 回だけ)。onboarding 完了で
  // complete() が onboarding_completed=true を書き、/(tabs) に replace 遷移する。
  useEffect(() => {
    if (!ready || !needsOnboarding) return;
    router.replace('/onboarding');
  }, [ready, needsOnboarding, router]);

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

  // ADR-0029: StatusBar の文字色は resolved scheme に追従 ('light' bg → 'dark' icons)。
  return (
    <ThemeProvider
      themeMode={effectiveThemeMode}
      osScheme={osScheme}
      setThemeMode={handleSetThemeMode}
    >
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={styles.root}>
          <StatusBar style={resolvedScheme === 'light' ? 'dark' : 'light'} />
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
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
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
    </ThemeProvider>
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
