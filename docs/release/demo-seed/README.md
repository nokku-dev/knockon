# App Store スクリーンショット用 demo seed 手順

> 対象: Issue #238 (親: [提案 #229](https://github.com/nokku-dev/knockon/issues/229) / [Issue #224](https://github.com/nokku-dev/knockon/issues/224))
> 位置付け: **本ドキュメントは撮影用 demo データ投入の SoT**。fresh install に demo チェーン 3 本 + 定着状態を作るまでの手順を規定する。撮影 SOP 本体 (Cmd+S / 命名 / 格納) は別途 `docs/release/screenshots/6.7/README.md` (Issue #224 で整備予定) 側の SoT。
> 関連: 上位プレイブック [`../app-store-submission.md`](../app-store-submission.md) §1.1 (スクリーンショット要件)

## 0. なぜ「seed 手順」を repo に置くのか

- App Store のスクリーンショットは、Taku 個人の実データ (会社名 / 場所名 / 個人的アクション名) が混入しないよう **fresh install + demo データ** で撮る (提案 #229 §3.1)。
- demo データを毎回口伝で組むと、再撮影 (Metadata Rejection の再申請 / v1.1 差し替え) のたびに内容が微妙にブレる。
- ここに 3 本 × ノード内容 × 達成状態を SoT として固定し、**「同じ demo が何度でも同じ絵を出す」** を担保する。

## 1. 完成状態 (撮影時に画面が満たすべき state)

提案 #229 §3.1 に基づく。以下 3 本 + 見出し「定着 3 個」を Today / ログ / チェーン一覧 / チェーン編集の各カットで見せる。

### 1.1 demo チェーン 3 本

| # | チェーン名 | アンカー | ノード列 | ステータス |
|---|---|---|---|---|
| 1 | 朝ルーティン | 時刻 07:00 | ①コップ 1 杯の水 / ②深呼吸 3 回 / ③5 分ストレッチ / ④ジャーナル 2 行 | active |
| 2 | 集中の入り | 行動「机に座ったら」 | ①タブを 1 枚に絞る / ②今日 1 番の 1 タスクを書く / ③タイマー 25 分 | active |
| 3 | 夜ルーティン | 時刻 22:30 | ①机の上を空にする / ②明日の 1 タスクを 1 行 / ③ライトを暖色に | active |

### 1.2 達成状態 (Today カード / ChainDetail で見せる絵)

| チェーン | 今日の達成 | 定着ノード (左マーカー星型) |
|---|---|---|
| 朝ルーティン | 4/4 全達成 | ②深呼吸 3 回 / ③5 分ストレッチ |
| 集中の入り | 2/3 (③タイマー 25 分だけ未達) | ②今日 1 番の 1 タスクを書く |
| 夜ルーティン | 0/3 | なし |

- **Today 見出し** = 「定着 3 個」(右上・派生 `countSettlementStages().settled`)
- ログ画面ステージ見出し例 = 「定着 3 / もう少しで定着 0 / 育成中 7」(7 = 未定着ノード合計 = 4-2 + 3-1 + 3 = 7)

### 1.3 「もう少しで定着」を出したい場合 (任意)

提案 #229 §3.1 の「ログ画面カット」で見栄えを取るなら、 (例)「集中の入り①タブを 1 枚に絞る」を 14D 中 8-9 日達成にすれば `almost` に載る (§2.3 の追加行で調整可能)。**必須ではない** — 「もう少しで定着 0」でも見出しは常時表示され、Celebrate の主役は「定着 3」側なので優先度低い。

## 2. 投入手順

### 2.1 前提

- Simulator: iPhone 16 Pro Max (iOS 最新) を推奨 (提案 #229 §3.2)。実機でも可。
- app: EAS `preview` (or `development`) ビルドを install。**production ビルドは SQLite ファイルへの外部アクセス経路が閉じるため不可** — 撮影用は preview 経由で。
- テーマは Dark 固定 (`FORCE_DARK_FOR_REVIEW = true` の現状追認・DESIGN-SYSTEM §1)。
- **fresh install**: Simulator メニュー `Device > Erase All Content and Settings` で内容消去 → app を install。

### 2.2 Step A: チェーン 3 本を UI で作成

**推奨経路** (提案 #229 §8 の (a))。実装済み CRUD をそのまま使うので追加コスト無し。

1. app 起動 → onboarding をスキップ or 通過。
2. Bottom Tabs で「チェーン」→ 右下「+」で新規作成。
3. §1.1 の表に沿って 3 本を順に作成:
   - 「朝ルーティン」: アンカーで「時刻」を選び `07:00` を設定 → ノード 4 個をアクション名で追加 (順序は表の通り) → 保存。
   - 「集中の入り」: アンカーで「行動」を選び「机に座ったら」と入力 → ノード 3 個 → 保存。
   - 「夜ルーティン」: アンカーで「時刻」を選び `22:30` を設定 → ノード 3 個 → 保存。
4. Today に戻って 3 本のカードが並ぶことを確認。

**注意**: アクション名を表と 1 文字違わず揃える (「深呼吸 3 回」の全角スペース有無など)。撮影後に文言差替が発生すると再撮影が要る。

### 2.3 Step B: 定着 latch のための achievements 履歴投入 (SQLite 直接)

定着 = **取り下げ以降・windowDays=14・minAchievedDays=10** を満たす窓が過去に一度でも存在すること (`src/domain.ts:isNodeSettled`)。fresh install で 10 日実タップを回すのは非現実的なので、**SQLite に過去 10 日の `achievements` 行を直接 INSERT する**経路を取る。

これは正準データ (`(node_id, date, achieved)`) への追記であり、派生値ではない (CLAUDE.md §プロジェクト固有 (1))。ADR-0001 の禁則には抵触しない。

#### 2.3.1 Simulator の DB ファイル位置を特定

```sh
# Simulator の起動中デバイス UUID を得る
xcrun simctl list devices booted
# → 例: iPhone 16 Pro Max (ABCDEF12-3456-7890-ABCD-EF1234567890) (Booted)

# knockon.db のフルパスを検索 (fresh install 後・DB 生成後に実行)
find ~/Library/Developer/CoreSimulator/Devices/<DEVICE-UUID>/data/Containers/Data/Application -name "knockon.db" 2>/dev/null
# → 例: .../<APP-UUID>/Documents/knockon.db
```

**app を一度起動して `initSchema` を通してから**でないと `knockon.db` は存在しない (Step A 完了後に検索)。

#### 2.3.2 実 ID を確認

チェーン / ノード ID は UI 作成時に `ulid()` で採番されるため実 ID を SELECT で確認する。

```sh
sqlite3 <DB_PATH> <<'SQL'
.mode column
.headers on
SELECT n.id AS node_id, a.title AS action, c.title AS chain, n.order_index
FROM nodes n
JOIN actions a ON a.id = n.action_id
JOIN chains c ON c.id = n.chain_id
ORDER BY c.title, n.order_index;
SQL
```

以下 (§2.3.3) の `<node-id-...>` プレースホルダをこの出力の実 ID に置換する。

#### 2.3.3 achievements を過去 10 日分投入

以下 SQL を **`YYYY-MM-DD` を撮影当日の日付**に読み替えて実行 (`date` 列は端末ローカル日付基準 = リセット時刻適用後 = 通常 `YYYY-MM-DD`)。

「朝ルーティン②深呼吸 3 回」「朝ルーティン③5 分ストレッチ」「集中の入り②今日 1 番の 1 タスクを書く」の 3 ノードを定着させる例:

```sh
sqlite3 <DB_PATH> <<'SQL'
-- 撮影当日 = TODAY として、過去 14 日中 10 日 (D-13〜D-4) を達成にする。
-- 定着 latch は「過去のどこかで 14D 中 10 日を満たした窓が存在」の存在判定なので、
-- 直近 3-4 日は未達成でも定着扱いは維持される (履歴の不変性 / ADR-0047)。
-- 今日 (D-0) の達成は Step C で UI からタップして生成する (見出し「今日 M 個」に載せるため)。

-- ↓ 3 つの node_id は §2.3.2 の SELECT で得た実 ID に置換
WITH RECURSIVE dates(offset_days) AS (
  SELECT 4 UNION ALL SELECT offset_days + 1 FROM dates WHERE offset_days < 13
)
INSERT OR REPLACE INTO achievements (node_id, date, achieved)
SELECT '<node-id-morning-breath>', date('now', '-' || offset_days || ' days'), 1 FROM dates
UNION ALL
SELECT '<node-id-morning-stretch>', date('now', '-' || offset_days || ' days'), 1 FROM dates
UNION ALL
SELECT '<node-id-focus-task>', date('now', '-' || offset_days || ' days'), 1 FROM dates;
SQL
```

投入後、Simulator を **一度 kill → 再起動** (JS ホットリロードで cold-start データ再ロードを踏ませる)。Today で該当ノードの左マーカーが★（塗り星型・`--star`）に変わっていれば定着 latch が効いている。

**任意**: 「もう少しで定着 (almost)」を作りたければ、8〜9 日分だけ INSERT した別ノードを 1-2 個足す (`WHERE offset_days < 12` に緩めて 8 日ぶんにする等)。§1.3 参照。

### 2.4 Step C: 「今日」の達成状態を UI からタップ

見出し「定着 N 個」と「今日達成」の絵作りは、`achievements` 直投入とは別に **今日日付の実タップ**が必要 (K-002 / ADR-0050: レコードは実タップのみ)。

Today 画面で:

- 朝ルーティン 4 ノード全部をタップ → 4/4 になる。
- 集中の入り ①②をタップ → 2/3 (③タイマー 25 分は未タップのまま)。
- 夜ルーティンはタップしない → 0/3。

達成すると「1 つの達成ジェスチャ」(線が伸びる + マーカーバウンス + テキスト拡大縮小 / DESIGN-SYSTEM §4.3) が発火する。**撮影は静止画** — アニメ終了後 (~500ms 後) にキャプチャする。

## 3. 検証チェック

撮影開始前に以下を目視:

- [ ] Today 見出し右に「**定着 3 個**」と表示されている (0 なら §2.3 の INSERT が反映されていない)。
- [ ] 朝ルーティン②③・集中の入り② の 3 ノードで左マーカーが **★ (星型)**、それ以外は **○ (円)**。
- [ ] ログタブ (Bottom Tabs 中央) を開き、ステージ見出しに「**定着 3 / もう少しで定着 P / 育成中 M**」が見えている (P=0, M=7 想定)。
- [ ] チェーン一覧 (active フィルタ) で 3 本が並ぶ。順序は作成順 = 朝 / 集中 / 夜。
- [ ] チェーン編集画面 (朝ルーティンを選択) でアンカー=07:00・ノード 4 個・DnD ハンドル (`≡`) が見える構図。

## 4. 撮影後の後処理

- **SQLite の状態は破棄可**。撮影が終わったら Simulator を再度 `Erase All Content and Settings` で消して痕跡を残さない。
- demo チェーンのアクション名やアンカー名を変える判断が出たら、本ドキュメントを更新してから再撮影する (Step A の口伝防止・§0 の目的)。

## 5. スコープ外 (本 SoT で扱わない)

- **撮影 (Cmd+S / 命名 / 格納)**: `docs/release/screenshots/6.7/README.md` (Issue #224) 側で規定。
- **実機での SQLite 直投入**: 実機 (rooted 不可) は sqlite3 CLI 経路が使えない。実機で撮る場合は Step B を諦め「定着 0」で撮るか、Simulator に切り替える。
- **`__DEV__` ビルド専用の seed ボタン実装**: 提案 #229 §8 (b) 案。Q1 スコープ内では実装しない (追加実装コスト回避)。将来 v1.1 で再撮影が頻発するようになったら再判断。
- **英語ロケール版 demo**: 現在は日本語前提。海外展開判断時に別 Issue で分岐。

## 参照

- 上位プレイブック: [`../app-store-submission.md`](../app-store-submission.md)
- 提案 (親): [Issue #229](https://github.com/nokku-dev/knockon/issues/229) — 装飾方針・カット数・命名規約
- Issue #224 (スクリーンショット制作) / Issue #225 (審査提出)
- [ADR-0047](../../decisions/0047-settlement-lifecycle-and-log-portfolio.md) — 定着ライフサイクル (latch / 取り下げ)
- [ADR-0050](../../decisions/0050-settlement-star-marker-and-today-headline.md) — 左ドット星型 + 見出し「定着 N 個」
- [SPEC.md §2](../../../SPEC.md) — 正準データ 5 軸 / 定着判定
- [DESIGN-SYSTEM.md §4.2](../../../DESIGN-SYSTEM.md) — マーカー語彙 (円 / 星)
- 実装: `src/domain.ts:isNodeSettled` / `src/settlementRepository.ts`
