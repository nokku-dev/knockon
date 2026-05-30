import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  paletteFor,
  resolveColorScheme,
} from './theme';

// ADR-0029 (Issue #53): テーマ解決ロジックの純粋関数テスト。
// (ThemeProvider / hook の RN 依存テストは別ファイル)

describe('resolveColorScheme', () => {
  test("themeMode='light' は OS によらず 'light'", () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('light', 'light')).toBe('light');
    expect(resolveColorScheme('light', null)).toBe('light');
  });

  test("themeMode='dark' は OS によらず 'dark'", () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
    expect(resolveColorScheme('dark', 'dark')).toBe('dark');
    expect(resolveColorScheme('dark', null)).toBe('dark');
  });

  test("themeMode='auto' は OS の colorScheme に追従する", () => {
    expect(resolveColorScheme('auto', 'light')).toBe('light');
    expect(resolveColorScheme('auto', 'dark')).toBe('dark');
  });

  test("themeMode='auto' で OS が null / undefined のときは 'dark' (= 既存挙動互換)", () => {
    expect(resolveColorScheme('auto', null)).toBe('dark');
    expect(resolveColorScheme('auto', undefined)).toBe('dark');
  });
});

describe('paletteFor', () => {
  test("'light' は LIGHT_PALETTE", () => {
    expect(paletteFor('light')).toBe(LIGHT_PALETTE);
  });
  test("'dark' は DARK_PALETTE", () => {
    expect(paletteFor('dark')).toBe(DARK_PALETTE);
  });
});

describe('palette 構造', () => {
  // DESIGN-SYSTEM v0.2 §1 のカラートークンと整合。
  test('LIGHT / DARK は同じキー集合を持つ', () => {
    expect(Object.keys(LIGHT_PALETTE).sort()).toEqual(
      Object.keys(DARK_PALETTE).sort(),
    );
  });

  test('DARK_PALETTE は既存の tokens.ts の値と一致 (regression 防止)', () => {
    expect(DARK_PALETTE.bg).toBe('#16161A');
    expect(DARK_PALETTE.surface).toBe('#1E1E24');
    expect(DARK_PALETTE.fg).toBe('#F4F4F2');
    expect(DARK_PALETTE.grow).toBe('#EAEAE8');
    expect(DARK_PALETTE.accent).toBe('#E0574C');
    expect(DARK_PALETTE.star).toBe('#F2C14B');
  });

  test('LIGHT_PALETTE は DESIGN-SYSTEM v0.2 §1 の Light 列値と一致', () => {
    expect(LIGHT_PALETTE.bg).toBe('#F6F6F4');
    expect(LIGHT_PALETTE.surface).toBe('#FFFFFF');
    expect(LIGHT_PALETTE.fg).toBe('#1A1A19');
    expect(LIGHT_PALETTE.grow).toBe('#1A1A19');
    expect(LIGHT_PALETTE.accent).toBe('#B23A3A');
    expect(LIGHT_PALETTE.star).toBe('#C9941F');
  });
});
