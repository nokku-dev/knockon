import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnchorEditor } from './AnchorEditor';
import type { Action, Anchor } from './domain';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';
import type { ChainEditDraft, EditableNode } from './useChainEdit';

export type ChainEditScreenProps = {
  draft: ChainEditDraft;
  availableActions: readonly Action[];
  saving: boolean;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  onSetTitle: (title: string) => void;
  onSetAnchorKind: (kind: Anchor['kind']) => void;
  onSetAnchorTime: (time: string) => void;
  onSetAnchorLocation: (latitude: number, longitude: number) => void;
  onSetAnchorRadius: (radiusMeters: number) => void;
  onFetchLocation: () => Promise<CurrentPosition | null>;
  onAddExistingAction: (actionId: string, actionTitle: string) => void;
  onAddNewAction: (actionTitle: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, direction: 'up' | 'down') => void;
  onCancel: () => void;
  onSave: () => void;
};

export const ChainEditScreen = ({
  draft,
  availableActions,
  saving,
  locationPermission,
  locating,
  onSetTitle,
  onSetAnchorKind,
  onSetAnchorTime,
  onSetAnchorLocation,
  onSetAnchorRadius,
  onFetchLocation,
  onAddExistingAction,
  onAddNewAction,
  onRemoveNode,
  onMoveNode,
  onCancel,
  onSave,
}: ChainEditScreenProps) => {
  const [adderOpen, setAdderOpen] = useState(false);
  const [newActionDraft, setNewActionDraft] = useState('');
  const canSave =
    !saving && draft.title.trim().length > 0 && draft.nodes.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.topbar}>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {draft.isNew ? 'チェーンを新規作成' : 'チェーンを編集'}
        </Text>
        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel="保存"
          accessibilityState={{ disabled: !canSave }}
        >
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>
            {saving ? '保存中…' : '保存'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>チェーンタイトル</Text>
        <TextInput
          value={draft.title}
          onChangeText={onSetTitle}
          placeholder="朝のルーティン"
          placeholderTextColor={COLOR_FG_FAINT}
          style={styles.titleInput}
          accessibilityLabel="チェーンタイトル"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>起点アンカー</Text>
        <AnchorEditor
          anchor={draft.anchor}
          locationPermission={locationPermission}
          locating={locating}
          onSetKind={onSetAnchorKind}
          onSetTime={onSetAnchorTime}
          onSetLocation={onSetAnchorLocation}
          onSetRadius={onSetAnchorRadius}
          onFetchLocation={onFetchLocation}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ノード ({draft.nodes.length})</Text>
        {draft.nodes.length === 0 && (
          <Text style={styles.emptyHint}>「+ 追加」でノードを足してください</Text>
        )}
        {draft.nodes.map((n, idx) => (
          <NodeEditorRow
            key={n.id}
            node={n}
            index={idx}
            total={draft.nodes.length}
            onMove={onMoveNode}
            onRemove={onRemoveNode}
          />
        ))}

        {!adderOpen ? (
          <Pressable
            onPress={() => setAdderOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="ノードを追加"
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ ノードを追加</Text>
          </Pressable>
        ) : (
          <ActionPicker
            actions={availableActions}
            newActionDraft={newActionDraft}
            onNewActionDraftChange={setNewActionDraft}
            onSelectExisting={(a) => {
              onAddExistingAction(a.id, a.title);
              setAdderOpen(false);
            }}
            onSubmitNew={() => {
              if (newActionDraft.trim().length === 0) return;
              onAddNewAction(newActionDraft.trim());
              setNewActionDraft('');
              setAdderOpen(false);
            }}
            onCancel={() => {
              setAdderOpen(false);
              setNewActionDraft('');
            }}
          />
        )}
      </View>
    </ScrollView>
  );
};

type NodeEditorRowProps = {
  node: EditableNode;
  index: number;
  total: number;
  onMove: (nodeId: string, direction: 'up' | 'down') => void;
  onRemove: (nodeId: string) => void;
};

const NodeEditorRow = ({ node, index, total, onMove, onRemove }: NodeEditorRowProps) => {
  const upDisabled = index === 0;
  const downDisabled = index === total - 1;
  return (
    <View style={styles.nodeRow} accessibilityLabel={node.actionTitle}>
      <Text style={styles.nodeOrder}>{index + 1}</Text>
      <Text style={styles.nodeTitle}>{node.actionTitle}</Text>
      <View style={styles.nodeActions}>
        <Pressable
          onPress={() => onMove(node.id, 'up')}
          disabled={upDisabled}
          accessibilityRole="button"
          accessibilityLabel={`${node.actionTitle} を上に移動`}
          accessibilityState={{ disabled: upDisabled }}
          style={[styles.nodeBtn, upDisabled && styles.nodeBtnDisabled]}
        >
          <Text style={styles.nodeBtnText}>↑</Text>
        </Pressable>
        <Pressable
          onPress={() => onMove(node.id, 'down')}
          disabled={downDisabled}
          accessibilityRole="button"
          accessibilityLabel={`${node.actionTitle} を下に移動`}
          accessibilityState={{ disabled: downDisabled }}
          style={[styles.nodeBtn, downDisabled && styles.nodeBtnDisabled]}
        >
          <Text style={styles.nodeBtnText}>↓</Text>
        </Pressable>
        <Pressable
          onPress={() => onRemove(node.id)}
          accessibilityRole="button"
          accessibilityLabel={`${node.actionTitle} を削除`}
          style={styles.nodeBtn}
        >
          <Text style={styles.nodeBtnText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
};

type ActionPickerProps = {
  actions: readonly Action[];
  newActionDraft: string;
  onNewActionDraftChange: (s: string) => void;
  onSelectExisting: (action: Action) => void;
  onSubmitNew: () => void;
  onCancel: () => void;
};

const ActionPicker = ({
  actions,
  newActionDraft,
  onNewActionDraftChange,
  onSelectExisting,
  onSubmitNew,
  onCancel,
}: ActionPickerProps) => (
  <View style={styles.picker}>
    <View style={styles.pickerHeader}>
      <Text style={styles.pickerLabel}>ノードを追加</Text>
      <Pressable onPress={onCancel} accessibilityRole="button">
        <Text style={styles.pickerCancel}>閉じる</Text>
      </Pressable>
    </View>

    <Text style={styles.pickerSubLabel}>新しいアクション</Text>
    <View style={styles.newActionRow}>
      <TextInput
        value={newActionDraft}
        onChangeText={onNewActionDraftChange}
        placeholder="水を飲む"
        placeholderTextColor={COLOR_FG_FAINT}
        style={styles.newActionInput}
        accessibilityLabel="新しいアクション名"
        onSubmitEditing={onSubmitNew}
      />
      <Pressable
        onPress={onSubmitNew}
        accessibilityRole="button"
        accessibilityLabel="新しいアクションを追加"
        style={[
          styles.newActionBtn,
          newActionDraft.trim().length === 0 && styles.newActionBtnDisabled,
        ]}
        disabled={newActionDraft.trim().length === 0}
      >
        <Text style={styles.newActionBtnText}>+ 追加</Text>
      </Pressable>
    </View>

    {actions.length > 0 && (
      <>
        <Text style={styles.pickerSubLabel}>既存のアクションから選ぶ</Text>
        <View style={styles.existingList}>
          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onSelectExisting(a)}
              accessibilityRole="button"
              accessibilityLabel={`既存アクション: ${a.title}`}
              style={styles.existingChip}
            >
              <Text style={styles.existingChipText}>{a.title}</Text>
            </Pressable>
          ))}
        </View>
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  scroll: { padding: 24, gap: 16 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  cancel: { color: COLOR_FG_SOFT, fontSize: 14 },
  title: { color: COLOR_FG, fontSize: 14, fontWeight: '600' },
  save: { color: COLOR_GROW, fontSize: 14, fontWeight: '600' },
  saveDisabled: { color: COLOR_FG_FAINT },
  section: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sectionLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontWeight: '600',
  },
  titleInput: {
    color: COLOR_FG,
    fontSize: 20,
    fontWeight: '600',
    backgroundColor: COLOR_BG,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  anchorSummary: { color: COLOR_FG, fontSize: 16, fontWeight: '500' },
  anchorHint: { color: COLOR_FG_FAINT, fontSize: 11 },
  emptyHint: { color: COLOR_FG_FAINT, fontSize: 12 },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  nodeOrder: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    width: 16,
  },
  nodeTitle: { color: COLOR_FG, fontSize: 16, flex: 1 },
  nodeActions: { flexDirection: 'row', gap: 4 },
  nodeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLOR_LINE_BG,
  },
  nodeBtnDisabled: { opacity: 0.3 },
  nodeBtnText: { color: COLOR_FG, fontSize: 16, fontWeight: '600' },
  addBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  addBtnText: { color: COLOR_FG, fontSize: 13, fontWeight: '600' },
  picker: {
    marginTop: 8,
    padding: 12,
    backgroundColor: COLOR_BG,
    borderRadius: 12,
    gap: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerLabel: { color: COLOR_FG, fontSize: 13, fontWeight: '600' },
  pickerCancel: { color: COLOR_FG_SOFT, fontSize: 12 },
  pickerSubLabel: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
    marginTop: 4,
  },
  newActionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  newActionInput: {
    flex: 1,
    color: COLOR_FG,
    fontSize: 14,
    backgroundColor: COLOR_LINE_BG,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  newActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLOR_GROW,
  },
  newActionBtnDisabled: { opacity: 0.4 },
  newActionBtnText: { color: COLOR_BG, fontSize: 12, fontWeight: '700' },
  existingList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  existingChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  existingChipText: { color: COLOR_FG, fontSize: 12 },
});
