import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { OnboardingScreen } from '../src/OnboardingScreen';
import { COLOR_ACCENT, COLOR_BG, COLOR_FG } from '../src/tokens';
import { useOnboarding } from '../src/useOnboarding';

// #72 (SPEC §5): onboarding (初回ルート)。状態ゴール扉だけを通る 7 ステップ。
// 状態は useOnboarding が保持し、本 route はナビゲーション (完了 → Today) を配線する。
export default function OnboardingRoute() {
  const router = useRouter();
  const o = useOnboarding();

  // 完了 → Today (tabs) に置き換え遷移 (戻るで onboarding に戻らない)。
  const goToday = (params?: { openChainId: string }) => {
    router.replace({ pathname: '/(tabs)', params });
  };

  const handleFinish = async () => {
    await o.complete();
    goToday();
  };

  const handleTryNow = async () => {
    await o.complete();
    // 1 本目を開いて「今すぐ 1 回試す」(Today 常時表示 = 通知に依存せず実行できる)。
    goToday(o.firstChainId ? { openChainId: o.firstChainId } : undefined);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {o.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : (
        <OnboardingScreen
          step={o.step}
          firstMoment={o.firstMoment}
          time={o.time}
          previewItems={o.previewItems}
          selectedKeys={o.selectedKeys}
          onToggleItem={o.toggleItem}
          secondMoment={o.secondMoment}
          adoptedTimes={o.adoptedTimes}
          notifyDecided={o.notifyDecided}
          adopting={o.adopting}
          onBack={o.back}
          onStart={o.start}
          onSelectMoment={o.selectMoment}
          onChangeTime={o.changeTime}
          onConfirmTime={o.confirmTime}
          onAdoptFirst={() => o.adoptFirst(new Date().toISOString())}
          onAddSecond={() => o.addSecond(new Date().toISOString())}
          onSkipSecond={o.skipSecond}
          onRequestNotify={o.requestNotify}
          onSkipNotify={o.skipNotify}
          onFinish={handleFinish}
          onTryNow={handleTryNow}
        />
      )}
      {o.error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{o.error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    backgroundColor: COLOR_BG,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_ACCENT,
  },
  bannerText: { color: COLOR_ACCENT, fontSize: 12 },
});
