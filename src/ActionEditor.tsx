import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Action, VariantMap, WeekdayKey } from './domain';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

const WEEKDAYS: ReadonlyArray<{ key: WeekdayKey; label: string }> = [
  { key: 'mon', label: '月' },
  { key: 'tue', label: '火' },
  { key: 'wed', label: '水' },
  { key: 'thu', label: '木' },
  { key: 'fri', label: '金' },
  { key: 'sat', label: '土' },
  { key: 'sun', label: '日' },
];

const emptyVariants = (): VariantMap => ({
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
});

export type ActionEditorProps = {
  action: Action;
  onSave: (updated: Action) => void;
  onCancel: () => void;
};

// Phase 2 前倒し variant の編集モーダル。タイトル + 曜日別 variant 編集を 1 画面で。
// variant ON 時は 7 曜日のラベル入力欄、 空欄の曜日は variant null = Today に出ない。
export const ActionEditor = ({
  action,
  onSave,
  onCancel,
}: ActionEditorProps) => {
  const [title, setTitle] = useState(action.title);
  const [variantsEnabled, setVariantsEnabled] = useState(
    action.variants != null,
  );
  const [variants, setVariants] = useState<VariantMap>(
    action.variants ?? emptyVariants(),
  );

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      ...action,
      title: title.trim(),
      variants: variantsEnabled ? variants : null,
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          アクションを編集
        </Text>
        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="アクション保存"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
        >
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>
            保存
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>タイトル</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="筋トレ"
            placeholderTextColor={COLOR_FG_FAINT}
            style={styles.titleInput}
            accessibilityLabel="アクションタイトル"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.variantHeader}>
            <Text style={styles.sectionLabel}>曜日別 variant</Text>
            <Switch
              value={variantsEnabled}
              onValueChange={setVariantsEnabled}
              accessibilityLabel="variant を使う"
            />
          </View>
          {variantsEnabled ? (
            <>
              <Text style={styles.hint}>
                曜日ごとに違うラベルで Today に出す。空欄の曜日は Today に表示されない。
              </Text>
              {WEEKDAYS.map(({ key, label }) => (
                <View key={key} style={styles.variantRow}>
                  <Text style={styles.variantDay}>{label}</Text>
                  <TextInput
                    value={variants[key] ?? ''}
                    onChangeText={(t) =>
                      setVariants((prev) => ({
                        ...prev,
                        [key]: t.length === 0 ? null : t,
                      }))
                    }
                    placeholder="(なし)"
                    placeholderTextColor={COLOR_FG_FAINT}
                    style={styles.variantInput}
                    accessibilityLabel={`${label}曜日 variant`}
                  />
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.hint}>
              variant なし: タイトルそのままで毎日 Today に出る。
            </Text>
          )}
        </View>
      </ScrollView>
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
  headerTitle: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  save: { color: COLOR_GROW, fontSize: 14, fontWeight: '600' },
  saveDisabled: { color: COLOR_FG_FAINT },
  body: { padding: 16, gap: 16 },
  section: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sectionLabel: { color: COLOR_FG_SOFT, fontSize: 12, fontWeight: '600' },
  hint: { color: COLOR_FG_FAINT, fontSize: 11 },
  titleInput: {
    color: COLOR_FG,
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: COLOR_BG,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  variantDay: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '600',
    width: 20,
  },
  variantInput: {
    flex: 1,
    color: COLOR_FG,
    fontSize: 14,
    backgroundColor: COLOR_BG,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
});
