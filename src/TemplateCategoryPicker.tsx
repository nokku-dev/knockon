import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  buildGenrePreview,
  buildRecommendedPreview,
} from './categoryDiscovery';
import type { CategoryPreview } from './categoryDiscovery';
import type { CatalogAction, Category, RecommendedItem } from './domain';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// #168 (#155 follow-up): チェーン編集の「+ テンプレから追加」picker (新カテゴリモデル)。
// 旧 TemplateChainPicker (BUILTIN_TEMPLATE_CHAINS) を置換。
//
// 2-step フロー:
//   step 1 = 索引 (recommended カード + genre チップ)
//   step 2 = カテゴリ内アクション個別選択 (初期全選択・トグル可・「N件を追加」)
//
// onSelect は step 2 の「追加」でのみ呼ばれる。アイテムは表示順 (genre = position
// 昇順 / recommended = item position 昇順、重複保持) で渡り、 actionTitle と
// timerSeconds (catalog 由来) を保持する。 useChainEdit 側でこの配列をそのまま
// 新規 Action + Node として末尾追加する (= 旧テンプレ取り込みのセマンティクスを継承)。

export type TemplateCategoryPickerItem = {
  actionTitle: string;
  timerSeconds: number | null;
};

export type TemplateCategoryPickerProps = {
  recommendedCategories: readonly Category[];
  genreCategories: readonly Category[];
  actions: readonly CatalogAction[];
  recommendedItems: readonly RecommendedItem[];
  onSelect: (items: ReadonlyArray<TemplateCategoryPickerItem>) => void;
  onCancel: () => void;
};

export const TemplateCategoryPicker = ({
  recommendedCategories,
  genreCategories,
  actions,
  recommendedItems,
  onSelect,
  onCancel,
}: TemplateCategoryPickerProps) => {
  // 開いているカテゴリ (null = step 1 表示)。
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  // 選択キー集合 (= CategoryPreview.items[i].key)。 同 actionId の重複参照 (recommended)
  // を扱うため title ではなく key (= genre:actionId / recommended:item.id) で持つ。
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // door (= openCategory) からプレビューを導出する純粋計算 (useDiscovery と同型)。
  const preview = useMemo<CategoryPreview | null>(() => {
    if (!openCategory) return null;
    return openCategory.type === 'recommended'
      ? buildRecommendedPreview(openCategory, recommendedItems, actions)
      : buildGenrePreview(openCategory, actions);
  }, [openCategory, actions, recommendedItems]);

  const openStep2 = useCallback(
    (category: Category) => {
      // 初期は全アイテム選択 (ADR-0039「カテゴリ選択時は初期全選択」)。
      const next =
        category.type === 'recommended'
          ? buildRecommendedPreview(category, recommendedItems, actions)
          : buildGenrePreview(category, actions);
      setSelectedKeys(new Set(next.items.map((i) => i.key)));
      setOpenCategory(category);
    },
    [actions, recommendedItems],
  );

  const backToStep1 = useCallback(() => {
    setOpenCategory(null);
    setSelectedKeys(new Set());
  }, []);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!preview) return;
    setSelectedKeys(new Set(preview.items.map((i) => i.key)));
  }, [preview]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const selectedItems = useMemo<ReadonlyArray<TemplateCategoryPickerItem>>(() => {
    if (!preview) return [];
    return preview.items
      .filter((i) => selectedKeys.has(i.key))
      .map((i) => ({
        actionTitle: i.title,
        timerSeconds: i.timerSeconds,
      }));
  }, [preview, selectedKeys]);

  const handleSubmit = useCallback(() => {
    if (selectedItems.length === 0) return;
    onSelect(selectedItems);
  }, [selectedItems, onSelect]);

  if (openCategory == null || preview == null) {
    return (
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
          カテゴリを開いて、追加したいアクションだけを選べます。
        </Text>
        <ScrollView contentContainerStyle={styles.body}>
          {recommendedCategories.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>おすすめ</Text>
              {recommendedCategories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => openStep2(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`カテゴリ「${c.name}」を開く`}
                  style={styles.recommendCard}
                >
                  {/* a11y: 色ストライプはラベル併用で色のみ依存を避ける (#74 と同型) */}
                  <View style={[styles.stripe, { backgroundColor: c.color }]} />
                  <View style={styles.recommendText}>
                    <Text style={styles.recommendTitle}>{c.name}</Text>
                    <Text style={styles.recommendHint}>
                      そのまま使える順序つきのアクション集
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
          {genreCategories.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelGap]}>
                ジャンルから選ぶ
              </Text>
              <View style={styles.chipRow}>
                {genreCategories.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => openStep2(c)}
                    accessibilityRole="button"
                    accessibilityLabel={`カテゴリ「${c.name}」を開く`}
                    style={styles.genreChip}
                  >
                    <View
                      style={[styles.chipDot, { backgroundColor: c.color }]}
                    />
                    <Text style={styles.genreChipText}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== Step 2: アクション個別選択 =====
  const allSelected = selectedKeys.size === preview.items.length;
  const toggleAllLabel = allSelected ? '全解除' : '全選択';
  const submitLabel = `${selectedItems.length}件を追加`;
  const submitDisabled = selectedItems.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <Pressable
          onPress={backToStep1}
          accessibilityRole="button"
          accessibilityLabel="カテゴリ一覧に戻る"
        >
          <Text style={styles.cancel}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {preview.category.name}
        </Text>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
      </View>
      <View style={styles.step2Subbar}>
        <Text style={styles.hint}>
          追加したいアクションを選んでください。
        </Text>
        <Pressable
          onPress={allSelected ? deselectAll : selectAll}
          accessibilityRole="button"
          accessibilityLabel={toggleAllLabel}
          hitSlop={8}
        >
          <Text style={styles.toggleAllText}>{toggleAllLabel}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.actionList}>
        {preview.items.map((item) => {
          const checked = selectedKeys.has(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => toggleKey(item.key)}
              accessibilityRole="checkbox"
              accessibilityLabel={`アクション「${item.title}」`}
              accessibilityState={{ checked }}
              style={[styles.actionRow, checked && styles.actionRowChecked]}
            >
              <View
                style={[styles.checkbox, checked && styles.checkboxChecked]}
              >
                {checked && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.actionTitle}>{item.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          onPress={handleSubmit}
          disabled={submitDisabled}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: submitDisabled }}
          style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
        >
          <Text
            style={[
              styles.submitBtnText,
              submitDisabled && styles.submitBtnTextDisabled,
            ]}
          >
            {submitLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

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
    flex: 1,
  },
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
  step2Subbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  toggleAllText: {
    color: COLOR_GROW,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  actionList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  actionRowChecked: { backgroundColor: COLOR_LINE_BG },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLOR_FG_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR_BG,
  },
  checkboxChecked: { backgroundColor: COLOR_GROW, borderColor: COLOR_GROW },
  checkboxMark: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  actionTitle: { color: COLOR_FG, fontSize: 15, flex: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  submitBtn: {
    backgroundColor: COLOR_GROW,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: COLOR_LINE_BG },
  submitBtnText: { color: COLOR_BG, fontSize: 14, fontWeight: '700' },
  submitBtnTextDisabled: { color: COLOR_FG_FAINT },
});
