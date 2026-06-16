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
import { PromoteModulePanel } from './PromoteModulePanel';
import { CUSTOM_INBOX_MODULE_ID } from './catalogSeed';
import {
  buildModuleRoster,
  computeRunLeaders,
  deleteKindForSource,
} from './editLayout';
import type { DeleteKind } from './editLayout';
import { TemplateChainPicker } from './TemplateChainPicker';
import { BUILTIN_TEMPLATE_CHAINS } from './templateChains';
import type { TemplateChain } from './templateChains';
import type { Action, Anchor, CatalogSource, ChainStatus, Module } from './domain';
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

export type ChainEditScreenProps = {
  draft: ChainEditDraft;
  availableActions: readonly Action[];
  // #73: モジュールメタ (チップ層 / 行のカラーストライプ / source 別削除に使う)。
  modules: readonly Module[];
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
  // #95: moduleId = 追加先モジュール (振り分けピッカーで選択)。
  onAddExistingAction: (actionId: string, actionTitle: string, moduleId: string) => void;
  onAddNewAction: (actionTitle: string, moduleId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  // #73 (SPEC §6): ノードの ON/OFF (一時停止) トグル。
  onToggleNodeActive: (nodeId: string) => void;
  // #93 (SPEC §6): custom inbox ノードを user モジュールに昇格。未指定なら昇格 UI 非表示。
  onPromoteToModule?: (nodeIds: string[], name: string, color: string) => void;
  // #94 (SPEC §6/§8): モジュール一括外し + undo。
  onDetachModule: (moduleId: string) => void;
  undoCount: number;
  onUndo: () => void;
  onUndoDismiss: () => void;
  // PR-Y1: テンプレチェーンを選んで末尾追加 (各アクションを新規 INSERT + ノード追加)。
  // 未指定なら Footer の「+ テンプレから追加」ボタンは表示されない。
  // #134: 第 2 引数 = TemplateChainPicker で選ばれたアクションタイトル集合
  // (現状 picker 側に個別選択 UI は無く template.actions 全件が渡る)。
  // 受け側 (useChainEdit) で省略時に全件を取り込む形でも互換になる (knockon#133)。
  onAddNodesFromTemplate?: (
    template: TemplateChain,
    selectedActionTitles: ReadonlyArray<string>,
  ) => void;
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
  modules,
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
  onPromoteToModule,
  onDetachModule,
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
  // #93: 昇格パネル (Modal) の open 状態。
  const [promoteOpen, setPromoteOpen] = useState(false);
  // #95: チップタップで絞り込み中のモジュール (null = 絞り込みなし)。
  const [filterModuleId, setFilterModuleId] = useState<string | null>(null);

  // #73: モジュールメタ map + チップ層ロスター。ロスターは常に全ノードから算出。
  const modulesById = useMemo(() => {
    const map: Record<string, { name: string; color: string; source: CatalogSource }> = {};
    for (const m of modules) map[m.id] = { name: m.name, color: m.color, source: m.source };
    return map;
  }, [modules]);
  const allModuleIds = useMemo(
    () => draft.nodes.map((n) => n.moduleId ?? null),
    [draft.nodes],
  );
  const roster = useMemo(
    () => buildModuleRoster(allModuleIds, modulesById),
    [allModuleIds, modulesById],
  );

  // #95: 絞り込み中はそのモジュールのノードだけ表示。並び替えは無効化する
  // (= 部分集合の index と全体 order_index が一致しないため、reorderNodes が壊れる)。
  const filtering = filterModuleId !== null;
  const visibleNodes = useMemo(
    () =>
      filterModuleId === null
        ? draft.nodes
        : draft.nodes.filter((n) => (n.moduleId ?? null) === filterModuleId),
    [draft.nodes, filterModuleId],
  );
  // C 案ラベルの run leader は「表示中リスト」基準で算出 (renderItem の index は visibleNodes)。
  const runLeaders = useMemo(
    () => computeRunLeaders(visibleNodes.map((n) => n.moduleId ?? null)),
    [visibleNodes],
  );

  // 絞り込み対象モジュールがロスターから消えたら絞り込み解除 (全ノード削除/外し対応)。
  useEffect(() => {
    if (filterModuleId !== null && !roster.some((r) => r.id === filterModuleId)) {
      setFilterModuleId(null);
    }
  }, [filterModuleId, roster]);

  // #94: undo バーのタイムアウト (SPEC §8: 5 秒で自動的に確定 = undo 不可に)。
  // undoCount が変わるたびにタイマーを張り直す (新しい削除で延長)。
  useEffect(() => {
    if (undoCount === 0) return;
    const t = setTimeout(onUndoDismiss, UNDO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [undoCount, onUndoDismiss]);

  // #95: 「+追加」の振り分け先候補 = チェーンに既にあるモジュール (ロスター) + custom inbox。
  // custom inbox は常に末尾に 1 つ含める (= デフォルト所属先)。
  const assignableModules = useMemo(() => {
    const out: { id: string; name: string; color: string }[] = roster.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    }));
    if (!out.some((m) => m.id === CUSTOM_INBOX_MODULE_ID)) {
      const inbox = modulesById[CUSTOM_INBOX_MODULE_ID];
      out.push({
        id: CUSTOM_INBOX_MODULE_ID,
        name: inbox?.name ?? 'カスタム',
        color: inbox?.color ?? COLOR_FG_FAINT,
      });
    }
    return out;
  }, [roster, modulesById]);

  // #93: custom inbox 所属ノード = 昇格候補。
  const customCandidates = useMemo(
    () =>
      draft.nodes
        .filter((n) => n.moduleId === CUSTOM_INBOX_MODULE_ID)
        .map((n) => ({ nodeId: n.id, title: n.actionTitle })),
    [draft.nodes],
  );

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
    ({ item, index }: ReorderableListRenderItemInfo<EditableNode>) => {
      const meta = item.moduleId ? modulesById[item.moduleId] : undefined;
      // C 案ラベル: run 先頭 (= leader) かつモジュール所属ありのとき名前を出す。
      const showModuleName = !!meta && runLeaders[index] === true;
      const deleteKind = deleteKindForSource(meta?.source ?? null);
      return (
        <NodeEditorRow
          node={item}
          moduleColor={meta?.color}
          moduleName={showModuleName ? meta!.name : undefined}
          deleteKind={deleteKind}
          dragEnabled={!filtering}
          onRemove={onRemoveNode}
          onToggleActive={onToggleNodeActive}
        />
      );
    },
    [modulesById, runLeaders, filtering, onRemoveNode, onToggleNodeActive],
  );

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      // 絞り込み中は並び替え無効 (部分集合の index が全体と一致しない)。
      if (filtering) return;
      onReorderNodes(from, to);
    },
    [filtering, onReorderNodes],
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

        {/* #73/#95: チップ層 (採用中モジュールのロスター)。タップ=絞り込み (主)。
            色 + ラベル併用で a11y 担保 (#74)。 */}
        {roster.length > 0 && (
          <View style={styles.rosterRow}>
            {roster.map((r) => {
              const selected = filterModuleId === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() =>
                    setFilterModuleId((prev) => (prev === r.id ? null : r.id))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    selected
                      ? `モジュール ${r.name} の絞り込みを解除`
                      : `モジュール ${r.name} (${r.count}) で絞り込む`
                  }
                  accessibilityState={{ selected }}
                  style={[styles.rosterChip, selected && styles.rosterChipSelected]}
                >
                  <View style={[styles.rosterDot, { backgroundColor: r.color }]} />
                  <Text style={styles.rosterChipText}>{r.name}</Text>
                  <Text style={styles.rosterChipCount}>{r.count}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.nodesHeader}>
          <Text style={styles.sectionLabel}>ノード ({draft.nodes.length})</Text>
          {filtering ? (
            <View style={styles.filterActions}>
              {/* 二次アクション: 絞り込み中のモジュールを一括で外す */}
              <Pressable
                onPress={() => filterModuleId && onDetachModule(filterModuleId)}
                accessibilityRole="button"
                accessibilityLabel="このモジュールをまとめて外す"
              >
                <Text style={styles.detachText}>まとめて外す</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterModuleId(null)}
                accessibilityRole="button"
                accessibilityLabel="絞り込みを解除"
              >
                <Text style={styles.filterClear}>✕ 解除</Text>
              </Pressable>
            </View>
          ) : (
            draft.nodes.length > 0 && (
              <Text style={styles.dragHint}>長押しで並び替え</Text>
            )
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
      roster,
      filterModuleId,
      filtering,
      onDetachModule,
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
            {/* #93: custom inbox に 1 件以上あれば「モジュール化」導線を出す */}
            {onPromoteToModule && customCandidates.length > 0 && (
              <Pressable
                onPress={() => setPromoteOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="カスタムをモジュール化"
                style={styles.addBtn}
              >
                <Text style={styles.addBtnText}>カスタムをモジュール化</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <ActionPicker
            actions={availableActions}
            assignableModules={assignableModules}
            newActionDraft={newActionDraft}
            onNewActionDraftChange={setNewActionDraft}
            onSelectExisting={(a, moduleId) => {
              onAddExistingAction(a.id, a.title, moduleId);
              setAdderOpen(false);
            }}
            onSubmitNew={(moduleId) => {
              if (newActionDraft.trim().length === 0) return;
              onAddNewAction(newActionDraft.trim(), moduleId);
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
      assignableModules,
      customCandidates.length,
      onPromoteToModule,
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
        data={visibleNodes}
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
      <Modal
        visible={promoteOpen}
        animationType="slide"
        onRequestClose={() => setPromoteOpen(false)}
      >
        {onPromoteToModule && (
          <PromoteModulePanel
            candidates={customCandidates}
            onPromote={(nodeIds, name, color) => {
              onPromoteToModule(nodeIds, name, color);
              setPromoteOpen(false);
            }}
            onCancel={() => setPromoteOpen(false)}
          />
        )}
      </Modal>
      {/* #94: undo バー (直近 1 操作のみ・タイムアウトで自動確定) */}
      {undoCount > 0 && (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>
            {undoCount}件を外しました
          </Text>
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
  // #73: モジュール由来の表示メタ。
  moduleColor?: string; // 左カラーストライプ色 (C 案)。未所属なら undefined。
  moduleName?: string; // run 先頭のときだけ渡る (C 案・自己修復)。
  deleteKind: DeleteKind; // 'detach' (外す/非破壊) or 'delete' (削除/破壊的)。
  dragEnabled: boolean; // #95: 絞り込み中は並び替え無効。
  onRemove: (nodeId: string) => void;
  onToggleActive: (nodeId: string) => void;
};

const NodeEditorRow = ({
  node,
  moduleColor,
  moduleName,
  deleteKind,
  dragEnabled,
  onRemove,
  onToggleActive,
}: NodeEditorRowProps) => {
  // useReorderableDrag は ReorderableList の renderItem ツリー内でのみ有効。
  // タップ判定範囲は行全体 (Pressable) にし、見た目のハンドル ≡ は装飾の View
  // にとどめる。子の Pressable (トグル/削除) はタッチを consume するため外側
  // (行) の長押しには bubble しない。
  const drag = useReorderableDrag();
  const removeLabel = deleteKind === 'detach' ? '外す' : '削除';
  const removeA11y =
    deleteKind === 'detach'
      ? `${node.actionTitle} をチェーンから外す`
      : `${node.actionTitle} を削除`;
  return (
    <View style={styles.nodeRowWrap}>
      {/* C 案: 左カラーストライプ (モジュール色)。未所属は無色。 */}
      <View
        style={[
          styles.moduleStripe,
          { backgroundColor: moduleColor ?? 'transparent' },
        ]}
      />
      <Pressable
        onLongPress={dragEnabled ? drag : undefined}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={`${node.actionTitle} をドラッグして並び替え`}
        style={[styles.nodeRow, !node.active && styles.nodeRowPaused]}
      >
        <View style={styles.dragHandle}>
          <Text style={styles.dragHandleText}>≡</Text>
        </View>
        <View style={styles.nodeTitleCol}>
          {/* run 先頭だけモジュール名 (C 案・自己修復) */}
          {moduleName && <Text style={styles.nodeModuleName}>{moduleName}</Text>}
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
          accessibilityLabel={removeA11y}
          style={styles.removeBtn}
          hitSlop={6}
        >
          <Text style={styles.removeBtnText}>{removeLabel}</Text>
        </Pressable>
      </Pressable>
    </View>
  );
};

type AssignableModule = { id: string; name: string; color: string };

type ActionPickerProps = {
  actions: readonly Action[];
  // #95: 追加先モジュール候補 (ロスター + custom inbox)。
  assignableModules: readonly AssignableModule[];
  newActionDraft: string;
  onNewActionDraftChange: (s: string) => void;
  onSelectExisting: (action: Action, moduleId: string) => void;
  onSubmitNew: (moduleId: string) => void;
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
  assignableModules,
  newActionDraft,
  onNewActionDraftChange,
  onSelectExisting,
  onSubmitNew,
  onCancel,
  onDeleteExisting,
  onEditExisting,
}: ActionPickerProps) => {
  // #95: 追加先モジュール。デフォルトは custom inbox (= 末尾候補)。候補があればその先頭か
  // custom inbox を初期選択にする。
  const [target, setTarget] = useState<string>(CUSTOM_INBOX_MODULE_ID);
  return (
  <View style={styles.picker}>
    <View style={styles.pickerHeader}>
      <Text style={styles.pickerLabel}>ノードを追加</Text>
      <Pressable onPress={onCancel} accessibilityRole="button">
        <Text style={styles.pickerCancel}>閉じる</Text>
      </Pressable>
    </View>

    {/* #95: 追加先 (既存モジュール or カスタム) の振り分け */}
    {assignableModules.length > 0 && (
      <>
        <Text style={styles.pickerSubLabel}>追加先</Text>
        <View style={styles.existingList}>
          {assignableModules.map((m) => {
            const selected = target === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setTarget(m.id)}
                accessibilityRole="button"
                accessibilityLabel={`追加先: ${m.name}`}
                accessibilityState={{ selected }}
                style={[styles.targetChip, selected && styles.targetChipSelected]}
              >
                <View style={[styles.rosterDot, { backgroundColor: m.color }]} />
                <Text style={styles.targetChipText}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </>
    )}

    <Text style={styles.pickerSubLabel}>新しいアクション</Text>
    <View style={styles.newActionRow}>
      <TextInput
        value={newActionDraft}
        onChangeText={onNewActionDraftChange}
        placeholder="水を飲む"
        placeholderTextColor={COLOR_FG_FAINT}
        style={styles.newActionInput}
        accessibilityLabel="新しいアクション名"
        onSubmitEditing={() => onSubmitNew(target)}
      />
      <Pressable
        onPress={() => onSubmitNew(target)}
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
              onPress={() => onSelectExisting(a, target)}
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
};

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
  // #73 チップ層 (モジュールロスター)
  rosterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  rosterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_SURFACE,
    minHeight: 32,
  },
  rosterChipSelected: { backgroundColor: COLOR_LINE_BG, borderWidth: 1, borderColor: COLOR_GROW },
  rosterDot: { width: 10, height: 10, borderRadius: 999 },
  rosterChipText: { color: COLOR_FG, fontSize: 12, fontWeight: '600' },
  rosterChipCount: { color: COLOR_FG_FAINT, fontSize: 11, fontWeight: '600' },
  filterClear: { color: COLOR_GROW, fontSize: 11, fontWeight: '600' },
  filterActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detachText: { color: COLOR_ACCENT, fontSize: 11, fontWeight: '600' },
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
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
    minHeight: 32,
  },
  targetChipSelected: { borderWidth: 1, borderColor: COLOR_GROW },
  targetChipText: { color: COLOR_FG, fontSize: 12, fontWeight: '600' },
  // #73 行 (左ストライプ + 行本体)
  nodeRowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: COLOR_SURFACE,
  },
  moduleStripe: { width: 4 },
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
  nodeModuleName: {
    color: COLOR_FG_FAINT,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
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
  // 例: 「筋トレ 月火水 ×」のようにタイトルと削除の間に控えめに表示。
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
  // 削除/外すは destructive 寄り。文字色のみ accent (DESIGN-SYSTEM §1 / PR-1.8a と整合)。
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
