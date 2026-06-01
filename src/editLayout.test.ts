import {
  PROMOTE_COLORS,
  buildModuleRoster,
  computeRunLeaders,
  deleteKindForSource,
  validatePromotion,
} from './editLayout';

// #73 (SPEC docs/template-modules-spec.md §6): 編集UI の純粋ドメイン層。
// チップ層 (モジュールロスター) / リスト層の C 案ラベル (run 先頭だけ名前・自己修復) /
// source 別の削除破壊性を DB/UI 非依存で検証する (K-007)。

const modulesById = {
  'mod-a': { name: '朝食', color: '#E0A24C' },
  'mod-b': { name: 'スキンケア', color: '#C9849E' },
};

describe('buildModuleRoster — チップ層 (採用中モジュール一覧) (#73)', () => {
  test('出現順・重複なしで count 付きのモジュール一覧を返す', () => {
    const roster = buildModuleRoster(
      ['mod-a', 'mod-a', 'mod-b', 'mod-a'],
      modulesById,
    );
    expect(roster).toEqual([
      { id: 'mod-a', name: '朝食', color: '#E0A24C', count: 3 },
      { id: 'mod-b', name: 'スキンケア', color: '#C9849E', count: 1 },
    ]);
  });

  test('null (手作り = 未所属) はロスターに出さない', () => {
    const roster = buildModuleRoster(['mod-a', null, null], modulesById);
    expect(roster.map((r) => r.id)).toEqual(['mod-a']);
  });

  test('未知の moduleId は除外する (catalog 削除との競合に対する防御)', () => {
    const roster = buildModuleRoster(['mod-a', 'mod-gone'], modulesById);
    expect(roster.map((r) => r.id)).toEqual(['mod-a']);
  });
});

describe('computeRunLeaders — C 案ラベル (run 先頭だけ名前・自己修復) (#73)', () => {
  test('連続 run の先頭だけ leader=true', () => {
    expect(computeRunLeaders(['mod-a', 'mod-a', 'mod-b'])).toEqual([
      true,
      false,
      true,
    ]);
  });

  test('散らばると同じモジュールでも再び leader=true (自己修復)', () => {
    expect(computeRunLeaders(['mod-a', 'mod-b', 'mod-a'])).toEqual([
      true,
      true,
      true,
    ]);
  });

  test('先頭は常に leader、null も run の境界として扱う', () => {
    expect(computeRunLeaders([null, null, 'mod-a', 'mod-a'])).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  test('空配列は空', () => {
    expect(computeRunLeaders([])).toEqual([]);
  });
});

describe('deleteKindForSource — source 別の削除破壊性 (#73)', () => {
  test('official は detach (チェーンから外す・非破壊)', () => {
    expect(deleteKindForSource('official')).toBe('detach');
  });

  test('user は delete (削除・破壊的)', () => {
    expect(deleteKindForSource('user')).toBe('delete');
  });

  test('null/undefined (手作り = 未所属) は delete (破壊的)', () => {
    expect(deleteKindForSource(null)).toBe('delete');
    expect(deleteKindForSource(undefined)).toBe('delete');
  });
});

describe('validatePromotion — 昇格の入力検証 (#93)', () => {
  test('選択 0 件はエラー', () => {
    expect(validatePromotion('朝食', 0)).toMatch(/アクション/);
  });

  test('名前が空白のみはエラー', () => {
    expect(validatePromotion('   ', 2)).toMatch(/モジュール名/);
  });

  test('名前あり + 選択ありは null (OK)', () => {
    expect(validatePromotion('朝食', 2)).toBeNull();
  });

  test('PROMOTE_COLORS は重複なしの色集合', () => {
    expect(new Set(PROMOTE_COLORS).size).toBe(PROMOTE_COLORS.length);
    expect(PROMOTE_COLORS.length).toBeGreaterThan(0);
  });
});
