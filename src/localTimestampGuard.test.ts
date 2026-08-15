import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

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
// ── #292: この検査自体が漏れていた ─────────────────────────────────────────
//
// 旧実装は `src/` 配下 5 ファイルの**ハードコードされたリスト**を検査していた。
// 守るべき条件は普遍的 (「永続化する時刻すべて」) なのに、検査は列挙だった。
// その差は一度も明示されず、リストの外にある `app/discover.tsx` /
// `app/onboarding.tsx` の 3 箇所が `chains.created_at` に UTC を書き続け、
// テストは緑のままだった (テンプレ採用と手動作成のチェーンで並び順が JST で 9 時間ずれる)。
//
// さらに旧実装は `readFileSync(join(__dirname, name))` だったため、リストに
// `../app/discover.tsx` を足しても `src/` 起点でしか解決できず**リストへの追加では
// 閉じられなかった**。よって列挙を反転し、以下の形にする:
//
//   1. `src/` と `app/` を**全走査**する (新規ファイルは自動で検査対象に入る)
//   2. 除外は ALLOWED_UTC に**明示的に挙げたものだけ**
//   3. 走査が空振り (対象 0 件・パターン不一致) したら fail させる
//      = 「検出 0 件」が「違反なし」なのか「検査が壊れている」なのかを区別できるようにする
//
// 参考: nokku-ops ADR-0078 (「列挙による検査は列挙漏れを検出できない」)。

const REPO_ROOT = join(__dirname, '..');
const SCAN_ROOTS = ['src', 'app'];

// UTC (`toISOString`) を使ってよいファイル。**ここに挙げたものだけが除外される。**
// 追加するときは「なぜ UTC が正しいか」を必ず書くこと。
const ALLOWED_UTC: readonly { path: string; reason: string }[] = [
  {
    path: 'src/chainExport.ts',
    reason: '外部へ渡すエクスポート形式。ISO8601 (Z 付き) が正しい',
  },
  {
    path: 'src/seed.ts',
    reason: 'dev 専用で出荷経路に乗らない',
  },
  {
    path: 'src/screenshotSeed.ts',
    reason: 'dev 専用 (SEED_SCREENSHOT_DATA=false) で出荷経路に乗らない',
  },
];

const ALLOWED_PATHS = new Set(ALLOWED_UTC.map((a) => a.path));

// 永続化する時刻を実際に書いている箇所。全走査 (負の検査) の補助として、
// 「localIsoTimestamp を使い続けていること」を正の側からも固定する。
// ⚠ このリストは**主検査ではない**。リストが漏れても上の全走査が違反を捕まえる。
const KNOWN_PERSISTENCE_SITES = [
  'src/useNotesData.ts',
  'src/useAnalyticsData.ts',
  'src/useTodayData.ts',
  'src/useMetricsData.ts',
  'src/chainEditPersist.ts',
  'app/discover.tsx',
  'app/onboarding.tsx',
];

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // テストは fixture で任意の時刻を作るため対象外。
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
};

const scannedFiles = SCAN_ROOTS.flatMap((root) =>
  listSourceFiles(join(REPO_ROOT, root)),
).map((full) => relative(REPO_ROOT, full).split(sep).join('/'));

const readSource = (repoRelativePath: string): string =>
  readFileSync(join(REPO_ROOT, repoRelativePath), 'utf8');

// 経緯の説明で `toISOString` に言及することがあるため、コメント行は除いて実コードだけを見る。
export const stripComments = (src: string): string =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const usesToIsoString = (src: string): boolean =>
  stripComments(src).includes('toISOString');

describe('永続化する時刻はローカル壁時計で書く (#273 / #109 / #292)', () => {
  // ── 検査器そのものの検証 ───────────────────────────────────────────────
  // 「検出 0 件」が「違反なし」なのか「検査が壊れている」なのかを区別する。

  describe('検査器が機能していること', () => {
    test('走査対象が空でない (glob / パス解決の壊れを検出する)', () => {
      // 旧実装は `join(__dirname, name)` で `app/` を解決できなかった。
      // パス起点を間違えると全部素通しになるので、下限を固定する。
      expect(scannedFiles.length).toBeGreaterThan(50);
      expect(scannedFiles).toContain('src/chainEditPersist.ts');
      expect(scannedFiles).toContain('app/discover.tsx');
      expect(scannedFiles).toContain('app/onboarding.tsx');
    });

    test('既知の違反パターンを必ず検出する', () => {
      expect(usesToIsoString('const now = new Date().toISOString();')).toBe(
        true,
      );
      expect(
        usesToIsoString('o.adoptFirst(new Date().toISOString())'),
      ).toBe(true);
    });

    test('コメント内の言及は違反にしない', () => {
      expect(
        usesToIsoString('// 旧実装は new Date().toISOString() で UTC だった'),
      ).toBe(false);
    });
  });

  // ── 主検査 (全走査・除外リストで絞る) ─────────────────────────────────

  test('除外リストに無いファイルは toISOString を使っていない', () => {
    const violations = scannedFiles.filter(
      (p) => !ALLOWED_PATHS.has(p) && usesToIsoString(readSource(p)),
    );
    expect(violations).toEqual([]);
  });

  // ── 除外リストが腐らないようにする ─────────────────────────────────────

  test.each(ALLOWED_UTC.map((a) => a.path))(
    '除外リストの %s が実在し、実際に toISOString を使っている',
    (path) => {
      // 使わなくなったファイルが除外リストに残ると、そこだけ検査の穴になる。
      expect(scannedFiles).toContain(path);
      expect(usesToIsoString(readSource(path))).toBe(true);
    },
  );

  // ── 補助 (正の側からの固定) ───────────────────────────────────────────

  test.each(KNOWN_PERSISTENCE_SITES)(
    '%s が localIsoTimestamp を使っている',
    (path) => {
      expect(scannedFiles).toContain(path);
      expect(readSource(path)).toContain('localIsoTimestamp');
    },
  );
});
