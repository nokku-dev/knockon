// ADR-0053: 分析イベントの定義と「送ってよい値」の制限。
//
// このファイルは **純粋** (import ゼロ・副作用なし)。PostHog SDK に触れるのは
// analytics.ts 側だけで、ここは「何を送ってよいか」の宣言に徹する (K-007 と同型)。

// ADR-0053 §4 で確定した 7 イベント。
// **悪シグナルのイベントは作らない** — 良シグナル (観測した事実) を送り、その不在として
// PostHog のクエリ側で悪シグナルを定義する。事実を送れば解釈は後から作り直せるが、
// 判断を送ると出荷時の定義に縛られる (ADR-0001「派生値を保存しない」の分析版)。
export const ANALYTICS_EVENTS = [
  // 起動できているか
  'onboarding_completed', // { skipped }
  'chain_created', // { source, node_count, nodes_from_template, anchor_kind }
  // コアループ
  'node_completed', // { node_position, chain_node_count, is_settled }
  // アプリの約束が果たされているか
  'node_settled', // { days_to_settle, definition_version }
  'settlement_retracted', // { days_since_settled }
  // 摩擦
  'permission_result', // { kind, granted }
  'chain_deleted', // { age_days, total_completions }
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

// ADR-0053 §1: 送ってよいのは数値と真偽値だけ。
// **string を許可しない**ことで、チェーン名 / アクション名 / メモ本文 / メトリクス値
// (体重等) / 位置座標を送るコードがコンパイルを通らなくなる。
// 人間の注意力ではなく型で止める (K-006 のハードガードレールと同じ思想)。
export type SafeValue = number | boolean;
export type SafeProps = Record<string, SafeValue>;

// 列挙値は数値で送る (文字列を許可しないため)。意味は本ファイルで一元管理する。
export const CHAIN_SOURCE = {
  onboarding: 0,
  discover: 1,
  manual: 2,
} as const;

export const ANCHOR_KIND = {
  time: 0,
  place: 1,
  action: 2,
} as const;

export const PERMISSION_KIND = {
  notification: 0,
  location: 1,
} as const;

// 定着判定の定義バージョン。ADR-0047 / 0050 / 0051 で 3 回変わっている。
// **判定ロジックを変えたらここをインクリメントする**。付けておかないと、定義変更の
// 前後で node_settled が混ざり、時系列比較が静かに壊れる。
export const SETTLEMENT_DEFINITION_VERSION = 1;

// 型 (SafeValue) が第一の防御線だが、`as any` 経由の混入や将来の型変更に備えて
// 実行時にも検証する。analytics.ts が送信前に必ず通す。
export const isSafeProps = (props: SafeProps | undefined): boolean => {
  if (props === undefined) return true;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) {
    return false;
  }
  return Object.values(props).every((v) => {
    if (typeof v === 'boolean') return true;
    // NaN / Infinity は JSON 化で null になり意味が壊れるので弾く。
    return typeof v === 'number' && Number.isFinite(v);
  });
};

// expo-router のパスを、安定した画面名に正規化する。
//
// PostHog の autocapture は expo-router では動かない (NavigationContainer を
// 露出しないため、SDK の型定義でも「手動で捕捉して captureScreens を無効にせよ」と
// 明記されている)。よって画面遷移は自前で送る。
//
// 正規化する理由は 2 つ。
// (1) `/chain/<uuid>` のような動的セグメントをそのまま送ると、画面名の cardinality が
//     ユーザーのチェーン数だけ増えて集計にならない。
// (2) ID は記録内容ではないが、送らずに済むなら送らない (ADR-0053 §1 の方針)。
//
// 未知のパスは 'unknown' に畳む。ルートを追加したらここも足す (テストが落ちて気付く)。
export const normalizeScreenPath = (pathname: string): string => {
  const path = pathname.split('?')[0]!.replace(/\/+$/, '');
  if (path === '' || path === '/') return 'today';
  if (path === '/chains') return 'chains';
  if (path === '/analytics') return 'log';
  if (path === '/research') return 'research';
  if (path === '/discover') return 'discover';
  if (path === '/onboarding') return 'onboarding';
  if (path === '/chain/new') return 'chain_new';
  if (path.startsWith('/chain/')) return 'chain_detail';
  return 'unknown';
};
