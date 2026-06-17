import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReorderableList, {
  useReorderableDrag,
} from 'react-native-reorderable-list';
import type {
  ReorderableListReorderEvent,
  ReorderableListRenderItemInfo,
} from 'react-native-reorderable-list';

import { ActionEditor } from './ActionEditor';
import { AnchorEditor } from './AnchorEditor';
import { TemplateChainPicker } from './TemplateChainPicker';
import { BUILTIN_TEMPLATE_CHAINS } from './templateChains';
import type { TemplateChain } from './templateChains';
import type { Action, Anchor, ChainStatus } from './domain';
import { summarizeVariantDays } from './domain';
import type { CurrentPosition, LocationPermissionStatus } from './location';
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
import type { ChainEditDraft, EditableNode } from './useChainEdit';

// #94 (SPEC §8): undo バーの表示時間。これを過ぎると削除が確定し undo 不可になる。
const UNDO_TIMEOUT_MS = 5000;

// ADR-0040 (#160): 編集 UI の module 概念 (チップ層 / カラーストライプ / run ラベル /
// 絞り込み / 一括外し / promote-to-module / custom inbox / 追加先振り分け) を廃止。
// 編集はノードの追加 / 削除 / 並び替え / ON-OFF / タイマーに簡素化した。
export type ChainEditScreenProps = {
  draft: ChainEditDraft;
  availableActions: readonly Action[];
  saving: boolean;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  onSetTitle: (title: string) => void;
  onSetStatus: (status: ChainStatus) => void;
  onSetAnchorKind: (kind: Anchor['kind']) => void;
  onSetAnchorTime: (time: string) => void;
  onSetAnchorLocation: (latitude: number, longitude: number) => void;
  onSetAnchorRadius: (radiusMeters: number) => void;
  onFetchLocation: () => Promise<CurrentPosition | null>;
  onAddExistingAction: (actionId: string, actionTitle: string) => void;
  onAddNewAction: (actionTitle: string) => void;
  onRemoveNode: (nodeId: string) => void;
  // #73 (SPEC §6): ノードの ON/OFF (一時停止) トグル。
  onToggleNodeActive: (nodeId: string) => void;
  // #94 (SPEC §8): 削除 + undo。
  undoCount: number;
  onUndo: () => void;
  onUndoDismiss: () => void;
  // PR-Y1: テンプレチェーンを選んで末尾追加 (各アクションを新規 INSERT + ノード追加)。
  // 未指定なら Footer の「+ テンプレから追加」ボタンは表示されない。
  onAddNodesFromTemplate?: (
    template: TemplateChain,
    selectedActionTitles: ReadonlyArray<string>,
  ) => void;
  // react-native-reorderable-list の onReorder({from, to}) をそのまま受ける形。
  onReorderNodes: (from: number, to: number) => void;
  onCancel: () => void;
  onSave: () => void;
  // 編集モードのみ渡す。指定があれば Footer 末尾に「このチェーンを削除」ボタンを表示。
  onDelete?: () => void;
  // 既存アクションを削除する。未指定なら ActionPicker のチップに × ボタンが出ない。
  onDeleteAction?: (action: Action) => void;
  // 既存アクションを編集 (タイトル + variant)。未指定なら鉛筆アイコンが出ない。
  onSaveAction?: (action: Action) => Promise<boolean>;
};

export const ChainEditScreen = ({
  draft,
  availableActions,
  saving,
  locationPermission,
  locating,
  onSetTitle,
  onSetStatus,
  onSetAnchorKind,
  onSetAnchorTime,
  onSetAnchorLocation,
  onSetAnchorRadius,
  onFetchLocation,
  onAddExistingAction,
  onAddNewAction,
  onAddNodesFromTemplate,
  onRemoveNode,
  onToggleNodeActive,
  undoCount,
  onUndo,
  onUndoDismiss,
  onReorderNodes,
  onCancel,
  onSave,
  onDelete,
  onDeleteAction,
  onSaveAction,
}: ChainEditScreenProps) => {
  const [adderOpen, setAdderOpen] = useState(false);

  // #94: undo バーのタイムアウト (SPEC §8: 5 秒で自動的に確定 = undo 不可に)。
  // undoCount が変わるたびにタイマーを張り直す (新しい削除で延長)。
  useEffect(() => {
    if (undoCount === 0) return;
    const t = setTimeout(onUndoDismiss, UNDO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [undoCount, onUndoDismiss]);

  const [newActionDraft, setNewActionDraft] = useState('');
  // Phase 2 variant: 編集中のアクション (Modal で ActionEditor を表示)。
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  // PR-Y1: テンプレチェーン選択モーダルの open 状態。
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const canSave =
    !saving && draft.title.trim().length > 0 && draft.nodes.length > 0;

  // ReorderableList は ScrollView 内に置けないので画面 root として使う。
  // 編集 UI 全体は ListHeaderComponent / ListFooterComponent で吸収する。
  const renderItem = useCallback(
    ({ item }: ReorderableListRenderItemInfo<EditableNode>) => (
      <NodeEditorRow
        node={item}
        onRemove={onRemoveNode}
        onToggleActive={onToggleNodeActive}
      />
    ),
    [onRemoveNode, onToggleNodeActive],
  );

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      onReorderNodes(from, to);
    },
    [onReorderNodes],
  );

  const Header = useMemo(
    () => (
      <View style={styles.headerContent}>
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

        {!draft.isNew && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ステータス</Text>
            <View style={styles.statusToggle}>
              <Pressable
                onPress={() => onSetStatus('active')}
                accessibilityRole="button"
                accessibilityLabel="アクティブにする"
                accessibilityState={{ selected: draft.status === 'active' }}
                style={[
                  styles.statusOption,
                  draft.status === 'active' && styles.statusOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    draft.status === 'active' && styles.statusOptionTextSelected,
                  ]}
                >
                  アクティブ
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onSetStatus('stocked')}
                accessibilityRole="button"
                accessibilityLabel="一時休止にする"
                accessibilityState={{ selected: draft.status === 'stocked' }}
                style={[
                  styles.statusOption,
                  draft.status === 'stocked' && styles.statusOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    draft.status === 'stocked' && styles.statusOptionTextSelected,
                  ]}
                >
                  一時休止
                </Text>
              </Pressable>
            </View>
            {draft.status === 'stocked' && (
              <Text style={styles.statusHint}>
                Today に表示されません。 復活させるときは「アクティブ」に戻す。
              </Text>
            )}
          </View>
        )}

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

        <View style={styles.nodesHeader}>
          <Text style={styles.sectionLabel}>ノード ({draft.nodes.length})</Text>
          {draft.nodes.length > 0 && (
            <Text style={styles.dragHint}>長押しで並び替え</Text>
          )}
        </View>
        {draft.nodes.length === 0 && (
          <Text style={styles.emptyHint}>「+ 追加」でノードを足してください</Text>
        )}
      </View>
    ),
    [
      draft.isNew,
      draft.title,
      draft.status,
      draft.anchor,
      draft.nodes.length,
      saving,
      canSave,
      locationPermission,
      locating,
      onCancel,
      onSave,
      onSetTitle,
      onSetStatus,
      onSetAnchorKind,
      onSetAnchorTime,
      onSetAnchorLocation,
      onSetAnchorRadius,
      onFetchLocation,
    ],
  );

  const Footer = useMemo(
    () => (
      <View style={styles.footerContent}>
        {!adderOpen ? (
          <View style={styles.addRow}>
            <Pressable
              onPress={() => setAdderOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="ノードを追加"
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>+ ノードを追加</Text>
            </Pressable>
            {onAddNodesFromTemplate && (
              <Pressable
                onPress={() => setTemplatePickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="テンプレから追加"
                style={styles.addBtn}
              >
                <Text style={styles.addBtnText}>+ テンプレから追加</Text>
              </Pressable>
            )}
          </View>
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
            onDeleteExisting={onDeleteAction}
            onEditExisting={onSaveAction ? setEditingAction : undefined}
          />
        )}
        {onDelete && (
          <Pressable
            onPress={onDelete}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="このチェーンを削除"
            accessibilityState={{ disabled: saving }}
            style={[styles.deleteBtn, saving && styles.deleteBtnDisabled]}
          >
            <Text style={styles.deleteBtnText}>このチェーンを削除</Text>
          </Pressable>
        )}
      </View>
    ),
    [
      adderOpen,
      availableActions,
      newActionDraft,
      onAddExistingAction,
      onAddNewAction,
      onAddNodesFromTemplate,
      onDelete,
      onDeleteAction,
      onSaveAction,
      saving,
    ],
  );

  return (
    <>
      <ReorderableList
        data={draft.nodes}
        onReorder={handleReorder}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
      <Modal
        visible={editingAction != null}
        animationType="slide"
        onRequestClose={() => setEditingAction(null)}
      >
        {editingAction && onSaveAction && (
          <ActionEditor
            action={editingAction}
            onSave={async (updated) => {
              const ok = await onSaveAction(updated);
              if (ok) setEditingAction(null);
            }}
            onCancel={() => setEditingAction(null)}
          />
        )}
      </Modal>
      <Modal
        visible={templatePickerOpen}
        animationType="slide"
        onRequestClose={() => setTemplatePickerOpen(false)}
      >
        {onAddNodesFromTemplate && (
          <TemplateChainPicker
            templates={BUILTIN_TEMPLATE_CHAINS}
            onSelect={(t, titles) => {
              onAddNodesFromTemplate(t, titles);
              setTemplatePickerOpen(false);
            }}
            onCancel={() => setTemplatePickerOpen(false)}
          />
        )}
      </Modal>
      {/* #94: undo バー (直近 1 操作のみ・タイムアウトで自動確定) */}
      {undoCount > 0 && (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>{undoCount}件を削除しました</Text>
          <Pressable
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="削除を元に戻す"
            hitSlop={14}
          >
            <Text style={styles.undoAction}>↺ 元に戻す</Text>
          </Pressable>
        </View>
      )}
    </>
  );
};

const keyExtractor = (item: EditableNode): string => item.id;

type NodeEditorRowProps = {
  node: EditableNode;
  onRemove: (nodeId: string) => void;
  onToggleActive: (nodeId: string) => void;
};

const NodeEditorRow = ({
  node,
  onRemove,
  onToggleActive,
}: NodeEditorRowProps) => {
  // useReorderableDrag は ReorderableList の renderItem ツリー内でのみ有効。
  // タップ判定範囲は行全体 (Pressable) にし、見た目のハンドル ≡ は装飾の View
  // にとどめる。子の Pressable (トグル/削除) はタッチを consume するため外側
  // (行) の長押しには bubble しない。
  const drag = useReorderableDrag();
  return (
    <View style={styles.nodeRowWrap}>
      <Pressable
        onLongPress={drag}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={`${node.actionTitle} をドラッグして並び替え`}
        style={[styles.nodeRow, !node.active && styles.nodeRowPaused]}
      >
        <View style={styles.dragHandle}>
          <Text style={styles.dragHandleText}>≡</Text>
        </View>
        <View style={styles.nodeTitleCol}>
          <Text style={[styles.nodeTitle, !node.active && styles.nodeTitlePaused]}>
            {node.actionTitle}
          </Text>
        </View>
        {node.actionVariants &&
          summarizeVariantDays(node.actionVariants).length > 0 && (
            <Text
              style={styles.nodeVariantHint}
              accessibilityLabel={`variant: ${summarizeVariantDays(node.actionVariants)}`}
            >
              {summarizeVariantDays(node.actionVariants)}
            </Text>
          )}
        {/* ON/OFF = 一時停止トグル (停止と削除は別系統) */}
        <Pressable
          onPress={() => onToggleActive(node.id)}
          accessibilityRole="switch"
          accessibilityState={{ checked: node.active }}
          accessibilityLabel={
            node.active
              ? `${node.actionTitle} を一時停止`
              : `${node.actionTitle} を再開`
          }
          style={[styles.toggleBtn, node.active && styles.toggleBtnOn]}
          hitSlop={10}
        >
          <Text style={[styles.toggleText, node.active && styles.toggleTextOn]}>
            {node.active ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onRemove(node.id)}
          accessibilityRole="button"
          accessibilityLabel={`${node.actionTitle} を削除`}
          style={styles.removeBtn}
          hitSlop={6}
        >
          <Text style={styles.removeBtnText}>削除</Text>
        </Pressable>
      </Pressable>
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
  // 既存アクションの × ボタンが押されたときの削除ハンドラ。未指定なら × は出ない。
  onDeleteExisting?: (action: Action) => void;
  // 既存アクションの鉛筆ボタンが押されたときの編集ハンドラ。未指定なら鉛筆は出ない。
  onEditExisting?: (action: Action) => void;
};

const ActionPicker = ({
  actions,
  newActionDraft,
  onNewActionDraftChange,
  onSelectExisting,
  onSubmitNew,
  onCancel,
  onDeleteExisting,
  onEditExisting,
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
              {a.variants && summarizeVariantDays(a.variants).length > 0 && (
                <Text
                  style={styles.existingChipVariantHint}
                  accessibilityLabel={`variant: ${summarizeVariantDays(a.variants)}`}
                >
                  {summarizeVariantDays(a.variants)}
                </Text>
              )}
              {onEditExisting && (
                <Pressable
                  onPress={() => onEditExisting(a)}
                  accessibilityRole="button"
                  accessibilityLabel={`アクション「${a.title}」を編集`}
                  style={styles.existingChipEdit}
                  hitSlop={14}
                >
                  <Text style={styles.existingChipEditText}>✎</Text>
                </Pressable>
              )}
              {onDeleteExisting && (
                <Pressable
                  onPress={() => onDeleteExisting(a)}
                  accessibilityRole="button"
                  accessibilityLabel={`アクション「${a.title}」を削除`}
                  style={styles.existingChipDelete}
                  hitSlop={14}
                >
                  <Text style={styles.existingChipDeleteText}>×</Text>
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>
      </>
    )}
  </View>
);

const styles = StyleSheet.create({
  listContent: { padding: 24, paddingBottom: 48 },
  headerContent: { gap: 16, paddingBottom: 8 },
  footerContent: { paddingTop: 12 },
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
  statusToggle: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLOR_BG,
    alignItems: 'center',
  },
  statusOptionSelected: {
    backgroundColor: COLOR_LINE_BG,
  },
  statusOptionText: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    fontWeight: '600',
  },
  statusOptionTextSelected: {
    color: COLOR_FG,
  },
  statusHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
    marginTop: 6,
  },
  nodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  dragHint: { color: COLOR_FG_FAINT, fontSize: 11 },
  emptyHint: { color: COLOR_FG_FAINT, fontSize: 12, paddingHorizontal: 4 },
  undoBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR_SURFACE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  undoText: { color: COLOR_FG, fontSize: 13 },
  undoAction: { color: COLOR_GROW, fontSize: 13, fontWeight: '700' },
  nodeRowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: COLOR_SURFACE,
  },
  nodeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  nodeRowPaused: { opacity: 0.5 },
  nodeTitleCol: { flex: 1, gap: 2 },
  nodeTitlePaused: { textDecorationLine: 'line-through' },
  toggleBtn: {
    minWidth: 40,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: COLOR_LINE_BG,
  },
  toggleBtnOn: { backgroundColor: COLOR_GROW },
  toggleText: { color: COLOR_FG_FAINT, fontSize: 11, fontWeight: '700' },
  toggleTextOn: { color: COLOR_BG },
  dragHandle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  dragHandleText: {
    color: COLOR_FG_FAINT,
    fontSize: 18,
    fontWeight: '600',
  },
  nodeTitle: { color: COLOR_FG, fontSize: 16, flex: 1 },
  // variant 設定済みアクションのバッジ (ノード行)。
  nodeVariantHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 8,
  },
  removeBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  // 削除は destructive 寄り。文字色のみ accent (DESIGN-SYSTEM §1 / PR-1.8a と整合)。
  removeBtnText: { color: COLOR_ACCENT, fontSize: 12, fontWeight: '600' },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  addBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  addBtnText: { color: COLOR_FG, fontSize: 13, fontWeight: '600' },
  // 削除ボタンは destructive action。文字色のみ accent、背景は LINE_BG に抑える
  // (Augmentation 原則: 「マイナスを指差さない」を保ちつつ、操作の不可逆性は明示)。
  deleteBtn: {
    marginTop: 24,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  deleteBtnText: { color: COLOR_ACCENT, fontSize: 13, fontWeight: '600' },
  deleteBtnDisabled: { opacity: 0.4 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  existingChipText: { color: COLOR_FG, fontSize: 12 },
  existingChipVariantHint: {
    color: COLOR_FG_FAINT,
    fontSize: 10,
    fontWeight: '600',
  },
  existingChipDelete: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  existingChipDeleteText: { color: COLOR_FG_FAINT, fontSize: 12, fontWeight: '600' },
  existingChipEdit: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  existingChipEditText: { color: COLOR_FG_FAINT, fontSize: 11, fontWeight: '600' },
});
