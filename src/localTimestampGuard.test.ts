import { readFileSync } from 'fs';
import { join } from 'path';

// #273: 永続化する時刻は必ずローカル壁時計 (`localIsoTimestamp`) で書く。
//
// #109 で `metrics.recorded_at` を直したが、同じ `new Date().toISOString()` パターンが
// 他に 5 箇所残っていた (Simulator の QA で DB を直接読んで発見)。特に
// `settlement_retractions.retracted_at` は `domain.ts` の `lastRetractionDateForNode` が
// `slice(0, 10)` で日付部を取り、**ローカル日付である達成日と比較する**ため、UTC で
// 保存すると JST 00:00〜08:59 の取り下げが前日扱いになり定着判定が狂う。
//
// 個別に直しても 4 度目が起きるので、K-006 (ハードガードレールのテスト固定) と同じく
// **機械的に禁止**する。人間の注意力に頼らない。
//
// 対象外 (意図的に UTC のまま):
// - `chainExport.ts` の `exportedAt` — 外部へ渡すエクスポート形式。ISO8601 (Z 付き) が正しい
// - `seed.ts` / `screenshotSeed.ts` — dev 専用で出荷経路に乗らない
// - `domain.ts` — コメント内での言及のみ

const FILES_REQUIRING_LOCAL_TIMESTAMPS = [
  'useNotesData.ts',
  'useAnalyticsData.ts',
  'useTodayData.ts',
  'useMetricsData.ts',
  'chainEditPersist.ts',
];

const read = (name: string): string =>
  readFileSync(join(__dirname, name), 'utf8');

describe('永続化する時刻はローカル壁時計で書く (#273 / #109)', () => {
  test.each(FILES_REQUIRING_LOCAL_TIMESTAMPS)(
    '%s が toISOString を使っていない',
    (name) => {
      const src = read(name);
      // コメント行は除外して実コードだけを見る (経緯の説明で言及することがある)。
      const code = src
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
      expect(code).not.toContain('toISOString');
    },
  );

  test.each(FILES_REQUIRING_LOCAL_TIMESTAMPS)(
    '%s が localIsoTimestamp を import している',
    (name) => {
      const src = read(name);
      // 時刻を書かないファイルが将来この一覧に入ることは想定していないため、
      // import の存在も固定する (削除されたら気付ける)。
      expect(src).toContain('localIsoTimestamp');
    },
  );
});
