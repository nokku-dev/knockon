export type IsoDate = string;

export type ChainStatus = 'active' | 'stocked';

export type AnchorKind = 'time' | 'place' | 'behavior';

export type Anchor = {
  id: string;
  title: string;
  kind: AnchorKind;
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
};

export type Action = {
  id: string;
  title: string;
  variants: VariantMap | null;
};

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Phase 2 前倒し variant (PR feat/phase-2-variant): 曜日ごとのラベル切替。
// - キーは曜日 (mon..sun)
// - 値が string → その曜日にそのラベルで Today に出る (発火)
// - 値が null → その曜日は Today に出ない (= 発火スキップ)
// - そもそも variants 自体が null → variant 未設定アクション、 既存挙動どおり毎日発火
//
// 将来サブチェーン実装時には variant 型の意味が変わる可能性 ([ADR-0018](docs/decisions/0018-variant-phase-2-frontload.md))。
// Phase 1 N=1 試作中の variant データはサブチェーン化のタイミングで再設計可能 (K-021 同型の受容)。
export type VariantMap = {
  [K in WeekdayKey]: string | null;
};

export type NodeKind = 'action';

export type Node = {
  id: string;
  chainId: string;
  orderIndex: number;
  kind: NodeKind;
  actionId: string;
};

export type Chain = {
  id: string;
  title: string;
  anchorId: string;
  status: ChainStatus;
  createdAt: IsoDate;
};

export type Achievement = {
  nodeId: string;
  date: IsoDate;
  achieved: boolean;
};

// ADR-0012: アンカー発火イベント。1 日 1 回の不可逆事実。
// 時刻/場所共通の発火モデル。
export type AnchorFiring = {
  anchorId: string;
  date: IsoDate;
};

export const isNodeAchievedOn = (
  achievements: readonly Achievement[],
  nodeId: string,
  date: IsoDate,
): boolean => {
  const record = achievements.find(
    (a) => a.nodeId === nodeId && a.date === date,
  );
  return record?.achieved ?? false;
};

export const countAchievedNodesOn = (
  achievements: readonly Achievement[],
  nodeIds: readonly string[],
  date: IsoDate,
): number =>
  nodeIds.reduce(
    (acc, id) => acc + (isNodeAchievedOn(achievements, id, date) ? 1 : 0),
    0,
  );

export const shouldSeed = (existingChains: readonly Chain[]): boolean =>
  existingChains.length === 0;

export type AchievementMap = Readonly<Record<string, boolean>>;

export const toAchievementMap = (
  achievements: readonly Achievement[],
  date: IsoDate,
): AchievementMap => {
  const map: Record<string, boolean> = {};
  for (const a of achievements) {
    if (a.date === date) map[a.nodeId] = a.achieved;
  }
  return map;
};

export const toggleAchievementInMap = (
  map: AchievementMap,
  nodeId: string,
): AchievementMap => ({ ...map, [nodeId]: !(map[nodeId] ?? false) });

export const todayIsoDate = (now: Date): IsoDate => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 線（スパイン）の --grow 範囲を派生する関数。
// 「達成済みノード範囲モデル」(ADR-0010) — アンカーから最後に達成済みのノードまで
// を --grow で繋ぐ。途中に未達ノードがあっても両端が達成済みなら線は繋がる扱い。
// 返り値: 最後に達成済みのノードのインデックス。全ノード未達なら -1。
export const lastAchievedNodeIndex = (
  nodes: readonly Node[],
  achievements: AchievementMap,
): number => {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node && achievements[node.id] === true) return i;
  }
  return -1;
};

// 地球を球とみなした 2 点間距離 (メートル)。Haversine 公式。
// 場所アンカーの発火判定 (isPlaceAnchorFiringNow) で使う純粋関数。
// 引数は度単位の (latitude, longitude)。返り値は m。
const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const distanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
};

// 場所アンカーが「発火状態」かを判定する純粋関数。
// 発火 = anchor.kind='place' かつ currentPosition がアンカーの半径内。
// Phase 1.6 は前景での距離判定のみ (Expo Go 制約で OS ジオフェンスは Phase 1.6b
// 後送り)。位置が取得できない / 権限拒否のときは呼び出し側が false を返す経路。
export const isPlaceAnchorFiringNow = (
  anchor: Anchor,
  currentPosition: { latitude: number; longitude: number },
): boolean => {
  if (anchor.kind !== 'place') return false;
  if (
    anchor.latitude == null ||
    anchor.longitude == null ||
    anchor.radiusMeters == null
  )
    return false;
  const d = distanceMeters(
    { latitude: anchor.latitude, longitude: anchor.longitude },
    currentPosition,
  );
  return d <= anchor.radiusMeters;
};

// 今日アンカーが発火済みかどうかを判定する純粋関数 (ADR-0012)。
// 発火 record が AnchorFiring 配列にあれば true。時刻/場所共通の判定。
// 「今日まだ発火していない」のチェックにも使う (! を取って評価)。
export const isAnchorFiringToday = (
  firings: readonly AnchorFiring[],
  anchorId: string,
  date: IsoDate,
): boolean =>
  firings.some((f) => f.anchorId === anchorId && f.date === date);

// 時刻アンカーが今日「発火状態」かを判定する純粋関数。
// 「発火状態」= その日の現在時刻が anchor.time 以降に到達している。
// 「Today に出るかどうか」とは独立した別軸 (Today 表示は Phase 1.4 Q2=B で
// 全 active シードチェーン)。本関数は UI の発火中ピル / 通知判断のみに使う。
export const isTimeAnchorFiringNow = (
  anchor: Anchor,
  now: Date,
): boolean => {
  if (anchor.kind !== 'time' || !anchor.time) return false;
  const parts = anchor.time.split(':');
  if (parts.length !== 2) return false;
  const hh = parseInt(parts[0]!, 10);
  const mm = parseInt(parts[1]!, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
  const fireMinutes = hh * 60 + mm;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= fireMinutes;
};

export const groupAchievementsByDate = (
  achievements: readonly Achievement[],
): Readonly<Record<IsoDate, AchievementMap>> => {
  const grouped: Record<IsoDate, Record<string, boolean>> = {};
  for (const a of achievements) {
    const day = (grouped[a.date] ??= {});
    day[a.nodeId] = a.achieved;
  }
  return grouped;
};

// IsoDate (YYYY-MM-DD) を曜日キーに変換する純粋関数 (Phase 2 variant)。
// new Date(string + 'T00:00:00') で local timezone 解釈 → getDay() が曜日番号 (0=日, 1=月, ..., 6=土)。
const WEEKDAY_BY_DAY_INDEX: readonly WeekdayKey[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];
export const getWeekdayKey = (date: IsoDate): WeekdayKey => {
  const d = new Date(date + 'T00:00:00');
  const idx = d.getDay();
  // 0..6 必ずいずれかのため safe assertion
  return WEEKDAY_BY_DAY_INDEX[idx]!;
};

// アクションを当日に Today に出すかどうか + 表示ラベルを解決する純粋関数 (Phase 2 variant)。
// - kind: 'fire' → 当日発火 (label を Today に表示)
// - kind: 'skip' → 当日は発火スキップ (Today に出さない)
//
// 分岐:
// - action.variants が null → variant 未設定アクション、既存挙動どおり毎日 fire
//   (Phase 1 で作成済みアクションの後方互換)
// - action.variants[weekday] が string → その曜日に variant ラベルで fire
// - action.variants[weekday] が null → その曜日は skip (Q1=A: variant なしの曜日は Today に出さない)
export type ResolvedAction =
  | { kind: 'fire'; label: string }
  | { kind: 'skip' };

export const resolveActionForDate = (
  action: Action,
  date: IsoDate,
): ResolvedAction => {
  if (action.variants == null) {
    return { kind: 'fire', label: action.title };
  }
  const weekday = getWeekdayKey(date);
  const variantLabel = action.variants[weekday];
  if (variantLabel == null) {
    return { kind: 'skip' };
  }
  return { kind: 'fire', label: variantLabel };
};
