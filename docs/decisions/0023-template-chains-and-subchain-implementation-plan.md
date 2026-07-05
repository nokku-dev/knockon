---
id: 23
date: 2026-05-25
project: knockon
tags: [scope, data-model, ux, architecture]
status: accepted
supersedes: []
superseded-by: []
---

# テンプレートチェーン機能 (パターン 1 + 2) とサブチェーン本実装の段階計画

## 文脈

[ADR-0022](0022-phase-1-completion-and-verification-operation.md) 検証期間中、 ユーザーが「**一つのチェーンを作るのが面倒**」と観測 (不便驅動シグナル)。 解決策として 2 パターンの「テンプレートチェーン機能」を希望:

- **パターン 1**: 1 つのテンプレチェーンを選び、 自前チェーンの末尾にアクションをフラットに追加 (= ノードを 1 つずつ末尾に INSERT)
- **パターン 2**: 1 つのテンプレチェーンを自前一覧に**インポート**することで、 サブチェーンとして別チェーンに組み込む (= サブチェーン参照)

パターン 2 は v1 非スコープ ([SPEC §2](../../SPEC.md)) の **サブチェーン本実装**を前提とする。 過去の Q2 議論 (variant の仕様詰め) で「サブチェーン化のタイミングで variant も含めて再設計」と決めた ([ADR-0018](0018-variant-phase-2-frontload.md))。 今 ADR で **サブチェーン data モデルを確定する**。

## 検討した選択肢

### スコープ

- 案 S1: パターン 1 のみ → 検証でシグナル出てからパターン 2
- 案 S2: パターン 1 + 2 を並行で同 PR
- 案 S3: パターン 2 が本命なのでそっちから着手 (パターン 1 は手段として不足)

### サブチェーン data モデル

- **案 P (SPEC §2 通り)**: nodes.kind を `'action' | 'subchain'` に拡張、 nodes に `subchain_id` column 追加。 アクションとサブチェーンは別エンティティ
- **案 Q (アクション = ミニチェーン)**: actions が「子ノード列」を持てる。 ADR-0001 を覆す
  - 変形 Q1: actions と chains を統合 (単一 `routines` エンティティ) — 大規模再設計
  - 変形 Q2: actions に `child_chain_id` 列を追加 (NULL 許容) — 既存構造維持しつつ拡張

## 決定

### スコープ: **案 S2 を 3 段階の PR に分割実装**

- **PR-Y1**: パターン 1 (フラット末尾追加) — schema 変更なし、 即着手可、 数時間
- **PR-Y2**: サブチェーン本実装 (actions に child_chain_id 追加) — schema migration、 表示/編集 UI、 達成判定
- **PR-Y3**: パターン 2 (テンプレチェーンを「インポート」して child_chain_id で参照)

「一気に」 = ユーザー要件は全体着手だが、 サブチェーン本実装は規模が大きいため**順次デリバリ**。 ADR-0022 不便驅動原則と整合 — パターン 1 で「面倒さ」がどこまで解消するかも検証できる。

### サブチェーン data モデル: **案 Q 変形 Q2** (actions に `child_chain_id` 追加)

- `actions` テーブルに `child_chain_id TEXT REFERENCES chains(id) ON DELETE SET NULL` を追加 (nullable)
- `child_chain_id` が NULL → 単純アクション (現状通り)
- `child_chain_id` 非 NULL → サブチェーン参照アクション (子 chain のノードを「展開表示」する)
- 既存 actions は全部 `child_chain_id=NULL` で互換、 migration コスト最小
- nodes は変更なし (action_id を持ち、 そのアクションが child_chain_id を持つかで挙動切替)

### サブチェーンの達成判定 ([SPEC §2](../../SPEC.md) 既存)

- 親 chain のノード達成 = 子 chain のいずれか 1 ノードでも達成済み (ゆるい判定 / 派生関数で計算)
- 達成記録は子 chain の各ノードに紐付くまま (正準データ変更なし、 ADR-0001 整合)

### サブチェーンの variant 互換

- 子 chain 内の各 action は通常通り variant を持てる
- 親 chain のノード (= 子 chain 参照アクション) は variant を持たない (= 子の variant を尊重)
- 排他: 1 つのアクションが variant と child_chain_id の両方を持つことは禁止 (CHECK 制約 or アプリ層バリデーション)

## 理由

- **案 Q 変形 Q2 を採用した理由**: 案 Q1 (統合) は ADR-0001 大改修 + 既存 全実装影響。 案 P (kind 拡張) はユーザー希望 (「アクション = ミニチェーン」モデル) と乖離。 Q2 は両者の中間で、 既存構造を残しつつアクション拡張のみで実現できる。 ユーザー希望のメンタルモデル (= 「胸トレ」アクションがサブチェーン化されたら自動展開) を最小コストで実装。
- **3 段階実装の理由**: パターン 1 は schema 変更不要で「面倒さ」を即解消。 PR-Y1 単独で実機検証可能。 パターン 2 はサブチェーン本実装 (PR-Y2) を前提とし、 順次デリバリで段階的に検証。 一気に大規模 PR を出すと review / debug が困難 ([K-019](../../KNOWLEDGE.md) 経験から大物 PR は分割推奨)。
- **テンプレートは builtin (コード内) スタート**: `src/templateChains.ts` に定数リストで保持。 「ユーザー追加できる」は Phase 2 後半。 最小スコープで「面倒さ」解消の効果を検証。

## 想定される影響

### 即時の影響 (PR-Y1 範囲)

- `src/templateChains.ts` 新規: builtin テンプレ定義 (title + actions の list)
- ChainEditScreen の Footer の `+ ノードを追加` の隣に **「+ テンプレから追加」** ボタン
- テンプレ選択モーダル → 選択 → 各アクションを INSERT (新規 action として) + ノード末尾追加
- **改定 ([ADR-0046](0046-template-picker-two-step-individual-action-selection.md))**: 上記動線条文は 2-step 個別選択 (step1 でテンプレを開く → step2 で checkbox 選択 → 「N件を追加」) に改定された (PR #137 / #173 で実装済み)。 本 ADR の他の条文 (PR-Y1/Y2/Y3 の 3 段階 / サブチェーン data モデル / テンプレ builtin スタート) は維持。 [K-005](../../KNOWLEDGE.md) 双方向リンク運用。

### PR-Y2 範囲

- schema: `actions.child_chain_id TEXT REFERENCES chains(id) ON DELETE SET NULL` 追加、 SCHEMA_VERSION = 2 へ bump (K-021 drop + recreate)
- domain.Action 型に `childChainId: string | null` 追加
- ChainDetail でサブチェーン参照ノードを「展開表示」 (子チェーンのノードを内包)
- 達成判定: 親ノード達成 = 子チェーンいずれかノード達成 (純粋関数追加)
- ChainEditScreen でアクションが child_chain_id を持つ場合の UI 切替

### PR-Y3 範囲

- テンプレチェーンを「インポート」する UI: 自前 chains に新規 chain を作成 (status='stocked' で一覧から隠す) + 新規 action を child_chain_id 付きで作成
- 親 chain に「サブチェーン参照アクションを追加」ボタン → 既存サブチェーンアクションを選んで末尾追加

### 将来の覆すコスト

- **案 Q2 を案 Q1 (統合) に変更**: 既存 actions/chains 統合 = 大規模 migration、 全 UI 影響。 ただし Q2 で「アクション = ミニチェーン」のメンタルモデルが満たされるならやる必要なし
- **テンプレを DB 永続化 (ユーザー追加可能に)**: template_chains テーブル追加、 CRUD UI 追加。 1 PR 規模で対応可
- **サブチェーン参照ノードに variant 追加**: 「曜日でサブチェーン切替」の Q2 議論で出ていた本来希望。 actions.variants_json の型を `string | { kind: 'subchain', chainId }` の union に拡張。 別 PR

### 注意点

- **ADR-0001 への影響**: 「派生値禁止」原則は維持 (child_chain_id は派生値ではなく事実)。 ただし「アクションは title だけのシンプル entity」前提が崩れる → ADR-0001 に逆参照を追加して系譜を辿れるようにする (K-005)
- **PR-Y2 の schema migration**: K-021 drop+create で対応、 試作データ消失受容 (Phase 1 N=1)
- **テスト**: 各 PR で純粋関数 (テンプレ展開 / サブチェーン達成判定) を ts-jest テスト
