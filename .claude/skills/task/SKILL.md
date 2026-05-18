---
name: task
description: 作業中に思いついたタスクをTodoistに追加するスキル。「タスク追加」「これやらないと」「TODO」「あとでやる」などのキーワードでトリガー。リポジトリ名からラベルを自動推定し、Inbox/Backlogセクションに投入する。
argument-hint: "[タスク内容（省略可）]"
disable-model-invocation: false
---

# /task — 作業中タスク追加スキル

開発中に「あ、これもやらないと」が出た時に、ワンコマンドでTodoistに追加する。

## Todoist構成

- **Inbox（Boardビュー）**: 未分類 / Backlog / In Progress / Done
- デフォルト投入先: **Backlog** セクション
- 記事ネタ: **発信** プロジェクトの **ネタストック** セクション
- ラベルでプロダクト識別（必須）
- セクションIDは Todoist MCP の `find-sections` で動的に取得する

## ラベル自動推定

現在のリポジトリ名からラベルを自動推定する。`CLAUDE.local.md` に `todoist_label` 指定がある場合はそれを使う。

| リポジトリ名（部分一致） | ラベル |
|---|---|
| cardex | `cardex` |
| gitpulse | `gitpulse` |
| ai-mini-app / mini-app | `ai-mini-app` |
| still-here / still_here | `still-here` |
| claude-code-template / dev-loop | `dev-loop` |
| life-os | `life-os` |
| fit-river / fitriver | `work` |

推定できない場合はユーザーに聞く。

## 手順

### 1. タスク内容の取得

- **引数あり**: その内容をタスク名にする
- **引数なし**: 直近の会話コンテキストから「やるべきこと」を抽出して提案

### 2. ラベル推定

以下の優先順で決定:
1. `CLAUDE.local.md` に `todoist_label` が指定されていればそれを使う
2. 現在のリポジトリ名（`basename $(pwd)`）からマッピング表で推定
3. タスク内容のキーワードから推定（記事/発信系 → `発信`、学習系 → `learning` 等）
4. どれにも当てはまらない → ユーザーに確認

### 3. 投入先の決定

セクションIDは `find-sections` で動的に取得する。

- デフォルト: **Inbox / Backlog**
- 記事ネタ（「記事にしたい」「ネタ」「書きたい」）: **発信 / ネタストック**
- 優先度: デフォルト p4。「急ぎ」「今日中」等のキーワードがあれば p2

### 4. タスク追加

```
todoist:add-tasks:
  tasks:
    - content: "{タスク名}"
      description: "{補足があれば。関連Issue番号等}"
      sectionId: "{find-sectionsで取得したセクションID}"
      labels: ["{推定ラベル}"]
      priority: "{推定優先度}"
```

### 5. 確認

```
✅ タスク追加: {タスク名}
   → Inbox/Backlog [@{ラベル}] p{優先度}
```

## 例

```
> /task OCR精度が低い画像パターンを調査する

✅ タスク追加: OCR精度が低い画像パターンを調査する
   → Inbox/Backlog [@cardex] p4
```

```
> /task 急ぎ: テスト用の画像データセットを用意する

✅ タスク追加: テスト用の画像データセットを用意する
   → Inbox/Backlog [@cardex] p2
```

```
> /task この仕組みを記事にしたい

✅ タスク追加: この仕組みを記事にしたい
   → 発信/ネタストック [@発信] p4
```

## 注意
- タスク追加後に作業を中断しない。追加して即元の作業に戻る
- 1回の呼び出しで1タスクだけ追加する（複数まとめ追加はしない）
- タスク名は簡潔に。詳細はdescriptionに入れる
