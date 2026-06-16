import type {
  Achievement,
  Action,
  Anchor,
  AnchorFiring,
  Chain,
  Node,
} from './domain';
import {
  countAchievedDaysInWindow,
  countAchievedNodesOn,
  distanceMeters,
  effectiveTodayIsoDate,
  getWeekdayKey,
  groupAchievementsByDate,
  isAnchorFiringToday,
  isNodeAchievedOn,
  isNodeEstablished,
  isPlaceAnchorFiringNow,
  isTimeAnchorFiringNow,
  lastAchievedNodeIndex,
  recentDateRange,
  resolveActionForDate,
  shouldSeed,
  sortChainsForDisplay,
  summarizeVariantDays,
  toAchievementMap,
  todayIsoDate,
  toggleAchievementInMap,
} from './domain';

describe('isNodeAchievedOn', () => {
  const achievements: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n3', date: '2026-05-17', achieved: true },
  ];

  test('記録がある日に達成済みなら true', () => {
    expect(isNodeAchievedOn(achievements, 'n1', '2026-05-18')).toBe(true);
  });

  test('記録があっても achieved=false なら false', () => {
    expect(isNodeAchievedOn(achievements, 'n2', '2026-05-18')).toBe(false);
  });

  test('記録がない日は false', () => {
    expect(isNodeAchievedOn(achievements, 'n1', '2026-05-17')).toBe(false);
  });

  test('該当ノードが存在しない場合は false', () => {
    expect(isNodeAchievedOn(achievements, 'unknown', '2026-05-18')).toBe(false);
  });
});

describe('countAchievedNodesOn (ゆるい連鎖判定の基礎: 各ノード独立に集計)', () => {
  const achievements: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n3', date: '2026-05-18', achieved: true },
  ];

  test('飛ばされたノード (n2) があっても後続 (n3) は独立に達成扱い', () => {
    expect(
      countAchievedNodesOn(achievements, ['n1', 'n2', 'n3'], '2026-05-18'),
    ).toBe(2);
  });

  test('空配列で 0', () => {
    expect(countAchievedNodesOn(achievements, [], '2026-05-18')).toBe(0);
  });

  test('別日付では 0', () => {
    expect(
      countAchievedNodesOn(achievements, ['n1', 'n2', 'n3'], '2026-05-17'),
    ).toBe(0);
  });
});

describe('shouldSeed (起動時シード判定: 既存チェーン 0 件のときだけ投入)', () => {
  const chain: Chain = {
    id: 'c1',
    title: '朝のルーティン',
    anchorId: 'a1',
    status: 'active',
    createdAt: '2026-05-18T00:00:00Z',
  };

  test('チェーンが 0 件なら true', () => {
    expect(shouldSeed([])).toBe(true);
  });

  test('チェーンが 1 件以上あれば false', () => {
    expect(shouldSeed([chain])).toBe(false);
  });
});

describe('toAchievementMap (該当日付の Achievement[] を nodeId→bool 化)', () => {
  const records: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n3', date: '2026-05-17', achieved: true },
  ];

  test('対象日付のみマップに入る', () => {
    expect(toAchievementMap(records, '2026-05-18')).toEqual({
      n1: true,
      n2: false,
    });
  });

  test('該当 0 件なら空オブジェクト', () => {
    expect(toAchievementMap(records, '2026-05-16')).toEqual({});
  });
});

describe('toggleAchievementInMap (純粋に反転コピーを返す)', () => {
  test('未登録 nodeId は false 起点で true に反転', () => {
    expect(toggleAchievementInMap({}, 'n1')).toEqual({ n1: true });
  });

  test('true → false に反転', () => {
    expect(toggleAchievementInMap({ n1: true }, 'n1')).toEqual({ n1: false });
  });

  test('false → true に反転、他キーは保持', () => {
    expect(toggleAchievementInMap({ n1: false, n2: true }, 'n1')).toEqual({
      n1: true,
      n2: true,
    });
  });

  test('元のオブジェクトは破壊しない', () => {
    const original = { n1: true };
    toggleAchievementInMap(original, 'n1');
    expect(original).toEqual({ n1: true });
  });
});

describe('todayIsoDate (Date → YYYY-MM-DD; ローカルタイムゾーンで切り出し)', () => {
  test('1 桁の月/日はゼロ埋めされる', () => {
    expect(todayIsoDate(new Date(2026, 0, 3, 12, 0, 0))).toBe('2026-01-03');
  });

  test('境界の月末', () => {
    expect(todayIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('effectiveTodayIsoDate (ADR-0028: リセット時刻ベースの今日日付)', () => {
  test('resetTime=00:00 はデフォルト挙動 (todayIsoDate と一致)', () => {
    const now = new Date(2026, 4, 30, 0, 0, 0); // 5/30 00:00
    expect(effectiveTodayIsoDate(now, '00:00')).toBe('2026-05-30');
  });

  test('resetTime=00:00 で深夜 12 時直前 → 当日', () => {
    const now = new Date(2026, 4, 30, 23, 59, 59); // 5/30 23:59:59
    expect(effectiveTodayIsoDate(now, '00:00')).toBe('2026-05-30');
  });

  test('resetTime=03:00 で 02:59 → 前日扱い (= 「夜型ユーザーが寝る前の操作」を当日記録に)', () => {
    const now = new Date(2026, 4, 30, 2, 59, 0); // 5/30 02:59
    expect(effectiveTodayIsoDate(now, '03:00')).toBe('2026-05-29');
  });

  test('resetTime=03:00 で 03:00 ぴったり → 当日に切り替わる (= 境界包含)', () => {
    const now = new Date(2026, 4, 30, 3, 0, 0); // 5/30 03:00:00
    expect(effectiveTodayIsoDate(now, '03:00')).toBe('2026-05-30');
  });

  test('resetTime=03:00 で 03:00 の 1 秒前 → 前日扱い', () => {
    const now = new Date(2026, 4, 30, 2, 59, 59);
    expect(effectiveTodayIsoDate(now, '03:00')).toBe('2026-05-29');
  });

  test('resetTime=12:00 で 11:59 → 前日扱い (= 昼を境界にする運用)', () => {
    const now = new Date(2026, 4, 30, 11, 59, 0);
    expect(effectiveTodayIsoDate(now, '12:00')).toBe('2026-05-29');
  });

  test('resetTime=12:00 で 12:00 → 当日扱い', () => {
    const now = new Date(2026, 4, 30, 12, 0, 0);
    expect(effectiveTodayIsoDate(now, '12:00')).toBe('2026-05-30');
  });

  test('月またぎ: 6/1 02:00 / resetTime=03:00 → 5/31 (前月)', () => {
    const now = new Date(2026, 5, 1, 2, 0, 0); // 6/1 02:00
    expect(effectiveTodayIsoDate(now, '03:00')).toBe('2026-05-31');
  });

  test('年またぎ: 1/1 02:00 / resetTime=04:00 → 前年 12/31', () => {
    const now = new Date(2027, 0, 1, 2, 0, 0); // 2027/1/1 02:00
    expect(effectiveTodayIsoDate(now, '04:00')).toBe('2026-12-31');
  });

  test('不正な resetTime 文字列はデフォルト (00:00) として扱う (= 当日)', () => {
    const now = new Date(2026, 4, 30, 5, 0, 0);
    expect(effectiveTodayIsoDate(now, 'garbage')).toBe('2026-05-30');
    expect(effectiveTodayIsoDate(now, '25:00')).toBe('2026-05-30');
    expect(effectiveTodayIsoDate(now, '')).toBe('2026-05-30');
  });
});

describe('lastAchievedNodeIndex (達成済みノード範囲モデル: ADR-0010)', () => {
  const node = (id: string, orderIndex: number): Node => ({
    id,
    chainId: 'c1',
    orderIndex,
    kind: 'action',
    actionId: `act-${id}`,
  });
  const nodes: Node[] = [node('n1', 0), node('n2', 1), node('n3', 2)];

  test('全ノード未達 → -1 (スパイン --grow 範囲なし)', () => {
    expect(lastAchievedNodeIndex(nodes, {})).toBe(-1);
  });

  test('n1 のみ達成 → 0 (anchor → n1 が --grow)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true })).toBe(0);
  });

  test('n1, n2 達成 → 1 (anchor → n2 が --grow)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true, n2: true })).toBe(1);
  });

  test('飛ばし達成 (n1 と n3 のみ) → 2 (達成済みノード範囲モデル: n3 まで線が繋がる)', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: true, n3: true })).toBe(2);
  });

  test('n3 のみ達成 (アンカー → n3 まで全部 --grow / 途中 n1 n2 未達でも繋がる)', () => {
    expect(lastAchievedNodeIndex(nodes, { n3: true })).toBe(2);
  });

  test('全ノード達成 → nodes.length - 1 (スパイン全域 --grow)', () => {
    expect(
      lastAchievedNodeIndex(nodes, { n1: true, n2: true, n3: true }),
    ).toBe(2);
  });

  test('achieved=false (明示的未達記録) は達成扱いしない', () => {
    expect(lastAchievedNodeIndex(nodes, { n1: false })).toBe(-1);
  });
});

describe('distanceMeters (Haversine 2 点間距離)', () => {
  test('同じ点 → 0m', () => {
    expect(
      distanceMeters(
        { latitude: 35.6586, longitude: 139.7454 },
        { latitude: 35.6586, longitude: 139.7454 },
      ),
    ).toBe(0);
  });

  test('東京タワー → 増上寺 (公称約 400m) を許容誤差 50m 以内で計算', () => {
    // 東京タワー
    const a = { latitude: 35.6586, longitude: 139.7454 };
    // 増上寺
    const b = { latitude: 35.6577, longitude: 139.7488 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(500);
  });

  test('緯度 1 度 ≒ 111km 程度', () => {
    const d = distanceMeters(
      { latitude: 35.0, longitude: 139.0 },
      { latitude: 36.0, longitude: 139.0 },
    );
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('isPlaceAnchorFiringNow (場所アンカーの発火判定)', () => {
  const placeAnchor = (
    lat: number | null,
    lng: number | null,
    radius: number | null,
  ): Anchor => ({
    id: 'a1',
    title: '自宅',
    kind: 'place',
    time: null,
    latitude: lat,
    longitude: lng,
    radiusMeters: radius,
  });
  const home = { latitude: 35.6586, longitude: 139.7454 };

  test('現在地がアンカー位置と一致 (距離 0m < 100m) → true', () => {
    expect(isPlaceAnchorFiringNow(placeAnchor(35.6586, 139.7454, 100), home)).toBe(true);
  });

  test('現在地がアンカーから半径内 (約 50m, 半径 100m) → true', () => {
    // 北に約 50m
    const near = { latitude: 35.6586 + 0.00045, longitude: 139.7454 };
    expect(isPlaceAnchorFiringNow(placeAnchor(35.6586, 139.7454, 100), near)).toBe(true);
  });

  test('現在地がアンカー半径外 (約 200m, 半径 100m) → false', () => {
    const far = { latitude: 35.6586 + 0.0018, longitude: 139.7454 };
    expect(isPlaceAnchorFiringNow(placeAnchor(35.6586, 139.7454, 100), far)).toBe(false);
  });

  test('kind=time は常に false', () => {
    const a: Anchor = {
      id: 'a2',
      title: '起床',
      kind: 'time',
      time: '07:30',
      latitude: null,
      longitude: null,
      radiusMeters: null,
    };
    expect(isPlaceAnchorFiringNow(a, home)).toBe(false);
  });

  test('latitude / longitude / radiusMeters のどれかが null なら false (defensive)', () => {
    expect(isPlaceAnchorFiringNow(placeAnchor(null, 139.7454, 100), home)).toBe(false);
    expect(isPlaceAnchorFiringNow(placeAnchor(35.6586, null, 100), home)).toBe(false);
    expect(isPlaceAnchorFiringNow(placeAnchor(35.6586, 139.7454, null), home)).toBe(false);
  });
});

describe('isAnchorFiringToday (発火イベント記録の有無判定: ADR-0012)', () => {
  const firings: AnchorFiring[] = [
    { anchorId: 'a1', date: '2026-05-18' },
    { anchorId: 'a1', date: '2026-05-19' },
    { anchorId: 'a2', date: '2026-05-19' },
  ];

  test('該当 anchor の今日 record があれば true', () => {
    expect(isAnchorFiringToday(firings, 'a1', '2026-05-19')).toBe(true);
  });

  test('該当 anchor の record があっても別日なら false', () => {
    expect(isAnchorFiringToday(firings, 'a1', '2026-05-20')).toBe(false);
  });

  test('該当日付の record があっても別 anchor なら false', () => {
    expect(isAnchorFiringToday(firings, 'a3', '2026-05-19')).toBe(false);
  });

  test('空配列なら常に false', () => {
    expect(isAnchorFiringToday([], 'a1', '2026-05-19')).toBe(false);
  });
});

describe('isTimeAnchorFiringNow (時刻アンカーの今日発火判定)', () => {
  const timeAnchor = (time: string | null): Anchor => ({
    id: 'a1',
    title: '起床',
    kind: 'time',
    time,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  });
  const behaviorAnchor: Anchor = {
    id: 'a2',
    title: '起床',
    kind: 'behavior',
    time: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  };

  test('kind=time, 現在時刻 ≥ anchor.time → true', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 8, 0)),
    ).toBe(true);
  });

  test('kind=time, 現在時刻 = anchor.time ぴったり → true', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 7, 30)),
    ).toBe(true);
  });

  test('kind=time, 現在時刻 < anchor.time → false', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:30'), new Date(2026, 4, 19, 7, 0)),
    ).toBe(false);
  });

  test('kind=behavior は常に false (時刻アンカーではない)', () => {
    expect(
      isTimeAnchorFiringNow(behaviorAnchor, new Date(2026, 4, 19, 23, 59)),
    ).toBe(false);
  });

  test('time が null なら false', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor(null), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
  });

  test('time が不正フォーマットなら false (defensive)', () => {
    expect(
      isTimeAnchorFiringNow(timeAnchor('abc'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
    expect(
      isTimeAnchorFiringNow(timeAnchor('25:30'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
    expect(
      isTimeAnchorFiringNow(timeAnchor('07:99'), new Date(2026, 4, 19, 12, 0)),
    ).toBe(false);
  });
});

describe('groupAchievementsByDate (14D ウィンドウ用 API 受口: 日付別 nodeId→bool マップ)', () => {
  const records: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n2', date: '2026-05-18', achieved: false },
    { nodeId: 'n1', date: '2026-05-19', achieved: true },
    { nodeId: 'n3', date: '2026-05-19', achieved: true },
  ];

  test('日付ごとに nodeId→bool に分かれる', () => {
    expect(groupAchievementsByDate(records)).toEqual({
      '2026-05-18': { n1: true, n2: false },
      '2026-05-19': { n1: true, n3: true },
    });
  });

  test('空配列 → 空オブジェクト', () => {
    expect(groupAchievementsByDate([])).toEqual({});
  });
});

describe('getWeekdayKey (Phase 2 variant)', () => {
  test('2026-05-18 (月) → mon', () => {
    expect(getWeekdayKey('2026-05-18')).toBe('mon');
  });
  test('2026-05-19 (火) → tue', () => {
    expect(getWeekdayKey('2026-05-19')).toBe('tue');
  });
  test('2026-05-20 (水) → wed', () => {
    expect(getWeekdayKey('2026-05-20')).toBe('wed');
  });
  test('2026-05-21 (木) → thu', () => {
    expect(getWeekdayKey('2026-05-21')).toBe('thu');
  });
  test('2026-05-22 (金) → fri', () => {
    expect(getWeekdayKey('2026-05-22')).toBe('fri');
  });
  test('2026-05-23 (土) → sat', () => {
    expect(getWeekdayKey('2026-05-23')).toBe('sat');
  });
  test('2026-05-24 (日) → sun', () => {
    expect(getWeekdayKey('2026-05-24')).toBe('sun');
  });
});

describe('resolveActionForDate (Phase 2 variant: 曜日ごとのラベル切替 + 発火スキップ)', () => {
  const base = { id: 'a1', title: '筋トレ', timerSeconds: null };

  test('variants=null → 既存挙動 (毎日 fire / ラベル=親 title)', () => {
    const action: Action = { ...base, variants: null };
    expect(resolveActionForDate(action, '2026-05-20')).toEqual({
      kind: 'fire',
      label: '筋トレ',
    });
  });

  test('variants 設定済み + 当日 (水) に variant あり → fire / variant ラベル', () => {
    const action: Action = {
      ...base,
      variants: {
        mon: '胸トレ',
        tue: '足トレ',
        wed: '背中トレ',
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    };
    expect(resolveActionForDate(action, '2026-05-20')).toEqual({
      kind: 'fire',
      label: '背中トレ',
    });
  });

  test('variants 設定済み + 当日 (木) に variant null → skip (親 title を保持して Today にグレー表示)', () => {
    const action: Action = {
      ...base,
      variants: {
        mon: '胸トレ',
        tue: '足トレ',
        wed: '背中トレ',
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    };
    expect(resolveActionForDate(action, '2026-05-21')).toEqual({
      kind: 'skip',
      label: '筋トレ',
    });
  });

  test('全曜日 null の variants → 毎日 skip / 親 title 表示', () => {
    const action: Action = {
      ...base,
      variants: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    };
    expect(resolveActionForDate(action, '2026-05-18')).toEqual({
      kind: 'skip',
      label: '筋トレ',
    });
    expect(resolveActionForDate(action, '2026-05-19')).toEqual({
      kind: 'skip',
      label: '筋トレ',
    });
  });
});

describe('summarizeVariantDays (Phase 2 variant: UI バッジ用)', () => {
  test('variants=null → 空文字', () => {
    expect(summarizeVariantDays(null)).toBe('');
  });

  test('月火水のみ variant あり → "月火水"', () => {
    expect(
      summarizeVariantDays({
        mon: '胸トレ',
        tue: '足トレ',
        wed: '背中トレ',
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      }),
    ).toBe('月火水');
  });

  test('全曜日 null (完全休眠) → 空文字', () => {
    expect(
      summarizeVariantDays({
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      }),
    ).toBe('');
  });

  test('全曜日 variant あり → "月火水木金土日" (順序固定)', () => {
    expect(
      summarizeVariantDays({
        mon: 'a',
        tue: 'b',
        wed: 'c',
        thu: 'd',
        fri: 'e',
        sat: 'f',
        sun: 'g',
      }),
    ).toBe('月火水木金土日');
  });

  test('土日のみ variant あり → "土日" (順序は月→日固定)', () => {
    expect(
      summarizeVariantDays({
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: '休日筋トレ',
        sun: '休日ヨガ',
      }),
    ).toBe('土日');
  });
});

describe('sortChainsForDisplay (Today / 一覧の表示順)', () => {
  const mkChain = (id: string, createdAt: string): Chain => ({
    id,
    title: `chain ${id}`,
    anchorId: `anchor-${id}`,
    status: 'active',
    createdAt,
  });
  const mkAnchor = (
    kind: Anchor['kind'],
    time: string | null = null,
  ): Anchor => ({
    id: `anchor-${time ?? kind}`,
    title: '起点',
    kind,
    time,
    latitude: null,
    longitude: null,
    radiusMeters: null,
  });

  test('時刻アンカーは time 昇順で並ぶ', () => {
    const items = [
      { chain: mkChain('a', '2026-05-01'), anchor: mkAnchor('time', '22:00') },
      { chain: mkChain('b', '2026-05-02'), anchor: mkAnchor('time', '07:00') },
      { chain: mkChain('c', '2026-05-03'), anchor: mkAnchor('time', '12:30') },
    ];
    const sorted = sortChainsForDisplay(items);
    expect(sorted.map((s) => s.chain.id)).toEqual(['b', 'c', 'a']);
  });

  test('グループ順は time → place → behavior', () => {
    const items = [
      { chain: mkChain('be', '2026-05-01'), anchor: mkAnchor('behavior') },
      { chain: mkChain('pl', '2026-05-02'), anchor: mkAnchor('place') },
      { chain: mkChain('ti', '2026-05-03'), anchor: mkAnchor('time', '07:00') },
    ];
    const sorted = sortChainsForDisplay(items);
    expect(sorted.map((s) => s.chain.id)).toEqual(['ti', 'pl', 'be']);
  });

  test('place / behavior グループ内は createdAt 昇順', () => {
    const items = [
      { chain: mkChain('p2', '2026-05-10'), anchor: mkAnchor('place') },
      { chain: mkChain('p1', '2026-05-01'), anchor: mkAnchor('place') },
      { chain: mkChain('b2', '2026-05-20'), anchor: mkAnchor('behavior') },
      { chain: mkChain('b1', '2026-05-15'), anchor: mkAnchor('behavior') },
    ];
    const sorted = sortChainsForDisplay(items);
    expect(sorted.map((s) => s.chain.id)).toEqual(['p1', 'p2', 'b1', 'b2']);
  });

  test('kind=time だが time=null は behavior 相当 (末尾)', () => {
    const items = [
      {
        chain: mkChain('null', '2026-05-01'),
        anchor: mkAnchor('time', null),
      },
      {
        chain: mkChain('valid', '2026-05-02'),
        anchor: mkAnchor('time', '08:00'),
      },
    ];
    const sorted = sortChainsForDisplay(items);
    expect(sorted.map((s) => s.chain.id)).toEqual(['valid', 'null']);
  });

  test('空配列 → 空配列', () => {
    expect(sortChainsForDisplay([])).toEqual([]);
  });

  test('元配列を破壊しない (新配列を返す)', () => {
    const items = [
      { chain: mkChain('a', '2026-05-01'), anchor: mkAnchor('time', '22:00') },
      { chain: mkChain('b', '2026-05-02'), anchor: mkAnchor('time', '07:00') },
    ];
    const original = [...items];
    sortChainsForDisplay(items);
    expect(items).toEqual(original);
  });
});

describe('recentDateRange (今日を含む過去 N 日の IsoDate 配列を返す: 14D ウィンドウ用)', () => {
  test('windowDays=3 → 今日と前 2 日 (昇順)', () => {
    expect(recentDateRange('2026-05-19', 3)).toEqual([
      '2026-05-17',
      '2026-05-18',
      '2026-05-19',
    ]);
  });

  test('月またぎを跨ぐ (4/30 windowDays=3 → 4/28, 4/29, 4/30)', () => {
    expect(recentDateRange('2026-04-30', 3)).toEqual([
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
  });

  test('年またぎ (2026/01/02 windowDays=3 → 2025/12/31, 2026/01/01, 2026/01/02)', () => {
    expect(recentDateRange('2026-01-02', 3)).toEqual([
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  test('windowDays=14 → 14 件', () => {
    const range = recentDateRange('2026-05-19', 14);
    expect(range.length).toBe(14);
    expect(range[13]).toBe('2026-05-19');
    expect(range[0]).toBe('2026-05-06');
  });

  test('windowDays=1 → 今日 1 件のみ', () => {
    expect(recentDateRange('2026-05-19', 1)).toEqual(['2026-05-19']);
  });

  test('windowDays=0 → 空配列', () => {
    expect(recentDateRange('2026-05-19', 0)).toEqual([]);
  });
});

describe('countAchievedDaysInWindow (定着判定の中間集計: ウィンドウ内達成日数)', () => {
  const achievements: Achievement[] = [
    { nodeId: 'n1', date: '2026-05-19', achieved: true },
    { nodeId: 'n1', date: '2026-05-18', achieved: true },
    { nodeId: 'n1', date: '2026-05-17', achieved: false },
    { nodeId: 'n1', date: '2026-05-10', achieved: true },
    { nodeId: 'n1', date: '2026-05-05', achieved: true }, // 14D ウィンドウ外 (>14 日前)
    { nodeId: 'n2', date: '2026-05-19', achieved: true },
  ];

  test('14D ウィンドウ内の達成日数を集計', () => {
    expect(
      countAchievedDaysInWindow(achievements, 'n1', '2026-05-19', 14),
    ).toBe(3); // 5/19, 5/18, 5/10 (5/17 は achieved=false)
  });

  test('境界: 14D ウィンドウ inclusive 端 (5/6) は含む / 1 日超え (5/5) は含まない', () => {
    // 5/19 を today にした 14D = 5/6 から 5/19 (両端 inclusive)。
    // 5/6 の達成は count に含まれ、 5/5 の達成は含まれないことを境界 1 日差で対比検証。
    const boundaryRecords: Achievement[] = [
      { nodeId: 'nb', date: '2026-05-06', achieved: true }, // ウィンドウ内 (端)
      { nodeId: 'nb', date: '2026-05-05', achieved: true }, // ウィンドウ外 (1 日越え)
    ];
    expect(
      countAchievedDaysInWindow(boundaryRecords, 'nb', '2026-05-19', 14),
    ).toBe(1); // 5/6 のみ count、 5/5 は除外
  });

  test('他ノードの達成は除外', () => {
    expect(
      countAchievedDaysInWindow(achievements, 'n2', '2026-05-19', 14),
    ).toBe(1);
  });

  test('該当ノードなしなら 0', () => {
    expect(
      countAchievedDaysInWindow(achievements, 'unknown', '2026-05-19', 14),
    ).toBe(0);
  });

  test('windowDays=1 (今日のみ) で集計', () => {
    expect(countAchievedDaysInWindow(achievements, 'n1', '2026-05-19', 1)).toBe(1);
  });
});

describe('isNodeEstablished (定着判定: ADR-0024 PR-Z1 / 14D 中 10 日以上達成で定着)', () => {
  // 14D 連続達成
  const allAchieved = (nodeId: string): Achievement[] =>
    Array.from({ length: 14 }, (_, i) => {
      const day = String(6 + i).padStart(2, '0');
      return { nodeId, date: `2026-05-${day}`, achieved: true };
    });

  test('14D 中 10 日達成 (デフォルト閾値) → 定着 (true)', () => {
    const records: Achievement[] = Array.from({ length: 10 }, (_, i) => {
      const day = String(10 + i).padStart(2, '0');
      return { nodeId: 'n1', date: `2026-05-${day}`, achieved: true };
    });
    expect(isNodeEstablished(records, 'n1', '2026-05-19')).toBe(true);
  });

  test('14D 中 9 日達成 (閾値未満) → 未定着 (false)', () => {
    const records: Achievement[] = Array.from({ length: 9 }, (_, i) => {
      const day = String(11 + i).padStart(2, '0');
      return { nodeId: 'n1', date: `2026-05-${day}`, achieved: true };
    });
    expect(isNodeEstablished(records, 'n1', '2026-05-19')).toBe(false);
  });

  test('14D 連続達成 → 定着', () => {
    expect(isNodeEstablished(allAchieved('n1'), 'n1', '2026-05-19')).toBe(true);
  });

  test('14D 中 0 日達成 → 未定着', () => {
    expect(isNodeEstablished([], 'n1', '2026-05-19')).toBe(false);
  });

  test('閾値カスタム (minAchievedDays=5) → 14D 中 5 日で定着', () => {
    const records: Achievement[] = Array.from({ length: 5 }, (_, i) => {
      const day = String(15 + i).padStart(2, '0');
      return { nodeId: 'n1', date: `2026-05-${day}`, achieved: true };
    });
    expect(
      isNodeEstablished(records, 'n1', '2026-05-19', {
        minAchievedDays: 5,
      }),
    ).toBe(true);
  });

  test('ウィンドウ外の連続達成は定着判定に含めない', () => {
    // 5/19 を基準に 14D = 5/6~5/19。 4 月の達成 14 日連続は範囲外
    const records: Achievement[] = Array.from({ length: 14 }, (_, i) => {
      const day = String(15 + i).padStart(2, '0');
      return { nodeId: 'n1', date: `2026-04-${day}`, achieved: true };
    });
    expect(isNodeEstablished(records, 'n1', '2026-05-19')).toBe(false);
  });
});
