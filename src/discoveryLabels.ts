// moment (朝/夜) の表示ラベル。onboarding の moment 選択 (OnboardingScreen / useOnboarding)
// で共有する。未知値はそのまま返す。
// ADR-0039 (#155): goal ラベルと旧 discovery (moment/goal 扉) は新カテゴリモデル移行で廃止。
const MOMENT_LABELS: Record<string, string> = {
  morning: '朝',
  noon: '昼',
  night: '夜',
};

export const momentLabel = (m: string): string => MOMENT_LABELS[m] ?? m;
