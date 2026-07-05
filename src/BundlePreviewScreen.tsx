import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CategoryPreview } from './categoryDiscovery';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
} from './tokens';

// ADR-0039 (#155): カテゴリのアクションプレビュー (新カテゴリモデル)。
// genre / recommended を同じ flat なトグルリストで見せる (CategoryPreview に正規化済み)。
// 初期は全アイテム選択 (ADR-0039「カテゴリ選択時は初期全選択」)。外したいものを外して
// 「これで進む」で採用確認へ。recommended は順序つき・重複あり (item 単位トグル)。
// 旧 module アコーディオン (starter/additional) は廃止 (扉 = カテゴリに 1:1)。
export type BundlePreviewScreenProps = {
  preview: CategoryPreview;
  selectedKeys: Set<string>;
  selectedCount: number;
  onToggleItem: (key: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export const BundlePreviewScreen = ({
  preview,
  selectedKeys,
  selectedCount,
  onToggleItem,
  onBack,
  onNext,
}: BundlePreviewScreenProps) => (
  <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.topbar}>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>戻る</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {preview.category.name}
      </Text>
      <View style={styles.topbarSpacer} />
    </View>

    <ScrollView contentContainerStyle={styles.body}>
      {preview.items.map((item) => {
        const checked = selectedKeys.has(item.key);
        return (
          <Pressable
            key={item.key}
            onPress={() => onToggleItem(item.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={item.title}
            style={styles.itemRow}
          >
            <Text style={[styles.marker, checked && styles.markerOn]}>
              {checked ? '●' : '○'}
            </Text>
            <Text style={[styles.itemTitle, !checked && styles.itemTitleOff]}>
              {item.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>

    <View style={styles.footer}>
      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="採用確認へ進む"
        disabled={selectedCount === 0}
        style={[styles.nextBtn, selectedCount === 0 && styles.nextBtnDisabled]}
      >
        <Text style={styles.nextBtnText}>{selectedCount} 個でチェーンを作る</Text>
      </Pressable>
    </View>
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
  back: { color: COLOR_FG_SOFT, fontSize: 14 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  topbarSpacer: { width: 40 },
  body: { padding: 16, gap: 4 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  marker: { color: COLOR_FG_FAINT, fontSize: 14, width: 16, textAlign: 'center' },
  markerOn: { color: COLOR_GROW },
  itemTitle: { color: COLOR_FG, fontSize: 15, flex: 1 },
  itemTitleOff: { color: COLOR_FG_SOFT },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_LINE_BG,
  },
  nextBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLOR_BG, fontSize: 15, fontWeight: '700' },
});
