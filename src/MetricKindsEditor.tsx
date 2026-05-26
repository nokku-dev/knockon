import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MetricKind } from './metricKindsRepository';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// PR-CC (ADR-0026): メトリクス種別の編集モーダル。
// builtin (is_builtin=1) も含めて全件編集可 (削除可)。 削除は警告 alert を 1 段挟む。
// 編集: 既存行に対して label / unit / key を変更可能。 key 変更は Notion 連携影響あり。

export type MetricKindsEditorProps = {
  open: boolean;
  kinds: readonly MetricKind[];
  onClose: () => void;
  onAdd: (key: string, label: string, unit: string) => Promise<void> | void;
  onUpdate: (id: string, patch: Partial<MetricKind>) => Promise<void> | void;
  onDelete: (kind: MetricKind) => Promise<void> | void;
};

export const MetricKindsEditor = ({
  open,
  kinds,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: MetricKindsEditorProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  // 新規追加 row 用 (editingId === '__new__' でトグル)
  const NEW_ID = '__new__';

  const startEdit = (kind: MetricKind) => {
    setEditingId(kind.id);
    setDraftKey(kind.key);
    setDraftLabel(kind.label);
    setDraftUnit(kind.unit);
  };

  const startNew = () => {
    setEditingId(NEW_ID);
    setDraftKey('');
    setDraftLabel('');
    setDraftUnit('');
  };

  const cancelEdit = () => setEditingId(null);

  const handleSave = async () => {
    const trimmedKey = draftKey.trim();
    const trimmedLabel = draftLabel.trim();
    const trimmedUnit = draftUnit.trim();
    if (
      trimmedKey.length === 0 ||
      trimmedLabel.length === 0 ||
      trimmedUnit.length === 0
    ) {
      return;
    }
    if (editingId === NEW_ID) {
      await onAdd(trimmedKey, trimmedLabel, trimmedUnit);
    } else if (editingId) {
      await onUpdate(editingId, {
        key: trimmedKey,
        label: trimmedLabel,
        unit: trimmedUnit,
      });
    }
    setEditingId(null);
  };

  const handleDelete = (kind: MetricKind) => {
    const message = kind.isBuiltin
      ? `「${kind.label}」を削除しますか?\n\n初期種別を削除します。 既存の記録は残ります (一覧から隠れるだけ)。 Notion 連携を使っている場合は sync が機能しなくなります。`
      : `「${kind.label}」を削除しますか?\n\n既存の記録は残ります (一覧から隠れるだけ)。`;
    Alert.alert('種別を削除', message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await onDelete(kind);
        },
      },
    ]);
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.topbar}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="閉じる"
          >
            <Text style={styles.cancel}>閉じる</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            メトリクス種別
          </Text>
          <View style={styles.topbarSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {kinds.length === 0 && editingId !== NEW_ID && (
            <Text style={styles.empty}>
              種別がありません。「+ 種別を追加」で作成してください。
            </Text>
          )}

          {kinds.map((kind) =>
            editingId === kind.id ? (
              <View key={kind.id} style={styles.editCard}>
                <KindEditFields
                  draftKey={draftKey}
                  draftLabel={draftLabel}
                  draftUnit={draftUnit}
                  setDraftKey={setDraftKey}
                  setDraftLabel={setDraftLabel}
                  setDraftUnit={setDraftUnit}
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={cancelEdit}
                    accessibilityRole="button"
                    accessibilityLabel="編集キャンセル"
                  >
                    <Text style={styles.cancel}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel="種別保存"
                    style={styles.saveBtn}
                  >
                    <Text style={styles.saveBtnText}>保存</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View key={kind.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>
                    {kind.label}{' '}
                    {kind.isBuiltin && (
                      <Text style={styles.builtinBadge}>(初期)</Text>
                    )}
                  </Text>
                  <Text style={styles.rowMeta}>
                    key: {kind.key} · {kind.unit}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    onPress={() => startEdit(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={`${kind.label} を編集`}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.iconBtnText}>✎</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={`${kind.label} を削除`}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.deleteIconText}>×</Text>
                  </Pressable>
                </View>
              </View>
            ),
          )}

          {editingId === NEW_ID ? (
            <View style={styles.editCard}>
              <KindEditFields
                draftKey={draftKey}
                draftLabel={draftLabel}
                draftUnit={draftUnit}
                setDraftKey={setDraftKey}
                setDraftLabel={setDraftLabel}
                setDraftUnit={setDraftUnit}
              />
              <View style={styles.editActions}>
                <Pressable
                  onPress={cancelEdit}
                  accessibilityRole="button"
                  accessibilityLabel="新規キャンセル"
                >
                  <Text style={styles.cancel}>キャンセル</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  accessibilityRole="button"
                  accessibilityLabel="新規種別保存"
                  style={styles.saveBtn}
                >
                  <Text style={styles.saveBtnText}>追加</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={startNew}
              accessibilityRole="button"
              accessibilityLabel="種別を追加"
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>+ 種別を追加</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const KindEditFields = ({
  draftKey,
  draftLabel,
  draftUnit,
  setDraftKey,
  setDraftLabel,
  setDraftUnit,
}: {
  draftKey: string;
  draftLabel: string;
  draftUnit: string;
  setDraftKey: (s: string) => void;
  setDraftLabel: (s: string) => void;
  setDraftUnit: (s: string) => void;
}) => (
  <View style={styles.fieldsRoot}>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>表示名</Text>
      <TextInput
        value={draftLabel}
        onChangeText={setDraftLabel}
        placeholder="例: 体重"
        placeholderTextColor={COLOR_FG_FAINT}
        style={styles.input}
        accessibilityLabel="表示名"
      />
    </View>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>単位</Text>
      <TextInput
        value={draftUnit}
        onChangeText={setDraftUnit}
        placeholder="例: kg"
        placeholderTextColor={COLOR_FG_FAINT}
        style={styles.input}
        accessibilityLabel="単位"
      />
    </View>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>key (英字、 Notion property 名)</Text>
      <TextInput
        value={draftKey}
        onChangeText={setDraftKey}
        placeholder="例: weight"
        placeholderTextColor={COLOR_FG_FAINT}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel="key"
      />
      <Text style={styles.fieldHint}>
        builtin の key を変更すると Notion 連携の sync が壊れる可能性あり
      </Text>
    </View>
  </View>
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
  headerTitle: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  topbarSpacer: { width: 50 },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  empty: { color: COLOR_FG_FAINT, fontSize: 13, padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 8,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: COLOR_FG, fontSize: 15, fontWeight: '600' },
  builtinBadge: { color: COLOR_FG_FAINT, fontSize: 11, fontWeight: '500' },
  rowMeta: { color: COLOR_FG_FAINT, fontSize: 11 },
  rowActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: { color: COLOR_FG, fontSize: 14 },
  deleteIconText: { color: COLOR_ACCENT, fontSize: 18, fontWeight: '700' },
  editCard: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 8,
  },
  fieldsRoot: { gap: 10 },
  field: { gap: 4 },
  fieldLabel: { color: COLOR_FG_SOFT, fontSize: 12, fontWeight: '600' },
  fieldHint: { color: COLOR_FG_FAINT, fontSize: 11 },
  input: {
    color: COLOR_FG,
    fontSize: 15,
    backgroundColor: COLOR_BG,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  saveBtnText: { color: COLOR_BG, fontSize: 13, fontWeight: '700' },
  addBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR_GROW,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  addBtnText: { color: COLOR_GROW, fontSize: 14, fontWeight: '700' },
});
