---
name: bug
description: バグ報告をGitHub Issue作成 + Todoist Backlog追加で1コマンドでキャプチャする
argument-hint: "[バグの概要（省略可）]"
disable-model-invocation: false
---

# /bug — バグキャプチャスキル

開発中にバグを見つけた時に、Issue作成 + Todoistへの追加を1コマンドで実行する。
作業を中断しない軽量フロー。

## 手順

### 1. バグ内容の取得

- **引数あり**: その内容をバグ概要にする
- **引数なし**: 直近の会話コンテキストから「何がおかしいか」を抽出して提案

### 2. バグ情報の構造化

ユーザーに以下を確認（会話から推測できる場合は提案して確認）:

```
🐛 バグ報告

タイトル: {バグ概要}
再現手順: {わかれば}
期待動作: {何が正しいか}
実際の動作: {何が起きているか}
優先度: p3（デフォルト。「緊急」「ブロッカー」等があればp1/p2）

これでIssue作成しますか？ (Y/n)
```

簡潔でOK。完璧な記述は求めない。

### 3. GitHub Issue 作成

```
gh issue create:
  title: "[Bug] {バグ概要}"
  body: |
    ## バグ報告
    
    **再現手順**: {再現手順}
    **期待動作**: {期待動作}
    **実際の動作**: {実際の動作}
    
    ---
    Todoist: {タスクID}
  labels: ["bug"]
```

### 4. Todoist タスク追加

ラベル推定は /task スキルと同じロジック（`CLAUDE.local.md` の `todoist_label` > リポジトリ名マッピング）。
投入先は **Inbox プロジェクトの Backlog セクション**。セクションIDは `find-sections` で動的に取得する。

```
todoist:find-sections:
  projectId = "inbox"
  searchText = "Backlog"

todoist:add-tasks:
  tasks:
    - content: "[Bug] {バグ概要}"
      description: "GitHub Issue: #{Issue番号}\n{再現手順の要約}"
      sectionId: "{find-sectionsで取得したBacklogのセクションID}"
      labels: ["{推定ラベル}"]
      priority: "{推定優先度}"
```

### 5. 確認

```
🐛 バグ登録完了
   Issue: #{番号} {タイトル}
   Todoist: [Bug] {概要} → Inbox/Backlog [@{ラベル}] p{優先度}
```

## 注意

- バグ登録後に作業を中断しない。登録して即元の作業に戻る
- 今すぐ修正すべきバグの場合は「このまま /start で修正に入りますか？」と聞く
- Issue には `[Bug]` プレフィックスを付ける（/start の逆フローで検知するため）
