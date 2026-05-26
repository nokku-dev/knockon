# KNOWLEDGE — 失敗パターン

標準フォーマット: 状況 / 問題 / 原因 / 解決 / 教訓

---

## K-001: 快適で得意な作業が実リスクに触れていない罠

- **状況**: 新規プロダクトの設計初期。精密な事前設計に着手したくなった。
- **問題**: 進んでいる感触はあるが、実リスク（発見されるか／切り口が刺さるか）に触れていない。
- **原因**: 得意領域は心理的コストが低く、検証より先に手が出る。
- **解決**: 先に拘束条件を特定し、設計精度がそれを下げないなら市場/実機シグナル側に投資する。
- **教訓**: 着手深度は拘束条件で決める。設計精度がリスクを下げないなら、それは前進ではなく消耗。

## K-002: 小さなデータ単位の選択が差別化をデータ層レベルで殺す

- **状況**: 達成度をリンク単位とアクション単位どちらで保存するかの判断。
- **問題**: 粗い単位で保存すると文脈情報が落ち差別化が消える。不可逆。
- **原因**: 表示の都合から保存単位もそれに合わせたくなる引力。
- **解決**: 正準データは情報量最大で可逆な方を選ぶ。
- **教訓**: 「保存は事実、解釈は関数」を貫けば見え方の都合でデータ構造を歪めずに済む。

## K-003: コアモデルが固まる前に UI を作り、繰り返し作り直した

- **状況**: チェーン詳細を v0.1→v0.3 まで何度も作り直した。
- **問題**: 画面を描くたびにモデル側が動き、UI を都度全面再構築。時間と注意の消耗。
- **原因**: モデルを確定と思っていたが実運用の写像が未完で、UI 作成で差分が顕在化した。
- **解決**: コアモデルが動いている間は UI を使い捨て前提の薄い参照に留める。
- **教訓**: UI はモデル検証の道具として安く回す。Phase 0 だけ先に固め UI は作り込まない。

## K-004: 完成ゲートを非コア機能／ANT 違反機能の上に置いた

- **状況**: N=1 完成判定を「目標ビュー（メトリクス手入力）で実運用が閉じる」と定義していた。
- **問題**: (1) メトリクスは If-Then 連鎖というコアとは別系統の機能で、完成基準が中核からずれた。(2) 既存 Notion Body Metrics・/fitness と二重記録になり ANT（行動変容を要求しない）に違反。完成ゲート自体が原則違反機能に乗っていた。
- **原因**: 「あると良い」機能を完成の指標に組み込み、コア体験（毎日使えるか）より測りやすい代理指標を選んだ。
- **解決**: 完成判定をコア体験の実使用（Today が実機で数日回る）に移し、ANT 違反機能は連携前提が立つまで非スコープ化。
- **教訓**: 完成ゲートは必ずコア体験そのものに置く。測りやすい代理機能や付随機能をゲートにしない。ゲート機能が ANT 等の自分の原則に違反していないか必ず照合する。
- **追記 (ADR-0024)**: Phase 1 完成 ([ADR-0022](docs/decisions/0022-phase-1-completion-and-verification-operation.md)) 後、目標ビュー / メトリクス / 分析を Phase 3 と統合して v1 範囲に**取り込む**判断 ([ADR-0024](docs/decisions/0024-goal-view-analytics-phase-3-unified.md))。 K-004 の本質的教訓 (「完成ゲートをコア体験に置く」) は維持 — 完成ゲートは Phase 1 のまま動かさず、機能追加だけ。 ANT 違反リスクは「メトリクスは任意 + チェーンと疎結合 + Notion 連携は read-only」で構造的に回避する。 PR-Z3 実装時は「メトリクス入力を毎日要求する UI」になっていないか自己レビュー必須。

## K-005: 「supersede しない部分変更」を片側リンクだけで処理した

- **状況**: ADR-0006 でサブチェーンを v1 非スコープ化した結果、ADR-0004 の白抜き星仕様が事実上 v1 で動かなくなった。0004 は核（モダンミニマル / 1 本スパイン / Celebrate 主 / 禁止 UI）が維持されるため supersede しないと判断し、0006 側に「付随変更として扱う」とだけ書いて 0004 本文には何も追記せずに PR を出した。
- **問題**: ADR-0004 単体を読むと、白抜き星が依然 v1 不変条件として書かれており、後から 0004 だけを参照した実装者（自分含む）が白抜き星を実装する誤誘導が発生する。判断ログは単体読みされる前提で書かれており、片側リンクだけでは判断系譜（lineage）が壊れる。
- **原因**: 判断ログ間の関係を「supersede」「無関係」の二値で扱っていた。中間（影響あり・supersede 未満）のケースを処理するルールを持っていなかった。
- **解決**: 「supersede しないが特定条文の効力が変わる」ケースでは、影響を受ける ADR 側にも「この条文は ADR-NNNN により v1 では…」の 1 行を残し、双方向リンクで系譜を辿れるようにする。
- **教訓**: ADR 間の関係は二値ではなく中間がある。supersede しない部分変更でも、影響を受ける側の ADR に逆参照を残すこと。判断ログを単体読みしても誤誘導されない状態を保つ。

## K-006: スキーマの不変条件はドキュメント文だけに依存させず SQL レベルでテスト固定する

- **状況**: Phase 0 で「正準データは `(node_id, date, achieved)` の 3 カラムのみ・派生値カラム禁止」「旧リンクモデル禁止」を SPEC.md / CLAUDE.md / ADR-0001 に文字で明記していた。
- **問題**: ドキュメント文だけに依存すると、Phase 1-3 で「ちょっとカラム足せば便利だな」と手が滑ったときに気付けない。レビューで毎回 ADR-0001 を参照して照合する負担も大きい。
- **原因**: 「ハードガードレール」をドキュメント運用に閉じ込めていた。SPEC は不変条件を語る場所であって、ガード自体ではない。
- **解決**: `repository.test.ts` に `PRAGMA table_info(achievements)` と `sqlite_master` を直接検証するテストを追加し、派生値カラム不在・旧リンクモデルテーブル不在を機械的に固定した。CI で物理的に弾けるガードレールになる。
- **教訓**: 「変えてはいけないこと」はドキュメントだけでなくテストで固定する。スキーマレベルの不変条件は SQL のメタクエリ（`PRAGMA` / `sqlite_master`）で機械検証できる。これは Phase 1-3 でも踏襲する（特に派生値の保存欲求が出やすい進捗 / 定着まわりで）。

## K-007: ドメイン層の純粋性は import 文ゼロをレビュー観点に加える

- **状況**: CLAUDE.md グローバル原則「純粋関数によるドメイン層の隔離」では、「DB / UI / 状態管理ライブラリに依存しない」と書かれていた。
- **問題**: レビュー時に「依存していないか」を確認する具体的な手段が曖昧で、レビュアー（自分含む）が一行ずつ読んで判断する負担になる。
- **原因**: 抽象的な原則だけで、機械的に確認できる物理シグナルを持っていなかった。
- **解決**: 「ドメイン層ファイル (`src/domain.ts` など) の `import` 文がゼロ（または同レイヤー内の型 import のみ）」をレビュー観点に追加。`grep "^import" src/domain.ts` で一発検証できる。Phase 0 では実際に import 文ゼロを実現している。
- **教訓**: 抽象原則を運用するには、機械的に検証できる物理シグナルとセットにする。レイヤー依存原則は import グラフで可視化できる。後で `madge` や ESLint の `no-restricted-imports` で自動化する余地もあるが、当面は目視 + grep で十分。

## K-008: Expo Go を dev クライアントとして使う限り、プロジェクト SDK はストア側 Expo Go によって外圧的に決まる

- **状況**: Phase 1.1 実機検証で Android Expo Go が Play Store 自動更新で SDK 53 → 54 に上がり、プロジェクト SDK 53 では `PlatformConstants could not be found` で起動不能になった。Expo Go はストアから上がった SDK バージョンより古いプロジェクトをロードできない。
- **問題**: ADR-0007 で「Expo SDK 更新サイクルへの追従コストが発生する。v1 は年 1-2 回の SDK 更新を許容」と書いていたが、これは「自分のペースで上げるコスト」を想定したものだった。実運用では Expo Go ストア更新が外圧として SDK 移行を **随時** 強制する構造になっており、夜から朝にかけて Expo Go が勝手に上がる可能性がある。
- **原因**: managed workflow + Expo Go の組み合わせでは、dev クライアントの SDK 制約条件をストア側（Apple/Google）がコントロールする。「依存バージョンを自分が決める」という前提が成立しない。
- **解決**: (a) Expo Go ベースの開発を続けるなら SDK は常に最新追従する。(b) 特定 SDK にピン留めしたいなら EAS Dev Build に移行して自前で SDK バージョン管理する。(c) Phase 1 中は EAS Free tier の制約と time-to-device 優先から (a) を取る（ADR-0007 §トレードオフに反映済み）。
- **教訓**: SDK バージョンは「ストア側がいつでも上げる可能性のある外部入力」として扱う。Phase 1.5/1.6 で時刻/場所アンカーを実装した後に SDK 強制移行が来ると壊れる可能性が高いため、その時点で **EAS Dev Build への移行判断を再評価** する。長期実機運用フェーズに入る前に Dev Build に降りるのが安全。
- **追記 (PR-1.5b-1)**: ADR-0006 早期検証ゲート到達 + Phase 1.5b 通知実装の前提 (Expo Go では expo-notifications のローカル通知が動かない) から、Dev Client (`expo-dev-client` + EAS Build) に移行した ([ADR-0017](docs/decisions/0017-expo-dev-client-migration.md))。 Android 先行 / iOS は Phase 1 出荷判断の手前まで保留。これで K-008 の「Expo Go の SDK 外圧」リスクは解消。

## K-009: `expo install` / SDK バンプは tsconfig / babel.config / package.json / app.json に予期せぬ書き換えをする

- **状況**: PR #8 (Phase 1.1) で SDK 54 へのバンプ過程で、(a) `babel-preset-expo` が transitive から外れ devDep への明示追加が必要、(b) `tsconfig.json` が `expo/tsconfig.base` への `extends` を自動付与され `module: preserve` / `customConditions` を要求して TS 5.3 + `moduleResolution: node` と非互換、(c) `app.json` の plugins 配列に `expo-asset` が自動付与、(d) `typescript` が誤って dependencies と devDependencies の両方に入った、という副作用に連続的に踏んだ。
- **問題**: 「依存バージョンを上げる」だけの操作だと思っていたが、ビルド設定全体に副作用が及ぶ。1 回の `expo install` で 3-4 ファイルが同時に書き換わり、ts-jest / type-check / Metro bundling のどれかが連鎖的に壊れる。
- **原因**: Expo の標準セットアップは「自分が決めた tsconfig / babel config」を尊重しない前提があり、SDK 間でデフォルト挙動が変わる（`expo install` 内部の config plugin hook が tsconfig まで触る）。
- **解決**: `expo install` / SDK バンプ後は **必ず `git status` で diff 対象を確認**し、最低 `package.json` / `tsconfig.json` / `babel.config.js` / `app.json` の 4 ファイルを開く。`tsconfig.json` の `extends` 自動付与は黙って受け入れて整合させる方が、毎回戦うよりコストが低い（TS 5.8+ と `moduleResolution: bundler` で動く）。
- **教訓**: SDK バンプは「依存バージョン更新」ではなく「ビルドツールチェイン更新」として扱う。Phase 1 残り (1.2-1.6) でも `expo install` を叩く局面が出る（`expo-notifications` / `expo-location` 等）ので、その都度この 4 ファイルを diff チェック。CLAUDE.md §レビューロールにチェック項目として明記。

## K-010: 楽観更新パターンは rollback / stale closure / 同時実行の 3 トラップを内包する — 判断したことを暗黙にしない

- **状況**: PR #11 (Phase 1.2) で Today のタップ → UI 即時反転 → `recordAchievement` で永続化、という楽観更新パターンを実装した。`useCallback(..., [data])` で `data` を closure に取り込み、失敗時の rollback も入れなかった。
- **問題**: (1) closure 内の `data` を参照しているため、連打すると stale な `data.achievements` を基準に 2 重 UPSERT が発生しうる。(2) `recordAchievement` 失敗時に UI を rollback しないと UI/DB が乖離する。どちらも N=3 シードでは表示上ほぼ顕在化しないが、設計判断としては存在している。
- **原因**: 楽観更新パターンは「stale closure」「rollback」「同時実行」の 3 トラップを内包するが、N=3 ではどれも目に見えにくく、暗黙の判断にしやすい。
- **解決**: 楽観更新を書く時点で「functional update か `[data]` 依存か」「rollback ありか / 失敗を受容するか」を明示的に判断し、コードコメントで残す。PR #11 では `App.tsx` の `handleToggle` に「Phase 1.2 では rollback を入れない (SQLite ローカル同期書込でほぼ失敗しない前提)」を明記。
- **教訓**: 「受容する」も立派な判断だが暗黙にしない。N が増えるシグナル (連打感がある UI / マルチデバイス同期が来る / 達成ノード数が 10+ になる) を観測したら functional update + rollback への移行を判断する。CLAUDE.md §レビューロールに「楽観更新の rollback / stale closure / 同時実行への対処が暗黙か明示か」チェック項目として明記。

## K-011: Android edge-to-edge (SDK 53+ デフォルト) で root view が透ける → `expo-system-ui.setBackgroundColorAsync` を root file の top-level で呼ぶ

- **状況**: PR #11 (Phase 1.2) で Android Expo Go SDK 54 で起動するとシステムナビバー周辺が白く透けた。`SafeAreaProvider` / `SafeAreaView` の bg は適用されているのに、最下部だけ白い。
- **問題**: Android edge-to-edge がデフォルト ON のため、システムナビバーは透明で背後のアプリ色が透ける。`SafeAreaView` の bg は JS レイヤの View なので native root view までは届かない。
- **原因**: `userInterfaceStyle: 'dark'` だけでは native root view の bg が制御できない。RN の `SafeAreaProvider` / `SafeAreaView` は JS 階層の bg であり、Android 12+ の透明ナビバー越しに透けるのは native root view。
- **解決**: `expo-system-ui.setBackgroundColorAsync('#16161A')` を `App.tsx` の module top-level (コンポーネント外) で呼ぶ。`expo-system-ui` の JSDoc が公式に「root file outside of your component」と推奨。Promise は `void` で意図的に握り潰す。
- **教訓**: ダークテーマアプリで Android を触るときは `userInterfaceStyle` だけでは透けが残る。SDK 53+ の edge-to-edge 既定挙動を前提に `expo-system-ui` を 1 行入れるパターンを使う。Phase 1.5/1.6 で別ダークサーフェスを足す場合も同じ対処。

## K-012: Metro バンドルキャッシュで古い JS が動く → 「コード変えたのに動きが変わらない」を見たら最初に `--clear`

- **状況**: PR #11 で `App.tsx` を書き換えてから Expo Go で起動したが、PR-1.1 と同じ画面 (マーカーなし / タップ無反応) のままだった。Metro が古いバンドルを serve していた。
- **問題**: `npx expo start` を再起動せず、また `--clear` も付けないと、Metro のキャッシュが効いたままで JS 変更が反映されない。ユーザーから見ると「実装したはずなのに動かない」となり、コード起因のバグを疑って時間を浪費する。
- **原因**: Metro はバンドル成果物を `.expo/` 配下にキャッシュする。`npx expo start` 再起動しても Metro 自身のメモリキャッシュは無効化されるが、ファイルキャッシュは残る。
- **解決**: 「コード変えたのに動きが変わらない」を見たら最初に Metro キャッシュを疑う。`Ctrl+C` で停止 → `npx expo start --clear` で再起動 → Expo Go で Reload。これで直れば原因確定。
- **教訓**: Phase 1 では `expo install` / SDK 設定変更 / ファイル切り出しが頻発するので、Metro キャッシュ起因の「動かない」を踏むことが繰り返される。デバッグ第一手として `--clear` を反射神経にする。PR ブランチ切替時 (Phase 内で feature/PR-1.x を行き来する場合) も要注意。

## K-013: SVG の円マーカーは stroke 外側マージンを viewport で予約しないと左端クリップする

- **状況**: PR #13 (Phase 1.3) で `<Circle cx={SPINE_X} cy={...} r={7} strokeWidth={1.5}>` を最小幅の `<Svg width={SPINE_COLUMN_WIDTH}>` 内に配置。当初 `SPINE_X=7` だったが、実機で円の左端が縦に切れた。
- **問題**: react-native-svg は `<Svg>` の `width/height` を viewport として扱う。`cx=7, r=7, stroke=1.5` だと実描画範囲は `x = 7 - 7 - 0.75 = -0.75` まで広がるが、viewport 外なのでピクセル境界で左端 0.75px 分が clip される。
- **原因**: SVG の stroke は path 中心線から両側に広がる。`strokeWidth=1.5` の半分 0.75 が円周の外側に出る。CSS の overflow と違って viewport 内に押し込まれるとは限らない。
- **解決**: `SPINE_X >= MARKER_RADIUS + strokeWidth/2 + safety` で計算。PR #13 では `SPINE_X = 9` (= 7 + 0.75 + 余裕 1.25) で解消。コード側 (TodayScreen.tsx) にも 1 行コメントで残すべき (PR-1.4 着手時の Minor 指摘で対応予定)。
- **教訓**: SVG マーカーを最小幅の `<Svg>` に配置するときは `cx >= r + strokeWidth/2 + safety` を満たすこと。`MARKER_RADIUS` か `strokeWidth` を変えるときは `SPINE_X` 連動を確認する。Phase 1.5 のノックモーション（線の伸びアニメ）で stroke を変えるときに踏みやすい。

## K-014: 実機実使用 → SPEC 改訂は早期検証ゲートの正規ルート (ADR-0010 が実例)

- **状況**: PR #13 (Phase 1.3) で SVG スパインを実装し、実機で初めて「飛ばすと線が切れる」挙動を見て Augmentation 原則との齟齬に気づいた。机上の SPEC / ADR レビューでは出てこなかった違和感。
- **問題**: 設計時に「ゆるい連鎖判定なのに線は連続実行範囲」という不整合を見抜けなかった。抽象モデル上の整合性検証 (SPEC レビュー) は、ビジュアルの印象整合性まで保証しない。「マーカー単位は独立だが線が連続性を要求している」状態は実機で目視して初めて違和感として認識される。
- **原因**: SPEC レベルの言葉ベース整合性チェックでは「ビジュアルがマイナスを指差していないか」が検証できない。実機を触る前に判定するのが構造的に難しい。
- **解決**: 実機で違和感を覚えたら ADR を超えて SPEC を改訂してよい。本 PR では (1) SPEC §2 と DESIGN-SYSTEM §4.1 を実装と同 PR で改訂、(2) 改訂理由を ADR-0010 として残し、影響を受ける ADR-0009 と SPEC / DESIGN-SYSTEM に双方向リンクを張った (K-005 ルール遵守)。
- **教訓**: 早期検証ゲート ([ADR-0006](docs/decisions/0006-phase1-completion-and-scope-narrowing.md)) は「実装後の違和感→ADR 改訂」を正規ルートとして許容する。Phase 1.4-1.6 でも同じパターンが出る可能性があり (手動発火 UI / 自動発火 / 場所登録 UI)、「触ってみて違和感→ADR」のフローを禁忌にしない。K-003 「UI はモデル検証の道具として安く回す」と同じ精神。

## K-015: ADR の「正準データは X のみ」全称禁則を後続 ADR で軸別に拡張するパターン

- **状況**: [ADR-0001](docs/decisions/0001-chain-data-model.md) §決定4 で「永続化される正準データは `(ノード, 日付, bool)` のみ」と書いていたが、Phase 1.6 で「アンカー発火イベント」という別軸の事実 (派生値ではない) を保存する必要が出てきた。
- **問題**: 文字通り読むと ADR-0001 の禁則条文に抵触する。supersede するほどではない (達成側の不変条件は維持される) が、片側リンクだけだと ADR-0001 単体読みで誤誘導される (K-005 の問題)。
- **原因**: 初期 ADR の禁則条文を「他のすべての保存を禁じる絶対句」として書いてしまった。後で別軸の事実が出てきたとき、再解釈の余地が条文に組み込まれていない。
- **解決**: 新規 ADR ([ADR-0012](docs/decisions/0012-anchor-firing-events.md)) で「ADR-0001 §決定4 を **ノード達成側の話** と再解釈」を明示し、ADR-0001 側にも逆参照 1 行を追加 (K-005 適用)。SPEC.md / CLAUDE.md の同期更新もセット。テーブルとしては別軸 (`achievements` / `anchor_firings`)、判断系譜としては双方向リンクで辿れる。
- **教訓**: 「正準データは X のみ」のような全称禁止条文を書くときは、将来 X とは別軸の事実が出てきたら「軸別に分離して両者を共存させる」運用ルールを判断ログ運用に組み込む。ADR-0012 がそのテンプレ。新規 ADR で「先行 ADR §N を Y 側に限定の話として再解釈」+ 双方向逆参照 + 同期更新がセット。

## K-016: 1 回発火イベントモデルは Augmentation 原則「離脱を指差さない」と整合する

- **状況**: Phase 1.6 で場所アンカーを実装した当初、「範囲内なら発火中 / 範囲外なら非発火」の動的派生で UI を組んだ。
- **問題**: ユーザーが範囲を出るとピルが消える挙動になり、「離脱を指差すビジュアル」になっていた。Celebrate 主の核 ([CLAUDE.md](CLAUDE.md) §Augmentation 原則 / [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §0) と微妙に逆向き。
- **原因**: 状態モデル (動的派生) とイベントモデル (1 回発火) を区別せずに、自然な実装である動的派生から入った。動的派生は「現在の状態」を可視化するため、ネガティブな状態 (範囲外 / 時刻巻き戻し) も等しく可視化してしまう。
- **解決**: 「観測した事実 (発火が起きた)」だけを残し、「現在の状態 (範囲外)」を派生に出さない。一度発火した祝福がその日続く。[ADR-0012](docs/decisions/0012-anchor-firing-events.md) で時刻/場所共通の「1 日 1 回の不可逆発火」モデルに統一。`anchor_firings` テーブルに観測した事実を保存する。
- **教訓**: Celebrate 主の UI を作るとき、「**状態** (今 X なら Y を表示)」より「**不可逆イベント** (X が起きたら以後 Y を表示)」のモデルが原則と整合しやすい。状態モデルを使う場合は「ネガティブ側 (X でなくなったら Y を消す)」を慎重にチェック。Phase 2 以降で同じ判断点が出たら本パターンを参照。

## K-017: GPS / 重い非同期処理は base load から分離 → 非同期マージ + cancelled で unmount race ガード

- **状況**: Phase 1.6 初期実装で `useTodayData.loadToday` の中で `getCurrentPosition()` を同期実行していたら Today のローディングが 20-30 秒 block した (focus 復帰のたびに GPS 取り直し)。
- **問題**: ローディング状態を 1 つにまとめてしまうと、最も遅い処理に引きずられる。base data (チェーン・アンカー・達成記録) は < 100ms で取れるのに、GPS で全体が block される。
- **原因**: 「単一のローディング状態」で全データを丸めて await する設計。React Native でも Web でも同じ罠を踏みやすい。
- **解決**: `loadToday` は base data だけ取って即 `setData` → `setLoading(false)`。GPS は base 表示後に非同期で取り、結果を `setData((prev) => prev ? { ...prev, anchorFiredToday: true } : prev)` でマージ。unmount race は `cancelled` フラグで防ぐ。「一度発火後は GPS skip」最適化も発火イベント DB ([ADR-0012](docs/decisions/0012-anchor-firing-events.md)) で構造的に解決。
- **教訓**: 重い非同期処理 (GPS / 大量 IO / 外部 API) は base load から分離する。ローディング状態を 1 段に丸めず、必要なら段階的に解決する。`cancelled` フラグは `useFocusEffect` / `useEffect` のセオリーとして必ず入れる。Phase 2 で別の重い非同期 (例: Notion API 連携) が出てきたら同じパターンを適用する。

## K-018: test env (better-sqlite3) と prod env (expo-sqlite) で FK 制約のデフォルト挙動が違う

- **状況**: PR #17 で `anchor_firings.anchor_id REFERENCES anchors(id)` を宣言した状態で、「存在しない anchor_id で `recordAnchorFiring` を呼んだら何が起こるか」のテストを書いた。
- **問題**: テスト (better-sqlite3) は `FOREIGN KEY constraint failed` で reject されたが、prod (expo-sqlite / vanilla SQLite) は **デフォルト `PRAGMA foreign_keys=OFF` で orphan record が静かに通る**。つまり「test では制約違反として弾かれるが prod では通る」という乖離が発生する。
- **原因**: better-sqlite3 はデフォルトで `foreign_keys=ON`、vanilla SQLite (expo-sqlite を含む) はデフォルトで OFF。両者は別々の C ライブラリビルドで歴史的にデフォルトが違う。[ADR-0008](docs/decisions/0008-test-strategy-ts-jest-bettersqlite.md) でテストに better-sqlite3 を採用したが、この挙動差は ADR-0008 着手時に意識していなかった。
- **解決**: 当面は test env での挙動 (FK on で reject) をテストで固定 + コメントで「prod env では orphan record が通る」と注意喚起。Phase 2 でチェーン / アンカー削除を実装するときに `PRAGMA foreign_keys=ON` 有効化 + 全リレーションに `ON DELETE CASCADE` を足すかを判断する。`src/db.ts` SCHEMA_SQL §冒頭にもコメント記載。
- **教訓**: K-006 のスキーマ不変条件テストは「スキーマ定義の存在」を機械検証するが、「FK 制約が実際に強制されるか」のレイヤーは test/prod 環境差で乖離しうる。同種の test/prod 差を踏まないために、SQLite の `PRAGMA` 設定差・トリガーの有無・ビューの定義差などはレビュー観点として持っておく。
- **追記 (PR-1.8a)**: ADR-0014 で CRUD を Phase 1.7-1.8 に前倒し、PR-1.8a で構造的に解決: (a) `db.expo.ts` の client factory で接続時に `PRAGMA foreign_keys = ON;` を毎回明示発行 (better-sqlite3 は元から ON)、(b) `ON DELETE CASCADE` を `nodes.chain_id` / `achievements.node_id` / `anchor_firings.anchor_id` の 3 リレーションに付与、(c) `chains.anchor_id` は 1-1 専属で CASCADE せず repository.deleteChain が同 TX で anchor を消す、(d) FK 強制と CASCADE の存在を `PRAGMA foreign_key_list` 経由でスキーマ不変条件テスト (K-006) に組み込み。

## K-019: 3 サイクルで消えない UI バグは library 責務を疑い、入れ替えを選択肢に入れる

- **状況**: PR-1.7a で `react-native-draggable-flatlist` を採用し、ノード並び替えのチラつき (ドラッグ中のアイテムが一瞬上下にスライドして見える) を 3 回の修正試行 (rAF defer / memo 比較関数で `drag` を除外 / ScaleDecorator 撤去) で消そうとしたが、実機で全く解消しなかった。
- **問題**: 自分のコード側で吸収できる範囲を超えていることに気付くのが遅れ、修正試行の往復で時間を消費した。CLAUDE.md §迷走検知ルールの「同一ファイルを 3 回以上編集」に該当していたが、library 起因という仮説に切り替えるトリガーが弱かった。
- **原因**: DnD の swap モーションは library 内部の cell layout 制御 (active セル高さ 0 化 + placeholder 挿入) に閉じている。setState タイミングや memo の整合性で吸収できる範疇を超えていた。
- **解決**: 動画を 0.05 秒間隔でフレームキャプチャして症状を直接観察 → library 内部挙動が原因と判定 → reanimated v4 worklet ベースの [react-native-reorderable-list](https://github.com/omahili/react-native-reorderable-list) に置換 (PR #22) で根治。
- **教訓**: 「3 サイクル試して消えない UI バグ」は library 責務の可能性を最初に疑う。修正試行ではなく **library の挙動を動画で観察** することに移る。次回似た判断点 (carousel / bottom-sheet / swipe-to-delete 等の DnD 系 library 選定) で同じパターンを踏まないために、選定時は公式 example の動画 / Expo Go 実機を必ず触る + reanimated v4 worklet ベースを優先する。CLAUDE.md §迷走検知ルールに「3 サイクルで消えない UI バグ → library 入れ替えを選択肢に」を実例として追記する候補。

## K-020: 「フォーム + DnD リスト」は List を画面 root に置き、編集 UI を ListHeader/Footer に集約する

- **状況**: PR-1.7b でチェーン編集画面に DnD を導入したとき、当初は `ScrollView` でフォーム全体を包んでその中に DnD リストを置こうとした。
- **問題**: `ReorderableList` (および `FlatList` / `DraggableFlatList`) は `ScrollView` 内に置けない。reanimated worklet の scroll handler が親 ScrollView と衝突し、DnD ジェスチャが効かない / scroll が二重に発火する。
- **原因**: RN の VirtualizedList 系は親 ScrollView と scroll コンテキストを共有できない構造的制約。reorderable-list は `NestedReorderableList` という別 API を提供するが、複雑度が上がるので避けたい。
- **解決**: `ReorderableList` を画面 root に置き、編集 UI 全体 (タイトル入力 / アンカー編集 / アクション追加ピッカー) を `ListHeaderComponent` / `ListFooterComponent` に集約。Header は `useMemo` でラップするが、parent route の inline callback (`onCancel={() => router.back()}` 等) が deps を毎レンダ壊すので memo 効果は限定的 — 描画コストが許容できるなら諦める判断も明示すべき (K-010 同型: 暗黙にしない)。
- **教訓**: 「フォーム + DnD」「フォーム + リスト」を 1 画面で組むときの正規パターン: (a) リストを画面 root に、(b) 編集 UI を Header / Footer に集約、(c) Header / Footer の useMemo の deps は親 route の inline callback で壊れがちなので、route 側で `useCallback` 化するか memo を諦めるかを明示判断する。Phase 2 以降で「目標ビュー」「アクション編集」等の同型画面を組むときも同じパターン。

## K-021: `CREATE TABLE IF NOT EXISTS` だけでは schema 変更は反映されない → `PRAGMA user_version` で migration を入れる

- **状況**: PR-1.8a で `ON DELETE CASCADE` 句を schema に追加し、テストでは全 30 件 pass。実機でも JS リロードのみで動くはずだった。
- **問題**: 実機 (Expo Go) で「FOREIGN KEY constraint failed」発生。既存 DB ファイル (`knockon.db`) は Phase 1.7 までの古いスキーマ (CASCADE なし) で作成済みで、`CREATE TABLE IF NOT EXISTS` は既存テーブルがあるとスキップするため CASCADE 句が反映されない。そこに `PRAGMA foreign_keys=ON` だけが新規有効化されたため、古いデフォルト RESTRICT で削除が拒否された。
- **原因**: テスト env (`createBetterSqliteClient(':memory:')`) は毎回新規 DB なのでこの問題に遭遇しない。テストでは全 pass するのに prod で破綻する典型 (K-018 と同型の test/prod 環境差)。
- **解決**: `PRAGMA user_version` でスキーマバージョン追跡を導入。`SCHEMA_VERSION` 定数 + `initSchema` で `current < SCHEMA_VERSION` なら全テーブル DROP → CREATE → user_version 更新。Phase 1 N=1 開発中なので「drop + recreate」で十分 (試作データの再作成は許容)。
- **教訓**: SQLite の `CREATE TABLE IF NOT EXISTS` だけに依存する schema は「初回作成時しか反映されない」性質を持つ。`REFERENCES` 句 / CHECK 制約 / `UNIQUE` 等の変更は migration なしには既存 DB に反映されない。`PRAGMA user_version` ベースの単純 migration は Phase 1 N=1 で十分。Phase 2 で履歴が必要になれば ALTER TABLE 系に拡張。K-006 のスキーマ不変条件テストは「scheme 定義の存在」を機械検証するが、「既存 DB ファイルに対する migration が走るか」までは検証できない (K-018 と同じ test/prod 差の限界事例)。
- **追記 (ADR-0027)**: 検証期間 ([ADR-0022](docs/decisions/0022-phase-1-completion-and-verification-operation.md)) でユーザーが運用データを蓄積し始めたため、 「drop+recreate」だと毎 PR でデータ消失する不便が顕在化。 ADR-0027 で **v4 (= PR-CC 後) 以降は ALTER ベース migration** に切替。 v1-v3 範囲は drop+recreate を維持 (= 試作期間扱い)、 v4 以降は `MIGRATIONS: Record<number, Migration>` を順次適用 + データ保全。 教訓の更新: 「`CREATE TABLE IF NOT EXISTS` で不足 → drop+recreate **か** ALTER」の判断は **データの蓄積フェーズ** で切替える (= 試作期間中は drop+recreate、 検証期間以降は ALTER)。

## K-022: 「同 TX」のような実態を伴わない用語をコメントで使わない

- **状況**: PR-1.8a で `deleteChain` のコメントに「同 TX 内で消す」と書いたが、実際は `BEGIN/COMMIT` で囲まれていない 2 段の独立 `db.run` だった (リポジトリ全体に TX 抽象がない / persistChainDraft と整合)。
- **問題**: コメントの文言が実装の保証を上回ると、後続のレビュアー / 実装者が「ここはアトミック」と誤読する。Phase 2 で別のマルチ DELETE を追加するとき、同じ書き方が伝播するリスク。レビューで指摘されて修正。
- **原因**: 「TX で囲んだほうが安全」という設計意図を、実装と区別せずにコメントで書いてしまった。
- **解決**: コメントを「続けて発行する。失敗時の orphan は受容する」と書き換え、K-010 (楽観更新パターンの判断明示) と同じ原則で「受容する」判断であることを明示。
- **教訓**: 用語の保証レベルを実装と一致させる。トランザクション抽象が無いコードベースでは「順に発行」「失敗時は orphan を受容する」のように、保証していないことを明示的に書く。本気でアトミックにしたいなら `DbClient.transaction()` をまず生やす。レビュー観点として「コメントの用語が実装と一致しているか」を持つ。

## K-023: RESTRICT を活かすバリデーションは 2 段クエリで TOCTOU 残る (Phase 1 受容 / Phase 2 で TX 化判断)

- **状況**: PR-1.8b で `deleteAction` に「使用数 COUNT → 0 件なら DELETE」の 2 段クエリを書いた。UX 上「使用中のため削除できません」を明示メッセージで返すための先回りバリデーション。
- **問題**: COUNT と DELETE の間に別経路 (他チェーンの編集 / マルチデバイス同期 / 並行操作) が同アクションを使い始めると、「使用 0 件 → DELETE 通る → 直後に orphan record」になる TOCTOU レースが理論上残る。
- **原因**: アプリ層でバリデーションを再実装すると、DB の RESTRICT が裏で守ってくれる保証と二重管理になり、prod env の状態を SELECT 時点と DELETE 時点で「同じ」と仮定する暗黙の前提が入る。
- **解決**: Phase 1 N=1 では並行操作経路がなく実害なし → 受容。コメントで「Phase 2 でマルチデバイス同期 / 並行操作が出るタイミングで BEGIN/COMMIT で囲むか判断する」を明示 (K-010 / K-022 の受容判断ルール継承)。
- **教訓**: 「DB 制約 + アプリ層先回りバリデーション」のパターンは Phase 1 単機運用なら受容できるが、並行性が増える瞬間に TOCTOU が顕在化する。「いつ TX 化するか」のトリガー (マルチデバイス同期 / バックグラウンド処理 / Webhook 等) を予め持っておく。

## K-024: repository から UI 表示文字列を throw するのは Phase 1 受容パターン (Phase 2 で error code 化)

- **状況**: PR-1.8b の `deleteAction` で `throw new Error('このアクションは N 個のノードで使用中のため削除できません')` と repository 層が UI 文面そのままの error.message を返している。
- **問題**: ドメイン / repo 層が UI 表示文字列を持つのは責務越境。Phase 2 で i18n / 複数 UI (CLI / 通知文面) を持つときに、repository の error.message を 1 箇所変えると複数 UI に波及する。
- **原因**: Phase 1 の単純さを優先し「型を増やすコスト」より「直接 throw する readability」を取った。Phase 1 N=1 では i18n / 複数 UI なしで実害なし。
- **解決**: 受容。コメントで「Phase 2 で i18n や通知文面が必要になったら error code 化 (`{ kind: 'in_use', count: N }`) に refactor」を明示。
- **教訓**: Phase 1 の prototype フェーズでは「UI 文面を repository に持つ」「error message を i18n キーで返さない」が一時的に許される。Phase 2 で別 UI / 通知 / 自動化が増える前に refactor 判断。本質は「責務分離は Phase 1 では負債を受容、Phase 2 で清算」のパターンとして Phase 2 着手前に再確認する。

## K-028: builtin マスタを DB 化したとき、 外部連携の重複判定は「DB 内 key 集合」ではなく「外部から来うる key 全集合」を基準にする

- **状況**: PR-CC (ADR-0026) でメトリクス種別 (weight / exercise_minutes / sleep_hours) を builtin 定数から DB マスタ化。 ユーザーが種別を削除可能になった。
- **問題**: Notion 連携 (PR-Z3b) の重複判定で `listMetricKinds(db)` 経由の existing 集合を作っていたら、 ユーザーが builtin (例: weight) を削除した瞬間に「DB 内 key 集合」から weight が消えるが、 Notion から weight pages は依然取り込まれる (= candidate には残る、 mapNotionPagesToMetrics は `BUILTIN_METRIC_KINDS` ベース)。 重複判定の基準が候補集合と乖離 → cold start ごとに同じ pages を毎回 insert する累積バグ。
- **原因**: 「DB マスタ化 = アプリの真実」と思いがちだが、 外部連携の正規化 (= 取り込み対象とする key 集合) は外部側 (Notion DB の property name) に依存する。 アプリ側で削除しても外部から来うる record は止まらない。
- **解決**: 重複判定の existing key 集合を、 mapping の入口で使う集合 (= 外部から来うる集合) と同じにする。 本 PR-CC では `BUILTIN_METRIC_KINDS` の key 集合に揃えた。
- **教訓**: 「マスタ DB 化」+「外部から fresh record が来る連携」がある場合、 重複判定の key 集合は **mapping の入口で使う集合と同じにする**。 「DB 内 = 真実」と取ると、 削除可能性 × 外部 fresh データの組み合わせで累積バグになる。 Phase 2 で Slack / Asana / Notion Tasks 連携を追加するときに同型を踏みやすい。 ルール: 連携の重複判定 existing は **連携層が認識する key 集合**で組む (= mapNotionPagesToMetrics 系の METRIC_KEYS と同じ source)。

## K-026: `setNotificationHandler` の global 設定は foreground の個別通知 sound を上書きする

- **状況**: PR-BB (ADR-0025) でタイマー完了時に `Notifications.scheduleNotificationAsync({ content: { sound: true } })` で音を鳴らそうとした。
- **問題**: 既存 `app/_layout.tsx` の `setNotificationHandler` が `shouldPlaySound: false` を返す設定 (PR-1.5b-3 で foreground 通知は Toast 一本にした判断)。 foreground 通知では handler の戻り値が個別 `sound: true` を上書きするため、 タイマー完了で音が鳴らない (= ADR-0025 案 P の核心要件が機能しない)。
- **原因**: Expo の foreground notification handler は global で、 個別の通知 content よりも優先される仕様。 ADR で「個別 sound: true で OK」と書いたが Expo 仕様への理解が浅かった。
- **解決**: 通知に `data: { kind: 'timer-complete' }` を付与し、 `setNotificationHandler` 内で `kind` 別に分岐して `shouldPlaySound` を動的に返す。 タイマー通知だけ音を鳴らし、 他の通知は従来通り Toast 一本で。
- **教訓**: 「タイマー / リマインダ / アラート」のように foreground でも音を鳴らしたい通知種別が出てきたら、 `data.kind` で分類して handler を分岐する設計が安全。 「個別の通知 content で sound: true を指定すれば鳴る」という想定は foreground では成立しないことを覚えておく。 Phase 2 で別種の通知 (e.g. ハビット休眠アラート) を追加するときに同じ罠を踏むリスクあり。

## K-027: 「自動達成」を意味する API は `toggle` ではなく明示的な `markAchieved(achieved)` を別に持つ

- **状況**: PR-BB (ADR-0025) でタイマー完了時に「自動達成」を実装するため `onToggleNode(chainId, nodeId)` を呼んだ。
- **問題**: `handleToggle` (`src/useTodayData.ts`) は `toggleAchievementInMap` で **bool 反転** semantics。 ユーザーが先にノードをタップ→達成済 → タイマー起動して完了 → `onToggleNode` 呼び出しで **未達成に戻る**バグ。 「タイマー集中タイムを再走したい」シナリオで顕在化する。
- **原因**: トグル意味の関数を「達成にする」用途で使い回した。 副作用 (= bool 反転) を持つ関数の semantics と呼び出し意図 (= force set true) のミスマッチ。
- **解決**: `markNodeAchieved(chainId, nodeId, achieved: boolean)` を別 API として `useTodayData` に追加 (force set semantics)。 タイマー完了は `markNodeAchieved(..., true)`、 ユーザータップは `handleToggle` のままで分離。
- **教訓**: トグル系 API (反転) と force set 系 API (絶対値設定) を明確に分ける。 自動化系 (場所発火→達成、 通知タップ→達成、 タイマー→達成 等) を追加するときは必ず force set を使う。 Phase 2 で同型を踏まないため、 ADR-0025 §決定の中で「force set 必須」を明示。 K-010 「楽観更新の判断明示」と同型の運用ルール (= semantics と呼び出し意図の対応を暗黙にしない)。

## K-025: Expo モジュール追加は `npx expo install` を使う、 `npm install` だと SDK 非互換版が入る

- **状況**: PR-1.5b-2 で `expo-notifications` を追加する際、 `npm install expo-notifications` を実行した。 `package.json` には `^56.0.13` が記録された。
- **問題**: 実機 (Dev Client) 起動時に `NoClassDefFoundError: Failed resolution of: Lexpo/modules/kotlin/types/AnyTypeCache;` が発生。 アプリが起動できない。 EAS Build 自体は通る (JS / type-check は通っているので)。
- **原因**: `^56.0.13` は SDK 55+ 向け expo-notifications。 本プロジェクトは SDK 54 で、 互換 native API は `~0.32.x` 系。 `npm install` は最新版を入れるだけで Expo SDK バージョンとの互換性を見ない。
- **解決**: `npm uninstall expo-notifications` → `npx expo install expo-notifications` で SDK 54 互換版 `~0.32.17` に置換。 EAS Build を再実行 + 新 apk を実機に再 install。
- **教訓**: **Expo 公式モジュール (`expo-*` / Expo plugin を要求するもの) を追加するときは必ず `npx expo install <module>` を使う**。 `npm install` は SDK 非互換版を入れうる。 [K-009](#k-009) (`expo install` の副作用) と本 K-025 (`expo install` を使わない副作用) は表裏一体で、 SDK 互換版選定のために K-009 の副作用は受容する。 失敗シグナル: 実機で `NoClassDefFoundError` / `Cannot find native module` が出た場合は SDK 互換性を最初に疑う。
