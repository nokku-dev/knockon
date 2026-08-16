// ADR-0056: user-facing なプロダクト名の唯一の出所。
//
// CLAUDE.md §プロジェクト固有の注意点 6: 「プロダクト名 `knockon` を user-facing
// 文字列にハードコードせず 1 箇所に集約」。実際に `notifications.ts` の夜サマリ通知
// タイトルが直書きになっていた (ADR-0056 で発見)。
//
// ⚠ 表示は Title Case (`Knockon`)、コード上の識別子・リポジトリ名・バンドル ID・
// slug は小文字 (`knockon`) のまま。**ここは表示側だけ**を扱う。
//
// app.json の `expo.name` (= CFBundleDisplayName / Android app_name) と一致すること
// を `productName.test.ts` で固定する (二重 truth source を値で担保する)。
export const PRODUCT_NAME = 'Knockon';
