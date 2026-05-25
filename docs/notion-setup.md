# Notion Body Metrics 連携セットアップ

PR-Z3b ([ADR-0024](decisions/0024-goal-view-analytics-phase-3-unified.md) §3c) で導入された Notion 連携の設定方法。 Notion 側に体重 / 運動時間 / 睡眠時間を記録している場合に、 knockon の分析タブへ自動取り込みする (read-only)。

設定なしでも knockon は普通に動く (sync は silently skip)。

## セットアップ手順

### 1. Notion Internal Integration 作成

https://www.notion.so/my-integrations にアクセスし、 「New integration」で knockon 用 integration を作成。 **Internal Integration Secret** をコピー。

### 2. Body Metrics ページに integration を share

Notion で Body Metrics database を開き、 右上「...」→「Connections」→ 作成した integration を Add。

### 3. データソース ID を取得

Body Metrics database を Notion で開き、 URL 末尾の hyphenated UUID をコピー (例: `1234abcd-5678-90ef-1234-567890abcdef`)。

### 4. プロジェクトルートに `.env` を作成

`.env` ファイル (gitignore 済み) を作成し、 以下を記述:

```
KNOCKON_NOTION_API_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxx
KNOCKON_NOTION_BODY_METRICS_DS_ID=1234abcd-5678-90ef-1234-567890abcdef
```

### 5. Notion 側 property 名

Notion DB のプロパティ名は以下の number 型である必要 (Phase 1 N=1 ハードコード、 Phase 2 で mapping config 化判断):
- `weight` (体重 kg)
- `exercise_minutes` (運動 分)
- `sleep_hours` (睡眠 時間)

これ以外のプロパティは無視される。

### 6. preview build を再ビルド

```
eas build --profile preview --platform android
```

## 動作確認

- 設定後に preview build を実機に install → 分析タブを開く
- 1 セッションに 1 度だけ Notion API を query (cold start ごと)
- 設定が正しければ「14 日で N 件記録」が増える
- 設定が間違っていれば silently skip (console.warn のみ、 UI に出さない)

## EAS Build 用 secret 登録 (Phase 2 推奨)

preview build / production build で secret を埋め込むには:

```
eas secret:create --name KNOCKON_NOTION_API_TOKEN --value secret_xxx
eas secret:create --name KNOCKON_NOTION_BODY_METRICS_DS_ID --value 1234abcd-...
```

これにより EAS Build 時に process.env から読まれる。

## トラブルシューティング

- **分析タブを開いても何も同期されない**: console (Dev Client) で `Notion metrics sync failed` を確認
- **401 Unauthorized**: integration secret が間違っている、 もしくは integration を Body Metrics ページに share していない
- **404 Not Found**: データソース ID が違う (database ID と data source ID の取り違え、 Notion 2025-09 以降の API 変更にも要注意)
