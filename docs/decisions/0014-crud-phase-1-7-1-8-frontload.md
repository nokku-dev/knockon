---
id: 0014
date: 2026-05-20
project: knockon
tags: [scope, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# チェーン / アクション CRUD を Phase 1.7-1.8 として前倒しする (Phase 2 部分の先行)

## 文脈

[ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) で CRUD は Phase 2 にスコープ化していた。Phase 1 の完成判定は「Today で実運用ループが数日継続して回ること」で、CRUD は v1 出荷スコープ (Phase 0-3) には含まれるが Phase 1 中は **シードチェーン 1 本固定** で運用する想定だった。

Phase 1 全体実装が完了 (PR #5-#19 / Phase 0-1.6) し、次は [TODO.md](../../TODO.md) §「CRUD 着手シグナル」を観察しながら実機運用に入る段階だった。ところが N=1 ユーザー自身 (=自分) が以下を判断:

- **「編集・削除が必要なのは自明」**: シード書き換え再ビルドの摩擦は事前に予測できる
- **「実機運用前に CRUD を作って、ループ自体を CRUD 込みで検証する」**: シード書き換えで一度試す手順を省く

これにより [TODO.md](../../TODO.md) §CRUD 着手シグナル A (シード書き換え週 2 回以上 → Phase 2 前倒し) を **観察ベース** ではなく **予測ベース** で発火させる判断になる。[K-001](../../KNOWLEDGE.md) (快適で得意な作業が実リスクに触れていない罠) のリスクはあるが、N=1 ユーザーは自身の使用パターンを知っているため受容できる範囲と判断。

[K-018](../../KNOWLEDGE.md) (test env と prod env で FK 制約のデフォルト挙動が違う) も、削除実装で構造的に解決する好機。

本 ADR は ADR-0006 の v1 出荷スコープ (Phase 0-3) を変更するものではなく、**着手順序を変える判断**。

## 検討した選択肢

- **案A（採用）**: フル CRUD を Phase 1.7-1.8 として前倒し。新規作成 / 編集 / 削除 / アクション編集すべて含む。PR を 2 分割 (1.7 = 新規 + 編集 / 1.8 = 削除 + FK 整備)。
- **案B（却下）**: 新規作成だけ先行 (Phase 1.7)、編集 / 削除は実機運用後に判断 ([ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) §早期検証ゲートの精神に忠実)。ユーザーの「編集・削除が必要なのは自明」判断と矛盾。
- **案C（却下）**: 後送りのまま ([ADR-0006](./0006-phase1-completion-and-scope-narrowing.md) 維持)。シード書き換え運用で N=1 完成判定を取りに行く。

## 決定

案A を採用する。具体的に以下を固定する:

1. **Phase 1.7 (PR で 1 つ)**: チェーン新規作成 + チェーン編集 (タイトル / ノード並び替え + 追加) + アクション編集 (タイトル) を実装。**削除は含まない**。
2. **Phase 1.8 (PR で 1 つ)**: チェーン削除 + ノード削除 + アクション削除 + **FK 制約 ON + ON DELETE CASCADE** ([K-018](../../KNOWLEDGE.md) の構造的解決)。
3. **shouldSeed 削除 (Q5 = b 判断)**: 起動時にサンプルチェーンを自動投入する挙動を取り除き、初回起動時は **チェーン 0 件の空状態** にする。`+ 新規作成` ボタンへの誘導が主動線。`buildPersonalChainSeed` は domain test の fixture として残す。
4. **スコープ外**:
   - サブチェーン参照 (ADR-0006 維持で v1 非スコープ)
   - アクションのバリアント (曜日マップ等) — タイトルのみ編集、バリアントは Phase 2 以降に判断
   - チェーンステータス (active / stocked) の切替 UI — 簡単なので Phase 1.7 に含めても可、ただし基本はアクティブのみ
5. **完成判定は ADR-0006 のまま**: Today で実運用ループが数日継続して回ること (CRUD 完成自体は完成判定ではない)。
6. **ID 生成**: `expo-crypto.randomUUID()` または `nanoid` (Expo SDK 同梱の `expo-crypto` を優先)。
7. **既存 ADR との関係**:
   - [ADR-0006](./0006-phase1-completion-and-scope-narrowing.md): supersede しない。CRUD は v1 出荷スコープに既に含まれていた。「Phase 2 着手のタイミングを前倒し」だけの判断
   - [ADR-0010](./0010-spine-fill-to-last-achieved.md) (達成済みノード範囲モデル) / [ADR-0012](./0012-anchor-firing-events.md) (発火イベント): 影響なし
   - [K-018](../../KNOWLEDGE.md): PR-1.8 で `PRAGMA foreign_keys=ON` + `ON DELETE CASCADE` を実装することで構造的に解決
8. これは v1 確定事項。覆す場合は本 ADR を `superseded` にする新規 ADR が必要。

## 理由

- **N=1 ユーザーの判断尊重**: 大規模ユーザー向けプロダクトなら「実機で観察してから決める」が正しいが、N=1 ではユーザー自身が「自分のチェーンを毎日変えたくなる」を予測できる。情報の非対称性が逆 (作る人 = 使う人)。
- **ADR-0006 の本来スコープ拡張ではない**: ADR-0006 は CRUD を Phase 2 にしただけで、v1 出荷スコープには含めていた。前倒しは着手順序の変更で、スコープ creep ではない。
- **K-001 リスクの管理**: 「使う前に作り込み」リスクは存在するが、(1) CRUD 機能は完成判定ではなく道具、(2) 1.7-1.8 完了後に実機運用フェーズに入る、(3) PR 単位で小さく刻む (B 案で 2 PR 分割) — の 3 点でリスクを抑える。
- **K-018 の構造的解決機会**: 削除を実装するなら FK 制約と CASCADE の判断は不可避。Phase 1.8 でまとめて解決すれば、test env と prod env の乖離がなくなる ([K-018](../../KNOWLEDGE.md) の Phase 2 判断ポイントを前倒し)。
- **shouldSeed 削除 (Q5 = b) の理由**: CRUD 検証目的なら「自分のチェーンだけが入った状態」が綺麗。サンプルチェーン残置はノイズ。`buildPersonalChainSeed` は test fixture として残せば既存テスト無傷。
- **案B (新規作成のみ先行) を却下する理由**: ユーザーが「編集削除が必要なのは自明」と明示判断。新規だけ作って「やっぱり編集も要る」になると 2 度作業になる。
- **案C (後送り維持) を却下する理由**: シード書き換えで N=1 完成判定を取りに行く案は ADR-0006 の精神には忠実だが、ユーザーが「自分の摩擦は予測できる」と判断した時点で観察待ちの価値が下がる。

トレードオフ:
- 実装規模が増える (Phase 1.7 + 1.8 で 1500-2000 行規模)。Phase 1.6 (約 1400 行) より重い
- iOS 通電をさらに先送り ([PR #19](../../TODO.md) で明文化済み、追加影響なし)
- 「使う前の作り込み」リスクは ADR レベルで受容判断したので、Phase 2 着手以降に同じ判断する場合は本 ADR をリファレンスする
- Phase 2 のスコープが減る (チェーン編集 + アクション編集が Phase 1.7-1.8 に移動)。Phase 2 は他の機能 (サブチェーン参照 / バリアント / metrics 連携など、まだ未スコープ) に振り直し

## 想定される影響

- **同 PR で同期更新が必要 (K-005 双方向リンク)**:
  - [SPEC.md](../../SPEC.md): CRUD が Phase 1 範囲に入った旨を反映 (達成・連鎖判定セクションは無傷)
  - [PLAN.md](../../PLAN.md): Phase 1.7 / 1.8 を追記 (PR 分割表に行追加)
  - [CLAUDE.md](../../CLAUDE.md): §プロジェクト固有 5 「v1 非スコープ」リストはサブチェーン / 目標ビュー / 7/31 切替に絞り、CRUD は外す
  - [ADR-0006](./0006-phase1-completion-and-scope-narrowing.md): §「v1 非スコープへの降格」リストから「CRUD」関連は外し、本 ADR への逆参照を追加
- **コード変更 (PR-1.7)**:
  - [src/repository.ts](../../src/repository.ts) に `updateChain` / `updateNode` / `updateAction` (+ `insertNode` 等は既存) を追加 (削除関数は PR-1.8)
  - [src/seed.ts](../../src/seed.ts) はテスト fixture として維持、初回起動時の自動投入だけ削除
  - [app/_layout.tsx](../../app/_layout.tsx) から `shouldSeed` + `seed` 呼び出しを削除、`initSchema` のみ残す
  - 新規 routes: `app/chain/new.tsx` / `app/chain/[chainId].tsx`
  - 新規 UI: `ChainEditScreen` / `NodeListEditor` / `ActionPicker`
  - 新規 hook: `useChainEdit` (CRUD の透過 wrapper)
  - 依存追加: `expo-crypto` で ID 生成
- **コード変更 (PR-1.8)**:
  - 削除 repository 関数: `deleteChain` / `deleteNode` / `deleteAction`
  - `db.ts` SCHEMA_SQL に `PRAGMA foreign_keys=ON` 相当 + `ON DELETE CASCADE` 全リレーション (`chains.anchor_id` / `nodes.chain_id` / `nodes.action_id` / `achievements.node_id` / `anchor_firings.anchor_id`)
  - 既存 dev DB の foreign_keys 設定マイグレーションを `initSchema` で処理 (PRAGMA は session-scoped なので接続時に必ず実行する設計)
  - K-006 schema invariant テスト拡張 (FK 制約 ON / CASCADE 動作確認)
- **後で覆すコスト**: Phase 1.7 着手時に「やっぱり編集削除は不要だった」と判明したら、本 ADR を `superseded` にして Phase 2 に戻す判断が必要 (ユーザーがすでに編集が要ると明示したので可能性は低い)。スキーマ変更 (FK ON 化) も `PRAGMA foreign_keys=OFF` に戻すだけで覆せるが、orphan record の clean-up を別途行う必要が出る。
- **これは v1 確定事項**。Phase 1.7 着手後の再検討は本 ADR を `superseded` にする新規 ADR が必要。
