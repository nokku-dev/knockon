import type { Anchor, Chain } from './domain';
import {
  IOS_REGION_LIMIT,
  planGeofences,
  type GeofenceSource,
} from './geofenceRegions';

const placeAnchor = (id: string, over: Partial<Anchor> = {}): Anchor => ({
  id,
  title: id,
  kind: 'place',
  time: null,
  latitude: 35.68,
  longitude: 139.76,
  radiusMeters: 100,
  ...over,
});

const chain = (id: string, anchorId: string, over: Partial<Chain> = {}): Chain => ({
  id,
  title: id,
  anchorId,
  status: 'active',
  createdAt: '2026-08-01T09:00:00',
  ...over,
});

const src = (c: Chain, a: Anchor): GeofenceSource => ({ chain: c, anchor: a });

describe('planGeofences — 場所アンカーを OS に渡す region に変換する (#301)', () => {
  test('active な場所アンカーが region になる', () => {
    const a = placeAnchor('anchor-1');
    const plan = planGeofences([src(chain('c1', 'anchor-1'), a)]);
    expect(plan.regions).toEqual([
      {
        identifier: 'anchor-1',
        latitude: 35.68,
        longitude: 139.76,
        radius: 100,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ]);
    expect(plan.droppedForLimit).toBe(0);
  });

  test('identifier は anchor.id (到達イベントから発火先を引くため)', () => {
    const plan = planGeofences([
      src(chain('c1', 'anchor-x'), placeAnchor('anchor-x')),
    ]);
    expect(plan.regions[0]?.identifier).toBe('anchor-x');
  });

  test('退出は通知しない (ADR-0012 の発火は 1 日 1 回の不可逆で、到達のみが事実)', () => {
    const plan = planGeofences([
      src(chain('c1', 'a1'), placeAnchor('a1')),
    ]);
    expect(plan.regions[0]?.notifyOnEnter).toBe(true);
    expect(plan.regions[0]?.notifyOnExit).toBe(false);
  });

  test('stocked チェーンは登録しない (Today にも通知にも出さない方針と揃える)', () => {
    const plan = planGeofences([
      src(chain('c1', 'a1', { status: 'stocked' }), placeAnchor('a1')),
    ]);
    expect(plan.regions).toEqual([]);
  });

  test.each([
    ['time', { kind: 'time' as const, time: '07:00' }],
    ['behavior', { kind: 'behavior' as const }],
  ])('kind=%s のアンカーは登録しない', (_label, over) => {
    const plan = planGeofences([
      src(chain('c1', 'a1'), placeAnchor('a1', over)),
    ]);
    expect(plan.regions).toEqual([]);
  });

  test.each([
    ['latitude が null', { latitude: null }],
    ['longitude が null', { longitude: null }],
    ['radiusMeters が null', { radiusMeters: null }],
    ['radiusMeters が 0', { radiusMeters: 0 }],
    ['radiusMeters が負', { radiusMeters: -10 }],
  ])('%s の場所アンカーは登録しない (OS に不正な region を渡さない)', (_l, over) => {
    const plan = planGeofences([
      src(chain('c1', 'a1'), placeAnchor('a1', over)),
    ]);
    expect(plan.regions).toEqual([]);
  });

  test('同じアンカーを複数チェーンが共有していても region は 1 つ', () => {
    // chains.anchor_id の 1-1 は SQL レベルでは未強制 (src/db.ts §CASCADE 設計)。
    // 同じ identifier を 2 回登録すると OS 側の挙動が不定になるため排除する。
    const a = placeAnchor('shared');
    const plan = planGeofences([
      src(chain('c1', 'shared'), a),
      src(chain('c2', 'shared'), a),
    ]);
    expect(plan.regions).toHaveLength(1);
    expect(plan.regions[0]?.identifier).toBe('shared');
  });

  test('入力の順序を保つ (上限で切るときに何が落ちるかを呼び出し側が決められる)', () => {
    const plan = planGeofences([
      src(chain('c2', 'b'), placeAnchor('b')),
      src(chain('c1', 'a'), placeAnchor('a')),
    ]);
    expect(plan.regions.map((r) => r.identifier)).toEqual(['b', 'a']);
  });

  describe('iOS の同時監視上限', () => {
    const many = (n: number): GeofenceSource[] =>
      Array.from({ length: n }, (_, i) =>
        src(chain(`c${i}`, `a${i}`), placeAnchor(`a${i}`)),
      );

    test(`上限 (${IOS_REGION_LIMIT} 件) までは全部載る`, () => {
      const plan = planGeofences(many(IOS_REGION_LIMIT));
      expect(plan.regions).toHaveLength(IOS_REGION_LIMIT);
      expect(plan.droppedForLimit).toBe(0);
    });

    test('上限を超えたら切り捨てるが、落とした数を返す (黙って捨てない)', () => {
      // キューイングは Phase 2 (PLAN)。ここでは「載らなかった数」を呼び出し側に返す
      // だけにする — 握り潰して「全部登録できた」ように見せない (ADR-0073)。
      const plan = planGeofences(many(IOS_REGION_LIMIT + 3));
      expect(plan.regions).toHaveLength(IOS_REGION_LIMIT);
      expect(plan.droppedForLimit).toBe(3);
    });
  });

  test('場所アンカーが 1 つも無ければ空 (呼び出し側は停止を選べる)', () => {
    const plan = planGeofences([
      src(chain('c1', 'a1'), placeAnchor('a1', { kind: 'time', time: '07:00' })),
    ]);
    expect(plan.regions).toEqual([]);
    expect(plan.droppedForLimit).toBe(0);
  });
});
