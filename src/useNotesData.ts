import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { localIsoTimestamp } from './domain';

import { getExpoSqliteClient } from './db.expo';
import { newNoteId } from './ids';
import {
  deleteNote as deleteNoteRow,
  insertNote,
  listNotesWithContext,
  updateNote as updateNoteRow,
} from './notesRepository';
import type { NoteWithContext } from './notesRepository';
import { getAction, listChains, listNodes } from './repository';

// ADR-0044 (#181): 手動メモの一覧 + 作成 / 更新 / 削除 hook。
// 研究画面の FAB と Today アクション長押しの両導線から使う。
// chainOptions = メモ作成時のチェーン → アクション (= ノード) セレクタ用のデータ。

// メモ作成セレクタ用の 1 チェーン (active / stocked 問わず全チェーン)。
export type NoteChainOption = {
  chainId: string;
  chainTitle: string;
  nodes: { nodeId: string; actionTitle: string }[];
};

export type NotesData = {
  notes: NoteWithContext[];
  chainOptions: NoteChainOption[];
};

// ISO-like (秒精度) のタイムスタンプ。 metrics.recorded_at と同フォーマット
// (UTC ベース・標識なし、 Phase 1 N=1 同 TZ 単機運用で実害なし)。
const nowIsoLike = (): string =>
  localIsoTimestamp(new Date());

// メモ 1 件を永続化する共通関数。 研究画面の addNote (hook 経由) と Today アクション
// 長押し (app/(tabs)/index.tsx から直接) の両導線で再利用する (= 生成ロジックの二重化回避)。
// 空メモ (trim 後 0 文字) は保存せず false を返す。
export const persistNewNote = async (
  nodeId: string | null,
  content: string,
): Promise<boolean> => {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  const db = await getExpoSqliteClient();
  const ts = nowIsoLike();
  await insertNote(db, {
    id: newNoteId(),
    nodeId,
    content: trimmed,
    createdAt: ts,
    updatedAt: ts,
  });
  return true;
};

const loadNotes = async (): Promise<NotesData> => {
  const db = await getExpoSqliteClient();
  const notes = await listNotesWithContext(db);
  // 全チェーン (active + stocked) をセレクタ候補にする。 メモは stocked チェーンの
  // アクションにも書けてよい (= 振り返り用途、 active 限定にしない)。
  const chains = await listChains(db);
  const chainOptions = await Promise.all(
    chains.map(async (chain) => {
      const nodes = await listNodes(db, chain.id);
      const withTitles = await Promise.all(
        nodes.map(async (node) => {
          const action = await getAction(db, node.actionId);
          return {
            nodeId: node.id,
            actionTitle: action?.title ?? '(不明なアクション)',
          };
        }),
      );
      return {
        chainId: chain.id,
        chainTitle: chain.title,
        nodes: withTitles,
      };
    }),
  );
  return { notes, chainOptions };
};

export type UseNotesDataResult = {
  data: NotesData | null;
  error: string | null;
  loading: boolean;
  addNote: (nodeId: string | null, content: string) => Promise<void>;
  editNote: (id: string, content: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
};

export const useNotesData = (): UseNotesDataResult => {
  const [data, setData] = useState<NotesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadNotes()
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
      // #294: refreshTick は本体から参照しない「再取得トリガ」なので lint は不要と
      // 判定するが、依存から外すと更新後の再読み込みが止まる。意図的に残す。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshTick]),
  );

  // 失敗時は K-024 同型 silently fallback + error set。 成功で refreshTick を上げて再ロード。
  const addNote = useCallback(
    async (nodeId: string | null, content: string) => {
      try {
        const saved = await persistNewNote(nodeId, content);
        if (saved) setRefreshTick((t) => t + 1);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const editNote = useCallback(async (id: string, content: string) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    try {
      const db = await getExpoSqliteClient();
      await updateNoteRow(db, id, trimmed, nowIsoLike());
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const removeNote = useCallback(async (id: string) => {
    try {
      const db = await getExpoSqliteClient();
      await deleteNoteRow(db, id);
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { data, error, loading, addNote, editNote, removeNote };
};
