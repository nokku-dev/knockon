import { memo, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';

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
  // DnD で得た EditableNode[] (新しい順序の参照) を丸ごと渡す。
  onReorderNodes: (reorderedNodes: readonly EditableNode[]) => void;
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
  onReorderNodes,
  onCancel,
  onSave,
}: ChainEditScreenProps) => {
  const [adderOpen, setAdderOpen] = useState(false);
  const [newActionDraft, setNewActionDraft] = useState('');
  const canSave =
    !saving && draft.title.trim().length > 0 && draft.nodes.length > 0;

  // DraggableFlatList は ScrollView 内に置けないので、トップレベルを DraggableFlatList
  // にして header / footer に編集 UI を集約する。
  //
  // パフォーマンス: renderItem を useCallback でメモ化し、ハンドラを安定参照にすることで
  // DnD 完了後 (onDragEnd) の再レンダリングで全アイテム rerender が走るのを避ける。
  // NodeEditorRow も memo 化済み (PR #20 review m-2 / 実機検証で遅さ報告に対応)。
  // ScaleDecorator は使わない。掴んだ時の scale 1.05→1.0 settle アニメーションが
  // React 側の data 更新と競合し、ドロップ位置で旧位置 → 新位置にスライドする
  // 1-2 フレームがフラッシュとして見える現象の発生源だったため (PR-1.7a 実機検証で
  // ユーザー報告: 「ドラッグしていたノードアイテムが一瞬上や下に移動して映る」)。
  // 掴んだ時の視覚フィードバックは NodeEditorRow 内の active style 切替で代替。
  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<EditableNode>) => (
      <NodeEditorRow
        node={item}
        active={isActive}
        onDrag={drag}
        onRemove={onRemoveNode}
      />
    ),
    [onRemoveNode],
  );

  const handleDragEnd = useCallback(
    ({ data }: { data: EditableNode[] }) => {
      // library が渡してきた data (新しい順序の EditableNode 配列) をそのまま
      // 上流に渡す。id 配列に展開して再マッピングするとオブジェクト参照が変わり、
      // library の settle アニメーションと React の re-render が同期せずチラつく。
      // 即時更新する (requestAnimationFrame で defer すると逆に library の内部状態と
      // 1 フレームずれて、その間に旧位置で描画されてしまう)。
      onReorderNodes(data);
    },
    [onReorderNodes],
  );

  const Header = useMemo(() => (
    <View style={styles.headerSections}>
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

      <View style={styles.nodesLabelRow}>
        <Text style={styles.sectionLabel}>
          ノード ({draft.nodes.length})
        </Text>
        {draft.nodes.length > 0 && (
          <Text style={styles.dragHint}>長押しで並び替え</Text>
        )}
      </View>
      {draft.nodes.length === 0 && (
        <View style={styles.emptyHintWrapper}>
          <Text style={styles.emptyHint}>
            「+ 追加」でノードを足してください
          </Text>
        </View>
      )}
    </View>
  ), [
    canSave,
    draft.anchor,
    draft.isNew,
    draft.nodes.length,
    draft.title,
    locating,
    locationPermission,
    onCancel,
    onSave,
    onSetAnchorKind,
    onSetAnchorLocation,
    onSetAnchorRadius,
    onSetAnchorTime,
    onSetTitle,
    onFetchLocation,
    saving,
  ]);

  const Footer = useMemo(() => (
    <View style={styles.footerSection}>
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
  ), [adderOpen, availableActions, newActionDraft, onAddExistingAction, onAddNewAction]);

  return (
    <DraggableFlatList<EditableNode>
      data={draft.nodes}
      onDragEnd={handleDragEnd}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={Header}
      ListFooterComponent={Footer}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      // 並び替えでは要素数が変わらないので length では検知できない。
      // 順序まで含めた変化のヒントとして id 配列を渡す。
      extraData={draft.nodes.map((n) => n.id).join('|')}
    />
  );
};

const keyExtractor = (item: EditableNode): string => item.id;

type NodeEditorRowProps = {
  node: EditableNode;
  active: boolean;
  onDrag: () => void;
  onRemove: (nodeId: string) => void;
};

// memo の比較関数で `onDrag` を比較対象から除外する。
// draggable-flatlist が renderItem に渡してくる `drag` 関数は毎レンダー新参照に
// なるため、比較に含めると memo が常に失敗し全行が rerender される
// (ScaleDecorator の scale settle と非同期で 1 フレーム flash する原因)。
// drag は Pressable の onLongPress に渡されるだけで、参照が変わっても次の長押し時に
// 最新版が使われるだけなので比較から除外して問題ない。
const NodeEditorRow = memo(
  ({ node, active, onDrag, onRemove }: NodeEditorRowProps) => (
    <View
      style={[styles.nodeRow, active && styles.nodeRowActive]}
      accessibilityLabel={node.actionTitle}
    >
      <Pressable
        onLongPress={onDrag}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={`${node.actionTitle} をドラッグして並び替え`}
        style={styles.dragHandle}
      >
        <Text style={styles.dragHandleText}>≡</Text>
      </Pressable>
      <Text style={styles.nodeTitle}>{node.actionTitle}</Text>
      <Pressable
        onPress={() => onRemove(node.id)}
        accessibilityRole="button"
        accessibilityLabel={`${node.actionTitle} を削除`}
        style={styles.removeBtn}
      >
        <Text style={styles.removeBtnText}>×</Text>
      </Pressable>
    </View>
  ),
  (prev, next) =>
    prev.node === next.node &&
    prev.active === next.active &&
    prev.onRemove === next.onRemove,
);
NodeEditorRow.displayName = 'NodeEditorRow';

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
  listContent: { padding: 24, gap: 16 },
  headerSections: { gap: 16, paddingBottom: 8 },
  footerSection: { paddingTop: 8 },
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
  nodesLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dragHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
  },
  emptyHintWrapper: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  emptyHint: { color: COLOR_FG_FAINT, fontSize: 12 },
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
  nodeRowActive: {
    backgroundColor: COLOR_LINE_BG,
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
    fontWeight: '700',
  },
  nodeTitle: { color: COLOR_FG, fontSize: 16, flex: 1 },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLOR_LINE_BG,
  },
  removeBtnText: { color: COLOR_FG, fontSize: 16, fontWeight: '600' },
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
    backgroundColor: COLOR_SURFACE,
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
    backgroundColor: COLOR_BG,
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
    backgroundColor: COLOR_BG,
  },
  existingChipText: { color: COLOR_FG, fontSize: 12 },
});
