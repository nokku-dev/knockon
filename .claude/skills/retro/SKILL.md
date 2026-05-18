---
name: retro
description: 直近のIssue/PR/知見を振り返り、ハーネスファイルの改善を提案する
disable-model-invocation: true
---

## 手順

### 1. 直近の活動を収集
- `gh pr list --state merged --limit 10` で直近のマージ済みPRを取得
- `gh issue list --state closed --limit 10` で直近のクローズ済みIssueを取得
- KNOWLEDGE.md の直近の追記内容を読む

### 2. パターン分析
以下の観点で分析する:

**予測ログの答え合わせ**:
- PRの予測と実際の結果にズレはあったか
- ズレがあった場合、何が見落とされていたか

**繰り返し指摘パターン**:
- レビューで同じ種類の指摘が複数回出ていないか
- KNOWLEDGE.md に似た内容の知見が複数回記録されていないか

**迷走パターン**:
- 迷走検知が頻発した領域はあるか
- 共通の原因はあるか

**Todoistラベルとの照合**:
このリポジトリに対応するTodoistラベルの完了タスクを確認し、リポの活動と照合する。

ラベル → リポジトリ マッピング:

| ラベル | リポジトリ |
|---|---|
| `dev-loop` | claude-code-templates |
| `cardex` | cardex |
| `gitpulse` | gitpulse |
| `ai-mini-app` | ai-mini-app-sns |
| `still-here` | still-here |
| `life-os` | life-os-shell |

現在のリポジトリに対応するラベルが特定できる場合、Todoist MCPで完了タスクを取得:

```
todoist:find-completed-tasks:
  labels = ["{対応するラベル}"]
  since = "{1週間前の日付}"
  limit = 20
```

### 3. 改善提案
分析結果に基づき、以下の改善を提案する:

- **CLAUDE.md への追記**: 行動ルールとして定着させるべきパターン
- **.claude/rules/ への追記**: 特定パス・領域に適用すべきルール
- **レビューロールの更新**: レビュー観点の追加・修正
- **understanding-map.md の更新**: 把握状況の変化

### 4. 提案をまとめて表示
- 各提案を差分形式で表示
- ユーザーの承認を得てから反映
- 提案が多い場合は優先順位をつけて提示

### 推奨頻度
週次、またはスプリント末に実行