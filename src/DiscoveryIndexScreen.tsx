import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goalLabel, momentLabel } from './discoveryLabels';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';

// #70b (#70/#71 SPEC §4): discovery 索引。2 つの扉 + おまかせ。
// - 状態ゴール扉 (既定・主導線): 「いつを良くしたい?」→ moment (朝/夜)。
// - 成果ゴール扉: 「何を達成したい?」→ goal で横断フィルタ。
// - おまかせ: 目的の無い人向けの底 (既定 moment に着地)。
export type DiscoveryIndexScreenProps = {
  moments: string[];
  goals: string[];
  onOpenMoment: (moment: string) => void;
  onOpenGoal: (goal: string) => void;
  onOpenOmakase: () => void;
  onCancel: () => void;
};

export const DiscoveryIndexScreen = ({
  moments,
  goals,
  onOpenMoment,
  onOpenGoal,
  onOpenOmakase,
  onCancel,
}: DiscoveryIndexScreenProps) => (
  <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.topbar}>
      <Pressable onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancel}>キャンセル</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        テンプレから始める
      </Text>
      <View style={styles.topbarSpacer} />
    </View>

    <ScrollView contentContainerStyle={styles.body}>
      {/* 状態ゴール扉 — 主導線 */}
      <Text style={styles.sectionLabel}>いつを良くしたい?</Text>
      <View style={styles.chipRow}>
        {moments.map((m) => (
          <Pressable
            key={m}
            onPress={() => onOpenMoment(m)}
            accessibilityRole="button"
            accessibilityLabel={`${momentLabel(m)}の束を見る`}
            style={styles.momentChip}
          >
            <Text style={styles.momentChipText}>{momentLabel(m)}</Text>
          </Pressable>
        ))}
      </View>

      {/* おまかせ — 目的の無い人向けの底 */}
      <Pressable
        onPress={onOpenOmakase}
        accessibilityRole="button"
        accessibilityLabel="おまかせの束を見る"
        style={styles.omakaseCard}
      >
        <Text style={styles.omakaseTitle}>おまかせ</Text>
        <Text style={styles.omakaseHint}>迷ったらこれ。定番の朝の束から始める。</Text>
      </Pressable>

      {/* 成果ゴール扉 — 横断軸 */}
      <Text style={[styles.sectionLabel, styles.sectionLabelGap]}>
        何を達成したい?
      </Text>
      <View style={styles.chipRow}>
        {goals.map((g) => (
          <Pressable
            key={g}
            onPress={() => onOpenGoal(g)}
            accessibilityRole="button"
            accessibilityLabel={`${goalLabel(g)}の束を見る`}
            style={styles.goalChip}
          >
            <Text style={styles.goalChipText}>{goalLabel(g)}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancel: { color: COLOR_FG_SOFT, fontSize: 14 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  topbarSpacer: { width: 56 },
  body: { padding: 16, gap: 12 },
  sectionLabel: { color: COLOR_FG_SOFT, fontSize: 13, fontWeight: '600' },
  sectionLabelGap: { marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  momentChip: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
  },
  momentChipText: { color: COLOR_BG, fontSize: 16, fontWeight: '700' },
  omakaseCard: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    minHeight: 44,
  },
  omakaseTitle: { color: COLOR_FG, fontSize: 16, fontWeight: '700' },
  omakaseHint: { color: COLOR_FG_FAINT, fontSize: 12 },
  goalChip: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
  },
  goalChipText: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
});
