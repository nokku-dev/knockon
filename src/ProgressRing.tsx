import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { COLOR_FG, COLOR_FG_FAINT, COLOR_GROW, COLOR_LINE_BG } from './tokens';

// 円グラフで進捗を表示する小コンポーネント (PR-X / ADR-0021)。
// 中央に N/M テキスト、 円周は --grow の弧で達成率分塗る。 残りは --line-bg。
// 100% 達成は ChainCard 側で ✓ バッジに切替えるため、 本コンポーネント自体は
// 0/M〜M/M を一律で描く (M=0 のときは empty 円のみ)。
export type ProgressRingProps = {
  total: number;
  completed: number;
  size?: number;
  strokeWidth?: number;
};

export const ProgressRing = ({
  total,
  completed,
  size = 36,
  strokeWidth = 3,
}: ProgressRingProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      accessibilityLabel={`進捗 ${completed}/${total}`}
    >
      <Svg width={size} height={size}>
        {/* 背景の灰色リング */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLOR_LINE_BG}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* 達成率分の --grow 弧。 上 (12 時) からスタートして時計回り。 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLOR_GROW}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          // 上 (12 時) を 0% 位置にするため -90deg 回転
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.textWrap} pointerEvents="none">
        <Text
          style={[
            styles.text,
            { color: ratio > 0 ? COLOR_FG : COLOR_FG_FAINT },
          ]}
        >
          {completed}/{total}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
