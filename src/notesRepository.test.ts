import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import type { DbClient } from './db';
import {
  deleteChain,
  deleteNode,
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
} from './repository';
import {
  deleteNote,
  insertNote,
  listNotesWithContext,
  updateNote,
} from './notesRepository';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  await insertAnchor(db, {
    id: 'anchor-1',
    title: '起床',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  });
  await insertAction(db, {
    id: 'action-1',
    title: '水を飲む',
    variants: null,
    timerSeconds: null,
  });
  await insertChain(db, {
    id: 'chain-1',
    title: '朝のチェーン',
    anchorId: 'anchor-1',
    status: 'active',
    createdAt: '2026-06-24',
  });
  await insertNode(db, {
    id: 'node-1',
    chainId: 'chain-1',
    orderIndex: 0,
    kind: 'action',
    actionId: 'action-1',
  });
  return db;
};

const teardown = async (db: DbClient) => {
  await db.close?.();
};

describe('notesRepository — ADR-0044 手動メモ', () => {
  test('ノード紐付きメモを保存し、チェーン / アクション文脈を派生解決して取得する', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-1',
      nodeId: 'node-1',
      content: '今日は調子が良かった',
      createdAt: '2026-06-24T09:00:00',
      updatedAt: '2026-06-24T09:00:00',
    });
    const notes = await listNotesWithContext(db);
    expect(notes).toEqual([
      {
        id: 'note-1',
        nodeId: 'node-1',
        content: '今日は調子が良かった',
        createdAt: '2026-06-24T09:00:00',
        updatedAt: '2026-06-24T09:00:00',
        chainId: 'chain-1',
        chainTitle: '朝のチェーン',
        actionTitle: '水を飲む',
      },
    ]);
    await teardown(db);
  });

  test('汎用メモ (node_id NULL) は文脈ラベルが全て null で取得される', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-general',
      nodeId: null,
      content: '全体的な気づき',
      createdAt: '2026-06-24T10:00:00',
      updatedAt: '2026-06-24T10:00:00',
    });
    const notes = await listNotesWithContext(db);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      nodeId: null,
      chainId: null,
      chainTitle: null,
      actionTitle: null,
    });
    await teardown(db);
  });

  test('一覧は created_at 降順 (新しい順)', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-old',
      nodeId: null,
      content: '古い',
      createdAt: '2026-06-23T08:00:00',
      updatedAt: '2026-06-23T08:00:00',
    });
    await insertNote(db, {
      id: 'note-new',
      nodeId: null,
      content: '新しい',
      createdAt: '2026-06-24T08:00:00',
      updatedAt: '2026-06-24T08:00:00',
    });
    const notes = await listNotesWithContext(db);
    expect(notes.map((n) => n.id)).toEqual(['note-new', 'note-old']);
    await teardown(db);
  });

  test('本文を更新できる (updated_at も反映)', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-1',
      nodeId: 'node-1',
      content: '初稿',
      createdAt: '2026-06-24T09:00:00',
      updatedAt: '2026-06-24T09:00:00',
    });
    await updateNote(db, 'note-1', '改稿', '2026-06-24T12:00:00');
    const notes = await listNotesWithContext(db);
    expect(notes[0]).toMatchObject({
      content: '改稿',
      updatedAt: '2026-06-24T12:00:00',
    });
    await teardown(db);
  });

  test('削除できる', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-1',
      nodeId: null,
      content: '消す',
      createdAt: '2026-06-24T09:00:00',
      updatedAt: '2026-06-24T09:00:00',
    });
    await deleteNote(db, 'note-1');
    const notes = await listNotesWithContext(db);
    expect(notes).toEqual([]);
    await teardown(db);
  });

  test('ノード削除時もメモ本文は残り node_id が NULL になる (ON DELETE SET NULL / Augmentation)', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-1',
      nodeId: 'node-1',
      content: 'ノードが消えても残したい',
      createdAt: '2026-06-24T09:00:00',
      updatedAt: '2026-06-24T09:00:00',
    });
    await deleteNode(db, 'node-1');
    const notes = await listNotesWithContext(db);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'note-1',
      content: 'ノードが消えても残したい',
      nodeId: null,
      chainId: null,
      chainTitle: null,
      actionTitle: null,
    });
    await teardown(db);
  });

  test('チェーン削除 (ノード CASCADE) 経由でもメモ本文は残り node_id が NULL になる', async () => {
    const db = await setup();
    await insertNote(db, {
      id: 'note-1',
      nodeId: 'node-1',
      content: 'チェーンが消えても残したい',
      createdAt: '2026-06-24T09:00:00',
      updatedAt: '2026-06-24T09:00:00',
    });
    await deleteChain(db, 'chain-1');
    const notes = await listNotesWithContext(db);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'note-1',
      content: 'チェーンが消えても残したい',
      nodeId: null,
    });
    await teardown(db);
  });
});
