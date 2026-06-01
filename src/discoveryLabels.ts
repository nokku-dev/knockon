// #70b: moment / goal の表示ラベル。語彙は v0 カタログ準拠 (#69)。
// 未知値はそのまま返す (将来 user モジュールの独自 moment/goal に備える)。
// hook (useDiscovery) と discovery 画面で共有する。

const MOMENT_LABELS: Record<string, string> = {
  morning: '朝',
  noon: '昼',
  night: '夜',
};

export const momentLabel = (m: string): string => MOMENT_LABELS[m] ?? m;

const GOAL_LABELS: Record<string, string> = {
  health: '健康',
  skincare: 'スキンケア',
  exercise: '運動',
  beverage: '飲みもの',
  meal: '食事',
  grooming: '身支度',
  chores: '家事',
  reflection: '内省',
};

export const goalLabel = (g: string): string => GOAL_LABELS[g] ?? g;
