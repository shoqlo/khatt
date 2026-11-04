// Generates the app icons (the letter خ in Amiri Bold) into public/icons/. Dev-only; output is committed.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as hb from 'harfbuzzjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }

const data = fs.readFileSync(path.join(root, 'node_modules/@expo-google-fonts/amiri/700Bold/Amiri_700Bold.ttf'));
const face = new hb.Face(new hb.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
const font = new hb.Font(face);
const buf = new hb.Buffer(); buf.addText('خ'); buf.guessSegmentProperties(); hb.shape(font, buf);
const gid = buf.getGlyphInfos()[0].codepoint;
const d = font.glyphToPath(gid);
const ext = font.glyphExtents(gid);
const upem = face.upem;

function svg(size, safe) {
  // Fit the glyph's ink box into the safe area, centred.
  const box = size * safe;
  const k = box / Math.max(ext.width, -ext.height);
  const gx = (size - ext.width * k) / 2 - ext.xBearing * k;
  const gy = (size - -ext.height * k) / 2 + ext.yBearing * k; // ink top lands at (size - inkHeight)/2
  const r = safe < 0.6 ? 0 : size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${r}" fill="#1f1f1f"/>
<path d="${d}" fill="#ffffff" transform="translate(${gx} ${gy}) scale(${k} ${-k})"/>
<rect x="${size * 0.2}" y="${size * 0.86 - (safe < 0.6 ? size * 0.06 : 0)}" width="${size * 0.6}" height="${size * 0.025}" rx="${size * 0.012}" fill="#1d6fd6"/>
</svg>`;
}
const out = path.join(root, 'public/icons');
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, safe] of [['icon-192', 192, 0.62], ['icon-512', 512, 0.62], ['apple-touch-icon', 180, 0.62], ['maskable-512', 512, 0.5]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size, safe)}</body></html>`);
  await page.screenshot({ path: path.join(out, `${name}.png`), omitBackground: false });
}
fs.writeFileSync(path.join(out, 'icon.svg'), svg(512, 0.62));
await browser.close();
console.log('icons written', fs.readdirSync(out));
console.log('upem', upem);
