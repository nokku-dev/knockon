import { reinsertByIndex } from './editLayout';

// 編集UI の純粋ドメイン層。ADR-0040 (#160): module 概念の派生 (ロスター / run ラベル /
// source 別削除 / promote) は廃止。残るのは削除 undo の位置復元のみ (K-007)。

describe('reinsertByIndex — undo の位置復元 (#94)', () => {
  test('単一削除を元の位置に戻す', () => {
    // ['A','C'] に B(index 1) を戻す → ['A','B','C']
    expect(reinsertByIndex(['A', 'C'], [{ node: 'B', index: 1 }])).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  test('複数同時削除 (一括外し) を元の並びで戻す', () => {
    // 元 ['A','B','C','D'] から B(1)/D(3) を削除 → ['A','C']。undo で元に戻る。
    expect(
      reinsertByIndex(
        ['A', 'C'],
        [
          { node: 'D', index: 3 },
          { node: 'B', index: 1 },
        ],
      ),
    ).toEqual(['A', 'B', 'C', 'D']);
  });

  test('末尾削除も復元できる', () => {
    expect(reinsertByIndex(['A', 'B'], [{ node: 'C', index: 2 }])).toEqual([
      'A',
      'B',
      'C',
    ]);
  });
});
