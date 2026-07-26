import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Issue #233 / 提案 #228: knockon アプリアイコン PNG (icon / adaptive-icon) の
// 出力仕様を機械的に固定する。 K-006 (ハードガードレールのテスト固定) と同じ精神で、
// iOS App Store 提出要件 (alpha なし PNG) と Android adaptive-icon の
// セーフエリア (中央 66%) 前提を CI で守る。

const assetsDir = join(__dirname, '..', 'assets');
const iconPath = join(assetsDir, 'icon.png');
const adaptivePath = join(assetsDir, 'adaptive-icon.png');

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

// PNG 8 byte signature + IHDR (13 bytes data at offset 16). 外部依存なしで最小情報のみ抽出する。
function parsePngHeader(buffer: Buffer): PngHeader {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Not a valid PNG file (signature mismatch)');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
  };
}

describe('assets/icon.png (Issue #233 iOS + Android master icon)', () => {
  test('ファイルが存在する', () => {
    expect(existsSync(iconPath)).toBe(true);
  });

  test('1024×1024 で書き出されている', () => {
    const header = parsePngHeader(readFileSync(iconPath));
    expect(header.width).toBe(1024);
    expect(header.height).toBe(1024);
  });

  test('alpha チャンネルを持たない (iOS App Store 要件)', () => {
    // PNG color type: 0=Grayscale, 2=RGB, 3=Palette, 4=Grayscale+Alpha, 6=RGBA
    // Apple の "App Icon must not contain alpha channel" を通すには 2 (RGB) または 3 (Palette) を選ぶ。
    // 4 / 6 (alpha 付き) だと ipa アップロード時に拒否される。
    const header = parsePngHeader(readFileSync(iconPath));
    expect([0, 2, 3]).toContain(header.colorType);
  });
});

describe('assets/adaptive-icon.png (Issue #233 Android adaptive foreground layer)', () => {
  test('ファイルが存在する', () => {
    expect(existsSync(adaptivePath)).toBe(true);
  });

  test('1024×1024 で書き出されている', () => {
    const header = parsePngHeader(readFileSync(adaptivePath));
    expect(header.width).toBe(1024);
    expect(header.height).toBe(1024);
  });

  test('alpha チャンネルを持つ (safe area 外を透過するため)', () => {
    // adaptive foreground は中央 66% (676×676) にコンテンツを収め、
    // 周囲は透過にする (背景色は app.json の android.adaptiveIcon.backgroundColor で塗る)。
    // よって PNG は RGBA (color type 6) が必須。
    const header = parsePngHeader(readFileSync(adaptivePath));
    expect(header.colorType).toBe(6);
  });

  test('safe area の外 (中央 66% の外側) は完全に透過している', async () => {
    // 提案 #228 §3: adaptive-icon は中央 66% (676×676) にコンテンツ、周囲は透過。
    // safe area 外の 4 隅の代表点 (中央から 400px オフセット) が alpha=0 であることを確認。
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(adaptivePath).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    // safe area = center 676×676 → 外側マージン = (1024-676)/2 = 174。
    // 174 - 1 = 173 は safe area 完全に外。 offset 50 で余裕を持たせて確認。
    expect(alphaAt(50, 50)).toBe(0);
    expect(alphaAt(973, 50)).toBe(0);
    expect(alphaAt(50, 973)).toBe(0);
    expect(alphaAt(973, 973)).toBe(0);
  });

  test('safe area の中央 (アイコンコンテンツがある位置) は不透明である', async () => {
    // 中央 (512, 512) 付近には spine の縦線があるはずで alpha=255。
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(adaptivePath).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    // spine は縮小後も中央 X=512 付近を通る (スケール後の位置)
    expect(alphaAt(512, 512)).toBe(255);
  });
});
