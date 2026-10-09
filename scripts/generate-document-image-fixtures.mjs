// Non-sensitive, reproducible synthetic pixels. These fixtures are not an OCR
// accuracy benchmark and never need a cloud provider.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const directory = new URL('../tests/fixtures/documents/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const kind of ['clear', 'low-contrast', 'small', 'shadow', 'clipped', 'blank', 'no-paper']) {
  const width = kind === 'small' ? 123 : 640, height = kind === 'small' ? 161 : 800;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ink = y % 32 < 4 && x % 40 < 20;
    let value = ink ? 30 : kind === 'clipped' ? 176 : 255;
    if (kind === 'low-contrast') value = ink ? 205 : 230;
    if (kind === 'shadow') value *= 0.55 + 0.45 * x / width;
    if (kind === 'clipped' && x >= 256 && x < 320 && y >= 352 && y < 416) value = 255;
    if (kind === 'blank') value = 255;
    if (kind === 'no-paper') value = 110;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(value); data[i + 3] = 255;
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(new URL(`${kind}.png`, directory).pathname.replace(/^\/(\w:)/, '$1'));
}
