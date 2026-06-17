---
id: 0041
date: 2026-06-18
project: knockon
tags: [ux, scope]
status: accepted
supersedes: []
superseded-by: []
---

# Today 累計表示を「全体のみ・単位は個達成」に絞り込む (ノード単位 N 回を撤回)

## 文脈

Issue #142 で「やるだけ増える / リセットされない累計」を Today に出す方針を [ADR-0036](./0036-rescind-today-streak-display.md) §却下選択肢「リセットしない緩い指標」の格上げとして採択し、PR #152 で実装した:

1. **アプリ全体の累計**: Today 見出し右に `累計 N 回 (+今日M)`
2. **ノード単位の累計**: ChainDetail のノード行右端に `N 回`

実機で触ってから、Taku が以下の差分修正を判断した (2026-06-17):

> やっぱり各ノードに関しての累計回数は消して。また、単位は累計 N回じゃなくて累計 N個達成にして

意図は Issue 本文 + 追加指示で示された方針 (「どのノードがうまく行ってないか」的な分析は分析ビュー側に託す。Today でやりたいのは、ちゃんと前に進んでいる感覚にさせること) に立ち戻ること。実機で見たときに:

- ノード単位の `N 回` はノード行に既にある定着の星 / マトリクスと意味が混線し、「ノード個別に評価する目線」を Today に呼び込んでしまう (= Taku 指示の「分析は分析ビュー側に託す」の逆方向)。
- 「回」という単位は ChainDetail の `⏱ N 分` (タイマー) や「N 日連続」(ADR-0036 で撤回済み) と混線し、何の数字かが瞬時に読み取りづらい。「個達成」と書くと「ノードを N 個達成した」が一読で伝わる。

## 検討した選択肢

- **案A (採用): ノード単位 N 回を撤回し、全体累計の単位を「個達成」に変える**
  - ChainDetail のノード行から `N 回` 表示を削除。
  - Today 見出し右の累計表示は `累計 N 回 (+M)` → `累計 N 個達成 (+M)` に文言だけ変更。
  - 派生関数 `nodeCumulativeCount` / SQL `countAchievedBeforeByNode` は他に利用箇所がないため同 PR で削除 (ADR-0036 §死にコードを残さない原則を継承)。
- **却下: ノード単位 N 回だけ残して単位を変える**
  - Today で「ノード個別の進捗を数字で評価する」目線を残すことになり、「分析は分析ビュー側」という Taku 指示と逆。
- **却下: 全体累計も削除して 0 ベースからやり直す**
  - Issue #142 本文「累計はリセットされず行動するたびに増えるため『常に前進している感』を維持できる」という核心要件を失う。Taku 指示は「ノード単位を消す」だけで「全体累計も消す」ではない。
- **却下: 単位を「達成」「件」「ノード」など別語に変える**
  - 「個達成」(Taku 指定) が最も曖昧さが少ない。「達成」だけだと数えているものが伝わらず、「件」「ノード」は専門語寄り。

## 決定

案A を採用。

具体:
- `ChainDetail` の `nodeAchievedBase` prop / `NodeRow` の `cumulativeCount` 引数 / `node-row-cumulative-${nodeId}` testID と `nodeRowCumulative` スタイルを削除。
- `TodayScreen` の文言を `累計 ${N.toLocaleString()} 個達成 (+${M})` に変更 (accessibilityLabel も同様)。
- `domain.ts` の `nodeCumulativeCount` を削除。`countAchievedInMap` は全体累計の今日分集計に使うため維持。
- `repository.ts` の `countAchievedBeforeByNode` を削除。`countAchievedBefore` (全体集計) は維持。
- `useTodayData.ts` の `TodayChainData.nodeAchievedBase` および `loadChainForToday` 内の `countAchievedBeforeByNode` 呼び出しを削除。
- 関連テスト (`ChainDetail.test.tsx` の `#142: ノード行右端の累計達成回数「N 回」` / `domain.test.ts` の `nodeCumulativeCount` / `repository.test.ts` の `countAchievedBeforeByNode` ケース) を削除し、ノード行に数字が出ないことを確認する回帰テストを 1 本残す。`TodayScreen.test.tsx` の文字列期待値を「個達成」に更新。
- [SPEC.md](../../SPEC.md) §3 と [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) §0 に本判断を 1 行ずつ追記。

これは [ADR-0036](./0036-rescind-today-streak-display.md) の「Today / 分析ビューとも連続日数の数字・色強調は計算も表示もしない」を覆さない。「単純総和の累計」を全体に 1 つだけ残す Issue #142 の運用判断は維持し、ノード個別単位での数字評価を Today から外す。Today に出すのは「アプリ全体としての前進感」だけ、ノード個別の評価は分析ビューに集約、という面別役割分担を確立する。

## 理由

- **「Today = 前に進む感覚を作る場」の純化**: Taku 指示「どのノードがうまく行ってないか的な分析は分析ビュー側に託す」と整合。ノード単位の累計回数は実機で「個別の達成度を比較評価する目線」を Today に持ち込む (= ノード A は 50 回だが B は 3 回しかない、という相対比較を誘発)。これは [Augmentation 原則 (CLAUDE.md)](../../CLAUDE.md) の「マイナスを指差さない / Celebrate 主」と齟齬。
- **単位「個達成」の一意性**: ChainDetail のノード行は既に `⏱ N 分` (タイマー) / 7 日マトリクス / 定着星 が並ぶ。そこに `N 回` が加わると、何の「回」かが瞬時に判別できない。全体累計でも「回」は「やった回数 / ノードの回数 / 日数 / 時間」の解釈余地がある。「個達成」は「ノードを 1 個達成 = 1 個」と 1 対 1 対応で読める。
- **死にコードを残さない**: ノード単位を消すなら派生関数 (`nodeCumulativeCount`) と SQL API (`countAchievedBeforeByNode`) も削除する。ADR-0036 で同じ規律を適用した (= `chainCompletionStreakDays` / `nodeCompletionStreakDays` を関数ごと削除)。中途半端に残すと「いつかノード単位を復活させる」誘惑の温床になる。

トレードオフ:
- **ノード個別の前進感の手がかりは「定着の星 (★) と 7 日マトリクス」だけになる**: 累計回数のように「ずっと積み上がる数字」は持たない。これは意図した帰結 — ノード個別の数字評価は分析ビューに集約することで、Today の役割を純化する。
- **「個達成」は日本語固有表記**: i18n 化が将来必要になった場合、英訳は `N completed` 等で別途決める (Phase 1 N=1 では問題なし)。

## 想定される影響

- **覆すコスト (低)**: ノード単位を再導入するなら派生関数 + SQL API + ChainDetail prop / NodeRow 引数 / スタイル / テストを再実装する必要があるが、`Achievement` の正準データ ([ADR-0001](./0001-chain-data-model.md)) は不変なので、データ的な不可逆性はない。
- **PR #152 で残るのは「全体累計」のみ**: 「単位の表記」と「ノード単位の有無」が異なる Issue #142 の最終形を本 ADR で固定する。
- **撤回時の対称義務 (ADR-0036 継承)**: 将来本案 (= 全体累計の表示も含めて累計表示そのものを撤回する) を撤回するなら、`countAchievedBefore` / `countAchievedInMap` / TodayScreen の累計表示 / `TodayData.achievedBeforeToday` / `useTodayData.ts` の集計コード / SPEC §3 / DESIGN-SYSTEM §0 の追記文を **同時に削除する**ことを本 ADR で予約する。
- **関連 ADR との関係**: ADR-0036 (連続日数の非表示) と並立し、面別の数字表示ルールを確立する — Today で出すのは「アプリ全体としての単調増加な総和」のみ、ノード単位の数値評価は分析ビューに、連続性を煽る数字は出さない、の 3 点で完結。
