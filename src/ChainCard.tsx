import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Anchor, Chain } from './domain';
import { ProgressRing } from './ProgressRing';
import {
  COLOR_ACCENT,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// Today の折りたたみカード (PR-X / ADR-0021)。 タップで Bottom Sheet を開く。
// 表示: タイトル + 発火中ピル (発火時のみ) + 円グラフ + N/M 文字。
// 100% 達成は ✓ バッジに切替えて達成感を強調。
export type ChainCardProps = {
  chain: Chain;
  anchor: Anchor;
  // 当日 Today に並んでいる fire ノードの達成数 (kind='skip' は除外)。
  fireTotal: number;
  fireCompleted: number;
  anchorFiredToday: boolean;
  onPress: () => void;
};

export const ChainCard = ({
  chain,
  anchor,
  fireTotal,
  fireCompleted,
  anchorFiredToday,
  onPress,
}: ChainCardProps) => {
  const done = fireTotal > 0 && fireCompleted === fireTotal;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${chain.title} を開く (${fireCompleted}/${fireTotal} 完了)`}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {chain.title}
        </Text>
        {done ? (
          <View style={styles.doneBadge} accessibilityLabel="達成">
            <Text style={styles.doneBadgeText}>✓ 達成</Text>
          </View>
        ) : (
          <ProgressRing total={fireTotal} completed={fireCompleted} />
        )}
      </View>
      <View style={styles.metaRow}>
        {anchorFiredToday && anchor.kind === 'time' && anchor.time && (
          <View style={styles.firingPill}>
            <View style={styles.firingDot} />
            <Text style={styles.firingPillText}>{anchor.time} 発火中</Text>
          </View>
        )}
        {anchorFiredToday && anchor.kind === 'place' && (
          <View style={styles.firingPill}>
            <View style={styles.firingDot} />
            <Text style={styles.firingPillText}>範囲内 発火中</Text>
          </View>
        )}
        {!anchorFiredToday && anchor.kind === 'time' && anchor.time && (
          <Text style={styles.metaText}>⏰ {anchor.time}</Text>
        )}
        {!anchorFiredToday &&
          anchor.kind === 'place' &&
          anchor.radiusMeters != null && (
            <Text style={styles.metaText}>📍 {anchor.radiusMeters}m</Text>
          )}
        {anchor.kind === 'behavior' && (
          <Text style={styles.metaText}>アンカーなし</Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: COLOR_FG,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  doneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  doneBadgeText: {
    color: COLOR_SURFACE,
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  firingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  firingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_ACCENT,
  },
  firingPillText: {
    color: COLOR_ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  metaText: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
