import { METRIC_KINDS } from './metricKinds';
import type { Metric } from './metricsRepository';
import type { NotionPage } from './notionClient';

// PR-Z3b (ADR-0024 §3c Notion 連携): Notion page → metrics 取り込み。
// 純粋関数で「page list を Metric record list に変換」する責務だけ持つ。
// (DB アクセスは syncNotionMetrics の方で扱う、 K-007 ドメイン純粋性維持)。
//
// マッピングルール (Phase 1 N=1 簡易版):
// - Notion DB の number property name が METRIC_KINDS の key と一致するもののみ拾う
//   (= "weight" "exercise_minutes" "sleep_hours" などの英字 column 名前提)
// - recorded_at = Notion page の created_time (UTC ISO datetime、 末尾 Z は剥がす)
// - source = 'notion' で固定

const METRIC_KEYS = new Set(METRIC_KINDS.map((k) => k.key));

// Notion datetime ('2026-05-26T09:00:00.000Z') を 'YYYY-MM-DDTHH:MM:SS' に正規化。
// recorded_at の format 規約 (db.ts スキーマコメント) に合わせる。
//
// **前提**: Notion API の created_time は常に UTC + 'Z' 終端固定 (ms 精度)。
// TZ offset 形式 (例: '+09:00') が将来返るようになると同一時刻が別 key 扱いされ
// 重複判定が壊れる (K-018 同型の test/prod 差リスク)。 Phase 1 N=1 受容、 Phase 2 で
// Notion API ドキュメント変更を見て防御強化判断。
export const normalizeNotionDatetime = (iso: string): string => {
  // 'Z' 末尾を剥がし、 ミリ秒を切る
  const noZ = iso.replace('Z', '');
  return noZ.slice(0, 19);
};

// page 配列 → Metric record 配列。 同 page 内に複数の number property があれば
// 同じ recorded_at で複数 record を生成 (各 metric key ごとに 1 record)。
export const mapNotionPagesToMetrics = (
  pages: readonly NotionPage[],
): Omit<Metric, 'id'>[] => {
  const out: Omit<Metric, 'id'>[] = [];
  for (const page of pages) {
    const recordedAt = normalizeNotionDatetime(page.createdTime);
    for (const [key, value] of Object.entries(page.numberProperties)) {
      if (!METRIC_KEYS.has(key)) continue;
      if (!Number.isFinite(value)) continue;
      out.push({
        metricKey: key,
        value,
        recordedAt,
        source: 'notion',
      });
    }
  }
  return out;
};

// 既存 metrics と重複しないものだけを返す。
// 重複判定: (metricKey, recordedAt, source='notion') が同じものは skip。
// 同日複数記録 (例: 朝晩の体重) は recordedAt が違えば許容。
export const filterNewNotionMetrics = (
  candidates: readonly Omit<Metric, 'id'>[],
  existing: readonly Pick<Metric, 'metricKey' | 'recordedAt' | 'source'>[],
): Omit<Metric, 'id'>[] => {
  const existingKeys = new Set(
    existing
      .filter((e) => e.source === 'notion')
      .map((e) => `${e.metricKey}|${e.recordedAt}`),
  );
  return candidates.filter(
    (c) => !existingKeys.has(`${c.metricKey}|${c.recordedAt}`),
  );
};

