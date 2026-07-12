// PWA用アイコンを生成する（依存ライブラリなし・Node標準のzlibでPNGを直接エンコード）
// 実行: node scripts/gen-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ---- 最小PNGエンコーダ ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- アイコン描画（ドン＋カッの重なりモチーフ） ----
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = size;
  // 色
  const BG = [0xf5, 0xf3, 0xee];
  const DON = [0xe0, 0x45, 0x2a];
  const KA = [0x2a, 0x7f, 0xc4];
  const WHITE = [0xff, 0xff, 0xff];
  const OUTLINE = [0x2b, 0x26, 0x20];

  const blend = (dst, src, a) => [
    dst[0] + (src[0] - dst[0]) * a,
    dst[1] + (src[1] - dst[1]) * a,
    dst[2] + (src[2] - dst[2]) * a,
  ];
  const circleAlpha = (x, y, cx, cy, r) => {
    const d = Math.hypot(x - cx, y - cy) - r;
    return Math.min(1, Math.max(0, 0.5 - d)); // 1pxアンチエイリアス
  };

  // カッ（青・右下）→ ドン（赤・左上、上に重なる）の順に描く
  const circles = [
    { cx: S * 0.615, cy: S * 0.615, r: S * 0.215, fill: KA },
    { cx: S * 0.415, cy: S * 0.43, r: S * 0.26, fill: DON },
  ];
  const ring = S * 0.045; // 白リング幅
  const edge = Math.max(1, S * 0.012); // 外側の細い輪郭

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let c = BG;
      for (const cir of circles) {
        // 外側輪郭 → 白リング → 本体の順で重ねる
        const aOut = circleAlpha(x, y, cir.cx, cir.cy, cir.r + ring + edge);
        if (aOut > 0) c = blend(c, OUTLINE, aOut);
        const aRing = circleAlpha(x, y, cir.cx, cir.cy, cir.r + ring);
        if (aRing > 0) c = blend(c, WHITE, aRing);
        const aFill = circleAlpha(x, y, cir.cx, cir.cy, cir.r);
        if (aFill > 0) c = blend(c, cir.fill, aFill);
      }
      const i = (y * S + x) * 4;
      px[i] = Math.round(c[0]);
      px[i + 1] = Math.round(c[1]);
      px[i + 2] = Math.round(c[2]);
      px[i + 3] = 255;
    }
  }
  return encodePng(S, S, px);
}

const outDir = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const buf = drawIcon(size);
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`wrote public/icons/${name} (${buf.length} bytes)`);
}
