import { createBetterSqliteClient } from './db.bettersqlite';
import { initSchema } from './db';
import { buildV0Catalog, seedCatalog, V0_CATALOG_DEFS } from './catalogSeed';
import { listLinks, listLinksForModule, listModules } from './repository';
import type { DbClient } from './db';

const setup = async (): Promise<DbClient> => {
  const db = createBetterSqliteClient(':memory:');
  await initSchema(db);
  return db;
};

describe('buildV0Catalog — §9 カタログの純粋展開 (#69)', () => {
  test('モジュールは定義数だけ展開され、全て official / normal', () => {
    const { modules } = buildV0Catalog();
    expect(modules).toHaveLength(V0_CATALOG_DEFS.length);
    expect(modules.every((m) => m.source === 'official')).toBe(true);
    expect(modules.every((m) => m.kind === 'normal')).toBe(true);
    // orderIndex は 0..n-1 の連番
    expect(modules.map((m) => m.orderIndex)).toEqual(
      modules.map((_, i) => i),
    );
  });

  test('moment / goal は単一要素の配列、color は goal から導出される', () => {
    const { modules } = buildV0Catalog();
    const water = modules.find((m) => m.id === 'mod-wake-water')!;
    expect(water.moment).toEqual(['morning']);
    expect(water.goal).toEqual(['health']);
    expect(water.color).toBe('#4FB0AE'); // health の色
  });

  test('全リンクは必ず 1 モジュールに属す (orphan なし) / 全て official', () => {
    const { modules, links } = buildV0Catalog();
    const moduleIds = new Set(modules.map((m) => m.id));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => moduleIds.has(l.moduleId))).toBe(true);
    expect(links.every((l) => l.source === 'official')).toBe(true);
  });

  test('starter はモジュール単位で継承される (★モジュールの全リンクが starter)', () => {
    const { links } = buildV0Catalog();
    // mod-wake-water は ★ → 全リンク starter
    const waterLinks = links.filter((l) => l.moduleId === 'mod-wake-water');
    expect(waterLinks.every((l) => l.starter)).toBe(true);
    // mod-cardio は ★なし → 全リンク非 starter
    const cardioLinks = links.filter((l) => l.moduleId === 'mod-cardio');
    expect(cardioLinks.length).toBeGreaterThan(0);
    expect(cardioLinks.every((l) => !l.starter)).toBe(true);
  });

  test('defaultOn は ● / ○ を反映 (体重計・サプリは ○ = false)', () => {
    const { links } = buildV0Catalog();
    expect(links.find((l) => l.id === 'lnk-brush-teeth')?.defaultOn).toBe(true);
    expect(links.find((l) => l.id === 'lnk-weigh')?.defaultOn).toBe(false);
    expect(links.find((l) => l.id === 'lnk-supplement')?.defaultOn).toBe(false);
  });

  test('position は moment 内で通し番号 (所属モジュールとは独立)', () => {
    const { links } = buildV0Catalog();
    const morning = links
      .filter((l) => {
        // morning モジュール所属のリンクを moment で判定するため、id プレフィクスではなく
        // buildV0Catalog の position 連番性を見る: morning の先頭リンクは position 0
        return l.id === 'lnk-brush-teeth';
      })
      .map((l) => l.position);
    expect(morning).toEqual([0]); // morning の最初のリンク
    // noon は別カウンタ → 最初のリンク (lnk-prep-lunch) は position 0
    expect(links.find((l) => l.id === 'lnk-prep-lunch')?.position).toBe(0);
    // night も別カウンタ → 最初のリンク (lnk-prep-dinner) は position 0
    expect(links.find((l) => l.id === 'lnk-prep-dinner')?.position).toBe(0);
  });

  test('ID は全モジュール / 全リンクで一意', () => {
    const { modules, links } = buildV0Catalog();
    const moduleIds = modules.map((m) => m.id);
    const linkIds = links.map((l) => l.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(linkIds).size).toBe(linkIds.length);
  });
});

describe('seedCatalog — DB 投入 (#69)', () => {
  test('seed 後、catalog が DB から読み出せる', async () => {
    const db = await setup();
    await seedCatalog(db);
    const modules = await listModules(db);
    const links = await listLinks(db);
    const { modules: expectedModules, links: expectedLinks } = buildV0Catalog();
    // official catalog の round-trip (custom inbox #73 は別途検証 / K-033 seed 非依存)
    const officialModules = modules.filter((m) => m.source === 'official');
    expect(officialModules).toHaveLength(expectedModules.length);
    expect(links).toHaveLength(expectedLinks.length);
    // JSON 往復が成立する (moment/goal 配列)
    const water = modules.find((m) => m.id === 'mod-wake-water')!;
    expect(water.moment).toEqual(['morning']);
    expect(water.goal).toEqual(['health']);
    await db.close?.();
  });

  test('listLinksForModule で所属リンクを取得できる', async () => {
    const db = await setup();
    await seedCatalog(db);
    const waterLinks = await listLinksForModule(db, 'mod-wake-water');
    expect(waterLinks.map((l) => l.title)).toEqual([
      '歯磨き',
      'お湯を沸かす',
      '白湯',
      '体重計',
      'サプリ',
    ]);
    await db.close?.();
  });

  test('冪等性: seedCatalog を 2 回呼んでも重複しない (INSERT OR IGNORE)', async () => {
    const db = await setup();
    await seedCatalog(db);
    await seedCatalog(db); // 2 回目
    const modules = await listModules(db);
    const links = await listLinks(db);
    const { modules: expectedModules, links: expectedLinks } = buildV0Catalog();
    // 公式 + custom inbox の両方とも重複しない (INSERT OR IGNORE)
    expect(modules.filter((m) => m.source === 'official')).toHaveLength(
      expectedModules.length,
    );
    expect(modules.filter((m) => m.id === 'mod-custom-inbox')).toHaveLength(1);
    expect(links).toHaveLength(expectedLinks.length);
    await db.close?.();
  });

  test('initSchema が seedCatalog を自動実行する (毎起動投入)', async () => {
    // setup (= initSchema) だけで catalog が入っていること
    const db = await setup();
    const modules = await listModules(db);
    expect(modules.filter((m) => m.source === 'official').length).toBe(
      V0_CATALOG_DEFS.length,
    );
    await db.close?.();
  });

  test('#73: カスタムインボックスモジュール (kind=custom / source=user) が seed される', async () => {
    const db = await setup();
    const modules = await listModules(db);
    const inbox = modules.find((m) => m.id === 'mod-custom-inbox');
    expect(inbox).toBeTruthy();
    expect(inbox?.kind).toBe('custom');
    expect(inbox?.source).toBe('user');
    await db.close?.();
  });
});
