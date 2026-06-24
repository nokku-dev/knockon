import type { DbClient } from './db';
import type { Note } from './domain';

// ADR-0044 (#181): 手動メモの永続化。ユーザーが書いた「観測した事実」軸 (派生値ではない、
// ADR-0012 anchor_firings / ADR-0024 metrics と同型)。
// id / createdAt / updatedAt は呼び出し側で生成して渡す (domain/repository 層は expo-crypto /
// Date 生成に依存しない、 K-007 ドメイン層純粋性 / metricsRepository と同じ方針)。

type NoteRow = {
  id: string;
  node_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

const rowToNote = (r: NoteRow): Note => ({
  id: r.id,
  nodeId: r.node_id,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// 研究画面の一覧表示用。メモ本体 + 紐付けノードから派生で解決した
// チェーン / アクションの文脈ラベル (= 保存しない派生、ADR-0001)。
// node_id NULL (汎用メモ) または紐付け先が既に削除済み (SET NULL 済み) の場合は
// 文脈ラベルは全て null になる。actionTitle はアクションの基底タイトル (variant は解決しない、
// メモ文脈の表示には基底ラベルで十分)。
export type NoteWithContext = Note & {
  chainId: string | null;
  chainTitle: string | null;
  actionTitle: string | null;
};

type NoteContextRow = NoteRow & {
  chain_id: string | null;
  chain_title: string | null;
  action_title: string | null;
};

const rowToNoteWithContext = (r: NoteContextRow): NoteWithContext => ({
  ...rowToNote(r),
  chainId: r.chain_id,
  chainTitle: r.chain_title,
  actionTitle: r.action_title,
});

// 1 件保存。
export const insertNote = async (db: DbClient, note: Note): Promise<void> => {
  await db.run(
    `INSERT INTO notes (id, node_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [note.id, note.nodeId, note.content, note.createdAt, note.updatedAt],
  );
};

// 全メモを新しい順 (created_at 降順) で取得 + チェーン / アクションの文脈を LEFT JOIN で派生解決。
export const listNotesWithContext = async (
  db: DbClient,
): Promise<NoteWithContext[]> => {
  const rows = await db.all<NoteContextRow>(
    `SELECT
       notes.id        AS id,
       notes.node_id   AS node_id,
       notes.content   AS content,
       notes.created_at AS created_at,
       notes.updated_at AS updated_at,
       nodes.chain_id  AS chain_id,
       chains.title    AS chain_title,
       actions.title   AS action_title
     FROM notes
     LEFT JOIN nodes   ON notes.node_id    = nodes.id
     LEFT JOIN chains  ON nodes.chain_id   = chains.id
     LEFT JOIN actions ON nodes.action_id  = actions.id
     ORDER BY notes.created_at DESC`,
  );
  return rows.map(rowToNoteWithContext);
};

// 本文を更新 (updated_at は呼び出し側が生成して渡す)。
export const updateNote = async (
  db: DbClient,
  id: string,
  content: string,
  updatedAt: string,
): Promise<void> => {
  await db.run(`UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`, [
    content,
    updatedAt,
    id,
  ]);
};

// id 指定で削除。
export const deleteNote = async (db: DbClient, id: string): Promise<void> => {
  await db.run(`DELETE FROM notes WHERE id = ?`, [id]);
};
