import { useEffect, useState } from 'react';
import {
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

import type { NoteChainOption } from './useNotesData';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

// ADR-0044 (#181): 手動メモの作成 / 編集モーダル。
// 2 つの導線から使う:
// - 研究画面 FAB: チェーン → アクションを選択してから書く (選択なし = 汎用メモも可)。
// - Today アクション長押し: initialNodeId 指定でチェーン / アクションを選択済みで開く。
//
// 紐付けは node_id 単一 (ADR-0044)。チェーンだけ選んでアクション未選択のときは汎用メモ扱い
// (= node_id null)。「対象なし」で明示的に汎用メモにもできる。
// open=false なら Modal の visible で隠れる (親が永続マウントして open でトグル)。
export type NoteComposeModalProps = {
  open: boolean;
  chainOptions: readonly NoteChainOption[];
  // Today アクション長押し起点のときの初期選択ノード (= チェーン / アクション選択済みで開く)。
  initialNodeId?: string | null;
  // 編集起点のときの既存本文 (= 研究画面でメモをタップして編集)。
  initialContent?: string;
  // 対象セレクタを隠す。編集時は本文のみ更新で紐付けは変えない (ADR-0044 最小スコープ) ため、
  // セレクタを出すと「変えても効かない」嘘 UI になる (K-030 同型) ので非表示にする。
  hideSelector?: boolean;
  onCancel: () => void;
  onSubmit: (nodeId: string | null, content: string) => Promise<void> | void;
};

export const NoteComposeModal = ({
  open,
  chainOptions,
  initialNodeId = null,
  initialContent = '',
  hideSelector = false,
  onCancel,
  onSubmit,
}: NoteComposeModalProps) => {
  const findChainOfNode = (nodeId: string | null): string | null =>
    nodeId == null
      ? null
      : (chainOptions.find((c) => c.nodes.some((n) => n.nodeId === nodeId))
          ?.chainId ?? null);

  const [selectedChainId, setSelectedChainId] = useState<string | null>(() =>
    findChainOfNode(initialNodeId),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialNodeId,
  );
  const [content, setContent] = useState(initialContent);

  // 親が Modal を永続マウントして open でトグルするため、 open 遷移ごとに初期値へ再同期する
  // (MetricInputModal と同型: useState の初期値は初回マウント時しか評価されない)。
  useEffect(() => {
    if (open) {
      setSelectedChainId(findChainOfNode(initialNodeId));
      setSelectedNodeId(initialNodeId);
      setContent(initialContent);
    }
    // findChainOfNode は chainOptions / initialNodeId に依存する純粋導出なので deps から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialNodeId, initialContent, chainOptions]);

  const selectedChain = chainOptions.find((c) => c.chainId === selectedChainId);

  const handleSubmit = async () => {
    if (content.trim().length === 0) return; // 空メモは弾く
    await onSubmit(selectedNodeId, content);
    onCancel();
  };

  const selectChain = (chainId: string) => {
    if (chainId === selectedChainId) {
      // 同じチェーンを再タップで選択解除 (= 汎用メモに戻す)
      setSelectedChainId(null);
      setSelectedNodeId(null);
      return;
    }
    setSelectedChainId(chainId);
    setSelectedNodeId(null); // チェーンを変えたらアクション選択はリセット
  };

  const selectNode = (nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.overlay} onPress={onCancel}>
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityLabel="メモ入力"
          >
            <Text style={styles.title}>メモ</Text>

            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="気づいたことを書く"
              placeholderTextColor={COLOR_FG_FAINT}
              style={styles.input}
              multiline
              accessibilityLabel="メモ本文"
              autoFocus
            />

            {/* 対象 (チェーン → アクション) セレクタ。選択なし = 汎用メモ。
                編集時 (hideSelector) は本文のみ更新するため非表示 (K-030: 効かない UI を出さない)。 */}
            {!hideSelector && (
            <>
            <Text style={styles.sectionLabel}>対象 (任意)</Text>
            <ScrollView
              style={styles.selectorScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => {
                    setSelectedChainId(null);
                    setSelectedNodeId(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="対象なし (汎用メモ)"
                  accessibilityState={{ selected: selectedChainId == null }}
                  style={[
                    styles.chip,
                    selectedChainId == null && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedChainId == null && styles.chipTextActive,
                    ]}
                  >
                    なし
                  </Text>
                </Pressable>
                {chainOptions.map((c) => (
                  <Pressable
                    key={c.chainId}
                    onPress={() => selectChain(c.chainId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.chainTitle} を選択`}
                    accessibilityState={{ selected: selectedChainId === c.chainId }}
                    style={[
                      styles.chip,
                      selectedChainId === c.chainId && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedChainId === c.chainId && styles.chipTextActive,
                      ]}
                    >
                      {c.chainTitle}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {selectedChain && selectedChain.nodes.length > 0 && (
                <View style={[styles.chipRow, styles.nodeChipRow]}>
                  {selectedChain.nodes.map((n) => (
                    <Pressable
                      key={n.nodeId}
                      onPress={() => selectNode(n.nodeId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.actionTitle} を選択`}
                      accessibilityState={{ selected: selectedNodeId === n.nodeId }}
                      style={[
                        styles.chip,
                        styles.nodeChip,
                        selectedNodeId === n.nodeId && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedNodeId === n.nodeId && styles.chipTextActive,
                        ]}
                      >
                        {n.actionTitle}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
            </>
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="キャンセル"
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>キャンセル</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="保存"
                style={styles.submitBtn}
              >
                <Text style={styles.submitText}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLOR_SURFACE,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  title: {
    color: COLOR_FG,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    color: COLOR_FG,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 88,
    maxHeight: 180,
    textAlignVertical: 'top',
    borderRadius: 12,
    backgroundColor: COLOR_BG,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionLabel: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    fontWeight: '600',
  },
  selectorScroll: {
    maxHeight: 140,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nodeChipRow: {
    marginTop: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  nodeChip: {
    backgroundColor: COLOR_BG,
  },
  chipActive: {
    backgroundColor: COLOR_FG,
  },
  chipText: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLOR_BG,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: COLOR_GROW,
  },
  submitText: {
    color: COLOR_BG,
    fontSize: 14,
    fontWeight: '700',
  },
});
