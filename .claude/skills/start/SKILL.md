---
name: start
description: Todoistのタスクを起点にIssueを作成し、TDDで作業を開始する
argument-hint: "[TodoistタスクIDまたはタスク名]"
disable-model-invocation: true
---

## 手順

### 0. ローカル設定の読み込み
- `CLAUDE.local.md` が存在する場合: ファイルを読み込み、`todoist_label` 等の接続先情報を取得する
- `CLAUDE.local.md` が存在しない場合: 「`setup.sh` で CLAUDE.local.md を生成すると次回から自動で読み込まれます」と案内する

### 1. タスク取得

**Todoistのカンバン構成:**
- Inbox（Boardビュー）: 未分類 / Backlog / In Progress / Done
- ラベルでプロダクト識別（dev-loop, cardex, 発信, life-os 等）

**取得の優先順:**

1. **引数がある場合**: Todoist MCPで該当タスクを取得
2. **引数がない場合**: 以下の順で候補を表示
   - まず **In Progress セクション** のタスクを表示（継続作業）
   - 次に **Backlog セクション** からラベルでフィルタして表示
   - `CLAUDE.local.md` に `todoist_label` 指定がある場合はそのラベルでフィルタ

```
todoist:find-tasks:
  filter = "##Inbox & /In Progress"
  limit = 5
```
```
todoist:find-tasks:
  filter = "##Inbox & /Backlog"
  labels = ["{CLAUDE.local.mdで指定されたラベル}"]
  limit = 10
```

ユーザーに選択を求める:
```
📋 タスク候補

🔴 **In Progress** (継続):
1. {タスク名} [@{ラベル}]

📦 **Backlog** [@{ラベル}フィルタ]:
2. {タスク名}
3. 🐛 [Bug] {タスク名}  ← バグタスク
...

どれで作業開始する？（番号 or タスクID）
```

### 1.5. バグタスクの自動Issue化

選択されたタスクのタイトルが `[Bug]` で始まる場合、以下のフローを挟む:

1. **既存Issueの確認**: タスクの description に `GitHub Issue: #` が含まれていれば、既にIssue化済み。通常フローへ進む
2. **Issue化の提案**:
```
🐛 バグタスクを検知しました: {タスク名}

このタスクにはGitHub Issueがまだありません。
Issue を作成してから作業開始しますか？

a) Issue作成して開始（推奨）
b) Issueなしでそのまま開始
```

3. **a) の場合**: タスクの内容と description から Issue を自動生成
```
gh issue create:
  title: "{タスク名}"  （[Bug] プレフィックスはそのまま維持）
  body: |
    ## バグ報告

    {タスクのdescriptionから抽出}

    ---
    Todoist: {タスクID}
  labels: ["bug"]
```
作成後、Todoistタスクの description に `GitHub Issue: #{番号}` を追記する。

4. **b) の場合**: そのまま Step 2 に進む

### 2. タスクをIn Progressに移動

選択されたタスクがBacklogにある場合、Inbox の In Progress セクションに移動する。
セクションIDは Todoist MCP の `find-sections` で取得する。

```
todoist:find-sections:
  projectId = "{InboxのプロジェクトID}"

todoist:update-tasks:
  tasks:
    - id: "{選択されたタスクのID}"
      sectionId: "{In ProgressのセクションID}"
      priority: "p1"
```

すでにIn Progressにある場合はスキップ。

### 3. コンテキスト収集 + SPEC.mdギャップ検知
- KNOWLEDGE.md を読み、関連する既知の知見を確認
- understanding-map.md を読み、対象領域の把握状況を確認
- **SPEC.md を読み、これから着手する機能の仕様エントリが存在するか確認する**

**SPEC.mdギャップ検知:**
- SPEC.md の「機能仕様」セクションに、タスクに対応する記述があるか探す
- タスク名・内容のキーワードで機能仕様セクションを照合する

**仕様エントリがある場合**: そのまま Step 4 に進む。Issue作成時に該当仕様の受け入れ条件を参照する。

**仕様エントリがない場合**:
```
⚠️ この機能の仕様がSPEC.mdにまだありません。

a) /spec {機能名} で先に仕様化する（推奨）
b) このまま進める（Issue内で仕様を定義する）

どちらにしますか？
```
ユーザーが b) を選んだ場合はそのまま進める。強制しない。

### 4. Issue作成
以下の構造で `gh issue create` する:
- **タイトル**: タスク内容を簡潔に
- **本文**:
  - 目的（なぜやるか）
  - 受け入れ条件（完了の定義を明確に。**SPEC.mdに該当仕様がある場合はそこから引用する**）
  - テスト観点（何をどうテストすれば受け入れ条件を満たせるか）
  - TodoistタスクID
  - 関連するKNOWLEDGE.mdの知見があればリンク

受け入れ条件が曖昧な場合は、ユーザーに確認してから作成する。

### 5. ブランチ作成
- `git checkout -b feature/issue-{番号}-{短い説明}`

### 6. TDDでテストから着手
- Issue のテスト観点に基づいてテストファイルを作成
- テストが失敗することを確認（Red）
- ユーザーに「テストを書きました。実装に進みますか？」と確認

### 注意
- CLAUDE.md のレビューロールを事前に確認し、レビュー観点を意識した実装をする
- 迷走しそうになったら自発的に停止してユーザーに相談する
- 作業完了後は /ship でコミット→PR作成→レビューの流れに入る