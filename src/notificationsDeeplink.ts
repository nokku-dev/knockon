import type { NotificationResponse } from 'expo-notifications';

// 通知 response から chainId を取り出す純粋関数 (PR-1.5b-3 / Expo SDK wrapper の薄い層)。
// notification の content.data に chainId が含まれていれば string で返す、 なければ null。
// PR-1.5b-2 で `data: { chainId }` を仕込んでいる。
// type-only import なので ts-jest 環境でもテスト可能 (notifications.ts と分離する理由)。
export const extractChainIdFromResponse = (
  response: NotificationResponse | null | undefined,
): string | null => {
  if (!response) return null;
  const data = response.notification.request.content.data;
  if (data && typeof data === 'object' && typeof data.chainId === 'string') {
    return data.chainId;
  }
  return null;
};
