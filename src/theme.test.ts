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

// #74 (SPEC §7): faint テキストの WCAG AA (4.5:1) を機械検証する (K-006 spirit)。
// 旧 faint (#5A5A60 / rgba 0.26) は未達だった。bg / surface 双方で AA を割らないことを固定。
describe('faint テキストの WCAG AA コントラスト (#74)', () => {
  const srgbToLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string): number => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return (
      0.2126 * srgbToLinear(r) +
      0.7152 * srgbToLinear(g) +
      0.0722 * srgbToLinear(b)
    );
  };
  const contrast = (a: string, b: string): number => {
    const la = luminance(a);
    const lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };

  test('DARK fgFaint は bg / surface 双方で AA (>= 4.5) を満たす', () => {
    expect(contrast(DARK_PALETTE.fgFaint, DARK_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK_PALETTE.fgFaint, DARK_PALETTE.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test('LIGHT fgFaint は bg / surface 双方で AA (>= 4.5) を満たす', () => {
    expect(contrast(LIGHT_PALETTE.fgFaint, LIGHT_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT_PALETTE.fgFaint, LIGHT_PALETTE.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
