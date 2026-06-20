import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChecklistItem } from './onboardingChecklist';
import {
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_LINE_BG,
  COLOR_OK,
  COLOR_SURFACE,
} from './tokens';

// 立ち上げチェックリスト (#165 / ADR-0042 P1) の表示コンポーネント。
//
// onboarding 直後の Today 上部に出すオンボ導線。表示判定 (onboarding 完了 / dismiss / 全達成) は
// 呼び出し側 (TodayScreen) が shouldShowOnboardingChecklist で行い、ここは「渡された items を
// 描画する」だけの presentational。
//
// トーン (DESIGN-SYSTEM §0 Celebrate 主 / マイナスを指差さない):
//   - 達成済みは ✓ (COLOR_OK) + 薄いラベル、未達は □ (faint) + 通常ラベル。
//   - 未達に赤 / 警告色 / 段階塗りを **使わない** (失われうる指標の強調を避ける、ADR-0036)。
//   - 「閉じる」で dismiss 可能 (一度閉じたら戻らない)。
export type OnboardingChecklistCardProps = {
  items: readonly ChecklistItem[];
  onDismiss: () => void;
};

export const OnboardingChecklistCard = ({
  items,
  onDismiss,
}: OnboardingChecklistCardProps) => {
  const doneCount = items.filter((i) => i.done).length;

  return (
    <View style={styles.container} testID="onboarding-checklist">
      <View style={styles.header}>
        <Text style={styles.title}>
          立ち上げチェックリスト ({doneCount}/{items.length})
        </Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="立ち上げチェックリストを閉じる"
          hitSlop={8}
          style={styles.closeBtn}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text
            style={[styles.mark, item.done ? styles.markDone : styles.markTodo]}
          >
            {item.done ? '✓' : '□'}
          </Text>
          <Text
            style={[styles.label, item.done && styles.labelDone]}
            accessibilityLabel={`${item.label}${item.done ? ' 達成済み' : ' まだ'}`}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  closeBtn: {
    paddingHorizontal: 4,
  },
  closeBtnText: {
    color: COLOR_FG_FAINT,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  mark: {
    width: 22,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  markDone: {
    color: COLOR_OK,
  },
  markTodo: {
    color: COLOR_LINE_BG,
  },
  label: {
    flex: 1,
    color: COLOR_FG,
    fontSize: 14,
  },
  labelDone: {
    color: COLOR_FG_FAINT,
  },
});
