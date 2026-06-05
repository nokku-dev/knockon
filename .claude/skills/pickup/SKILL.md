---
name: pickup
description: GitHub issue または Graft POST (ULID) を Claude Code の対話セッションで引き取り、tech-executor と同じ Project ブックキーピング (status / label / comment) を自動で行いながら human-in-the-loop で実装するスキル。「#NN を引き取って」「この issue を pickup」「POST <ULID> を進めて」「このPOSTをpickup」「issue を対話で進めたい」「対話で実装」などでトリガー。autonomous executor (agent=tech-executor の自動ループ) ではなく、人間が手綱を持つ UX 重要 / 不確実なタスク向け。status 変更が対話セッションで自動化されないのを解消する。
allowed-tools: Bash(gh issue view:*), Bash(gh repo view:*), Bash(gh api:*), Bash(git:*), Bash(cd:*), Bash(npm run pickup:*), Bash(npm run dispatcher:vault:*), Bash(bun:*), Bash(grep:*)
---

# pickup — 対話で issue / Graft POST を引き取る

autonomous な tech-executor の「対話版ドライバ」。実装は人間と対話で進めつつ、**Project の状態遷移 (status / label / comment) はワークフローのゲートで自動更新**する。ブックキーピングのロジックは executor と共有し、自動経路と手動経路をズレさせない。

**2 つの起点を受ける**:
- **GitHub issue** (`#NN`) — 従来どおり issue から直接。
- **Graft POST** (ULID, 例 `01KTAF0T2DNM00MVHKKTFGAZAH`) — vault の POST から入り、dispatch 先の issue に橋渡しする。未 dispatch なら dispatch まで面倒を見て、ゲートでは **issue/Project と vault POST の status を両方同期**する。

## いつ使うか

- UX 重要・手触り依存・不確実なタスク (例: capture の作成、early kill-gate がある issue)
- 環境チャネル (macOS 権限、shell セットアップ等) で対話しながら見たいとき
- autonomous executor に丸投げせず、人間がゲートで判断したいとき

autonomous で十分・仕様が固いタスクは `agent=tech-executor` を付けて executor ループに乗せる (このスキルは使わない)。

## 原則 (ブックキーピングの正本)

- status の遷移規則・役割分業は **nokku-ops ADR-0019 / ADR-0020** が正本 (Status = SoT、label は `Blocked` / `Awaiting Decision` のみ 1:1、comment は narrative)。
- **status / label / comment の書き込みは executor のロジックを再利用する**: pickup CLI (`runtime/pickup`) が `setItemStatus` / `addIssueLabel` (+ `pickAnnotationLabel`) / `postIssueComment` を呼ぶ。**再実装していない。** ここで規約を restate せず CLI に委ねる。
- **Graft POST 中心モデル** (CLAUDE.md / ADR-0028): 1 POST = 1 永続ノート。dispatch は POST → 外部 issue/Notion への push + `external_ref` 刻印。pickup は POST の status を **issue/Project のミラー**として同期するだけで、遷移規則は持たない。

## 前提: CLI の置き場

ブックキーピングと dispatch は **nokku-ops の runtime CLI** が行う。product repo の中で起動しても CLI 本体は nokku-ops 側にある。graft CLI (vault 読み書き) は graft repo 側。両方を解決する:

```bash
# 1. nokku-ops を解決 (env override > 兄弟ディレクトリ > 既定パス)
NOKKU_OPS_DIR="${NOKKU_OPS_DIR:-$(cd "$(git rev-parse --show-toplevel)/.." 2>/dev/null && pwd)/nokku-ops}"
[ -d "$NOKKU_OPS_DIR/runtime" ] || NOKKU_OPS_DIR="$HOME/workspace/personal/nokku-ops"
[ -d "$NOKKU_OPS_DIR/runtime" ] || { echo "nokku-ops が見つかりません。NOKKU_OPS_DIR を設定してください"; exit 1; }

# 2. graft repo (graft CLI = bun <graft>/src/cli/index.ts) を解決
#    このスキルは graft repo の中で起動する前提 → git toplevel が graft。兄弟 / $HOME はフォールバック。
GRAFT_DIR="${GRAFT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -f "$GRAFT_DIR/src/cli/index.ts" ] || GRAFT_DIR="$(cd "$(git rev-parse --show-toplevel)/.." 2>/dev/null && pwd)/graft"
[ -f "$GRAFT_DIR/src/cli/index.ts" ] || GRAFT_DIR="$HOME/workspace/personal/graft"
[ -f "$GRAFT_DIR/src/cli/index.ts" ] || { echo "graft repo が見つかりません。GRAFT_DIR を設定してください"; exit 1; }
GRAFT_CLI="$GRAFT_DIR/src/cli/index.ts"

# 3. Graft vault path を解決 (env > CLAUDE.local.md の graft_vault_path)
#    CLAUDE.local.md は gitignore 対象。`graft_vault_path:` 行から値を取る。
if [ -z "$GRAFT_VAULT_PATH" ]; then
  GRAFT_VAULT_PATH="$(grep -E '^graft_vault_path:' "$GRAFT_DIR/CLAUDE.local.md" | sed -E 's/^graft_vault_path:[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/')"
fi
export GRAFT_VAULT_PATH GRAFT_DIR

# 4. 今いる product repo の slug を先に取る (cd する前に！)
REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
```

> ⚠️ nokku-ops CLI は `cd "$NOKKU_OPS_DIR/runtime"` してから走らせる。cd 後の cwd は nokku-ops なので、**pickup CLI には `--repo "$REPO_SLUG"` を必ず明示**で渡す (自動導出は nokku-ops を指す)。`GRAFT_DIR` / `GRAFT_VAULT_PATH` は export 済みなので dispatcher:vault が継承する。

## ワークフロー

### 0. 起点を判定する

引数を見る。**ULID (26 桁の Crockford base32、`01...` で始まる)** なら Graft POST 起点 → **§A** へ。**`#NN` / 数値** なら issue 起点 → §1 へ。branch 名から推定する場合も issue 番号として扱う。

### A. Graft POST を解決し issue に橋渡し (ULID 起点のとき)

```bash
graft() { bun "$GRAFT_CLI" "$@" --vault "$GRAFT_VAULT_PATH"; }

# A-1. POST を読む (body / project / status / external_ref)
POST_FILE="$GRAFT_VAULT_PATH/posts/<ULID>.md"
cat "$POST_FILE"   # frontmatter の external_ref を確認
```

- **`external_ref: gh:<url>` がある** → 既に dispatch 済み。url から `REPO_SLUG`（issue の repo）と issue 番号を取り出して §1 へ。
  例 `gh:https://github.com/nokku-dev/nokku-ops/issues/158` → `REPO_SLUG=nokku-dev/nokku-ops`, `#158`。
- **`external_ref` が無い** → 未 dispatch。**A-2** で dispatch する。

```bash
# A-2. 未 dispatch の POST を単一 dispatch する (G2)。まず DRY で分類を確認 → 人間に見せる。
cd "$NOKKU_OPS_DIR/runtime" && DRY_RUN=1 npm run dispatcher:vault -- --post <ULID>
# 分類結果 (category / repo) に納得したら本実行 (issue 作成 + Project add + POST へ external_ref 書き戻し)。
cd "$NOKKU_OPS_DIR/runtime" && npm run dispatcher:vault -- --post <ULID>
# 書き戻し後、POST を再読込して external_ref から REPO_SLUG / issue# を取得 → §1 へ。
```

> dispatch は LLM 分類を伴う。pickup は human-in-the-loop なので、**DRY_RUN で分類を見せてから**本実行する。分類が外れていれば手動 dispatch（`gh issue create` + `graft item ref <ULID> gh:<url>` + `graft item set <ULID> project=…`）にフォールバックしてよい。

> **クロスrepo注意**: issue の repo（external_ref / 分類の repo）と、実装するコードの repo は**異なることがある**（例: inquiry issue は nokku-ops、コード修正は graft）。ブックキーピングは issue の repo+Project を対象に、実装は作業対象の repo の中で行う。

### 1. 対象 issue を解決
`REPO_SLUG` と issue 番号が揃っている前提（§A 経由 or 直接 `#NN`）。

### 2. コンテキスト読み込み (read-only)
- issue 本文 + コメント: `gh issue view <NN> --repo "$REPO_SLUG" --comments`
- issue が参照する ADR / SPEC + 関連ファイル
- Project の現 status を pickup CLI の `--show` で確認 (Project は #1 eng / #2 org を自動判定):

```bash
cd "$NOKKU_OPS_DIR/runtime" && npm run pickup -- --issue <NN> --repo "$REPO_SLUG" --show
```

Project に載っていなければ `/intake` で起票 / add 済みか確認する (エラーメッセージが案内する)。

### 3. 着手 → status を In Progress に
branch を作成 / チェックアウトしてから:

```bash
# issue/Project 側
cd "$NOKKU_OPS_DIR/runtime" && npm run pickup -- --issue <NN> --repo "$REPO_SLUG" --to "In Progress"
# Graft POST 起点なら vault 側もミラー同期 (G3)
graft item set <ULID> status="In Progress"
```

### 4. 対話で実装
**作業対象 repo の中で** (= active context がその repo) 人間と進める。その repo の `CLAUDE.md` の dev-loop 要約に従う (TDD / commit 規約等)。pickup は実装方針を持たない。

### 5. ゲートで自動ブックキーピング
進行状態に応じて、CLI 経由で status / label / comment を更新する。**Graft POST 起点なら、各ゲートで `graft item set <ULID> status=…` も併せて同期する（issue/Project のミラー）**:

| 状況 | issue/Project (pickup CLI) | Graft POST (graft CLI) |
|---|---|---|
| 依存・環境で**進めない** | `--hold blocked --note "<理由>"` | `item set <ULID> status="Blocked"` |
| 方向が**未確定** (要判断) | `--hold awaiting-decision --note "<論点>"` ※ここで止めて人間の判断を待つ | `item set <ULID> status="Awaiting Decision"` |
| **PR を上げた** | `--to "Pending Review"` | `item set <ULID> status="Pending Review"` |
| **merge された** | `--to "Done"` | `item set <ULID> status="Done"` |

例:
```bash
cd "$NOKKU_OPS_DIR/runtime" && npm run pickup -- --issue <NN> --repo "$REPO_SLUG" --hold awaiting-decision --note "案 A (...) と案 B (...) のどちらに倒すか未決"
graft item set <ULID> status="Awaiting Decision"
```

`--dry-run` を付けると副作用なしで「何をするか」だけ表示する (確認用)。`--project N` で Project を明示指定もできる (既定は #1→#2 自動判定)。

### 6. early kill-gate / 不可逆操作
そこで手触りを評価する系・破壊的操作 (force push / 本番データ / 大量削除) の前は、人間に確認してから進む。

## tech-executor との違い

| | tech-executor (autonomous) | pickup (このスキル) |
|---|---|---|
| 駆動 | 連続オートループ (ADR-0027) | 人間との対話 |
| 判断ゲート | 自律 (Awaiting Decision に倒す) | 人間が確認 / 決定 |
| ブックキーピング | executor ロジック | **同じ書き込みロジックを再利用** (pickup CLI) |
| 向くタスク | 仕様が固い | UX 重要・不確実・要さばき |

## 参照

- nokku-ops ADR-0019 / ADR-0020 (status 遷移・役割分業 = 正本)
- nokku-ops ADR-0028 (Graft POST 中心モデル / dispatch port = 正本)
- nokku-ops `runtime/pickup/` (status/label/comment、Project #1/#2 自動判定 / `--project`)
- nokku-ops `runtime/dispatcher/vault-runner.ts` (`--post <id>` 単一 dispatch)
- nokku-ops `runtime/executor/` (再利用元: setItemStatus / pickAnnotationLabel / postIssueComment)
- graft `src/cli/index.ts` (vault 操作: posts list / item set / item ref / item derive / item comment)
- graft `CLAUDE.local.md` (`graft_vault_path`)
