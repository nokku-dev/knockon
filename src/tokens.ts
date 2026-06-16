// DESIGN-SYSTEM v0.2 §1 / §0 のカラートークン (Dark)。
// 生 hex をコンポーネント側で直書きしないために一箇所に集約 (DESIGN-SYSTEM §5 規律)。
//
// ADR-0029 (Issue #53): Light / Dark / Auto 切替を導入したが、 本ファイルの
// `COLOR_*` (Dark 値) はそのまま残し、 17 個の既存コンポーネントは引き続き
// dark 値を hard-code で参照する (= ADR-0029 §非スコープ、 段階移行)。
// 個別コンポーネントが Light レンダリングに対応するときは、 `useTheme()` 経由で
// palette を受け取り、 useMemo で StyleSheet 構築する形に逐次置換する。
// パレット定義の正本は `src/theme.ts` の `DARK_PALETTE` / `LIGHT_PALETTE`。

export const COLOR_BG = '#16161A';
export const COLOR_SURFACE = '#1E1E24';
export const COLOR_LINE_BG = '#2A2A32';

export const COLOR_FG = '#F4F4F2';
export const COLOR_FG_SOFT = 'rgba(244, 244, 242, 0.52)';
// #74 (SPEC §7): WCAG AA (4.5:1) を surface/bg 双方で満たす faint グレー。
// 旧 #5A5A60 は bg 上で約 2.7:1 で AA 未達だった。
export const COLOR_FG_FAINT = '#8A8A90';

export const COLOR_GROW = '#EAEAE8';
export const COLOR_ACCENT = '#E0574C';
export const COLOR_STAR = '#F2C14B';
// #128: 分析マトリクスの達成セルの塗り (OK 感のあるグリーン)。
// 反 streak / Celebrate 主の核に沿う「達成 = 前向きな塗り」専用。 マイナス (未達) は
// 引き続き赤を使わず極淡アウトラインで指差さない。 用途は達成セルの塗りに限定する。
export const COLOR_OK = '#4CB782';
