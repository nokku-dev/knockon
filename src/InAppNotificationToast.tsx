import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_SOFT,
  COLOR_SURFACE,
} from './tokens';

export type InAppNotificationToastProps = {
  title: string;
  body: string;
  onPress: () => void;
  onDismiss: () => void;
  // 自動消去までの ms (デフォルト 5 秒)。 0 以下なら自動消去なし。
  autoDismissMs?: number;
};

// foreground 中に通知を OS バナーで出すと URL deeplink との連動が分かりにくいため、
// 自前の in-app トーストで表示する (PR-1.5b-3 ユーザー判断)。
// 画面上部に絶対配置、 タップで onPress (deeplink へ)、 5 秒で自動消去 + Pan の代わりに
// シンプル fade-in / fade-out アニメ。
export const InAppNotificationToast = ({
  title,
  body,
  onPress,
  onDismiss,
  autoDismissMs = 5000,
}: InAppNotificationToastProps) => {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    if (autoDismissMs > 0) {
      const timer = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [opacity, translateY, autoDismissMs, onDismiss]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8 }, style]}
      accessibilityLiveRegion="polite"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`通知: ${title}。 タップで開く`}
        style={styles.toast}
      >
        <View style={styles.dot} />
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.body} numberOfLines={1}>
            {body}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // top は useSafeAreaInsets で動的に設定 (status bar / notch の下に配置)。
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLOR_SURFACE,
    // 自前の subtle shadow (DESIGN-SYSTEM 「影なし」だが foreground 通知の優先度
    // 表現として最小限。 OS Banner 相当の浮き感)
    elevation: 6,
    shadowColor: COLOR_BG,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR_ACCENT,
  },
  textCol: { flex: 1 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '700' },
  body: { color: COLOR_FG_SOFT, fontSize: 12, marginTop: 2 },
});
