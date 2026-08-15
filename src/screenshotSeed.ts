// スクショ用ダミーデータ seed (出荷物ではない・開発時のみ利用)。
//
// 目的: 「いい感じのサンプルスクショ」を撮るために、Today / チェーン一覧 / ログ
// (定着ポートフォリオ) / メトリクスが映える状態を 1 発で作る。
// ADR-0014 で本番の自動 seed は廃止済みなので、これは _layout.tsx の
// SEED_SCREENSHOT_DATA フラグでのみ起動する dev 専用ユーティリティ。
//
// 設計方針 (SPEC/CLAUDE 準拠):
// - 正準データ (achievements / anchor_firings / metrics) の「観測した事実」だけを入れる。
//   定着 / 累計 / スパインの伸び / 定着ポートフォリオは全て表示時の派生計算に任せる。
// - 達成履歴の密度で「定着 / もう少しで定着 / 育成中」の 3 ステージが自然に揃うよう配分する。
// - 「今週の流入」も履歴の立ち上がりで自然に出す (日記ノードを直近だけ密にする)。
import type { DbClient } from './db';
import type { Achievement, Action, Anchor, Chain, Node, Note } from './domain';
import { todayIsoDate } from './domain';
import { insertMetric } from './metricsRepository';
import { insertNote } from './notesRepository';
import {
  insertAction,
  insertAnchor,
  insertChain,
  insertNode,
  recordAchievement,
  recordAnchorFiring,
} from './repository';
import { updateAppSettings } from './settingsRepository';

const HISTORY_DAYS = 45;

// offset 0 = 今日、増えるほど過去。true = その日達成。
type Profile = (offset: number) => boolean;

// ずっと安定 (履歴全域で ~86%) → とっくに定着。今日も達成済み。
const settledSteady: Profile = (o) => o % 7 !== 3;
// 同上だが今日 (offset 0) は未達 → 夜のチェーンなど「まだ今日やってない」表現。
const settledSteadyPast: Profile = (o) => o >= 1 && o % 7 !== 3;
// 直近 15 日だけ密に立ち上がった → 今週 定着入り (= 週次流入 +1)。今日も達成済み。
const settledRecentInflow: Profile = (o) => o <= 15 && o % 7 !== 3;
// 14D 窓で 8/14 前後 → もう少しで定着。今日も達成済み。
const almost: Profile = (o) => o % 7 < 4;
// もう少しで定着だが今日は未達 → 夜/週末のチェーン用。
// 定着 latch (どれか 1 窓でも 10/14 到達で確定) を避けるため周期 14 の休み日集合に固定。
// 窓幅 = 周期 = 14 なので、どの連続 14 日窓も常にちょうど 9 日達成 (= 決して定着しない)。
const ALMOST_PAST_OFF = new Set([0, 2, 5, 8, 11]);
const almostPast: Profile = (o) => !ALMOST_PAST_OFF.has(o % 14);
// まばら → 育成中。今日は達成済み (立ち上げ途中)。
const growing: Profile = (o) => o % 5 === 0;
// まばらで今日は未達。
const growingPast: Profile = (o) => o >= 1 && o % 4 === 1;

type NodeSpec = {
  id: string;
  actionTitle: string;
  timerSeconds?: number | null;
  profile: Profile;
};

type ChainSpec = {
  id: string;
  title: string;
  status: Chain['status'];
  anchor: Omit<Anchor, 'id'> & { id: string };
  // 今日この anchor が発火済みか (time/place の「発火中」ピル用)。
  firedToday: boolean;
  nodes: NodeSpec[];
};

const behaviorAnchor = (id: string, title: string): ChainSpec['anchor'] => ({
  id,
  title,
  kind: 'behavior',
  time: null,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

const timeAnchor = (id: string, title: string, time: string): ChainSpec['anchor'] => ({
  id,
  title,
  kind: 'time',
  time,
  latitude: null,
  longitude: null,
  radiusMeters: null,
});

// スクショ用のチェーン構成。朝＝フル達成で線が伸びた祝福状態、
// 昼＝時刻発火中ピル、夜＝定着済み(星)だが今日未達、週末＝stocked。
const CHAINS: ChainSpec[] = [
  {
    id: 'ss-chain-morning',
    title: '朝のルーティン',
    status: 'active',
    anchor: timeAnchor('ss-anchor-wake', '6:00', '06:00'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-water', actionTitle: '水を飲む', profile: settledSteady },
      { id: 'ss-n-stretch', actionTitle: 'ストレッチ', profile: settledSteady },
      { id: 'ss-n-journal', actionTitle: '日記を書く', profile: settledRecentInflow },
      { id: 'ss-n-english', actionTitle: '英語を5分', profile: growing },
    ],
  },
  {
    id: 'ss-chain-commute',
    title: '出社前',
    status: 'active',
    anchor: timeAnchor('ss-anchor-0730', '7:30', '07:30'),
    firedToday: true,
    nodes: [
      { id: 'ss-n-coffee', actionTitle: 'コーヒーを淹れる', profile: settledSteady },
      { id: 'ss-n-plan', actionTitle: '今日のタスクを確認', profile: almost },
    ],
  },
  {
    id: 'ss-chain-evening',
    title: '帰宅後',
    status: 'active',
    anchor: timeAnchor('ss-anchor-home', '18:00', '18:00'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-wash', actionTitle: '手を洗う', profile: settledSteadyPast },
      { id: 'ss-n-prep', actionTitle: '明日の準備', profile: growingPast },
    ],
  },
  {
    id: 'ss-chain-night',
    title: '就寝前',
    status: 'active',
    anchor: timeAnchor('ss-anchor-2300', '23:00', '23:00'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-phone', actionTitle: 'スマホを置く', profile: almostPast },
      {
        id: 'ss-n-read',
        actionTitle: '読書を10分',
        timerSeconds: 600,
        profile: growingPast,
      },
    ],
  },
  {
    id: 'ss-chain-work',
    title: '仕事開始',
    status: 'active',
    anchor: timeAnchor('ss-anchor-desk', '9:00', '09:00'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-mail', actionTitle: 'メールを確認', profile: settledSteady },
      { id: 'ss-n-goal', actionTitle: '今日のゴールを書く', profile: almost },
      { id: 'ss-n-focus', actionTitle: '集中タイム25分', timerSeconds: 1500, profile: growing },
    ],
  },
  {
    id: 'ss-chain-lunch',
    title: '昼休み',
    status: 'active',
    anchor: timeAnchor('ss-anchor-1200', '12:00', '12:00'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-walk', actionTitle: '外を少し歩く', profile: almostPast },
      { id: 'ss-n-bottle', actionTitle: '水筒を洗う', profile: growingPast },
    ],
  },
  {
    id: 'ss-chain-weekend',
    title: '週末リセット',
    status: 'stocked',
    anchor: behaviorAnchor('ss-anchor-satmorning', '土曜の朝'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-tidy', actionTitle: '部屋を片付ける', profile: almostPast },
      { id: 'ss-n-laundry', actionTitle: '洗濯', profile: growingPast },
    ],
  },
  {
    id: 'ss-chain-monthly',
    title: '月次のふりかえり',
    status: 'stocked',
    anchor: behaviorAnchor('ss-anchor-monthstart', '月初の朝'),
    firedToday: false,
    nodes: [
      { id: 'ss-n-budget', actionTitle: '家計簿をつける', profile: almostPast },
      { id: 'ss-n-review', actionTitle: '目標を見直す', profile: growingPast },
    ],
  },
];

// 研究タブ / メモ導線を埋めるための手動メモ (「観測した事実」軸・ADR-0044)。
// nodeId を指定すると特定アクションに紐付く。null は汎用メモ。
// ⚠ 内容は必ず汎用テキストのみ。PC の絶対パス・ユーザー名・メール等の個人情報は書かない
//    (スクショに映り込ませないため)。offsetDays = 何日前に書いたメモか。
type NoteSpec = { id: string; nodeId: string | null; content: string; offsetDays: number };

const NOTES: NoteSpec[] = [
  {
    id: 'ss-note-journal',
    nodeId: 'ss-n-journal',
    content:
      '朝イチで書くと頭が整理される。3行でも続けるのが大事そう。うまく回った日は夜も気分がいい。',
    offsetDays: 1,
  },
  {
    id: 'ss-note-english',
    nodeId: 'ss-n-english',
    content: '通勤前の5分でも意外と積み上がる。単語アプリと併用するとリズムが作りやすい。',
    offsetDays: 2,
  },
  {
    id: 'ss-note-read',
    nodeId: 'ss-n-read',
    content: '寝る前の読書は、スマホを別の部屋に置くと圧倒的に捗る。ページ数より「開くこと」を目標に。',
    offsetDays: 3,
  },
  {
    id: 'ss-note-coffee',
    nodeId: 'ss-n-coffee',
    content: '豆を変えたら朝の楽しみが増えた。淹れる時間そのものがアンカーになっている気がする。',
    offsetDays: 4,
  },
  {
    id: 'ss-note-stretch',
    nodeId: 'ss-n-stretch',
    content: '肩甲骨まわりを重点的に。デスクワークの張りが減ってきた。',
    offsetDays: 6,
  },
  {
    id: 'ss-note-plan',
    nodeId: 'ss-n-plan',
    content: 'タスク確認は3つまでに絞る。多いと朝から気が重くなって手が止まる。',
    offsetDays: 7,
  },
  {
    id: 'ss-note-wash',
    nodeId: 'ss-n-wash',
    content: '帰宅導線の途中に置くと自然に手が動く。玄関で決まる。',
    offsetDays: 9,
  },
  {
    id: 'ss-note-general-place',
    nodeId: null,
    content:
      '習慣は「やる時間」より「やる場所」を固定したほうが続く気がする。次のチェーンは場所アンカーで試してみたい。',
    offsetDays: 5,
  },
  {
    id: 'ss-note-general-tired',
    nodeId: null,
    content: '疲れている日は「1個だけでもOK」にすると罪悪感が減って、翌日に戻ってこられる。',
    offsetDays: 11,
  },
  {
    id: 'ss-note-general-weekend',
    nodeId: null,
    content:
      '週末に崩れやすい。土日だけ軽めのチェーンに切り替えるか、そもそも週末は緩める前提にするか検討中。',
    offsetDays: 14,
  },
];

const isoForOffset = (now: Date, offset: number): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - offset);
  return todayIsoDate(d);
};

// ざっくり自然なメトリクス値 (体重は緩やかに減、睡眠 6.5-7.8h、運動 0-45分)。
// now は受け取らない: 値は offset (日数) で相対に決まる。日付解決は呼び出し側。
const buildMetrics = (): {
  metricKey: string;
  value: number;
  offset: number;
}[] => {
  const out: { metricKey: string; value: number; offset: number }[] = [];
  for (let o = 0; o < 30; o++) {
    // 体重: 63.2kg から緩やかに 62.1kg へ、日ごとの微ゆらぎ付き。
    const weight = 62.1 + (o / 30) * 1.1 + (o % 3 === 0 ? 0.2 : -0.1);
    out.push({ metricKey: 'weight', value: Math.round(weight * 10) / 10, offset: o });
    // 睡眠: 6.6-7.8h。
    const sleep = 7.0 + (o % 5 === 0 ? 0.8 : o % 3 === 0 ? -0.4 : 0.1);
    out.push({ metricKey: 'sleep_hours', value: Math.round(sleep * 10) / 10, offset: o });
    // 運動: 週の半分ぐらいだけ。
    if (o % 7 !== 0 && o % 3 !== 1) {
      const ex = 20 + (o % 4) * 8;
      out.push({ metricKey: 'exercise_minutes', value: ex, offset: o });
    }
  }
  return out;
};

const wipeUserData = async (db: DbClient): Promise<void> => {
  // カタログ / metric_kinds / app_settings は残し、ユーザー観測データのみ消す。
  const tables = [
    'achievements',
    'anchor_firings',
    'metrics',
    'notes',
    'settlement_retractions',
    'nodes',
    'chains',
    'actions',
    'anchors',
  ];
  for (const t of tables) {
    await db.run(`DELETE FROM ${t}`);
  }
};

// スクショ用ダミーデータを投入する。now はデバイス時刻 (テストしないので new Date() 前提)。
export const seedScreenshotData = async (
  db: DbClient,
  now: Date = new Date(),
): Promise<void> => {
  await wipeUserData(db);

  const createdAt = new Date(now);
  createdAt.setDate(createdAt.getDate() - HISTORY_DAYS);
  const createdAtIso = createdAt.toISOString();

  for (const spec of CHAINS) {
    await insertAnchor(db, spec.anchor);

    const chain: Chain = {
      id: spec.id,
      title: spec.title,
      anchorId: spec.anchor.id,
      status: spec.status,
      createdAt: createdAtIso,
    };
    await insertChain(db, chain);

    for (let i = 0; i < spec.nodes.length; i++) {
      const nodeSpec = spec.nodes[i]!;
      const action: Action = {
        id: `${nodeSpec.id}-act`,
        title: nodeSpec.actionTitle,
        variants: null,
        timerSeconds: nodeSpec.timerSeconds ?? null,
      };
      await insertAction(db, action);

      const node: Node = {
        id: nodeSpec.id,
        chainId: spec.id,
        orderIndex: i,
        kind: 'action',
        actionId: action.id,
      };
      await insertNode(db, node);

      for (let o = 0; o < HISTORY_DAYS; o++) {
        if (nodeSpec.profile(o)) {
          const achievement: Achievement = {
            nodeId: nodeSpec.id,
            date: isoForOffset(now, o),
            achieved: true,
          };
          await recordAchievement(db, achievement);
        }
      }
    }

    if (spec.firedToday) {
      await recordAnchorFiring(db, {
        anchorId: spec.anchor.id,
        date: isoForOffset(now, 0),
      });
    }
  }

  for (const m of buildMetrics()) {
    const d = new Date(now);
    d.setDate(d.getDate() - m.offset);
    d.setHours(8, 0, 0, 0);
    // metrics.recorded_at は ISO-like (秒精度)。トレンドグラフは日付でグルーピング。
    const recordedAt = `${todayIsoDate(d)}T08:00:00`;
    await insertMetric(db, {
      id: `ss-metric-${m.metricKey}-${m.offset}`,
      metricKey: m.metricKey,
      value: m.value,
      recordedAt,
      source: 'manual',
    });
  }

  for (const noteSpec of NOTES) {
    const created = new Date(now);
    created.setDate(created.getDate() - noteSpec.offsetDays);
    created.setHours(21, 0, 0, 0);
    const createdAtNote = `${todayIsoDate(created)}T21:00:00`;
    const note: Note = {
      id: noteSpec.id,
      nodeId: noteSpec.nodeId,
      content: noteSpec.content,
      createdAt: createdAtNote,
      updatedAt: createdAtNote,
    };
    await insertNote(db, note);
  }

  // onboarding をスキップし、立ち上げチェックリストも畳んでおく (画面をすっきり見せる)。
  await updateAppSettings(db, {
    onboardingCompleted: true,
    checklistDismissedAt: now.toISOString(),
  });
};

// 既に seed 済みか (marker チェーンの有無) を判定。再起動/ホットリロードで毎回消さない用。
export const isScreenshotDataSeeded = async (db: DbClient): Promise<boolean> => {
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM chains WHERE id = ? LIMIT 1`,
    ['ss-chain-morning'],
  );
  return rows.length > 0;
};
