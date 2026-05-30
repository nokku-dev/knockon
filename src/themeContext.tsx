import { createContext, ReactNode, useContext, useMemo } from 'react';

import type { ThemeMode } from './settingsRepository';
import {
  ColorScheme,
  paletteFor,
  resolveColorScheme,
  ThemePalette,
} from './theme';

// ADR-0029 (Issue #53): テーマ Context。 root layout で構築し、 子の任意の階層から
// `useTheme()` で resolved scheme / palette を参照できる。
//
// 設計意図:
// - 純粋な解決ロジックは `theme.ts` に分離 (K-007 ドメイン純度維持)。
// - Provider は themeMode (= ユーザー選択) + osScheme (= OS の現状) を受け取り、
//   resolveColorScheme で 'light' | 'dark' を派生計算する (= 派生値非保存原則と整合)。
// - setThemeMode は async 関数 props として外から受ける (= DB 書き込み責務を
//   Context 側で抱えない、 useSettings との分離を保つ)。

export type ThemeContextValue = {
  themeMode: ThemeMode;
  resolvedScheme: ColorScheme;
  palette: ThemePalette;
  setThemeMode: (mode: ThemeMode) => Promise<void> | void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  themeMode: ThemeMode;
  osScheme: ColorScheme | null | undefined;
  setThemeMode: (mode: ThemeMode) => Promise<void> | void;
  children: ReactNode;
};

export const ThemeProvider = ({
  themeMode,
  osScheme,
  setThemeMode,
  children,
}: ThemeProviderProps) => {
  const value = useMemo<ThemeContextValue>(() => {
    const resolvedScheme = resolveColorScheme(themeMode, osScheme);
    return {
      themeMode,
      resolvedScheme,
      palette: paletteFor(resolvedScheme),
      setThemeMode,
    };
  }, [themeMode, osScheme, setThemeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Provider 配下でのみ呼ぶ前提。 root layout 外 (= ThemeProvider 未配置) で呼ぶと
// throw する (= 構造的に「Provider を必ず挟む」を強制)。
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
