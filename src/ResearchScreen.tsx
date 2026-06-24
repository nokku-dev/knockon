import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NoteComposeModal } from './NoteComposeModal';
import type { NoteWithContext } from './notesRepository';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_SURFACE,
} from './tokens';
import type { NoteChainOption } from './useNotesData';

// ADR-0044 (#181): 研究タブ。 自動検出 (インサイト) は未実装なので、 当面は
// ユーザーの手動メモ一覧 + 右下 FAB (新規メモ作成) を出す。
// メモは観測した事実軸 (ADR-0044)。 反 streak / Celebrate 主 (ADR-0036) の対象外
// (= 数字 / グリフ / ハイライトを増やすものではなく自由記述)。

export type ResearchScreenProps = {
  notes: readonly NoteWithContext[];
  chainOptions: readonly NoteChainOption[];
  onAddNote: (nodeId: string | null, content: string) => void | Promise<void>;
  onEditNote: (id: string, content: string) => void | Promise<void>;
  onDeleteNote: (id: string) => void | Promise<void>;
};

// "2026-06-24T09:00:00" → "2026/06/24" (表示用、 秒以下は落とす)。
const formatNoteDate = (isoLike: string): string =>
  isoLike.slice(0, 10).replace(/-/g, '/');

// メモの文脈ラベル。 紐付けノードがあれば「チェーン名 / アクション名」、 無ければ「汎用メモ」。
const contextLabel = (note: NoteWithContext): string => {
  if (note.chainTitle && note.actionTitle) {
    return `${note.chainTitle} / ${note.actionTitle}`;
  }
  if (note.chainTitle) return note.chainTitle;
  return '汎用メモ';
};

export function ResearchScreen({
  notes,
  chainOptions,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: ResearchScreenProps) {
  // 作成 (editing=null) / 編集 (editing=該当メモ) を 1 つの Modal で兼ねる。
  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<NoteWithContext | null>(null);

  const openCreate = () => {
    setEditing(null);
    setComposeOpen(true);
  };

  const openEdit = (note: NoteWithContext) => {
    setEditing(note);
    setComposeOpen(true);
  };

  const confirmDelete = (note: NoteWithContext) => {
    Alert.alert('メモを削除', 'このメモを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => onDeleteNote(note.id),
      },
    ]);
  };

  const handleSubmit = (nodeId: string | null, content: string) => {
    if (editing) {
      // 編集時は本文のみ更新 (紐付けは作成時に固定、 ADR-0044 の最小スコープ)。
      onEditNote(editing.id, content);
    } else {
      onAddNote(nodeId, content);
    }
  };

  return (
    <View style={styles.root}>
      {notes.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>
            まだメモはありません。{'\n'}右下の + から書けます。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {notes.map((note) => (
            <Pressable
              key={note.id}
              onPress={() => openEdit(note)}
              onLongPress={() => confirmDelete(note)}
              accessibilityRole="button"
              accessibilityLabel={`メモ: ${note.content}`}
              style={styles.card}
            >
              <Text style={styles.cardContent}>{note.content}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardContext} numberOfLines={1}>
                  {contextLabel(note)}
                </Text>
                <Text style={styles.cardDate}>
                  {formatNoteDate(note.createdAt)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="メモを追加"
        style={styles.fab}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      <NoteComposeModal
        open={composeOpen}
        chainOptions={chainOptions}
        initialNodeId={editing?.nodeId ?? null}
        initialContent={editing?.content ?? ''}
        onCancel={() => setComposeOpen(false)}
        onSubmit={handleSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR_BG,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  empty: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 96, // FAB 分の余白
  },
  card: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardContent: {
    color: COLOR_FG,
    fontSize: 15,
    lineHeight: 22,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardContext: {
    flex: 1,
    color: COLOR_FG_SOFT,
    fontSize: 12,
  },
  cardDate: {
    color: COLOR_FG_FAINT,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLOR_GROW,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: {
    color: COLOR_BG,
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
});
