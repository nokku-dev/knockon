import type { CatalogSource } from './domain';

// #73 (SPEC docs/template-modules-spec.md §6): 編集UI の純粋ドメイン層。
// チップあり2層 (上=モジュール操作チップ / 下=リンクのフラットリスト) の派生を
// DB/UI 非依存の純粋関数として実装する (K-007)。状態・ナビゲーションは hook/UI の責務。

// チップ層に出す 1 モジュール。count = チェーン上の所属ノード数 (run 数ではなく総数)。
export type RosterModule = {
  id: string;
  name: string;
  color: string;
  count: number;
};

type ModuleMeta = { name: string; color: string };

// 採用中モジュールのロスター (チップ層)。ノードの moduleId 列を出現順・重複なしで畳み、
// 各モジュールの所属ノード総数を数える。null (手作り = 未所属) と未知 ID は出さない
// (未知 = catalog 側で削除されたモジュール、K-028 同型の防御)。
export const buildModuleRoster = (
  nodeModuleIds: readonly (string | null)[],
  modulesById: Readonly<Record<string, ModuleMeta>>,
): RosterModule[] => {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const id of nodeModuleIds) {
    if (id == null) continue;
    const meta = modulesById[id];
    if (!meta) continue;
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return order.map((id) => ({
    id,
    name: modulesById[id]!.name,
    color: modulesById[id]!.color,
    count: counts.get(id)!,
  }));
};

// C 案ラベルの「run 先頭だけ名前」判定。各ノードについて、直前ノードと moduleId が
// 変われば leader=true (= そこにモジュール名を出す)。同じモジュールが非連続に散らばると
// run が分かれて各 run 先頭で再び名前が出る = 自己修復 (SPEC §6)。
// null も 1 つの値として境界扱いする (手作りの連なりも run になる)。
export const computeRunLeaders = (
  nodeModuleIds: readonly (string | null)[],
): boolean[] =>
  nodeModuleIds.map((id, i) => i === 0 || nodeModuleIds[i - 1] !== id);

// 削除系の破壊性は source で出し分ける (SPEC §6)。
// official = テンプレ由来 → detach (チェーンから外す・非破壊・再追加可)。
// user / 未所属 (手作り) → delete (破壊的)。
export type DeleteKind = 'delete' | 'detach';

export const deleteKindForSource = (
  source: CatalogSource | null | undefined,
): DeleteKind => (source === 'official' ? 'detach' : 'delete');

// #93: カスタム→ユーザーモジュール昇格で選べる色パレット (a11y はラベル併用で担保、#74)。
// catalog の goal カラーと同系統で識別しやすい暫定パレット。
export const PROMOTE_COLORS: readonly string[] = [
  '#4FB0AE',
  '#C9849E',
  '#5B8DEF',
  '#B5835A',
  '#E0A24C',
  '#7C9CBF',
  '#8B9EB0',
  '#9B87C4',
];

// 昇格の入力バリデーション (純粋)。問題なしなら null、エラーは文言を返す。
export const validatePromotion = (
  name: string,
  selectedCount: number,
): string | null => {
  if (selectedCount === 0) return 'アクションを 1 つ以上選んでください';
  if (name.trim().length === 0) return 'モジュール名を入力してください';
  return null;
};

// #94: undo 用。削除/外し時に「元の位置」とノードを退避し、undo で復元する。
export type RemovedEntry<T> = { node: T; index: number };

// 退避した要素を元の index に戻す (純粋)。index は削除前の配列での位置。
// 昇順に splice すると、複数同時削除 (一括外し) でも元の並びを正しく復元できる。
export const reinsertByIndex = <T>(
  current: readonly T[],
  removed: readonly RemovedEntry<T>[],
): T[] => {
  const out = current.slice();
  const ascending = removed.slice().sort((a, b) => a.index - b.index);
  for (const { node, index } of ascending) {
    out.splice(Math.min(index, out.length), 0, node);
  }
  return out;
};
