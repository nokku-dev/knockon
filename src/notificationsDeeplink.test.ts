import { extractChainIdFromResponse } from './notificationsDeeplink';

const buildResponse = (
  data: unknown,
): Parameters<typeof extractChainIdFromResponse>[0] =>
  ({
    notification: {
      request: {
        content: { data },
      },
    },
  }) as unknown as Parameters<typeof extractChainIdFromResponse>[0];

describe('extractChainIdFromResponse (PR-1.5b-3)', () => {
  test('null / undefined → null', () => {
    expect(extractChainIdFromResponse(null)).toBeNull();
    expect(extractChainIdFromResponse(undefined)).toBeNull();
  });

  test('data に chainId (string) があれば取り出す', () => {
    expect(extractChainIdFromResponse(buildResponse({ chainId: 'c1' }))).toBe(
      'c1',
    );
  });

  test('data はあるが chainId なし → null', () => {
    expect(extractChainIdFromResponse(buildResponse({ other: 'x' }))).toBeNull();
  });

  test('data 自体が null → null', () => {
    expect(extractChainIdFromResponse(buildResponse(null))).toBeNull();
  });

  test('chainId が number など string でない → null (型安全)', () => {
    expect(
      extractChainIdFromResponse(buildResponse({ chainId: 42 })),
    ).toBeNull();
  });
});
