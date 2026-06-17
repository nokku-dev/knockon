// 編集UI の純粋ドメイン層。状態・ナビゲーションは hook/UI の責務 (K-007)。
// ADR-0040 (#160): module 概念 (ロスター / run ラベル / source 別削除 / promote) を廃止。
// 残るのは削除 undo の純粋ヘルパのみ。

// #94: undo 用。削除時に「元の位置」とノードを退避し、undo で復元する。
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
