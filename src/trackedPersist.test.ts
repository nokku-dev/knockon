import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const mockTrack = jest.fn();
const mockRecordAchievement = jest.fn(async () => undefined);
const mockInsertRetraction = jest.fn(async () => undefined);

jest.mock('./analytics', () => ({ track: mockTrack }));
jest.mock('./repository', () => ({ recordAchievement: mockRecordAchievement }));
jest.mock('./settlementRepository', () => ({
  insertRetraction: mockInsertRetraction,
}));

import { SETTLEMENT_DEFINITION_VERSION } from './analyticsEvents';
import type { DbClient } from './db';
import type { Achievement } from './domain';
import {
  persistNodeAchievement,
  persistSettlementRetraction,
} from './trackedPersist';

const db = {} as DbClient;

// 定着バーを満たす 10 日 (14D 窓に収まる)。
const settledHistory = (nodeId: string, upTo: string): Achievement[] =>
  Array.from({ length: 10 }, (_, i) => ({
    nodeId,
    date: `2026-04-${String(i + 1).padStart(2, '0')}`,
    achieved: true,
  })).concat([{ nodeId, date: upTo, achieved: true }]);

beforeEach(() => {
  mockTrack.mockClear();
  mockRecordAchievement.mockClear();
  mockInsertRetraction.mockClear();
});

describe('persistNodeAchievement — 達成の永続化と計測を 1 箇所にまとめる (#293)', () => {
  test('達成レコードを永続化し node_completed を送る', async () => {
    await persistNodeAchievement(db, {
      nodeId: 'n1',
      date: '2026-04-11',
      achieved: true,
      nodePosition: 2,
      chainNodeCount: 5,
      historyAfter: [{ nodeId: 'n1', date: '2026-04-11', achieved: true }],
      retractions: [],
      wasSettled: false,
    });
    expect(mockRecordAchievement).toHaveBeenCalledWith(db, {
      nodeId: 'n1',
      date: '2026-04-11',
      achieved: true,
    });
    expect(mockTrack).toHaveBeenCalledWith('node_completed', {
      node_position: 2,
      chain_node_count: 5,
      is_settled: false,
    });
  });

  test('取り消し (achieved=false) は永続化するがイベントは送らない', async () => {
    // ADR-0053: 悪シグナルのイベントは作らない (良シグナルの不在としてクエリ側で定義する)。
    await persistNodeAchievement(db, {
      nodeId: 'n1',
      date: '2026-04-11',
      achieved: false,
      nodePosition: 0,
      chainNodeCount: 3,
      historyAfter: [],
      retractions: [],
      wasSettled: false,
    });
    expect(mockRecordAchievement).toHaveBeenCalledTimes(1);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  test('このタップで定着に到達したら node_settled も送る', async () => {
    await persistNodeAchievement(db, {
      nodeId: 'n1',
      date: '2026-04-11',
      achieved: true,
      nodePosition: 0,
      chainNodeCount: 1,
      historyAfter: settledHistory('n1', '2026-04-11'),
      retractions: [],
      wasSettled: false,
    });
    expect(mockTrack).toHaveBeenCalledWith('node_completed', {
      node_position: 0,
      chain_node_count: 1,
      is_settled: true,
    });
    expect(mockTrack).toHaveBeenCalledWith('node_settled', {
      days_to_settle: expect.any(Number),
      definition_version: SETTLEMENT_DEFINITION_VERSION,
    });
  });

  test('既に定着済みなら node_settled は送らない (到達の瞬間だけ)', async () => {
    await persistNodeAchievement(db, {
      nodeId: 'n1',
      date: '2026-04-11',
      achieved: true,
      nodePosition: 0,
      chainNodeCount: 1,
      historyAfter: settledHistory('n1', '2026-04-11'),
      retractions: [],
      wasSettled: true,
    });
    const events = mockTrack.mock.calls.map((c) => c[0]);
    expect(events).toContain('node_completed');
    expect(events).not.toContain('node_settled');
  });

  test('永続化に失敗したらイベントを送らない (送るのは成立した事実だけ)', async () => {
    mockRecordAchievement.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      persistNodeAchievement(db, {
        nodeId: 'n1',
        date: '2026-04-11',
        achieved: true,
        nodePosition: 0,
        chainNodeCount: 1,
        historyAfter: [{ nodeId: 'n1', date: '2026-04-11', achieved: true }],
        retractions: [],
        wasSettled: false,
      }),
    ).rejects.toThrow('disk full');
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe('persistSettlementRetraction — 取り下げの永続化と計測 (#293)', () => {
  test('取り下げを永続化し settlement_retracted を送る', async () => {
    await persistSettlementRetraction(db, {
      nodeId: 'n1',
      retractedAt: '2026-04-11T09:00:00',
      today: '2026-04-11',
      achievements: settledHistory('n1', '2026-04-11'),
    });
    expect(mockInsertRetraction).toHaveBeenCalledWith(db, {
      nodeId: 'n1',
      retractedAt: '2026-04-11T09:00:00',
    });
    expect(mockTrack).toHaveBeenCalledWith('settlement_retracted', {
      days_since_settled: expect.any(Number),
    });
  });

  test('永続化に失敗したらイベントを送らない', async () => {
    mockInsertRetraction.mockRejectedValueOnce(new Error('locked'));
    await expect(
      persistSettlementRetraction(db, {
        nodeId: 'n1',
        retractedAt: '2026-04-11T09:00:00',
        today: '2026-04-11',
        achievements: [],
      }),
    ).rejects.toThrow('locked');
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

// ── 入口が増えても漏れないことを機械的に固定する ─────────────────────────────
//
// #293 の原因は「イベント送信を各呼び出し側に書いていた」こと。入口が増えるたびに
// 書き忘れが起きるが、書き忘れても**何も落ちない**（計測が静かに減るだけ）。
// 個別に足すだけでは 3 度目が起きるので、**永続化とイベント送信を同じ場所に置いた上で、
// 生の永続化関数を直接呼ばせない**ことをテストで固定する。
//
// #292 と同じ設計にする: 列挙ではなく全走査 + 除外リスト + 検査器自身の検証。

const REPO_ROOT = join(__dirname, '..');
const SCAN_ROOTS = ['src', 'app'];

const DIRECT_WRITE_FUNCTIONS = ['recordAchievement', 'insertRetraction'];

// 生の永続化関数を直接呼んでよいファイル。
const ALLOWED_DIRECT_CALLERS: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: 'src/trackedPersist.ts',
    reason: '永続化とイベント送信をまとめる層。ここだけが直接呼ぶ',
  },
  {
    path: 'src/repository.ts',
    reason: 'recordAchievement の定義元',
  },
  {
    path: 'src/settlementRepository.ts',
    reason: 'insertRetraction の定義元',
  },
  {
    path: 'src/seed.ts',
    reason: 'dev 専用。ダミーデータ投入で計測イベントを送ってはいけない',
  },
  {
    path: 'src/screenshotSeed.ts',
    reason: 'dev 専用。ダミーデータ投入で計測イベントを送ってはいけない',
  },
];

const ALLOWED_PATHS = new Set(ALLOWED_DIRECT_CALLERS.map((a) => a.path));

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
};

const scannedFiles = SCAN_ROOTS.flatMap((root) =>
  listSourceFiles(join(REPO_ROOT, root)),
).map((full) => relative(REPO_ROOT, full).split(sep).join('/'));

const stripComments = (src: string): string =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const callsDirectly = (src: string): boolean => {
  const code = stripComments(src);
  return DIRECT_WRITE_FUNCTIONS.some((fn) => code.includes(`${fn}(`));
};

describe('生の永続化関数は trackedPersist 経由でしか呼ばない (#293)', () => {
  describe('検査器が機能していること', () => {
    test('走査対象が空でない', () => {
      expect(scannedFiles.length).toBeGreaterThan(50);
      expect(scannedFiles).toContain('src/useTodayData.ts');
      expect(scannedFiles).toContain('src/useAnalyticsData.ts');
    });

    test('既知の違反パターンを検出する', () => {
      expect(callsDirectly('await recordAchievement(db, a);')).toBe(true);
      expect(callsDirectly('await insertRetraction(db, r);')).toBe(true);
    });

    test('コメント内の言及は違反にしない', () => {
      expect(callsDirectly('// recordAchievement(db, a) を直接呼ばない')).toBe(
        false,
      );
    });
  });

  test('除外リストに無いファイルは生の永続化関数を呼んでいない', () => {
    const violations = scannedFiles.filter(
      (p) =>
        !ALLOWED_PATHS.has(p) &&
        callsDirectly(readFileSync(join(REPO_ROOT, p), 'utf8')),
    );
    expect(violations).toEqual([]);
  });

  test.each(ALLOWED_DIRECT_CALLERS.map((a) => a.path))(
    '除外リストの %s が実在する',
    (path) => {
      expect(scannedFiles).toContain(path);
    },
  );
});
