# TODO

コンテキストがリセットされても作業を再開できるようにするためのタスク管理。
Claude Code のセッションをまたぐ作業の状態を記録する。

## 進行中

<!-- 今やっている作業。中断した場合ここを見れば再開できる状態にする

### タスク名
- **Issue**: #XX
- **ブランチ**: feature/xxx
- **現在地**: 何をどこまでやったか
- **次のステップ**: 再開したら最初にやること

-->

## PR-1.2 着手時に最初に潰す（PR #8 レビュー指摘繰り越し）

PR-1.2 ではタップでの再描画が入る = 毎回の `loadToday()` 呼び出しが増えるため、以下が早期に破綻する。チェックオフ配線より前に対処する。

- **DB ハンドル寿命管理**: `createExpoSqliteClient` を `App.tsx` 内で都度開いて閉じていない（リーク的挙動）。`src/db.expo.ts` に singleton ラッパ `getDb()` を置くか、App 全体で 1 ハンドルを共有する設計に直す。
- **`useEffect` クリーンアップ**: `loadToday().then(setView).catch(setError).finally(setLoading)` が unmount 後に setState を呼ぶ可能性。`let cancelled = false` ガード or `AbortController` 相当の打ち切り機構を入れる。Fast Refresh / HMR / 画面遷移で踏む。
- **iOS 起動確認**: PR #8 では Android のみ通電確認。iOS Simulator または実機で同じ動作を確認する（場合により別 PR で対処）。

## 完了

<!-- 直近の完了タスク。/retro の振り返り対象 -->
