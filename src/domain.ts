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

// ADR-0044 (#181): 手動メモ。ユーザーが書いた「観測した事実」軸 (派生値ではない)。
// 正準データの 4 軸目 (achievements / anchor_firings / metrics に続く)。
// nodeId: 紐付け先ノード (= 特定チェーン内の特定アクション位置)。null = 汎用メモ。
//   ノード削除時は ON DELETE SET NULL で本文を残し node_id だけ外す (Augmentation)。
// createdAt / updatedAt: ISO-like 文字列 (秒精度、 metrics の recorded_at と同フォーマット)。
export type Note = {
  id: string;
  nodeId: string | null;
  content: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
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

// ── 定着ライフサイクル (ADR-0047) ──────────────────────────────────────────
// 定着を「生涯マイルストーン (latch)」として派生する。isNodeEstablished (14D ローリング)
// との違い: 一度バーに到達したら以後も定着扱い (崩れうる (−) を排し Celebrate 主と整合)。
// システムは降格させない。ユーザーの「取り下げ」だけが定着をリセットできる (観測事実軸)。

// 定着取り下げ = ユーザーが「最近やれてない」と感じたときに定着を取り下げる観測事実。
// 正準データの 5 軸目 (achievements / anchor_firings / metrics / notes に続く)。
// retractedAt: ISO-like 文字列 (秒精度)。判定では日付部分 (YYYY-MM-DD) のみ使う。
export type SettlementRetraction = {
  nodeId: string;
  retractedAt: IsoDate;
};

// これから (未着手) / 育成中 (実タップあり・未定着) / もう少しで定着 (定着バー直前) / 定着 (latch)。
// ADR-0047 追補 (#205, 2026-07-07): 育成中と定着の間に「もう少しで定着」を追加。 現在の
// 14D 窓 (取り下げ以降・今日以前) で ALMOST 閾値以上の達成があるが未定着のノード。
export type SettlementStage = 'fresh' | 'growing' | 'almost' | 'settled';

// もう少しで定着: 14D 窓で達成 8〜9 日 (定着バー = 10 日の直前 2 日ぶん、 ユーザー判断
// 2026-07-07)。 10 日以上なら定着 (latch) 側に入るため、 実質 [8, 9] を拾う閾値。
const DEFAULT_ALMOST_MIN_ACHIEVED = 8;

// ノードの最新取り下げ日 (YYYY-MM-DD)。なければ null。
const lastRetractionDateForNode = (
  retractions: readonly SettlementRetraction[],
  nodeId: string,
): IsoDate | null => {
  let latest: IsoDate | null = null;
  for (const r of retractions) {
    if (r.nodeId !== nodeId) continue;
    const date = r.retractedAt.slice(0, 10);
    if (latest === null || date > latest) latest = date;
  }
  return latest;
};

// 定着 (latch): 取り下げ以降に、windowDays 窓で minAchievedDays 以上を満たした窓が
// 「過去に一度でも」存在するか。履歴は不変なのでこの存在判定は単調増加 (= latch)。
// auto 達成レコードは書かない (ADR-0047 ハイブリッド) ため achievements は実タップのみ。
export const isNodeSettled = (
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  nodeId: string,
  today: IsoDate,
  options?: EstablishedOptions,
): boolean => {
  const windowDays = options?.windowDays ?? DEFAULT_ESTABLISHED_WINDOW_DAYS;
  const minAchievedDays =
    options?.minAchievedDays ?? DEFAULT_ESTABLISHED_MIN_ACHIEVED;
  const lastRetraction = lastRetractionDateForNode(retractions, nodeId);
  // 取り下げ以降 かつ 今日以前の達成日のみを対象にする。
  const eligible: IsoDate[] = [];
  for (const a of achievements) {
    if (a.nodeId !== nodeId || !a.achieved) continue;
    if (a.date > today) continue;
    if (lastRetraction !== null && a.date <= lastRetraction) continue;
    eligible.push(a.date);
  }
  if (eligible.length < minAchievedDays) return false;
  const eligibleSet = new Set(eligible);
  // 窓の右端は達成日に置けば WLOG (それ以外へ動かしても達成数は増えない)。
  for (const end of eligible) {
    const windowSet = new Set(recentDateRange(end, windowDays));
    let count = 0;
    for (const d of eligibleSet) if (windowSet.has(d)) count++;
    if (count >= minAchievedDays) return true;
  }
  return false;
};

// ステージ分類: 定着 > もう少しで定着 > 育成中 (実タップ ≥1) > これから (未着手)。
// - 定着: latch (isNodeSettled)。
// - もう少しで定着: 未定着だが、 現在の 14D 窓 (取り下げ以降・今日以前) で eligible 達成が
//   ALMOST 閾値以上 (8〜9 日)。 未定着なので窓内 eligible は必ず 10 未満 (10 なら定着側)。
// - 育成中: 実タップが 1 つでもある (過去含む)。 取り下げ済みノードもここに戻る。
// - これから: 実タップが皆無。
export const nodeSettlementStage = (
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  nodeId: string,
  today: IsoDate,
  options?: EstablishedOptions,
): SettlementStage => {
  if (isNodeSettled(achievements, retractions, nodeId, today, options)) {
    return 'settled';
  }
  const windowDays = options?.windowDays ?? DEFAULT_ESTABLISHED_WINDOW_DAYS;
  const lastRetraction = lastRetractionDateForNode(retractions, nodeId);
  const windowSet = new Set(recentDateRange(today, windowDays));
  const eligibleInWindow = new Set<IsoDate>();
  let hasAnyTap = false;
  for (const a of achievements) {
    if (a.nodeId !== nodeId || !a.achieved || a.date > today) continue;
    hasAnyTap = true;
    // もう少しで定着は「現在有効な (取り下げ以降の) 窓」で測る (isNodeSettled と同じ eligibility)。
    if (lastRetraction !== null && a.date <= lastRetraction) continue;
    if (windowSet.has(a.date)) eligibleInWindow.add(a.date);
  }
  if (eligibleInWindow.size >= DEFAULT_ALMOST_MIN_ACHIEVED) return 'almost';
  if (hasAnyTap) return 'growing';
  return 'fresh';
};

// ポートフォリオ上部のステージ別カウント (クロス断面のスナップショット)。
export type SettlementStageCounts = {
  fresh: number;
  growing: number;
  almost: number;
  settled: number;
};

export const countSettlementStages = (
  nodeIds: readonly string[],
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  today: IsoDate,
  options?: EstablishedOptions,
): SettlementStageCounts => {
  const counts: SettlementStageCounts = {
    fresh: 0,
    growing: 0,
    almost: 0,
    settled: 0,
  };
  for (const nodeId of nodeIds) {
    counts[
      nodeSettlementStage(achievements, retractions, nodeId, today, options)
    ]++;
  }
  return counts;
};

// 先週 (daysAgo 日前) から「定着」「もう少しで定着」へ新たに入ったノード数 (= 流入数)。
// 増減 (net) ではなく上方向への移動個数のみ数える Celebrate 系フロー指標 (ユーザー判断
// 2026-07-07)。 定着 latch は単調増加なので intoSettled は「今週定着した個数」。 almost は
// 単調でないため「下位 (これから/育成中) から almost へ上がった個数」だけを数える (settled
// からの降格 = 下方向は数えない = マイナスを指差さない)。
export type SettlementStageMovements = {
  intoSettled: number;
  intoAlmost: number;
};

const STAGE_RANK: Record<SettlementStage, number> = {
  fresh: 0,
  growing: 1,
  almost: 2,
  settled: 3,
};

export const settlementStageMovements = (
  nodeIds: readonly string[],
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  today: IsoDate,
  daysAgo = 7,
  options?: EstablishedOptions,
): SettlementStageMovements => {
  // daysAgo 日前の日付 (recentDateRange(today, daysAgo+1) の先頭 = today - daysAgo)。
  const range = recentDateRange(today, daysAgo + 1);
  const prevDate = range[0] ?? today;
  let intoSettled = 0;
  let intoAlmost = 0;
  for (const nodeId of nodeIds) {
    const now = nodeSettlementStage(achievements, retractions, nodeId, today, options);
    const prev = nodeSettlementStage(
      achievements,
      retractions,
      nodeId,
      prevDate,
      options,
    );
    if (now === 'settled' && prev !== 'settled') intoSettled++;
    // almost への「上方向」流入のみ (settled からの降格は数えない)。
    if (now === 'almost' && STAGE_RANK[prev] < STAGE_RANK.almost) intoAlmost++;
  }
  return { intoSettled, intoAlmost };
};

// 2 つの ISO 日付 (YYYY-MM-DD) 間の日数差 (end - start)。同日なら 0。
const isoDayDiff = (start: IsoDate, end: IsoDate): number => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86_400_000);
};

// ADR-0047 追補 (2026-07-07): 「派生で数える」累計用。 1 ノードの effective 達成日数
// (= 実タップ達成 OR 定着 auto) を upToDate まで数える。 達成レコードは書かない (K-002)。
// 定着ノードは定着到達日以降を「毎日 auto 達成」とみなして数える (= 手を離しても累計が伸びる)。
//
// **単調性 (累計は減らない・ADR-0036 (+) / ADR-0041)**: 取り下げは「以後の auto 加算を止める」
// だけで、 取り下げ前に積んだ auto 日は消さない。 = 各日 D の定着判定は「D 時点までの取り下げ」
// のみで行う (未来の取り下げが過去の auto 日を遡って消さない)。 これにより取り下げても累計は
// 減らず、 その時点で伸びが止まるだけになる。
//
// 効率: (a) 取り下げ無し + 未定着 → 実タップ数のみ (最頻・O(records))。(b) 取り下げ無し + 定着 →
// スパン (firstSettled..upToDate) 一括計算 (O(records))。(c) 取り下げ有り (稀) → firstReal..upToDate
// を日走査し各日「その日までの取り下げ」で定着判定 (O(days×records)、 N=1 で許容・K-010)。
export const countEffectiveAchievedForNode = (
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  nodeId: string,
  upToDate: IsoDate,
  options?: EstablishedOptions,
): number => {
  const realSet = new Set<IsoDate>();
  for (const a of achievements) {
    if (a.nodeId !== nodeId || !a.achieved || a.date > upToDate) continue;
    realSet.add(a.date);
  }
  const realCount = realSet.size;
  if (realCount === 0) return 0;
  const nodeRetractions = retractions.filter((r) => r.nodeId === nodeId);

  if (nodeRetractions.length === 0) {
    // 取り下げ無し: 定着 latch は単調。 未定着なら auto 無し。 定着ならスパン一括。
    if (!isNodeSettled(achievements, retractions, nodeId, upToDate, options)) {
      return realCount;
    }
    const sorted = [...realSet].sort();
    let firstSettled: IsoDate | null = null;
    for (const d of sorted) {
      if (isNodeSettled(achievements, retractions, nodeId, d, options)) {
        firstSettled = d;
        break;
      }
    }
    if (firstSettled === null) return realCount;
    const spanDays = isoDayDiff(firstSettled, upToDate) + 1;
    let realInSpan = 0;
    for (const d of realSet) if (d >= firstSettled) realInSpan++;
    return realCount + (spanDays - realInSpan);
  }

  // 取り下げ有り (稀): 単調性のため各日「その日までの取り下げ」で定着判定して日走査する。
  const sorted = [...realSet].sort();
  const firstReal = sorted[0];
  const range = recentDateRange(upToDate, isoDayDiff(firstReal, upToDate) + 1);
  let count = 0;
  for (const d of range) {
    if (realSet.has(d)) {
      count++;
      continue;
    }
    const retrUpToD = nodeRetractions.filter(
      (r) => r.retractedAt.slice(0, 10) <= d,
    );
    if (isNodeSettled(achievements, retrUpToD, nodeId, d, options)) count++;
  }
  return count;
};

// アプリ全体の effective 累計 (全ノード合算)。
export const countEffectiveAchievedTotal = (
  nodeIds: readonly string[],
  achievements: readonly Achievement[],
  retractions: readonly SettlementRetraction[],
  upToDate: IsoDate,
  options?: EstablishedOptions,
): number => {
  let total = 0;
  for (const nodeId of nodeIds) {
    total += countEffectiveAchievedForNode(
      achievements,
      retractions,
      nodeId,
      upToDate,
      options,
    );
  }
  return total;
};
