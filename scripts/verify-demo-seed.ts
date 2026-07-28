// demo seed の検証スクリプト (ビルド不要・最重要 / Issue #238)。
//
// 目的: iOS ビルドを一切せずに、`screenshot-demo-seed.ts` が投入する状態が
//       `docs/release/demo-seed/README.md` §1.2 と一致することを実証する。
//
// 手順:
//   1. in-memory sqlite に **アプリの migration/schema** (`initSchema`) を適用
//      (= 実アプリと同じスキーマ / catalog seed を通す)。
//   2. `screenshot-demo-seed.ts` の seed を注入。
//   3. repository / domain の派生関数 (`countSettlementStages` / `countAchievedNodesOn`)
//      で読み直し、§1.2 の期待値と assert する。
//
// 期待値 (§1.2):
//   - 定着ステージ: settled=3 / almost=0 / growing=7 (見出し「定着 3 / もう少しで定着 0 / 育成中 7」)
//   - 今日の達成:   朝ルーティン 4/4 / 集中の入り 2/3 / 夜ルーティン 0/3
//   - 定着ノード:   node-morning-2 (深呼吸) / node-morning-3 (ストレッチ) / node-focus-2 (タスク)
//
// 実行: npx tsx scripts/verify-demo-seed.ts   (成功で exit 0 / 失敗で exit 1)

import { createBetterSqliteClient } from '../src/db.bettersqlite';
import { initSchema } from '../src/db';
import {
  buildScreenshotDemoSeed,
  applyScreenshotDemoSeed,
  MORNING_CHAIN_ID,
  FOCUS_CHAIN_ID,
  NIGHT_CHAIN_ID,
  SETTLED_NODE_IDS,
} from './screenshot-demo-seed';
import {
  listAllNodeIds,
  listAllAchievements,
  listNodes,
} from '../src/repository';
import { listRetractions } from '../src/settlementRepository';
import {
  countSettlementStages,
  nodeSettlementStage,
  countAchievedNodesOn,
} from '../src/domain';

// 撮影の再現性のため固定日付で検証 (相対構造は today 非依存だが、assert を安定させる)。
const FIXED_TODAY = '2026-07-20';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  if (!ok) failures++;
};

const main = async () => {
  const db = createBetterSqliteClient(':memory:');
  try {
    // 1. アプリの schema/migration を適用 (実アプリと同じ経路)。
    await initSchema(db);

    // 2. seed 注入。
    const seed = buildScreenshotDemoSeed({ today: FIXED_TODAY });
    await applyScreenshotDemoSeed(db, seed);

    // 3. DB から読み直して派生値を assert。
    const today = FIXED_TODAY;
    const nodeIds = await listAllNodeIds(db);
    const achievements = await listAllAchievements(db, today);
    const retractions = await listRetractions(db);

    console.log('== 構造 ==');
    check('チェーン数', seed.chains.length, 3);
    check('ノード総数', nodeIds.length, 10);
    check('取り下げ (retractions)', retractions.length, 0);

    console.log('== 定着ステージ (§1.2: 定着 3 / もう少しで定着 0 / 育成中 7) ==');
    const stages = countSettlementStages(nodeIds, achievements, retractions, today);
    check('settled (定着)', stages.settled, 3);
    check('almost  (もう少しで定着)', stages.almost, 0);
    check('growing (育成中)', stages.growing, 7);

    console.log('== 定着ノードの内訳 (§1.2: 深呼吸 / ストレッチ / タスク) ==');
    const settledActual = nodeIds
      .filter((id) => nodeSettlementStage(achievements, retractions, id, today) === 'settled')
      .sort();
    check('定着ノード ID 集合', settledActual, [...SETTLED_NODE_IDS].sort());

    console.log('== 今日の達成 (§1.2: 朝 4/4 / 集中 2/3 / 夜 0/3) ==');
    const nodesOfChain = async (chainId: string) =>
      (await listNodes(db, chainId)).map((n) => n.id);
    const morningIds = await nodesOfChain(MORNING_CHAIN_ID);
    const focusIds = await nodesOfChain(FOCUS_CHAIN_ID);
    const nightIds = await nodesOfChain(NIGHT_CHAIN_ID);
    check('朝ルーティン 今日達成', countAchievedNodesOn(achievements, morningIds, today), 4);
    check('集中の入り 今日達成', countAchievedNodesOn(achievements, focusIds, today), 2);
    check('夜ルーティン 今日達成', countAchievedNodesOn(achievements, nightIds, today), 0);

    console.log('== ログ画面見出し 育成中 = 未定着ノード合計 (§1.2: 7 = 4-2 + 3-1 + 3) ==');
    check('育成中 (= growing)', stages.growing, 4 - 2 + (3 - 1) + 3);

    console.log('');
    if (failures === 0) {
      console.log('ALL PASS — seed が §1.2 の state と一致 (定着3/almost0/育成7・今日 4-4/2-3/0-3)');
      process.exit(0);
    } else {
      console.error(`${failures} 件の assert が FAIL`);
      process.exit(1);
    }
  } finally {
    await db.close?.();
  }
};

main().catch((err) => {
  console.error('[verify-demo-seed] FAILED:', err);
  process.exit(1);
});
