#!/usr/bin/env node
// Issue #233 / 提案 #228: assets/icon.svg (SVG マスター) から
// Expo が要求する 2 種類の PNG を書き出す。
//
// 出力:
//   assets/icon.png          1024×1024 / no alpha    (iOS + Android 共通マスター)
//   assets/adaptive-icon.png 1024×1024 / with alpha  (Android adaptive icon foreground)
//
// 使い方: `node scripts/generate-app-icons.mjs`
// SVG マスターを更新したら本スクリプトを再実行して PNG を更新する。
// 出力仕様は src/appIconPng.test.ts で機械的に固定 (K-006 と同じ精神)。

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
const svgPath = join(assetsDir, 'icon.svg');
const iconPngPath = join(assetsDir, 'icon.png');
const adaptivePngPath = join(assetsDir, 'adaptive-icon.png');

const CANVAS_SIZE = 1024;
const SAFE_AREA_RATIO = 0.66; // Android adaptive icon の user-visible 保証範囲。
const SAFE_AREA_SIZE = Math.round(CANVAS_SIZE * SAFE_AREA_RATIO); // 676
const SAFE_AREA_OFFSET = Math.round((CANVAS_SIZE - SAFE_AREA_SIZE) / 2); // 174

const rawSvg = readFileSync(svgPath, 'utf-8');

// librsvg (sharp のバックエンド) は `--` を含む XML コメントを厳格に拒否する。
// assets/icon.svg のコメントには CSS 変数名 (--bg / --grow / --star) が入っているため
// パースエラーになる。 レンダリング前にコメントを剥がして XML 妥当性を確保する
// (icon.svg 側の可読性はそのまま残す)。
const svg = rawSvg.replace(/<!--[\s\S]*?-->/g, '');

// 1) icon.png: 1024×1024 alpha なし PNG (iOS App Store 提出要件)。
//    SVG の bg #16161A で不透明に塗られているため、 flatten で alpha を落とす。
await sharp(Buffer.from(svg))
  .resize(CANVAS_SIZE, CANVAS_SIZE)
  .flatten({ background: '#16161A' })
  .png({ compressionLevel: 9 })
  .toFile(iconPngPath);

console.log(`✓ wrote ${iconPngPath} (${CANVAS_SIZE}×${CANVAS_SIZE}, no alpha)`);

// 2) adaptive-icon.png: 1024×1024 alpha 付き PNG (Android adaptive foreground)。
//    - bg <rect> を除いた SVG (透過キャンバス上に spine + dot + star のみ) を用意
//    - safe area (676×676) にリサイズしてから 1024×1024 の透過キャンバス中央に合成
//    背景色は app.json の android.adaptiveIcon.backgroundColor で別途指定される。
const svgWithoutBg = svg.replace(/<rect\b[^/]*\/>/, '');
const foregroundBuffer = await sharp(Buffer.from(svgWithoutBg))
  .resize(SAFE_AREA_SIZE, SAFE_AREA_SIZE)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: foregroundBuffer, left: SAFE_AREA_OFFSET, top: SAFE_AREA_OFFSET }])
  .png({ compressionLevel: 9 })
  .toFile(adaptivePngPath);

console.log(
  `✓ wrote ${adaptivePngPath} (${CANVAS_SIZE}×${CANVAS_SIZE}, alpha, safe area ${SAFE_AREA_SIZE}×${SAFE_AREA_SIZE} @ +${SAFE_AREA_OFFSET})`,
);
