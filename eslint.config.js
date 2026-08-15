// #294: ESLint 設定 (flat config)。
//
// 背景: `eslint-disable` コメントが 6 箇所あるのに ESLint 自体が入っていなかった。
// 抑制だけが書かれていて、抑制する対象が動いていない状態だった。
//
// ⚠ **掃除のためではなく、今後の歯止めとして入れる。** 導入時点の実装コードの指摘は
// 8 件で、いずれも未使用 import / 未使用引数。ルールは「これから入る汚れを止める」ために
// ある (CLAUDE.md に規約として書くより、機械が落とす方が確実で安い)。
//
// ベースは `eslint-config-expo`。SDK 54 のピン (`node_modules/expo/bundledNativeModules.json`
// の `"eslint-config-expo": "~10.0.0"`) に合わせている。react / react-hooks / import /
// @typescript-eslint のプラグインを同梱するので、個別に足さない。

const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // #294 の再発防止そのもの: **抑制コメントだけが残る**状態を禁止する。
    // このリポジトリには ESLint 未導入のまま `eslint-disable` が 6 箇所書かれていた
    // (= 抑制する対象が動いていない)。ルールを外したり不要になったりしたときに
    // 抑制だけが残ると、また同じ「効いていない抑制」が積む。
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      // 使い捨て前提のデザイン参照 HTML (SPEC / DESIGN-SYSTEM 側が実装の規範)。
      'reference/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 未使用の import / 変数。ADR-0040 の module モデル撤去のような「撤去したが
      // import が残る」を機械で落とす。`_` 始まりは意図的な未使用として許す
      // (props の一部だけ使う callback で実際に使っている)。
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // ADR-0053 §1 の「記録内容を送らない」は SafeValue の型で守っているが、
      // `as any` で迂回されると型の防御線が消える。実装コードの any は現状 0 件。
      '@typescript-eslint/no-explicit-any': 'error',
      // console はテスト時に紛れやすい。analytics.ts の __DEV__ 分岐だけが例外で、
      // そこは既に eslint-disable コメントが書かれている (今回それが実際に効くようになる)。
      'no-console': 'warn',
    },
  },
  {
    // テストは fixture 構築で require / any を使う箇所があり、出荷経路には乗らない。
    // 実装コード側の厳しさだけを保つ。
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // jest.mock のファクトリは import より前に置く必要がある (ファクトリ内から
      // 参照する mock 関数を先に定義するため)。この並びは意図的なので import/first は
      // テストでは無効にする。実装コードでは有効なまま。
      'import/first': 'off',
      // テスト内の inline mock コンポーネントに displayName は要らない。
      'react/display-name': 'off',
    },
  },
  {
    // scripts/ は Node で直接実行する運用スクリプト (tsc の対象外)。
    // Buffer 等の Node グローバルを未定義扱いにしない。
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: require('globals').node,
    },
  },
];
