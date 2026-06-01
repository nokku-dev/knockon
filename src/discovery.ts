import type { ChainDraft, Link, Module } from './domain';

// #70b (ADR-0030 / SPEC docs/template-modules-spec.md §4): discovery (テンプレ発見) の
// 純粋ドメイン層。catalog (modules/links) → 束プレビュー構造 / 採用ドラフトへの変換を
// DB/UI 非依存の純粋関数として実装する (K-007)。永続化は bundleAdoption.adoptChainDraft。
//
// 索引 (扉) → 束プレビュー → 採用確認 のうち、本ファイルは「束の構造化」と
// 「選択集合 → ドラフト」を担う。画面状態・ナビゲーションは hook/UI (#70b) の責務。

// 束プレビュー内の1モジュール。所属リンクを position 昇順で保持。
export type BundleModulePreview = {
  module: Module;
  links: Link[];
  isStarter: boolean;
};

// 束 = ある切り口 (moment / goal) に属するモジュール群のプレビュー。
// starter モジュールは前面、それ以外 (additional) は折りたたみ (SPEC §4)。
// defaultSelectedLinkIds = 採用で既定 ON になる集合 (starter かつ defaultOn)。
// UI はこれを初期選択にし、全リンクをトグル可能にする (採用前トグル編集)。
export type BundlePreview = {
  title: string;
  starterModules: BundleModulePreview[];
  additionalModules: BundleModulePreview[];
  defaultSelectedLinkIds: string[];
};

// カタログに出現する moment を出現順・重複なしで返す (状態ゴール扉の選択肢)。
export const listMoments = (modules: readonly Module[]): string[] =>
  distinct(modules.flatMap((m) => m.moment));

// カタログに出現する goal を出現順・重複なしで返す (成果ゴール扉の選択肢)。
export const listGoals = (modules: readonly Module[]): string[] =>
  distinct(modules.flatMap((m) => m.goal));

const distinct = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
};

// 状態ゴール扉: moment に属するモジュール群を束にする (1 アンカー縦)。
export const buildBundleForMoment = (
  modules: readonly Module[],
  links: readonly Link[],
  moment: string,
  title: string,
): BundlePreview =>
  buildBundle(modules, links, (m) => m.moment.includes(moment), title);

// 成果ゴール扉: goal に属するモジュール群を束にする (複数アンカー横断)。
export const buildBundleForGoal = (
  modules: readonly Module[],
  links: readonly Link[],
  goal: string,
  title: string,
): BundlePreview =>
  buildBundle(modules, links, (m) => m.goal.includes(goal), title);

const buildBundle = (
  modules: readonly Module[],
  links: readonly Link[],
  predicate: (m: Module) => boolean,
  title: string,
): BundlePreview => {
  const matched = modules
    .filter(predicate)
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const previews = matched.map((module): BundleModulePreview => {
    const moduleLinks = links
      .filter((l) => l.moduleId === module.id)
      .slice()
      .sort((a, b) => a.position - b.position);
    // starter はモジュール内リンクで一様 (catalogSeed が module.starter を継承)。
    const isStarter = moduleLinks.some((l) => l.starter);
    return { module, links: moduleLinks, isStarter };
  });

  const starterModules = previews.filter((p) => p.isStarter);
  const additionalModules = previews.filter((p) => !p.isStarter);

  const defaultSelectedLinkIds = previews
    .flatMap((p) => p.links)
    .filter((l) => l.starter && l.defaultOn)
    .map((l) => l.id);

  return { title, starterModules, additionalModules, defaultSelectedLinkIds };
};

// 選択リンク集合 → ChainDraft。採用前トグル編集の結果 (任意の選択集合) を
// position 昇順で一列のチェーンに変換する。所属モジュールが非連続でもよい
// (ADR-0030 の所属/位置独立モデル)。buildChainDraftFromBundle (starter×defaultOn 自動採用)
// の一般化版で、UI でユーザーが選び直したリンク集合を受ける。
export const buildChainDraftFromSelection = (
  links: readonly Link[],
  selectedLinkIds: readonly string[],
  title: string,
): ChainDraft => {
  const selected = new Set(selectedLinkIds);
  const adopted = links
    .filter((l) => selected.has(l.id))
    .slice()
    .sort((a, b) => a.position - b.position);
  return {
    title,
    nodes: adopted.map((l) => ({
      actionTitle: l.title,
      timerSeconds: l.timerSeconds,
      moduleId: l.moduleId,
    })),
  };
};
