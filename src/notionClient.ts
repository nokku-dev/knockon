// PR-Z3b (ADR-0024 §3c Notion 連携): Notion API クライアント。
// fetch ベース (依存追加なし、 @notionhq/client は導入しない)。
//
// 用途: Body Metrics データソースを query → page properties から weight / exercise_minutes /
//   sleep_hours の number 値を抽出する。
// 制約 (ADR-0024 注意点):
// - **read-only**: 書き込みエンドポイントは呼ばない (Notion 側の既存運用を壊さない)
// - rate limit: Notion 公式は 3 req/sec。 sync は 1 日 1 回 1 リクエストなので問題なし
// - 失敗時は silently fallback (UI に出さない、 K-024 同型)

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// 1 page の property を簡略表現。 全 property を扱わず、 number 型のものだけ取り出す。
export type NotionPage = {
  id: string;
  createdTime: string; // ISO datetime, UTC
  lastEditedTime: string;
  // metric key → number 値 (例: { weight: 72.5, exercise_minutes: 30 })。
  // property name (= Notion 側の column 名) が「metric key 文字列」と一致するもののみ拾う。
  numberProperties: Record<string, number>;
};

// Notion API レスポンスの最小型 (実際の API レスポンスは膨大、 必要な field のみ抽出)。
type NotionQueryResponse = {
  results: NotionRawPage[];
  has_more: boolean;
  next_cursor: string | null;
};
type NotionRawPage = {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, NotionPropertyValue>;
};
type NotionPropertyValue =
  | { type: 'number'; number: number | null }
  | { type: 'date'; date: { start: string } | null }
  | { type: string; [k: string]: unknown };

const extractNumberProperties = (
  properties: Record<string, NotionPropertyValue>,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(properties)) {
    if (v.type === 'number' && typeof v.number === 'number') {
      out[key] = v.number;
    }
  }
  return out;
};

// データソースを query して直近の page を取得 (page_size 件数まで)。
// データソース ID は Notion の URL 末尾の hyphenated UUID。
// API token は integration secret (page を share した integration の token)。
//
// 用語注意: 本プロジェクトでは「データソース」と呼ぶが、 実装は **旧 database API**
// (`/v1/databases/{id}/query`) を Notion-Version 2022-06-28 で叩いている。 Notion 公式は
// 2025-09 以降 `/v1/data_sources/{id}/query` を新 API として導入済み。 Phase 1 N=1 では
// 1 database = 1 data source 前提で旧 API のままで動く。 user の Notion DB が複数
// data source 構成だと 404 になる。 その場合は Phase 2 で新 API + Notion-Version 更新を判断。
//
// throw されるエラー: HTTP status を error.message のプレフィックスに含めて呼び出し側
// (useMetricsData) で区別する。 401 は永続エラー (token 無効) として再試行しない設計。
export class NotionApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'NotionApiError';
  }
}

export const queryNotionDataSource = async (
  apiToken: string,
  dataSourceId: string,
  pageSize: number = 14,
): Promise<NotionPage[]> => {
  const res = await fetch(
    `${NOTION_API}/databases/${dataSourceId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [
          { timestamp: 'created_time', direction: 'descending' },
        ],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new NotionApiError(
      res.status,
      `Notion API ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as NotionQueryResponse;
  return json.results.map((p) => ({
    id: p.id,
    createdTime: p.created_time,
    lastEditedTime: p.last_edited_time,
    numberProperties: extractNumberProperties(p.properties),
  }));
};
