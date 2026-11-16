/**
 * 生成 PWA 图标（不依赖任何第三方库，直接写 PNG）
 * 运行：node scripts/gen-icons.mjs
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");

const BRAND = [31, 138, 91];

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- 绘制 ---------- */
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * @param size 边长
 * @param scale 图形缩放（maskable 要留安全区）
 * @param rounded 是否圆角
 */
function draw(size, { scale = 1, rounded = true, radiusRatio = 0.22 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // 超采样，抗锯齿
  const R = size * 0.3 * scale;
  const r = size * 0.225 * scale;
  const dot = size * 0.082 * scale;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = (282 * Math.PI) / 180; // 留 78° 缺口，像进度环
  const corner = size * radiusRatio;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // 圆角裁剪
          if (rounded) {
            const dx = Math.max(corner - px, px - (size - corner), 0);
            const dy = Math.max(corner - py, py - (size - corner), 0);
            if (Math.hypot(dx, dy) > corner) continue;
          }

          const dx = px - cx;
          const dy = py - cy;
          const dist = Math.hypot(dx, dy);

          // 从 12 点顺时针的角度
          let ang = Math.atan2(dx, -dy);
          if (ang < 0) ang += Math.PI * 2;

          const inRing = dist <= R && dist >= r && ang <= sweep;
          const inDot = dist <= dot;

          let color;
          if (inRing || inDot) {
            color = [255, 255, 255];
          } else {
            // 背景：中心稍亮的径向渐变
            const t = Math.min(1, dist / (size * 0.75));
            color = mix(BRAND, [17, 92, 60], t);
          }

          rSum += color[0];
          gSum += color[1];
          bSum += color[2];
          aSum += 255;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = aSum / n;
      buf[i] = Math.round(rSum / (aSum / 255 || 1) || 0);
      buf[i + 1] = Math.round(gSum / (aSum / 255 || 1) || 0);
      buf[i + 2] = Math.round(bSum / (aSum / 255 || 1) || 0);
      buf[i + 3] = Math.round(alpha);
    }
  }
  return buf;
}

function save(name, size, opts) {
  const rgba = draw(size, opts);
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, size, rgba));
  console.log(`✓ ${name} (${size}x${size})`);
}

fs.mkdirSync(OUT, { recursive: true });
save("icon-192.png", 192, { scale: 1 });
save("icon-512.png", 512, { scale: 1 });
save("maskable-512.png", 512, { scale: 0.7, rounded: false });
save("apple-touch-icon.png", 180, { rounded: false, radiusRatio: 0 });
console.log("图标生成完成 → public/icons");
