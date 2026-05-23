import type { Anchor, ChainStatus } from './domain';

// expo-notifications 非依存の純粋関数。 ts-jest で testable に保つため
// 切り出した。 notifications.ts (Expo SDK wrapper) からも参照する。

// HH:MM 形式の文字列を { hour, minute } に分解する純粋関数。
// 不正フォーマットは null を返す (呼び出し側でスケジュール skip)。
export const parseTimeString = (
  time: string,
): { hour: number; minute: number } | null => {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const parts = time.split(':');
  const hour = parseInt(parts[0]!, 10);
  const minute = parseInt(parts[1]!, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

// チェーンが通知対象かどうかを判定する純粋関数。
// 通知出す条件: status='active' + anchor.kind='time' + anchor.time が有効。
export const shouldNotifyForChain = (
  chain: { status: ChainStatus },
  anchor: { kind: Anchor['kind']; time: string | null },
): boolean => {
  if (chain.status !== 'active') return false;
  if (anchor.kind !== 'time') return false;
  if (!anchor.time) return false;
  return parseTimeString(anchor.time) !== null;
};
