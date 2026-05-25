import { useCallback, useMemo, useState } from 'react';
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
  // PR-Y1: テンプレチェーンを選んで末尾追加 (各アクションを新規 INSERT + ノード追加)。
  // 未指定なら Footer の「+ テンプレから追加」ボタンは表示されない。
  onAddNodesFromTemplate?: (template: TemplateChain) => void;
  // react-native-reorderable-list の onReorder({from, to}) をそのまま受ける形。
  onReorderNodes: (from: number, to: number) => void;
  onCancel: () => void;
  onSave: () => void;
  // 編集モードのみ渡す。新規モード (isNew=true) では未指定でよい。
  // 指定があれば Footer 末尾に「このチェーンを削除」ボタンを表示。
  onDelete?: () => void;
  // 既存アクションを削除する。未指定なら ActionPicker のチップに × ボタンが
  // 表示されない (新規モード / 削除非対応 UI のためのオプション)。
  onDeleteAction?: (action: Action) => void;
  // 既存アクションを編集 (タイトル + variant) して保存。未指定なら ActionPicker の
  // チップに鉛筆アイコンが表示されない (Phase 2 前倒し variant)。
  // ChainEditScreen 内で ActionEditor モーダルを開き、 onSave 時に呼ぶ。
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
  onReorderNodes,
  onCancel,
  onSave,
  onDelete,
  onDeleteAction,
  onSaveAction,
}: ChainEditScreenProps) => {
  const [adderOpen, setAdderOpen] = useState(false);
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
      <NodeEditorRow node={item} onRemove={onRemoveNode} />
    ),
    [onRemoveNode],
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
            onSelect={(t) => {
              onAddNodesFromTemplate(t);
              setTemplatePickerOpen(false);
            }}
            onCancel={() => setTemplatePickerOpen(false)}
          />
        )}
      </Modal>
    </>
  );
};

const keyExtractor = (item: EditableNode): string => item.id;

type NodeEditorRowProps = {
  node: EditableNode;
  onRemove: (nodeId: string) => void;
};

const NodeEditorRow = ({ node, onRemove }: NodeEditorRowProps) => {
  // useReorderableDrag は ReorderableList の renderItem ツリー内でのみ有効。
  // タップ判定範囲は行全体 (Pressable) にし、見た目のハンドル ≡ は装飾の View
  // にとどめる。削除ボタンは内側の別 Pressable のままで、子の Pressable が
  // タッチを consume するため外側 (行) の長押しには bubble しない。
  const drag = useReorderableDrag();
  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`${node.actionTitle} をドラッグして並び替え`}
      style={styles.nodeRow}
    >
      <View style={styles.dragHandle}>
        <Text style={styles.dragHandleText}>≡</Text>
      </View>
      <Text style={styles.nodeTitle}>{node.actionTitle}</Text>
      {node.actionVariants &&
        summarizeVariantDays(node.actionVariants).length > 0 && (
          <Text
            style={styles.nodeVariantHint}
            accessibilityLabel={`variant: ${summarizeVariantDays(node.actionVariants)}`}
          >
            {summarizeVariantDays(node.actionVariants)}
          </Text>
        )}
      <Pressable
        onPress={() => onRemove(node.id)}
        accessibilityRole="button"
        accessibilityLabel={`${node.actionTitle} を削除`}
        style={styles.removeBtn}
      >
        <Text style={styles.removeBtnText}>×</Text>
      </Pressable>
    </Pressable>
  );
};

type ActionPickerProps = {
  actions: readonly Action[];
  newActionDraft: string;
  onNewActionDraftChange: (s: string) => void;
  onSelectExisting: (action: Action) => void;
  onSubmitNew: () => void;
  onCancel: () => void;
  // 既存アクションの × ボタンが押されたときの確認 + 削除ハンドラ。
  // 未指定なら × は表示されない。
  onDeleteExisting?: (action: Action) => void;
  // 既存アクションの鉛筆ボタンが押されたときの編集ハンドラ。
  // 未指定なら鉛筆は表示されない (Phase 2 variant)。
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
                  hitSlop={8}
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
                  hitSlop={8}
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
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: 10,
    backgroundColor: COLOR_SURFACE,
  },
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
  // 例: 「筋トレ 月火水 ×」のようにタイトルと削除の間に控えめに表示。
  nodeVariantHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 8,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLOR_LINE_BG,
  },
  removeBtnText: { color: COLOR_FG, fontSize: 16, fontWeight: '600' },
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
  // 削除ボタンは destructive action。DESIGN-SYSTEM §1 で accent の用途は
  // 「今日発火中 / ノック」に限定しているが、destructive action は警告色が必要なため
  // 文字色のみ accent を使い、背景は LINE_BG に抑えて派手さを避ける。
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
  // variant 設定済みアクションのバッジ。
  // 例: 「筋トレ 月火水 ✎ ×」のように曜日を併記して「曜日切替あり」を示す。
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
