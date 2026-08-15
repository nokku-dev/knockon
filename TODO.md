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

## ~~iOS は Android 版 v1 出荷判断の手前までスルー~~ → **iOS 先行に転換済み (2026-07-21)**

> **この節は失効している。** 2026-07-21 の判断ログで **iOS 先行・Q1 内リリース**に方針転換した。以下の 2026-05-19 判断は履歴として残すが、現行方針は [docs/release/app-store-submission.md](docs/release/app-store-submission.md) が SoT。
>
> **現行の iOS 通電状況**: preview / development の iOS build profile は `"simulator": true` のため、**実機の権限フローは未通電**。位置権限の欠落 (#254) はこの穴で見逃されていた ([K-040](KNOWLEDGE.md))。実機通電は production build (#240) のタイミングでまとめて行う。

- **旧方針 (2026-05-19・失効)**: iOS の起動確認 / 通電は **Android で v1 (Phase 1 + 必要に応じて Phase 2/3) が出荷可能と判断できる手前** までやらない。各 PR 完了時に iOS でも動かす方式 / Phase 1 完了時点でまとめて確認する方式どちらも、iOS 固有の問題に時間を取られて Android の time-to-device / 実機運用ループが遅くなることが分かった (Phase 1 完了時点でユーザー判断、2026-05-19)。
- **暗黙の前提 (現在も有効)**: コードベースは Expo (React Native) なので iOS は基本的に同じ JS バンドルで動く想定。**ただし native 側 (Info.plist / config plugin) は JS バンドルと別系統**なので、権限フロー等は実機で初めて確認できる ([K-040](KNOWLEDGE.md))。

## 完了

<!-- 直近の完了タスク。/retro の振り返り対象 -->
