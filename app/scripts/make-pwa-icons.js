/** Write tiny PNG icons so the PWA installs without extra image tools. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size, r, g, b) {
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size + 1) + 1 + x * 1;
      // grayscale-ish solid via RGB stored as palette-less truecolor below
      void i;
    }
  }
  // Truecolor RGB
  const row = size * 3 + 1;
  const rawRgb = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    rawRgb[y * row] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * row + 1 + x * 3;
      rawRgb[o] = r;
      rawRgb[o + 1] = g;
      rawRgb[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = zlib.deflateSync(rawRgb);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, '..', 'public');
fs.mkdirSync(dir, { recursive: true });
const color = [15, 28, 23]; // #0F1C17
fs.writeFileSync(path.join(dir, 'pwa-192.png'), png(192, ...color));
fs.writeFileSync(path.join(dir, 'pwa-512.png'), png(512, ...color));
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), png(180, ...color));
console.log('Wrote PWA icons in app/public');
