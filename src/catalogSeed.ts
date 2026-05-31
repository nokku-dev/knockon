import type { DbClient } from './db';
import type { Link, Module } from './domain';
import { seedLink, seedModule } from './repository';

// #69 (ADR-0030): v0 モジュールカタログ。SPEC docs/template-modules-spec.md §9 由来
// (実 export + 汎用化)。テンプレ catalog 専用 (live と分離)。採用フローは #70。
//
// 持ち方: TS の中間定義 (CatalogModuleDef) を純粋関数 buildV0Catalog で
// Module[] / Link[] に展開する。投入は initSchema 末尾で seedCatalog を毎起動
// 呼び出し (固定 ID + INSERT OR IGNORE で冪等)。
//
// スコープ外 (後続 Issue):
// - カスタムインボックス module (kind='custom') → 編集 UI #73 の受け皿として作る
// - 採用フロー (links → nodes/actions 変換) → #70
// - moment / goal の語彙確定・色の最終調整 → discovery #70 / a11y #74

// goal カテゴリ → モジュール色。#74 (a11y) で最終調整する暫定パレット。
// 色のみに依存しない設計 (ラベル併用) は #74 で担保するため、ここは識別用の仮色。
const GOAL_COLORS: Record<string, string> = {
  health: '#4FB0AE',
  skincare: '#C9849E',
  exercise: '#5B8DEF',
  beverage: '#B5835A',
  meal: '#E0A24C',
  grooming: '#7C9CBF',
  chores: '#8B9EB0',
  reflection: '#9B87C4',
};

const FALLBACK_COLOR = '#8B9EB0';

type CatalogLinkDef = {
  id: string;
  title: string;
  defaultOn: boolean; // ● = true / ○ = false
  timerSeconds?: number;
};

type CatalogModuleDef = {
  id: string;
  name: string;
  goal: string;
  moment: string; // 'morning' | 'noon' | 'night'
  starter: boolean; // ★ = true (モジュール内全リンクの starter になる)
  links: CatalogLinkDef[];
};

// SPEC §9 の v0 カタログ。●=defaultOn true / ○=false / ★=starter モジュール。
export const V0_CATALOG_DEFS: readonly CatalogModuleDef[] = [
  // 朝｜起床
  {
    id: 'mod-wake-water',
    name: '目覚め・水分',
    goal: 'health',
    moment: 'morning',
    starter: true,
    links: [
      { id: 'lnk-brush-teeth', title: '歯磨き', defaultOn: true },
      { id: 'lnk-boil-water', title: 'お湯を沸かす', defaultOn: true },
      { id: 'lnk-warm-water', title: '白湯', defaultOn: true },
      { id: 'lnk-weigh', title: '体重計', defaultOn: false },
      { id: 'lnk-supplement', title: 'サプリ', defaultOn: false },
    ],
  },
  {
    id: 'mod-morning-skincare',
    name: '朝スキンケア',
    goal: 'skincare',
    moment: 'morning',
    starter: true,
    links: [
      { id: 'lnk-face-wash', title: '洗顔', defaultOn: true },
      { id: 'lnk-moisturize', title: '化粧水・保湿', defaultOn: true },
      { id: 'lnk-sunscreen', title: '日焼け止め', defaultOn: false },
    ],
  },
  {
    id: 'mod-cardio',
    name: '有酸素',
    goal: 'exercise',
    moment: 'morning',
    starter: false,
    links: [
      { id: 'lnk-stretch-morning', title: 'ストレッチ', defaultOn: true },
      { id: 'lnk-walk', title: 'ウォーキング30分', defaultOn: true },
    ],
  },
  {
    id: 'mod-strength',
    name: '筋トレ・補給',
    goal: 'exercise',
    moment: 'morning',
    starter: false,
    links: [
      { id: 'lnk-make-protein', title: 'プロテイン作る', defaultOn: true },
      { id: 'lnk-workout', title: '筋トレ', defaultOn: true },
      { id: 'lnk-drink-protein', title: 'プロテイン飲む', defaultOn: true },
    ],
  },
  {
    id: 'mod-coffee',
    name: 'コーヒー',
    goal: 'beverage',
    moment: 'morning',
    starter: false,
    links: [{ id: 'lnk-brew-coffee', title: 'コーヒーを淹れる', defaultOn: true }],
  },
  {
    id: 'mod-breakfast',
    name: '朝食',
    goal: 'meal',
    moment: 'morning',
    starter: true,
    links: [
      { id: 'lnk-prep-breakfast', title: '朝食準備', defaultOn: true },
      { id: 'lnk-breakfast', title: '朝食', defaultOn: true },
      { id: 'lnk-soak-dishes-morning', title: '食器を水につける', defaultOn: false },
    ],
  },
  {
    id: 'mod-grooming',
    name: '身支度',
    goal: 'grooming',
    moment: 'morning',
    starter: false,
    links: [
      { id: 'lnk-shower-morning', title: 'シャワー', defaultOn: true },
      { id: 'lnk-get-dressed', title: '着替え', defaultOn: true },
      { id: 'lnk-style-hair', title: '髪を整える', defaultOn: false },
    ],
  },
  {
    id: 'mod-morning-chores',
    name: '朝家事',
    goal: 'chores',
    moment: 'morning',
    starter: false,
    links: [
      { id: 'lnk-clean-morning', title: '掃除', defaultOn: true },
      { id: 'lnk-laundry-morning', title: '洗濯', defaultOn: true },
      { id: 'lnk-take-out-trash', title: 'ゴミ捨て', defaultOn: false },
    ],
  },
  {
    id: 'mod-day-planning',
    name: '一日の設計',
    goal: 'reflection',
    moment: 'morning',
    starter: true,
    links: [
      { id: 'lnk-morning-note', title: '朝ノート', defaultOn: true },
      { id: 'lnk-todo-today', title: '今日やること', defaultOn: true },
    ],
  },
  // 昼｜ランチ
  {
    id: 'mod-lunch',
    name: '昼の区切り',
    goal: 'meal',
    moment: 'noon',
    starter: true,
    links: [
      { id: 'lnk-prep-lunch', title: 'ランチ準備', defaultOn: true },
      { id: 'lnk-lunch', title: 'ランチ', defaultOn: true },
      { id: 'lnk-soak-dishes-noon', title: '食器を水につける', defaultOn: true },
    ],
  },
  // 夜｜ディナー
  {
    id: 'mod-dinner',
    name: '夕食',
    goal: 'meal',
    moment: 'night',
    starter: true,
    links: [
      { id: 'lnk-prep-dinner', title: 'ディナー準備', defaultOn: true },
      { id: 'lnk-dinner', title: 'ディナー食べる', defaultOn: true },
      { id: 'lnk-soak-dishes-night', title: '食器を水につける', defaultOn: false },
    ],
  },
  // 夜｜就寝
  {
    id: 'mod-night-chores',
    name: '夜家事・リセット',
    goal: 'chores',
    moment: 'night',
    starter: false,
    links: [
      { id: 'lnk-wash-dishes', title: '食器洗い', defaultOn: true },
      { id: 'lnk-quick-clean', title: '5分掃除', defaultOn: true },
      { id: 'lnk-put-away-dishes', title: '食器しまう', defaultOn: false },
      { id: 'lnk-fold-laundry', title: '洗濯物畳む', defaultOn: false },
    ],
  },
  {
    id: 'mod-bath',
    name: '入浴・整え',
    goal: 'skincare',
    moment: 'night',
    starter: true,
    links: [
      { id: 'lnk-run-bath', title: '風呂を沸かす', defaultOn: true },
      { id: 'lnk-take-bath', title: '風呂に入る', defaultOn: true },
      { id: 'lnk-skincare-night', title: 'スキンケア', defaultOn: true },
      { id: 'lnk-dry-hair', title: '髪を乾かす', defaultOn: true },
    ],
  },
  {
    id: 'mod-evening-reflection',
    name: '内省・締め',
    goal: 'reflection',
    moment: 'night',
    starter: true,
    links: [
      { id: 'lnk-read', title: '読書30分', defaultOn: true },
      { id: 'lnk-night-note', title: '夜ノート', defaultOn: true },
      { id: 'lnk-stretch-night', title: 'ストレッチ', defaultOn: false },
    ],
  },
];

export type V0Catalog = {
  modules: Module[];
  links: Link[];
};

// 中間定義を Module[] / Link[] に展開する純粋関数 (DB / 副作用なし、K-007)。
// - module.color は goal カテゴリから導出 (#74 で最終調整)。
// - link.position は moment 内の通し番号 (採用時のチェーン物理順。所属とは独立)。
// - link.starter はモジュールの starter を継承 (採用で live に入るのは starter かつ defaultOn)。
export const buildV0Catalog = (): V0Catalog => {
  const modules: Module[] = [];
  const links: Link[] = [];
  const positionByMoment: Record<string, number> = {};

  V0_CATALOG_DEFS.forEach((def, index) => {
    modules.push({
      id: def.id,
      name: def.name,
      color: GOAL_COLORS[def.goal] ?? FALLBACK_COLOR,
      moment: [def.moment],
      goal: [def.goal],
      source: 'official',
      kind: 'normal',
      orderIndex: index,
    });

    for (const linkDef of def.links) {
      const position = positionByMoment[def.moment] ?? 0;
      positionByMoment[def.moment] = position + 1;
      links.push({
        id: linkDef.id,
        title: linkDef.title,
        moduleId: def.id,
        defaultOn: linkDef.defaultOn,
        position,
        source: 'official',
        timerSeconds: linkDef.timerSeconds ?? null,
        starter: def.starter,
      });
    }
  });

  return { modules, links };
};

// catalog を DB に投入する。固定 ID + INSERT OR IGNORE で冪等 (毎起動呼び出し可)。
// モジュールを先に入れてから links を入れる (links.module_id の FK 制約を満たす)。
export const seedCatalog = async (db: DbClient): Promise<void> => {
  const { modules, links } = buildV0Catalog();
  for (const module of modules) {
    await seedModule(db, module);
  }
  for (const link of links) {
    await seedLink(db, link);
  }
};
