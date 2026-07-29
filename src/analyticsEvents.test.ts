import appJson from '../app.json';
import {
  ANALYTICS_EVENTS,
  SETTLEMENT_DEFINITION_VERSION,
  isSafeProps,
  normalizeScreenPath,
} from './analyticsEvents';

// ADR-0053: 分析基盤 (PostHog) の不変条件を機械検証する。
// K-006 (ハードガードレールのテスト固定) と同じ精神で、「守る線」を人間の注意力ではなく
// CI で守る。

describe('イベント定義 (ADR-0053 §4)', () => {
  test('ADR-0053 で決めた 7 イベントが過不足なく定義されている', () => {
    // 増減したら ADR を更新してからこのテストを直す (勝手に増やさせない)。
    expect([...ANALYTICS_EVENTS].sort()).toEqual(
      [
        'chain_created',
        'chain_deleted',
        'node_completed',
        'node_settled',
        'onboarding_completed',
        'permission_result',
        'settlement_retracted',
      ].sort(),
    );
  });

  test('イベント名は snake_case の ASCII (PostHog のクエリで扱いやすくする)', () => {
    for (const e of ANALYTICS_EVENTS) {
      expect(e).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('送ってよい値の制限 (ADR-0053 §1 「記録内容を送らない」)', () => {
  // 型 (SafeValue = number | boolean) が第一の防御線だが、any 経由の混入や
  // 将来の型変更に備えて実行時にも検証する。
  test('number / boolean は許可される', () => {
    expect(isSafeProps({ node_count: 4, skipped: false })).toBe(true);
    expect(isSafeProps(undefined)).toBe(true);
    expect(isSafeProps({})).toBe(true);
  });

  test('文字列は拒否される (チェーン名・メモ本文・アクション名の流出経路)', () => {
    expect(isSafeProps({ title: 'モーニングルーティン' } as never)).toBe(false);
    expect(isSafeProps({ note: '' } as never)).toBe(false);
  });

  test('オブジェクト / 配列 / null は拒否される (入れ子で内容を運べてしまう)', () => {
    expect(isSafeProps({ chain: { title: 'x' } } as never)).toBe(false);
    expect(isSafeProps({ nodes: [1, 2] } as never)).toBe(false);
    expect(isSafeProps({ value: null } as never)).toBe(false);
  });

  test('NaN / Infinity は拒否される (JSON 化で null になり意味が壊れる)', () => {
    expect(isSafeProps({ days: NaN })).toBe(false);
    expect(isSafeProps({ days: Infinity })).toBe(false);
  });
});

describe('定着の定義バージョン (ADR-0053 §4)', () => {
  test('1 以上の整数である', () => {
    // 定着判定 (ADR-0047 / 0050 / 0051 で 3 回変更) を変えたらインクリメントする。
    // これが無いと node_settled の時系列比較が静かに壊れる。
    expect(Number.isInteger(SETTLEMENT_DEFINITION_VERSION)).toBe(true);
    expect(SETTLEMENT_DEFINITION_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('app.json の PostHog 設定', () => {
  const posthog = (appJson.expo.extra as { posthog?: Record<string, unknown> })
    .posthog;

  test('extra.posthog が定義されている', () => {
    expect(posthog).toBeDefined();
  });

  test('host が EU または US の正規エンドポイントである', () => {
    expect(['https://eu.i.posthog.com', 'https://us.i.posthog.com']).toContain(
      posthog?.host,
    );
  });

  // ⚠️ このテストは apiKey を設定するまで落ちる。意図的にそうしている。
  // Notion 連携 (#259 / ADR-0052) は「実装はあるが設定が無く動かない」状態のまま
  // 出荷寸前まで気付かれなかった。同じ失敗を繰り返さないため、設定漏れを CI で落とす。
  // PostHog の project API key は write-only でクライアント埋め込み前提のため、
  // リポジトリにコミットしてよい (secret ではない)。
  test('apiKey が設定されている (未設定のまま出荷すると計測が無言で失われる)', () => {
    expect(typeof posthog?.apiKey).toBe('string');
    expect((posthog?.apiKey as string).length).toBeGreaterThan(0);
  });
});

describe('normalizeScreenPath (expo-router のパス正規化)', () => {
  test.each([
    ['/', 'today'],
    ['', 'today'],
    ['/chains', 'chains'],
    ['/analytics', 'log'],
    ['/research', 'research'],
    ['/discover', 'discover'],
    ['/onboarding', 'onboarding'],
    ['/chain/new', 'chain_new'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeScreenPath(input)).toBe(expected);
  });

  test('動的セグメント (チェーン ID) は畳まれ、ID が送信されない', () => {
    // cardinality 爆発の防止と、ID を送らない方針の両方を満たす。
    expect(normalizeScreenPath('/chain/01JABCDEF0123456789')).toBe(
      'chain_detail',
    );
    expect(normalizeScreenPath('/chain/another-id')).toBe('chain_detail');
  });

  test('末尾スラッシュとクエリを無視する', () => {
    expect(normalizeScreenPath('/chains/')).toBe('chains');
    expect(normalizeScreenPath('/chains?tab=active')).toBe('chains');
  });

  test('未知のパスは unknown に畳む (ID 等が漏れない)', () => {
    expect(normalizeScreenPath('/some/new/route')).toBe('unknown');
  });
});
