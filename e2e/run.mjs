// End-to-end check in real Chromium: library search (Arabic), Arabic text, image upload,
// draw-on playback, export MP4/WebM/GIF + audio, save/reload. Writes screenshots + videos to OUT.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);
await page.waitForFunction(() => window.khatt);
check('UI starts in Arabic RTL for Arabic locale', await page.evaluate(() => document.documentElement.dir === 'rtl'));

// 1. Drawing library, searched in Arabic
await page.locator('#library input[type=search]').fill('مدرسة');
await page.waitForTimeout(600);
const note = await page.locator('#library .note').first().textContent();
check('Arabic search translated for the icon library', /school/.test(note), note);
await page.locator('#library .thumb').first().click();
await page.waitForFunction(() => window.khatt.state.project.elements.length === 1);

// 2. Arabic text
await page.locator('#tabs .tab').nth(2).click();
await page.locator('#library textarea').fill('التعليم نور\nمرحباً بكم في الدرس الأول');
await page.locator('#library button.primary').click();
await page.waitForFunction(() => window.khatt.state.project.elements.length === 2);

// 3. Raster image upload (a generated picture: house-like shapes)
const png = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 300);
  x.fillStyle = '#e74c3c'; x.beginPath(); x.moveTo(60, 150); x.lineTo(200, 40); x.lineTo(340, 150); x.fill();
  x.fillStyle = '#3498db'; x.fillRect(90, 150, 220, 130); x.fillStyle = '#f1c40f'; x.fillRect(180, 200, 50, 80);
  return c.toDataURL('image/png').split(',')[1];
});
fs.writeFileSync(path.join(OUT, 'house.png'), Buffer.from(png, 'base64'));
await page.locator('#tabs .tab').nth(3).click();
await page.locator('#library input[type=file]').setInputFiles(path.join(OUT, 'house.png'));
await page.waitForFunction(() => window.khatt.state.project.elements.length === 3, null, { timeout: 15000 });

// Lay elements out so they don't overlap
await page.evaluate(() => {
  const [icon, text, img] = window.khatt.state.project.elements;
  Object.assign(icon, { x: 1300, y: 120, scale: 16 });
  Object.assign(text, { x: 260, y: 160 });
  Object.assign(img, { x: 1200, y: 600, scale: 0.9 });
  window.khatt.commit();
});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '01-editor.png') });

const info = await page.evaluate(() => ({
  sizes: window.khatt.state.project.elements.map((e) => ({ kind: e.kind, dir: e.direction, ...window.khatt.elementSize(e) })),
  sched: window.khatt.schedule(),
}));
check('text element is laid out (not placeholder size)', info.sizes[1].w > 300 && info.sizes[1].w !== 200, JSON.stringify(info.sizes[1]));
check('Arabic text defaults to RTL drawing', info.sizes[1].dir === 'rtl');

// 4. Mid-draw frames: verify ink grows over time and the hand appears
const ink = async () => page.evaluate(() => {
  const c = document.getElementById('stage'); const x = c.getContext('2d');
  const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] < 120 && d[i + 1] < 120 && d[i + 2] < 120) n++;
  return n;
});
const slots = info.sched.slots;
const shots = [];
for (const [label, t] of [['icon-30', slots[0].revealStart + 0.3 * (slots[0].revealEnd - slots[0].revealStart)], ['icon-70', slots[0].revealStart + 0.7 * (slots[0].revealEnd - slots[0].revealStart)],
  ['text-20', slots[1].revealStart + 0.2 * (slots[1].revealEnd - slots[1].revealStart)], ['text-60', slots[1].revealStart + 0.6 * (slots[1].revealEnd - slots[1].revealStart)], ['text-done', slots[1].end - 0.05],
  ['image-30', slots[2].revealStart + 0.3 * (slots[2].revealEnd - slots[2].revealStart)], ['image-85', slots[2].revealStart + 0.85 * (slots[2].revealEnd - slots[2].revealStart)], ['end', info.sched.total]]) {
  await page.evaluate((tt) => window.khatt.seek(tt), t);
  shots.push({ label, ink: await ink() });
  await page.locator('#stage').screenshot({ path: path.join(OUT, `02-frame-${label}.png`) });
}
check('icon ink grows while drawing', shots[1].ink > shots[0].ink, `${shots[0].ink} -> ${shots[1].ink}`);
check('text ink grows while writing', shots[3].ink > shots[2].ink && shots[4].ink > shots[3].ink, `${shots[2].ink} -> ${shots[3].ink} -> ${shots[4].ink}`);


// 5. Audio + fit-to-audio (synthesised 12s tone as WAV)
const wav = (() => {
  const sr = 16000, secs = 12, n = sr * secs, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / sr) * 2 * Math.PI * 220) * 6000), 44 + i * 2);
  return b;
})();
fs.writeFileSync(path.join(OUT, 'voice.wav'), wav);
await page.locator('#tabs .tab').nth(4).click();
await page.locator('#library input[type=file]').setInputFiles(path.join(OUT, 'voice.wav'));
await page.waitForFunction(() => !!window.khatt.state.project.audio, null, { timeout: 10000 });
await page.locator('#library button', { hasText: /اضبط|Fit/ }).click();
const total = await page.evaluate(() => window.khatt.schedule().total);
check('fit-to-audio makes video length match voice-over', Math.abs(total - 12) < 0.3, `${total.toFixed(2)}s vs 12s`);

// 6. Exports
const exp = async (format, width, height, fps) => page.evaluate(async ({ format, width, height, fps }) => {
  const t0 = performance.now();
  const r = await window.khatt.exportVideo(window.khatt.state.project, { format, width, height, fps });
  const buf = new Uint8Array(await r.blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), frames: r.frames, codec: r.codec, withAudio: r.withAudio, ms: performance.now() - t0, ext: r.ext };
}, { format, width, height, fps });
for (const [fmt, w, hh, fps] of [['mp4', 1280, 720, 30], ['webm', 1280, 720, 30], ['gif', 640, 360, 10]]) {
  try {
    const r = await exp(fmt, w, hh, fps);
    const file = path.join(OUT, `export.${r.ext}`);
    fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
    check(`export ${fmt}`, fs.statSync(file).size > 10000, `${r.codec}, ${r.frames} frames, audio=${r.withAudio}, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${(r.ms / 1000).toFixed(1)}s for ${total.toFixed(1)}s of video`);
  } catch (e) { check(`export ${fmt}`, false, String(e).slice(0, 300)); }
}

// 7. Saved on the server, reload restores it
await page.waitForTimeout(1200);
await page.reload();
await page.waitForFunction(() => window.khatt && window.khatt.state.project.elements.length === 3, null, { timeout: 10000 }).catch(() => {});
check('project persists across reload', await page.evaluate(() => window.khatt.state.project.elements.length) === 3);

check('RTL page has no runaway horizontal overflow', await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1));

// 8. English UI toggle
await page.locator('header button', { hasText: 'English' }).click();
check('language toggle switches to LTR English', await page.evaluate(() => document.documentElement.dir === 'ltr'));
await page.screenshot({ path: path.join(OUT, '03-editor-en.png') });

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
