# 判断ログ (Architecture Decision Records)

このディレクトリには、このプロジェクトの重要な判断が ADR (Architecture Decision Record) 形式で記録される。

## ファイル命名規則

`NNNN-short-kebab-case-title.md`

- `NNNN`: 4桁の連番
- タイトル: kebab-case の英語

例: `0001-use-react-native.md`, `0042-accent-color-decision.md`

## 新規作成

Claude Code から `/decision` スキルを起動するか、以下のスクリプトを実行する:

```bash
./scripts/new-decision.sh accent-color-decision
```

スキルを使う場合は、「捨てた選択肢」「理由」「想定される影響」が必ずヒアリングされる。
スクリプトを直接使う場合は、自分で空のテンプレートを埋める。

## タグ語彙集

新しいタグを使う場合は、まずこのリストに追加すること（同義タグの乱立を防ぐため）。

### デザイン系
- `color`: 色彩の判断
- `typography`: タイポグラフィの判断
- `spacing`: 余白・レイアウトの判断
- `animation`: アニメーション・トランジションの判断
- `branding`: ブランディング全般の判断
- `iconography`: アイコン・記号の判断

### 技術系
- `architecture`: アーキテクチャ判断
- `library`: ライブラリ選定
- `performance`: パフォーマンス関連
- `testing`: テスト戦略
- `deployment`: デプロイ・配信

### プロダクト系
- `ux`: UX設計の判断
- `naming`: 命名（機能・コンポーネント・プロダクト）
- `scope`: スコープの判断（やる/やらない）
- `data-model`: データモデル設計

## status の値

- `accepted`: 採用された判断（通常）
- `superseded`: 後の判断によって覆された
- `proposed`: まだ採用していない検討中の判断（基本的には使わない）

## 判断が変わった時

過去の判断を覆す場合:
1. 新しい判断ログを作成し、`supersedes: [過去ID]` を記載
2. 過去の判断ログの `status` を `superseded` に変更
3. 過去の判断ログの `superseded-by: [新ID]` を記載

これにより、判断の系譜（lineage）がたどれるようになる。
