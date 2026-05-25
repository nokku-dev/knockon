import baseConfig from './app.json';

// PR-Z3b (ADR-0024 §3c Notion 連携): app.json + process.env 由来の secret を合流。
// app.json 単独だと secret を直書きする運用になり ADR-0024 §3c 注意点 (CLAUDE.local.md
// に閉じる方針) と矛盾するため、 app.config.ts を導入して env vars 経由で読む構造に変更。
//
// 設定方法:
// - 開発: プロジェクトルートに .env を置く (gitignore 済み)
//     KNOCKON_NOTION_API_TOKEN=secret_xxx
//     KNOCKON_NOTION_BODY_METRICS_DS_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
// - EAS Build: `eas secret:create` で同名の secret を登録 (Phase 2 で整備)
//
// env vars が未設定なら null となり、 src/notionConfig.isNotionConfigured() で
// false 判定 → Notion sync は silently skip (= 開発者でも誰でも動く前提)。

export default ({ config: _config }: { config: unknown }) => ({
  ...baseConfig.expo,
  extra: {
    ...baseConfig.expo.extra,
    notion: {
      apiToken: process.env.KNOCKON_NOTION_API_TOKEN ?? null,
      bodyMetricsDataSourceId:
        process.env.KNOCKON_NOTION_BODY_METRICS_DS_ID ?? null,
    },
  },
});
