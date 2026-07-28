// Генератор иконок-заглушек PWA: акцентный фон + белая «молния» (тема — электроснабжение).
// PNG кодируем вручную (IHDR/IDAT/IEND + CRC32), сжатие — zlib из fflate (уже в зависимостях).
// Разовый скрипт: `bun run scripts/gen-icons.ts` → public/icon-192.png, icon-512.png (в репозиторий).
import { zlibSync } from 'fflate';

// Молния в нормированных координатах 0..1 (по центру, с полями — maskable-safe).
const BOLT: [number, number][] = [
  [0.56, 0.08], [0.30, 0.55], [0.47, 0.55], [0.40, 0.92],
  [0.72, 0.40], [0.53, 0.40], [0.62, 0.08],
];
const ACCENT: [number, number, number] = [0x0a, 0x84, 0xff];

function inBolt(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [xi, yi] = BOLT[i]!;
    const [xj, yj] = BOLT[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(size: number): Uint8Array {
  const [ar, ag, ab] = ACCENT;
  const raw = new Uint8Array(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // тип фильтра строки — none
    for (let x = 0; x < size; x++) {
      const white = inBolt((x + 0.5) / size, (y + 0.5) / size);
      raw[p++] = white ? 0xff : ar;
      raw[p++] = white ? 0xff : ag;
      raw[p++] = white ? 0xff : ab;
      raw[p++] = 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type 6 (RGBA)
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) { out.set(a, o); o += a.length; }
  return out;
}

await Bun.write('public/icon-192.png', png(192));
await Bun.write('public/icon-512.png', png(512));
console.log('icons written: public/icon-192.png, public/icon-512.png');
