import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';
import type { TemplateChain } from './templateChains';

// PR-Y1 (ADR-0023): builtin テンプレを選んで末尾追加するモーダル UI。
// 各カードに title + アクション一覧 (プレビュー) を表示、 タップで onSelect。
// 「閉じる」キャンセル。
export type TemplateChainPickerProps = {
  templates: ReadonlyArray<TemplateChain>;
  onSelect: (template: TemplateChain) => void;
  onCancel: () => void;
};

export const TemplateChainPicker = ({
  templates,
  onSelect,
  onCancel,
}: TemplateChainPickerProps) => (
  <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.topbar}>
      <Pressable onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancel}>キャンセル</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        テンプレから追加
      </Text>
      <View style={styles.topbarSpacer} />
    </View>
    <Text style={styles.hint}>
      選んだテンプレのアクションが末尾に追加されます (重複名も別アクションとして
      追加されます)。
    </Text>
    <ScrollView contentContainerStyle={styles.list}>
      {templates.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => onSelect(t)}
          accessibilityRole="button"
          accessibilityLabel={`テンプレ「${t.title}」を追加`}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>{t.title}</Text>
          <Text style={styles.cardActions} numberOfLines={3}>
            {t.actions.join(' / ')}
          </Text>
          <Text style={styles.cardMeta}>{t.actions.length} ノード</Text>
        </Pressable>
      ))}
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
  hint: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: { color: COLOR_FG, fontSize: 16, fontWeight: '700' },
  cardActions: { color: COLOR_FG_SOFT, fontSize: 13, lineHeight: 18 },
  cardMeta: { color: COLOR_GROW, fontSize: 11, fontWeight: '600', marginTop: 4 },
});
