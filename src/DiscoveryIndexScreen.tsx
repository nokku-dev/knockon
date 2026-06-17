import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Category } from './domain';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_SURFACE,
} from './tokens';

// ADR-0039 (#155): discovery 索引 (新カテゴリモデル)。
// - おすすめ (朝/夜): 完成ルーティン束。順序つきで全ノードが入る雛形。
// - ジャンル別カテゴリ (9): 個別アクションを genre で探す。
// 旧 moment/goal 扉・おまかせは廃止 (おすすめが役割を継ぐ)。
export type DiscoveryIndexScreenProps = {
  recommendedCategories: Category[];
  genreCategories: Category[];
  onOpenCategory: (category: Category) => void;
  onCancel: () => void;
};

export const DiscoveryIndexScreen = ({
  recommendedCategories,
  genreCategories,
  onOpenCategory,
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
      {/* おすすめ — 完成ルーティン束 (主導線) */}
      <Text style={styles.sectionLabel}>おすすめ</Text>
      {recommendedCategories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onOpenCategory(c)}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}を見る`}
          style={styles.recommendCard}
        >
          {/* a11y: 色ストライプは名前ラベル併用で色のみ依存を避ける (#74 で仕上げ) */}
          <View style={[styles.stripe, { backgroundColor: c.color }]} />
          <View style={styles.recommendText}>
            <Text style={styles.recommendTitle}>{c.name}</Text>
            <Text style={styles.recommendHint}>
              そのまま使える順序つきのルーティン
            </Text>
          </View>
        </Pressable>
      ))}

      {/* ジャンル別カテゴリ — 個別アクションを genre で探す */}
      <Text style={[styles.sectionLabel, styles.sectionLabelGap]}>
        ジャンルから選ぶ
      </Text>
      <View style={styles.chipRow}>
        {genreCategories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onOpenCategory(c)}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}を見る`}
            style={styles.genreChip}
          >
            <View
              style={[styles.chipDot, { backgroundColor: c.color }]}
            />
            <Text style={styles.genreChipText}>{c.name}</Text>
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
  recommendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    minHeight: 44,
  },
  stripe: { width: 4, height: 36, borderRadius: 2 },
  recommendText: { flex: 1, gap: 2 },
  recommendTitle: { color: COLOR_FG, fontSize: 16, fontWeight: '700' },
  recommendHint: { color: COLOR_FG_FAINT, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  genreChipText: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
});
