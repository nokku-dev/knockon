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
  // ADR-0025 (PR-BB): タイマー秒数 (NULL = タイマーなし、 既存挙動)。
  // 入力単位は分 (UI で 30 → 1800 秒に変換) / DB は秒で精度確保。
  timerSeconds: number | null;
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
  // #73 (SPEC §6): ON/OFF = 一時停止。true/undefined = 通常 (Today に出る) /
  // false = 停止 (チェーンから外すが残す)。optional は既存 Node リテラルの非破壊追加。
  active?: boolean;
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

// テンプレートカタログの source。'official' = seed 由来 / 'user' = ユーザー作成。
// ADR-0040 (#160): 旧 Module / Link / ModuleKind 型は撤去。CatalogSource は新カテゴリ
// モデル (Category / CatalogAction) で継続利用する。
export type CatalogSource = 'official' | 'user';

// ADR-0039 (#154): 新カタログモデル (module 廃止 → カテゴリ2型)。
// 旧 Module / Link (ADR-0030) と並行追加 (catalog/live 分離は継承)。consumer
// (discovery / onboarding / edit) の移行は別トラックのため、旧型はまだ残す。
//
// カテゴリ2型:
// - 'genre'        ジャンル別カテゴリ。個別アクション (CatalogAction) を genre で束ねる。
//                  各アクションは 1 つの genre カテゴリにのみ属す (一意)。moment は持たない
//                  (moment は採用後にチェーン側で決まる、ADR-0039)。
// - 'recommended'  おすすめカテゴリ (朝/夜の完成ルーティン束)。genre アクションを順序つきで
//                  重複参照する (RecommendedItem)。プレビュー = ゴール提示。
export type CategoryType = 'genre' | 'recommended';

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  color: string; // 暫定パレット (a11y 最終調整は後続トラック)。
  source: CatalogSource;
  orderIndex: number;
};

// ジャンル別カテゴリ内の 1 アクション定義 (採用単位)。
// categoryId: 所属 genre カテゴリ (必ず 1 つ・一意)。
// defaultOn: 採用時の既定 ON (●=true / 「(任意)」=false)。「初期全選択」の既定集合判定に使う。
// position: カテゴリ内の表示順 (採用後のチェーン物理順は採用フロー側で決まる)。
export type CatalogAction = {
  id: string;
  title: string;
  categoryId: string;
  defaultOn: boolean;
  position: number;
  source: CatalogSource;
  timerSeconds: number | null;
};

// おすすめカテゴリの順序つきアイテム。genre アクション (CatalogAction) を重複可で参照する。
// 同じ actionId を複数の recommended カテゴリ / 同カテゴリ内で参照してよい (重複参照 OK)。
export type RecommendedItem = {
  id: string;
  categoryId: string; // 所属 recommended カテゴリ。
  actionId: string; // 参照する genre アクション。
  position: number; // recommended カテゴリ内の順序。
};

// 採用ドラフト。catalog → live (chain/nodes) 変換の中間表現。
// 純粋関数で生成し (DB/UI 非依存、K-007)、永続化は bundleAdoption.adoptChainDraft が担う。
// ADR-0040 (#160): 採用ノードは由来参照 (moduleId) を持たない (旧 module モデル撤去)。
export type ChainDraftNode = {
  actionTitle: string;
  timerSeconds: number | null;
};

export type ChainDraft = {
  title: string;
  nodes: ChainDraftNode[];
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

// #142: AchievementMap (今日分の nodeId→bool) の達成ノード数。 アプリ全体の
// 「今日の達成数」を全チェーン合算するときに 1 チェーン分を数える純粋ヘルパー。
export const countAchievedInMap = (map: AchievementMap): number =>
  Object.values(map).filter(Boolean).length;

// #142: ノード (アクション) 単位の全期間累計達成回数。 base = 今日より前の達成回数
// (repository の SQL COUNT で算出)、 achievedToday = 今日の達成状態。 今日分を base と
// 分離して表示時に合算するのは、 楽観更新 (タップで即時 +1) と整合させつつ
// ADR-0001「派生値は永続化しない」を守るため (今日の record を二重計上しない)。
export const nodeCumulativeCount = (
  base: number,
  achievedToday: boolean,
): number => base + (achievedToday ? 1 : 0);

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

// ADR-0028: ユーザー設定のリセット時刻 (HH:MM) を考慮した「今日の日付」。
// now の時刻 (hour*60+min) が resetTime 未満なら 1 日前を返す。 = 「夜型ユーザーが
// 自分の感覚で『まだ昨日』と思っている時間帯の操作を、 当日記録に振り分ける」。
//
// 不正な resetTime 文字列はデフォルト '00:00' 扱い (= 既存挙動)。 N=1 で UI 側
// バリデーションが正常系を保証する前提だが、 DB から壊れた値が来ても落ちないよう
// silent fallback (K-024 同型受容)。
export const effectiveTodayIsoDate = (
  now: Date,
  resetTime: string,
): IsoDate => {
  const parts = resetTime.split(':');
  let resetMinutes = 0;
  if (parts.length === 2) {
    const hh = parseInt(parts[0]!, 10);
    const mm = parseInt(parts[1]!, 10);
    if (
      !Number.isNaN(hh) &&
      !Number.isNaN(mm) &&
      hh >= 0 &&
      hh <= 23 &&
      mm >= 0 &&
      mm <= 59
    ) {
      resetMinutes = hh * 60 + mm;
    }
  }
  if (resetMinutes === 0) return todayIsoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes >= resetMinutes) return todayIsoDate(now);
  // 前日扱い。 月またぎ / 年またぎは Date オブジェクトに委ねる。
  const shifted = new Date(now);
  shifted.setDate(shifted.getDate() - 1);
  return todayIsoDate(shifted);
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
//
// 受容判断: 不正な date 文字列 (e.g. 'garbage') を渡すと getDay() = NaN になり、
// WEEKDAY_BY_DAY_INDEX[NaN] = undefined で「!」アサーションが嘘になる。
// 呼び出し側で IsoDate 形式 (YYYY-MM-DD) を保証する前提で受容 (todayIsoDate /
// listChains / Anchor.time の生成元はいずれも IsoDate を保証する型契約)。
// Phase 2 N=1 で生成元が手動入力されない限り発火しない。
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

// アクションを当日に Today にどう出すか解決する純粋関数 (Phase 2 variant)。
// - kind: 'fire' → 当日発火 (タップで達成記録可能、 マーカー描画あり、 通常色)
// - kind: 'skip' → 当日は休む日 (タップ無効、 マーカー描画なし、 グレー表示)
//   PR-1.9 修正前は Today から除外していたが、 「設定したのに表示されないと
//   バグと勘違いする」というユーザーフィードバックで「グレー表示で見せる」に変更。
//   ラベルは親アクション title (variant が null だから「何の variant がない日か」
//   が分からないので、 親 title を出すのが情報量最大)。
//
// 分岐:
// - action.variants が null → variant 未設定アクション、 毎日 fire (後方互換)
// - action.variants[weekday] が string → その曜日に variant ラベルで fire
// - action.variants[weekday] が null → 親 title で skip (グレー表示用)
export type ResolvedAction =
  | { kind: 'fire'; label: string }
  | { kind: 'skip'; label: string };

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
    return { kind: 'skip', label: action.title };
  }
  return { kind: 'fire', label: variantLabel };
};

// variant の有効曜日を「月火水」形式の文字列にまとめる純粋関数 (Phase 2)。
// UI で「このアクションは variant 設定済み」を視覚的に示すためのバッジ表示用。
// variants が null なら空文字。 全曜日 null (完全休眠) なら空文字。
const WEEKDAY_LABEL_BY_KEY: Readonly<Record<WeekdayKey, string>> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};
const WEEKDAY_KEYS_ORDERED: readonly WeekdayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export const summarizeVariantDays = (
  variants: VariantMap | null,
): string => {
  if (variants == null) return '';
  return WEEKDAY_KEYS_ORDERED.filter((k) => variants[k] != null)
    .map((k) => WEEKDAY_LABEL_BY_KEY[k])
    .join('');
};

// Today / チェーン一覧の表示順を「アンカー種別グループ + グループ内ソート」で決める
// 純粋関数 (PR feat/chain-sort-by-anchor-time、 ユーザー判断)。
//
// グループ順 (上→下):
//   1. kind='time' かつ time あり → 時刻昇順 (07:00 → 07:30 → 22:00 のように)
//   2. kind='place' → createdAt 昇順
//   3. それ以外 (kind='behavior' / kind='time' で time=null) → createdAt 昇順
//
// アンカー情報を chain と一緒に持つ任意の T 型に generic で動く。
type ChainOrderable = { chain: Chain; anchor: Anchor };

const kindOrderRank = (anchor: Anchor): number => {
  if (anchor.kind === 'time' && anchor.time != null) return 0;
  if (anchor.kind === 'place') return 1;
  return 2;
};

export const sortChainsForDisplay = <T extends ChainOrderable>(
  items: readonly T[],
): T[] => {
  return [...items].sort((a, b) => {
    const ra = kindOrderRank(a.anchor);
    const rb = kindOrderRank(b.anchor);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      // 時刻グループ: time 昇順 (HH:MM の文字列比較で OK)
      return (a.anchor.time ?? '').localeCompare(b.anchor.time ?? '');
    }
    // 他グループ: createdAt 昇順
    return a.chain.createdAt.localeCompare(b.chain.createdAt);
  });
};

// PR-Z1 (ADR-0024 §3a) 定着判定の純粋関数群。
//
// 「定着 = 14D ウィンドウ中の達成日数が閾値以上」の単純判定。 デフォルト閾値は
// 14D 中 10 日 (約 71%、 ユーザー判断で着手時に確定)。 variant 適用日数は当面
// 考慮しない (= 「Mon のみ variant」のような低頻度アクションは定着しにくい状態
// を受容)。 Phase 3 dashboard / Z2 で variant 考慮の達成率を実装したら再判断。

// 今日を含む過去 N 日の IsoDate 配列を返す (昇順)。 14D ウィンドウの基礎ヘルパー。
// 月またぎ / 年またぎは Date オブジェクトに委ねる (timezone は呼び出し側 today
// の解釈に依存。 todayIsoDate 経由なら local timezone 一貫)。
export const recentDateRange = (
  today: IsoDate,
  windowDays: number,
): IsoDate[] => {
  if (windowDays <= 0) return [];
  const base = new Date(today + 'T00:00:00');
  const out: IsoDate[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(todayIsoDate(d));
  }
  return out;
};

// ウィンドウ内の達成日数を集計。 achievements は全期間分の配列を受け取る
// (呼び出し側で絞り込まなくて良い API)。
export const countAchievedDaysInWindow = (
  achievements: readonly Achievement[],
  nodeId: string,
  today: IsoDate,
  windowDays: number,
): number => {
  const range = new Set(recentDateRange(today, windowDays));
  let count = 0;
  for (const a of achievements) {
    if (a.nodeId === nodeId && a.achieved && range.has(a.date)) count++;
  }
  return count;
};

// 定着判定 (ADR-0024 PR-Z1)。 14D 中 X 日以上達成で定着。
// 円→星マーカー (DESIGN-SYSTEM §4.2) の切替判定に使う。
// オプションで windowDays / minAchievedDays を上書き可能 (テスト / 将来の調整用)。
export type EstablishedOptions = {
  windowDays?: number;
  minAchievedDays?: number;
};

// 試行値 (PR-Z1 着手時に決定、 ユーザー判断で再調整): 14D 中 10 日達成 ≈ 71% で定着。
// Z2 で variant-aware threshold (= variant 適用日数を分母にする) に再判断する候補。
// 変更タイミング: 実機検証で「定着の手応えがズレている」シグナルが出たとき (K-014 ルート)。
const DEFAULT_ESTABLISHED_WINDOW_DAYS = 14;
const DEFAULT_ESTABLISHED_MIN_ACHIEVED = 10;

export const isNodeEstablished = (
  achievements: readonly Achievement[],
  nodeId: string,
  today: IsoDate,
  options?: EstablishedOptions,
): boolean => {
  const windowDays = options?.windowDays ?? DEFAULT_ESTABLISHED_WINDOW_DAYS;
  const minAchievedDays =
    options?.minAchievedDays ?? DEFAULT_ESTABLISHED_MIN_ACHIEVED;
  const count = countAchievedDaysInWindow(
    achievements,
    nodeId,
    today,
    windowDays,
  );
  return count >= minAchievedDays;
};
