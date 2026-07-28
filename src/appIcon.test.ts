import { readFileSync } from 'fs';
import { join } from 'path';

// Issue #232 / 提案 #228: knockon アプリアイコン SVG マスターの spec 不変条件を機械的に固定する。
// K-006 (ハードガードレールのテスト固定) と同じ精神で、
// 派手なリファクタで色トークンが差し替わったり要素が抜けたりしないことを CI で守る。

const svgPath = join(__dirname, '..', 'assets', 'icon.svg');
const svg = readFileSync(svgPath, 'utf-8');

describe('assets/icon.svg (Issue #232 app icon master)', () => {
  test('1024×1024 の viewBox / width / height を持つ', () => {
    expect(svg).toMatch(/viewBox="0 0 1024 1024"/);
    expect(svg).toMatch(/width="1024"/);
    expect(svg).toMatch(/height="1024"/);
  });

  test('DESIGN-SYSTEM v0.2 の bg / grow / star トークンの直値を含む', () => {
    // これらは src/theme.ts の DARK_PALETTE と一致する値。
    // アイコンは Superellipse マスク前提で常に Dark パレットで書き出す (ADR-0050 / 提案 #228 §2)。
    expect(svg).toContain('#16161A'); // --bg
    expect(svg).toContain('#EAEAE8'); // --grow
    expect(svg).toContain('#F2C14B'); // --star
  });

  test('禁止 UI (格子 / streak 数字 / 弱い輪アラート) を含まない', () => {
    // ADR-0004 §決定5 (禁止 UI) / ADR-0036 §一般原則 (+/- 判定軸)
    // アイコン内に text (streak 数字) や rect 格子を入れない。
    expect(svg).not.toMatch(/<text\b/); // 数字バッジ・streak 数字を持たない
    // 背景の <rect> は 1 個 (bg 単色) のみ許容 = 格子/ヒートマップは不可
    expect(svg.match(/<rect\b/g)?.length ?? 0).toBe(1);
  });

  test('spine (縦の grow 線) を含む', () => {
    // X=512 の縦直線, stroke=48, round cap, grow 色
    expect(svg).toMatch(/<line[^>]*x1="512"[^>]*y1="256"[^>]*x2="512"[^>]*y2="720"/);
    expect(svg).toMatch(/<line[^>]*stroke="#EAEAE8"/);
    expect(svg).toMatch(/<line[^>]*stroke-width="48"/);
    expect(svg).toMatch(/<line[^>]*stroke-linecap="round"/);
  });

  test('起点アンカードット (spine 上端) を含む', () => {
    // 中心 (512, 256), r=84, grow 色の塗り
    expect(svg).toMatch(/<circle[^>]*cx="512"[^>]*cy="256"[^>]*r="84"[^>]*fill="#EAEAE8"/);
  });

  test('定着 star (5 芒星 filled) を含み star 色で塗られる', () => {
    // ADR-0050: 定着 = 星型 Polygon (常に塗り, --star)。
    // Polygon の points は 10 頂点 (outer/inner 交互) = カンマ区切り座標が 10 組。
    const polygonMatch = svg.match(/<polygon[^>]*fill="#F2C14B"[^>]*points="([^"]+)"/);
    expect(polygonMatch).not.toBeNull();
    const points = polygonMatch![1].trim().split(/\s+/);
    expect(points).toHaveLength(10);
    // 上頂点 (i=0, angle=-90°, r=140, center Y=800) は (512, 660)。
    // spine 下端 (Y=720) は star 内部にわずかにめり込む構成 (提案 #228 §2)。
    expect(points[0]).toBe('512,660');
  });
});
