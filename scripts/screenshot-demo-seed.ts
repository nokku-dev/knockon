// App Store スクリーンショット用 demo seed 投入スクリプト (POC / Issue #238)。
//
// 役割: knockon.db (expo-sqlite が作った実 DB / または検証用 temp DB) を
//       better-sqlite3 で直接開き、`docs/release/demo-seed/README.md` §1.1/§1.2 の
//       「3 チェーン + 達成 + 定着状態」を注入する **純粋なデータ投入スクリプト**。
//
// 設計方針:
// - SQL 手書きは避け、既存 `src/repository.ts` の insert 関数を再利用する
//   (ドメインの正準データ経路に乗せる = スキーマ差異に強い / K-002 の派生値非保存を尊重)。
// - 時刻・日付は「1 回だけ取得した now」から全て決定論的に導出する (撮影の再現性)。
//   → 相対構造 (定着窓 D-13..D-4 / 今日 D-0) は固定。絶対日付は撮影日に追従する
//     (アプリの `effectiveTodayIsoDate` は reset_time='00:00' 既定で端末ローカル日付 =
//      撮影マシンのローカル日付と一致するため、今日の達成カウントが正しく出る)。
// - ids.ts (expo-crypto 依存) は import せず、固定文字列 ID を使う (node/tsx で動く +
//   ChainDetail deep-link `knockon://chain/chain-morning` から実 ID を参照できる)。
//
// 使い方:
//   npx tsx scripts/screenshot-demo-seed.ts <path-to-knockon.db> [YYYY-MM-DD]
//   - 第 1 引数: 注入先 DB パス (必須)。
//   - 第 2 引数: today 基準日 (省略時は端末ローカルの今日)。検証・固定撮影用。
//
// 冪等性: 同じ DB に 2 回流すと PK 衝突で失敗する (fresh install 前提)。撮影は必ず
//         Erase All Content → fresh install → 1 回だけ流す運用 (capture スクリプト参照)。

import { createBetterSqliteClient } from '../src/db.bettersqlite';
import type { DbClient } from '../src/db';
import type {
  Achievement,
  Action,
  Anchor,
  Chain,
  Node,
} from '../src/domain';
import { todayIsoDate, recentDateRange } from '../src/domain';
import {
  insertAnchor,
  insertAction,
  insertChain,
  insertNode,
  recordAchievement,
} from '../src/repository';

// ── 固定 ID (deep-link から参照するため決定論的) ────────────────────────────
export const MORNING_CHAIN_ID = 'chain-morning';
export const FOCUS_CHAIN_ID = 'chain-focus';
export const NIGHT_CHAIN_ID = 'chain-night';

// 定着させる 3 ノード (§1.2: 左マーカー星型) の ID。
export const SETTLED_NODE_IDS = [
  'node-morning-2', // 朝ルーティン ②深呼吸 3 回
  'node-morning-3', // 朝ルーティン ③5 分ストレッチ
  'node-focus-2', //   集中の入り ②今日 1 番の 1 タスクを書く
] as const;

export type ScreenshotDemoSeed = {
  anchors: Anchor[];
  actions: Action[];
  chains: Chain[];
  nodes: Node[];
  achievements: Achievement[];
};

export type BuildOptions = {
  // 撮影当日 (端末ローカル日付) 相当の IsoDate。全ての相対日付の基準。
  today: string;
  // チェーンの作成時刻 (created_at)。listChains は created_at 昇順なので
  // 朝 → 集中 → 夜 の順に増加させて一覧の並びを固定する。
  createdAtBase?: string;
};

// 「定着 latch」を満たす 14D 窓の中に minAchievedDays=10 日ぶんの達成を作る。
// today を右端に含めず、D-13..D-4 の 10 日を使う (直近 D-3..D-1 が未達でも latch は維持
// される = isNodeSettled の存在判定 / ADR-0047)。today (D-0) の達成は別途「今日の達成」
// として下で明示的に足す。
const SETTLE_OFFSET_START = 4; // D-4
const SETTLE_OFFSET_END = 13; // D-13 (両端含む = 10 日)

// today から offset 日前の IsoDate。recentDateRange(today, offset+1)[0] が D-offset。
const dateMinus = (today: string, offset: number): string =>
  recentDateRange(today, offset + 1)[0]!;

export const buildScreenshotDemoSeed = (
  options: BuildOptions,
): ScreenshotDemoSeed => {
  const { today } = options;
  const base = options.createdAtBase ?? `${today}T00:00:00`;
  // created_at を朝 < 集中 < 夜 の順に固定 (一覧の並び順を決定論的に)。
  const createdAt = (n: number) => `${base.slice(0, 10)}T00:00:0${n}`;

  // ── アンカー ───────────────────────────────────────────────
  const anchorMorning: Anchor = {
    id: 'anchor-morning',
    title: '', // 時刻アンカーは time フィールドで表示 (UI 作成時 title は空・useChainEdit 既定)
    kind: 'time',
    time: '07:00',
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };
  const anchorFocus: Anchor = {
    id: 'anchor-focus',
    title: '机に座ったら', // 行動アンカーは title を表示
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };
  const anchorNight: Anchor = {
    id: 'anchor-night',
    title: '',
    kind: 'time',
    time: '22:30',
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };

  // ── アクション (title は §1.1 と 1 文字違わず一致させる) ─────────
  const mkAction = (
    id: string,
    title: string,
    timerSeconds: number | null = null,
  ): Action => ({ id, title, variants: null, timerSeconds });

  const actions: Action[] = [
    // 朝ルーティン
    mkAction('action-morning-water', 'コップ 1 杯の水'),
    mkAction('action-morning-breath', '深呼吸 3 回'),
    mkAction('action-morning-stretch', '5 分ストレッチ'),
    mkAction('action-morning-journal', 'ジャーナル 2 行'),
    // 集中の入り
    mkAction('action-focus-tabs', 'タブを 1 枚に絞る'),
    mkAction('action-focus-task', '今日 1 番の 1 タスクを書く'),
    mkAction('action-focus-timer', 'タイマー 25 分', 25 * 60), // §1.1: 25 分タイマー
    // 夜ルーティン
    mkAction('action-night-desk', '机の上を空にする'),
    mkAction('action-night-plan', '明日の 1 タスクを 1 行'),
    mkAction('action-night-light', 'ライトを暖色に'),
  ];

  // ── チェーン ───────────────────────────────────────────────
  const chains: Chain[] = [
    {
      id: MORNING_CHAIN_ID,
      title: '朝ルーティン',
      anchorId: anchorMorning.id,
      status: 'active',
      createdAt: createdAt(1),
    },
    {
      id: FOCUS_CHAIN_ID,
      title: '集中の入り',
      anchorId: anchorFocus.id,
      status: 'active',
      createdAt: createdAt(2),
    },
    {
      id: NIGHT_CHAIN_ID,
      title: '夜ルーティン',
      anchorId: anchorNight.id,
      status: 'active',
      createdAt: createdAt(3),
    },
  ];

  // ── ノード (order_index は表の順序) ───────────────────────────
  const mkNode = (
    id: string,
    chainId: string,
    orderIndex: number,
    actionId: string,
  ): Node => ({ id, chainId, orderIndex, kind: 'action', actionId });

  const nodes: Node[] = [
    // 朝ルーティン ①〜④
    mkNode('node-morning-1', MORNING_CHAIN_ID, 0, 'action-morning-water'),
    mkNode('node-morning-2', MORNING_CHAIN_ID, 1, 'action-morning-breath'),
    mkNode('node-morning-3', MORNING_CHAIN_ID, 2, 'action-morning-stretch'),
    mkNode('node-morning-4', MORNING_CHAIN_ID, 3, 'action-morning-journal'),
    // 集中の入り ①〜③
    mkNode('node-focus-1', FOCUS_CHAIN_ID, 0, 'action-focus-tabs'),
    mkNode('node-focus-2', FOCUS_CHAIN_ID, 1, 'action-focus-task'),
    mkNode('node-focus-3', FOCUS_CHAIN_ID, 2, 'action-focus-timer'),
    // 夜ルーティン ①〜③
    mkNode('node-night-1', NIGHT_CHAIN_ID, 0, 'action-night-desk'),
    mkNode('node-night-2', NIGHT_CHAIN_ID, 1, 'action-night-plan'),
    mkNode('node-night-3', NIGHT_CHAIN_ID, 2, 'action-night-light'),
  ];

  // ── 達成 (achievements) ───────────────────────────────────
  const achievements: Achievement[] = [];

  // (a) 定着 latch 用: 3 ノードに D-13..D-4 の 10 日ぶんを注入。
  for (const nodeId of SETTLED_NODE_IDS) {
    for (let off = SETTLE_OFFSET_START; off <= SETTLE_OFFSET_END; off++) {
      achievements.push({ nodeId, date: dateMinus(today, off), achieved: true });
    }
  }

  // (b) 今日の達成 (§1.2 の Today カード絵作り):
  //   朝ルーティン: 4/4 全達成 / 集中の入り: ①② のみ (2/3) / 夜ルーティン: 0/3。
  const todayAchievedNodeIds = [
    'node-morning-1',
    'node-morning-2',
    'node-morning-3',
    'node-morning-4', // 朝 4/4
    'node-focus-1',
    'node-focus-2', // 集中 2/3 (③タイマーは未達)
    // 夜ルーティンは今日タップなし (0/3)
  ];
  for (const nodeId of todayAchievedNodeIds) {
    achievements.push({ nodeId, date: today, achieved: true });
  }

  return {
    anchors: [anchorMorning, anchorFocus, anchorNight],
    actions,
    chains,
    nodes,
    achievements,
  };
};

// repository の insert 関数で seed を DB に流す (SQL 手書き回避)。
export const applyScreenshotDemoSeed = async (
  db: DbClient,
  seed: ScreenshotDemoSeed,
): Promise<void> => {
  for (const anchor of seed.anchors) await insertAnchor(db, anchor);
  for (const action of seed.actions) await insertAction(db, action);
  for (const chain of seed.chains) await insertChain(db, chain);
  for (const node of seed.nodes) await insertNode(db, node);
  for (const a of seed.achievements) await recordAchievement(db, a);
};

// ── CLI エントリ ────────────────────────────────────────────
const isMain = () => {
  // tsx / node どちらでも「直接実行」を検出。
  const entry = process.argv[1] ?? '';
  return entry.includes('screenshot-demo-seed');
};

const main = async () => {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error(
      'usage: tsx scripts/screenshot-demo-seed.ts <path-to-knockon.db> [YYYY-MM-DD]',
    );
    process.exit(1);
  }
  const now = new Date();
  const today = process.argv[3] ?? todayIsoDate(now); // 単一の now から決定論的に導出
  const db = createBetterSqliteClient(dbPath);
  try {
    const seed = buildScreenshotDemoSeed({ today });
    await applyScreenshotDemoSeed(db, seed);
    console.log(
      `[screenshot-demo-seed] injected 3 chains / ${seed.nodes.length} nodes / ` +
        `${seed.achievements.length} achievements into ${dbPath} (today=${today})`,
    );
    console.log(
      `[screenshot-demo-seed] settled nodes: ${SETTLED_NODE_IDS.join(', ')}`,
    );
    console.log(
      `[screenshot-demo-seed] deep-link ids: morning=${MORNING_CHAIN_ID} focus=${FOCUS_CHAIN_ID} night=${NIGHT_CHAIN_ID}`,
    );
  } finally {
    await db.close?.();
  }
};

if (isMain()) {
  main().catch((err) => {
    console.error('[screenshot-demo-seed] FAILED:', err);
    process.exit(1);
  });
}
