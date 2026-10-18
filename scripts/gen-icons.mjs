import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const BLUE = [37, 99, 235, 255];
const WHITE = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
    buf[i + 3] = color[3];
  };
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) set(x, y, color);
    }
  };

  // Background: full-bleed blue for maskable, rounded square otherwise.
  if (maskable) {
    rect(0, 0, size, size, BLUE);
  } else {
    const r = size * 0.22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = Math.max(r - x, x - (size - r), 0);
        const dy = Math.max(r - y, y - (size - r), 0);
        if (dx * dx + dy * dy <= r * r) set(x, y, BLUE);
        else set(x, y, TRANSPARENT);
      }
    }
  }

  // Open book (two pages + spine gap).
  const scale = maskable ? 0.62 : 0.66;
  const off = (1 - scale) / 2;
  const top = size * (off + 0.02);
  const bottom = size * (off + scale) - size * 0.02;
  const midY = size * 0.5;
  const gap = size * 0.035;

  // Left and right page blocks with a subtle center notch.
  rect(size * (off + 0.04), top, size * 0.5 - gap / 2, bottom, WHITE);
  rect(size * 0.5 + gap / 2, top, size * (off + scale - 0.04), bottom, WHITE);

  // Notch the pages towards the spine to suggest an open book (triangular cut).
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / (bottom - top);
    const depth = size * 0.03 * Math.sin(Math.PI * t);
    for (let x = size * 0.5 - gap / 2 - depth; x < size * 0.5 - gap / 2; x++) {
      set(Math.round(x), Math.round(y), BLUE);
    }
    for (let x = size * 0.5 + gap / 2; x < size * 0.5 + gap / 2 + depth; x++) {
      set(Math.round(x), Math.round(y), BLUE);
    }
  }

  // Book spine.
  rect(size * 0.5 - gap / 2, top, size * 0.5 + gap / 2, bottom, WHITE);

  // Sparkle (diamond) at the top-right.
  const cx = size * 0.76;
  const cy = size * 0.28;
  const rad = size * 0.075;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= rad) set(Math.round(x), Math.round(y), WHITE);
    }
  }

  void midY;
  return encodePng(size, size, buf);
}

const targets = [
  ['pwa-192x192.png', 192, false],
  ['pwa-512x512.png', 512, false],
  ['pwa-maskable-512x512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, maskable] of targets) {
  writeFileSync(join(publicDir, name), draw(size, maskable));
  console.log('wrote', name);
}
