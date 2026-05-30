import type { ThemeMode } from './settingsRepository';

// ADR-0029 (Issue #53): テーマパレット + 解決ロジックの純粋関数モジュール。
//
// このファイルは domain 層の純粋性 (K-007) を維持するため、 DB / UI / 状態管理
// ライブラリに依存しない。 ThemeProvider / hook 等の RN 依存層は別ファイル
// (themeContext.tsx) に分離する。
//
// 注意 (スコープ): 本 PR で Light / Dark のパレットを定義し、 system-level
// (native root bg / StatusBar style) には反映するが、 個別コンポーネントは
// 既存の `COLOR_*` (tokens.ts、 dark 固定) を参照し続ける。
// コンポーネント単位の Light レンダリング対応は別 PR で段階的に移行する
// (= 17 ファイル一括変更による blast radius 回避、 検証期間中の regression リスク低減)。

export type ColorScheme = 'light' | 'dark';

export type ThemePalette = {
  bg: string;
  surface: string;
  lineBg: string;
  fg: string;
  fgSoft: string;
  fgFaint: string;
  grow: string;
  accent: string;
  star: string;
};

// DESIGN-SYSTEM v0.2 §1 のカラートークン。
export const DARK_PALETTE: ThemePalette = {
  bg: '#16161A',
  surface: '#1E1E24',
  lineBg: '#2A2A32',
  fg: '#F4F4F2',
  fgSoft: 'rgba(244, 244, 242, 0.52)',
  fgFaint: '#5A5A60',
  grow: '#EAEAE8',
  accent: '#E0574C',
  star: '#F2C14B',
};

export const LIGHT_PALETTE: ThemePalette = {
  bg: '#F6F6F4',
  surface: '#FFFFFF',
  lineBg: '#E7E7E3',
  fg: '#1A1A19',
  fgSoft: 'rgba(26, 26, 25, 0.52)',
  fgFaint: 'rgba(26, 26, 25, 0.26)',
  grow: '#1A1A19',
  accent: '#B23A3A',
  star: '#C9941F',
};

export const paletteFor = (scheme: ColorScheme): ThemePalette =>
  scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

// themeMode + OS の colorScheme から、 実描画に使う scheme ('light' | 'dark') を解決する。
// 'auto' のときは OS の colorScheme に追従。 OS が null / undefined (= 不明) のときは
// 'dark' にフォールバック (現状の app userInterfaceStyle: 'dark' との連続性を維持)。
export const resolveColorScheme = (
  themeMode: ThemeMode,
  osScheme: ColorScheme | null | undefined,
): ColorScheme => {
  if (themeMode === 'light') return 'light';
  if (themeMode === 'dark') return 'dark';
  return osScheme === 'light' ? 'light' : 'dark';
};
