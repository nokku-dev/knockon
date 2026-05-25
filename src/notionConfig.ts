import Constants from 'expo-constants';

// PR-Z3b (ADR-0024 §3c Notion 連携): 設定値の読み出し。
// app.json の extra.notion に書く前提 (Phase 1 N=1 受容、 機密値の取り扱いは Phase 2 で
// app.config.ts + .env / EAS Secret に移行判断)。 設定値が null なら sync を skip
// (silently fallback to local metrics)、 K-024 同型の判断明示。
//
// app.json の extra.notion フォーマット:
// {
//   "apiToken": "secret_xxx" | null,
//   "bodyMetricsDataSourceId": "32a8d366-..." | null
// }
//
// **重要**: API token を含む app.json をそのまま commit すると secret 流出。
// PR-Z3b の運用前提:
// - user (= 自分) が手元で app.json を一時編集 → preview build → token を null に戻す
// - もしくは app.config.ts に移行して process.env から読む (Phase 2 推奨)

export type NotionConfig = {
  apiToken: string | null;
  bodyMetricsDataSourceId: string | null;
};

export const getNotionConfig = (): NotionConfig => {
  const raw =
    (Constants.expoConfig?.extra as { notion?: Partial<NotionConfig> } | undefined)
      ?.notion ?? {};
  return {
    apiToken: typeof raw.apiToken === 'string' ? raw.apiToken : null,
    bodyMetricsDataSourceId:
      typeof raw.bodyMetricsDataSourceId === 'string'
        ? raw.bodyMetricsDataSourceId
        : null,
  };
};

// 設定が揃っている (apiToken + dataSourceId 両方非 null) かどうかの判定。
// false なら sync 関数は何もせず即 return する設計。
export const isNotionConfigured = (config: NotionConfig): boolean =>
  !!config.apiToken && !!config.bodyMetricsDataSourceId;
