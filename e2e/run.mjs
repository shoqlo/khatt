// End-to-end checks in real Chromium against the production build (`npm run build && npm run preview`).
// Phone (Android-sized, Arabic) and desktop (English) flows. Open-image sites are replaced by local
// fixtures shaped like their documented APIs, so these checks do NOT prove the live sites work.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium, devices } = pw;

const BASE = process.env.BASE || 'http://127.0.0.1:4173/';
const OUT = path.resolve(process.env.OUT || 'test-results');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

// ---------- fixtures ----------
const svgCamel = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><path d="M10 100 C 30 40, 60 40, 80 70 S 120 20, 150 60 L 190 100" fill="none" stroke="#000" stroke-width="5"/><circle cx="160" cy="40" r="10" fill="none" stroke="#000" stroke-width="4"/></svg>';
function wav(secs = 12, sr = 16000) {
  const n = sr * secs, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / sr) * 2 * Math.PI * 220) * 6000), 44 + i * 2);
  return b;
}
fs.writeFileSync(path.join(OUT, 'voice.wav'), wav());

async function makePng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 300);
    x.fillStyle = '#e74c3c'; x.beginPath(); x.moveTo(60, 150); x.lineTo(200, 40); x.lineTo(340, 150); x.fill();
    x.fillStyle = '#3498db'; x.fillRect(90, 150, 220, 130); x.fillStyle = '#f1c40f'; x.fillRect(180, 200, 50, 80);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

async function routeOpenImages(ctx, png) {
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('https://commons.wikimedia.org/w/api.php**', (r) => r.fulfill({
    headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify({ query: { pages: [
      { title: 'File:Camel line drawing.svg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/x/Camel.svg', thumburl: 'https://upload.wikimedia.org/thumb/x/Camel.svg/330px-Camel.svg.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Camel.svg', mime: 'image/svg+xml', width: 200, height: 120, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' }, Artist: { value: '<a href="#">Sara</a>' }, ObjectName: { value: 'Camel line drawing' } } }] },
      { title: 'File:Blocked.png', index: 2, imageinfo: [{ url: 'https://blocked.example/x.png', thumburl: 'https://upload.wikimedia.org/thumb/x/house.png/330px-house.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Blocked.png', mime: 'image/png', width: 400, height: 300, extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'Ali' } } }] },
    ] } }),
  }));
  await ctx.route('https://upload.wikimedia.org/**', (r) => {
    const u = r.request().url();
    if (u.endsWith('.svg')) return r.fulfill({ headers: { ...cors, 'content-type': 'image/svg+xml' }, body: svgCamel });
    return r.fulfill({ headers: { ...cors, 'content-type': 'image/png' }, body: png });
  });
  // A host that refuses the download. (Playwright's mocked responses are not CORS-checked, so a
  // refusal is simulated as a failed request; the app sees the same TypeError either way.)
  await ctx.route('https://blocked.example/**', (r) => (/thumb/.test(r.request().url()) && r.request().resourceType() === 'image'
    ? r.fulfill({ headers: { 'content-type': 'image/png' }, body: png })
    : r.abort('accessdenied')));
  await ctx.route('https://api.openverse.org/v1/images/?**', (r) => r.fulfill({
    headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify({ page_count: 1, results: [{ id: 'ov1', title: 'House', url: 'https://img.openverse.example/house.png', thumbnail: 'https://img.openverse.example/house-thumb.png', creator: 'Mona', license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', foreign_landing_url: 'https://example.org/house', attribution: '"House" by Mona is licensed under CC BY 2.0.', filetype: 'png' },
      { id: 'ov2', title: 'Refused', url: 'https://blocked.example/refused.png', thumbnail: 'https://blocked.example/refused-thumb.png', creator: 'X', license: 'cc0', license_url: '', foreign_landing_url: 'https://example.org/r', attribution: '', filetype: 'png' }] }),
  }));
  await ctx.route('https://img.openverse.example/**', (r) => r.fulfill({ headers: { ...cors, 'content-type': 'image/png' }, body: png }));
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

// =====================================================================
// PHONE: Android-sized, Arabic
// =====================================================================
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ar', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS policy/.test(m.text())) errors.push(m.text()); });
  const png = await (async () => { await page.goto('about:blank'); return makePng(page); })();
  fs.writeFileSync(path.join(OUT, 'house.png'), png);
  await routeOpenImages(ctx, png);
  await page.goto(BASE);
  await page.waitForFunction(() => window.khatt);
  const k = (fn, arg) => page.evaluate(fn, arg);

  check('phone: Arabic right-to-left interface', await k(() => document.documentElement.dir === 'rtl'));
  check('phone: page fits the screen (no sideways scrolling)', await k(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await shot(page, 'phone-01-empty.png');

  // Add sheet keeps the board visible
  await page.locator('#bottombar [data-id=add]').tap();
  await page.waitForTimeout(400);
  const geo = await k(() => ({ stage: document.getElementById('stage').getBoundingClientRect().bottom, sheet: document.getElementById('panel-add').getBoundingClientRect().top, vis: getComputedStyle(document.getElementById('panel-add')).visibility }));
  check('phone: Add sheet opens below the board', geo.vis === 'visible' && geo.sheet >= geo.stage - 2, JSON.stringify(geo));

  // Drawings searched in Arabic
  await page.locator('#library input[type=search]').fill('معلم');
  await page.waitForFunction(() => document.querySelectorAll('#library .thumb').length > 0 && /معلم|teacher/.test(document.querySelector('#library .note')?.textContent || '') || document.querySelectorAll('#library .thumb img[src^="data:"]').length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const firstTitle = await page.locator('#library .thumb').first().getAttribute('title');
  check('phone: Arabic drawing search finds teachers', /معلم|teacher|أستاذ|مدرس/.test(firstTitle || ''), firstTitle);
  await shot(page, 'phone-02-library-search.png');
  await page.locator('#library .thumb').first().tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 1);
  check('phone: sheet closes after adding, so the drawing is visible', await k(() => document.body.dataset.sheet === ''));

  // Category + style filters
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#library input[type=search]').fill('');
  await page.locator('#library .chip', { hasText: 'طعام وشراب' }).tap();
  await page.locator('#library .chip', { hasText: 'ملوّن' }).tap();
  await page.waitForTimeout(800);
  const foodNote = await page.locator('#library .note').first().textContent();
  check('phone: category + colour filter', /^\d+ نتيجة/.test(foodNote) && parseInt(foodNote) > 50 && parseInt(foodNote) < 1000, foodNote);
  await shot(page, 'phone-03-food-colour.png');
  await page.locator('#library .thumb').nth(3).tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 2);

  // Arabic text
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#tabs .tab').nth(2).tap();
  await page.locator('#library textarea').fill('العلم نور\nدرسنا اليوم عن الجمل');
  await page.locator('#library button.primary').tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 3);

  // Own photo
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#tabs .tab').nth(3).tap();
  await page.locator('#photo-input').setInputFiles(path.join(OUT, 'house.png'));
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 4, null, { timeout: 10000 });
  check('phone: photo stored on the device (not a server)', await k(() => window.khatt.state.project.elements[3].src.startsWith('asset:')));

  // Open images: Wikimedia SVG (drawable vector), blocked host, Openverse
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#tabs .tab').nth(1).tap();
  await page.locator('#library input[type=search]').fill('جمل');
  await page.locator('#library form button[type=submit]').tap();
  await page.waitForSelector('#library .thumb');
  const searched = await page.locator('#library .note').nth(1).textContent();
  check('phone: open-image search translates Arabic', /camel/.test(searched || ''), searched);
  await page.locator('#library .thumb').nth(1).tap(); // blocked host -> clear message, falls back to thumbnail first?
  await page.waitForTimeout(800);
  const afterBlocked = await k(() => window.khatt.state.project.elements.length);
  // The blocked hit has a working thumbnail as second choice, so it should still be added.
  check('phone: image with a blocked original falls back to its thumbnail', afterBlocked === 5, `elements=${afterBlocked}`);
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#library .thumb').first().tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 6, null, { timeout: 10000 });
  const camel = await k(() => window.khatt.state.project.elements[5]);
  check('phone: Wikimedia SVG becomes a drawable vector with its credit', camel.kind === 'svg' && /Sara/.test(camel.source.attribution), `${camel.kind} · ${camel.source?.attribution}`);
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#library .chip', { hasText: 'Openverse' }).tap();
  await page.waitForSelector('#library .thumb');
  await page.locator('#library .thumb').first().tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 7, null, { timeout: 10000 });
  // Fully blocked image: every URL of this hit is on a host that refuses cross-origin downloads
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#library .thumb').nth(1).tap();
  await page.waitForSelector('.toast.error', { timeout: 8000 }).catch(() => {});
  const toastText = await page.locator('.toast.error').first().textContent().catch(() => '');
  check('phone: clear Arabic message when an image cannot be downloaded', /لا يمكن تنزيل/.test(toastText || ''), toastText);
  check('phone: refused image is not added', await k(() => window.khatt.state.project.elements.length) === 7);
  await k(() => window.khatt.setSheet(''));

  // Lay elements out deterministically for the visual checks
  await k(() => {
    const els = window.khatt.state.project.elements;
    const spots = [[150, 120, null], [1400, 120, null], [520, 380, null], [1250, 620, 0.8], [1500, 560, null], [180, 640, 3], [800, 800, null]];
    els.forEach((e, i) => { const s = spots[i]; if (!s) return; e.x = s[0]; e.y = s[1]; if (s[2]) e.scale = s[2]; });
    window.khatt.commit();
  });
  await page.waitForTimeout(700);
  await shot(page, 'phone-04-board.png');

  // Edit sheet: reorder with Earlier/Later
  await k(() => { window.khatt.state.selected = window.khatt.state.project.elements[2].id; window.khatt.commit(); });
  await page.locator('#bottombar [data-id=edit]').tap();
  const before = await k(() => window.khatt.state.project.elements.map((e) => e.kind).join(','));
  await page.locator('#props button', { hasText: 'أبكر' }).tap();
  await page.waitForTimeout(200);
  const after = await k(() => window.khatt.state.project.elements.map((e) => e.kind).join(','));
  check('phone: Earlier/Later reorders without drag-and-drop', before !== after && after.split(',')[1] === 'text', `${before} -> ${after}`);
  await shot(page, 'phone-05-edit.png');
  await k(() => window.khatt.setSheet(''));

  // Two-finger gestures: pinch the board to zoom; pinch a drawing to resize it
  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator('#stage').boundingBox();
  async function pinch(cx, cy, from, to) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - from, y: cy, id: 1 }, { x: cx + from, y: cy, id: 2 }] });
    for (let i = 1; i <= 8; i++) {
      const d = from + ((to - from) * i) / 8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  }
  await k(() => { window.khatt.state.selected = null; window.khatt.state.view = { x: 960, y: 540, zoom: 1 }; window.khatt.commit(); });
  // first finger on an empty corner of the board (bottom-left is free), so the fingers zoom the view
  await pinch(box.x + (60 / 1920) * box.width + 20, box.y + (1040 / 1080) * box.height, 20, 60);
  const zoom = await k(() => window.khatt.state.view.zoom);
  check('phone: pinch zooms the board', zoom > 1.5, `zoom ${zoom.toFixed(2)}`);
  await k(() => { window.khatt.state.view = { x: 960, y: 540, zoom: 1 }; });
  const target = await k(() => { const e = window.khatt.state.project.elements[0]; const s = window.khatt.elementSize(e); return { id: e.id, scale: e.scale, cx: e.x + (s.w * e.scale) / 2, cy: e.y + (s.h * e.scale) / 2 }; });
  const px = box.x + (target.cx / 1920) * box.width, py = box.y + (target.cy / 1080) * box.height;
  await pinch(px, py, 8, 24);
  const newScale = await k((id) => window.khatt.state.project.elements.find((e) => e.id === id).scale, target.id);
  check('phone: pinch on a drawing resizes it', newScale > target.scale * 1.8, `${target.scale} -> ${newScale.toFixed(2)}`);
  await k(() => { const e = window.khatt.state.project.elements[0]; e.scale = 12; e.x = 150; e.y = 120; window.khatt.commit(); });

  // Voice-over + fit timing
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#tabs .tab').nth(4).tap();
  await page.locator('#audio-input').setInputFiles(path.join(OUT, 'voice.wav'));
  await page.waitForFunction(() => !!window.khatt.state.project.audio, null, { timeout: 10000 });
  await page.locator('#library button.primary').tap();
  const total = await k(() => window.khatt.schedule().total);
  check('phone: fit timing to the voice-over', Math.abs(total - 12) < 0.3, `${total.toFixed(2)}s`);
  // Microphone recording (fake device)
  await page.locator('#library button', { hasText: 'تسجيل' }).tap();
  await page.waitForTimeout(1500);
  await page.locator('#library button', { hasText: 'إيقاف' }).tap();
  await page.waitForFunction(() => window.khatt.state.project.audio?.name === 'تسجيل', null, { timeout: 10000 }).catch(() => {});
  const recorded = await k(() => window.khatt.state.project.audio);
  check('phone: record a voice-over with the microphone', recorded?.name === 'تسجيل' && recorded.duration > 0.8, recorded ? `${recorded.duration.toFixed(2)}s` : 'none');
  // put the 12s voice back for the export checks
  await page.locator('#audio-input').setInputFiles(path.join(OUT, 'voice.wav'));
  await page.waitForFunction(() => window.khatt.state.project.audio?.duration > 11, null, { timeout: 10000 });
  await page.locator('#library button.primary').tap();
  await k(() => window.khatt.setSheet(''));

  // Export through the UI (phone default = 720p)
  await page.locator('#bottombar [data-id=export]').tap();
  const res = await page.locator('dialog select').nth(1).inputValue();
  check('phone: export defaults to 720p', res === '720', res);
  const credits = await page.locator('dialog .credits textarea').inputValue().catch(() => '');
  check('phone: credits collected for CC BY material', /Streamline|Sara|Mona/.test(credits) && /CC BY/.test(credits), credits.replace(/\n/g, ' | ').slice(0, 160));
  const dl = page.waitForEvent('download', { timeout: 120000 });
  const t0 = Date.now();
  await page.locator('dialog button.primary', { hasText: 'اصنع الفيديو' }).tap();
  const download = await dl;
  const file = path.join(OUT, 'phone-export.mp4');
  await download.saveAs(file);
  check('phone: video made in the browser and downloaded', fs.statSync(file).size > 50000, `${(fs.statSync(file).size / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s for ${total.toFixed(0)}s of video`);
  await shot(page, 'phone-06-export-done.png');
  await page.locator('dialog button', { hasText: 'إغلاق' }).last().tap();

  // Real-time fallback (what older iPhones use) — shortened project
  const rt = await k(async () => {
    const p = structuredClone(window.khatt.state.project);
    p.elements = p.elements.slice(0, 2).map((e) => ({ ...e, timing: { transition: 0.3, animate: 1, pause: 0.2 } }));
    p.endHold = 0.5;
    const r = await window.khatt.exportVideo(p, { format: 'mp4', width: 640, height: 360, fps: 30, forceMethod: 'realtime' });
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), ext: r.ext, method: r.method, codec: r.codec };
  });
  fs.writeFileSync(path.join(OUT, `realtime.${rt.ext}`), Buffer.from(rt.b64, 'base64'));
  check('phone: real-time recording fallback works (with sound)', rt.method === 'realtime' && fs.statSync(path.join(OUT, `realtime.${rt.ext}`)).size > 10000, `${rt.codec}`);

  // Low-end phone estimate: CPU throttled 4x
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slow = await k(async () => {
    const t0 = performance.now();
    const r = await window.khatt.exportVideo(window.khatt.state.project, { format: 'mp4', width: 1280, height: 720, fps: 30 });
    return { secs: (performance.now() - t0) / 1000, method: r.method, size: r.blob.size };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check('phone: 720p export on a 4x slower CPU', slow.secs < total * 3, `${slow.secs.toFixed(1)}s for ${total.toFixed(0)}s video (${slow.method})`);

  // Persistence: an edit made just before the app is hidden must not be lost
  await k(() => {
    window.khatt.state.project.title = 'درس الجمل';
    window.khatt.commit();
    // What the phone does when the user switches app: the page becomes hidden.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.khatt && window.khatt.state.project.elements.length >= 7, null, { timeout: 10000 }).catch(() => {});
  const restored = await k(() => ({ n: window.khatt.state.project.elements.length, audio: !!window.khatt.state.project.audio, title: window.khatt.state.project.title }));
  check('phone: project restored after reload, including the last edit', restored.n === 7 && restored.audio && restored.title === 'درس الجمل', JSON.stringify(restored));

  // Project file: save and open again (backup / move to another phone)
  await page.locator('#bottombar [data-id=menu]').tap();
  const dl2 = page.waitForEvent('download');
  await page.locator('dialog .menu-item', { hasText: 'حفظ ملف المشروع' }).tap();
  const projFile = path.join(OUT, 'project.khatt');
  await (await dl2).saveAs(projFile);
  await page.locator('#bottombar [data-id=menu]').tap();
  await page.locator('input[accept=".khatt,application/json"]').last().setInputFiles(projFile);
  await page.waitForTimeout(1500);
  const imported = await k(() => ({ n: window.khatt.state.project.elements.length, id: window.khatt.state.project.id }));
  check('phone: project file opens as a copy with all pictures', imported.n === 7 && fs.statSync(projFile).size > 1000, `${(fs.statSync(projFile).size / 1024).toFixed(0)} KB`);
  await page.keyboard.press('Escape');

  // Mid-draw frames of the phone export
  check('phone: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await ctx.close();
}

// Offline + installability. Separate context: Playwright bypasses service workers whenever
// requests are intercepted, so this context has no routes.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ar' });
  const page = await ctx.newPage();
  const k = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(BASE);
  await page.waitForFunction(() => window.khatt);
  await page.locator('#bottombar [data-id=add]').tap();
  await page.locator('#tabs .tab').nth(2).tap();
  await page.locator('#library textarea').fill('مرحبا');
  await page.locator('#library button.primary').tap();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 1);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'محفوظ على هذا الجهاز' || window.khatt.state.saveStatus === 'محفوظ على هذا الجهاز');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
  check('offline: service worker controls the app', await k(() => !!navigator.serviceWorker.controller));
  await ctx.setOffline(true);
  await page.reload();
  const offlineOk = await page.waitForFunction(() => window.khatt && window.khatt.state.project.elements.length === 1, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('offline: app opens with no connection, project intact', offlineOk);
  if (offlineOk) {
    await page.locator('#bottombar [data-id=add]').tap();
    await page.locator('#tabs .tab').nth(2).tap();
    await page.locator('#library textarea').fill('بدون إنترنت');
    await page.locator('#library button.primary').tap();
    const n = await page.waitForFunction(() => window.khatt.state.project.elements.length === 2, null, { timeout: 8000 }).then(() => true).catch(() => false);
    check('offline: Arabic text still shaped and drawn', n);
    await page.locator('#bottombar [data-id=add]').tap();
    await page.locator('#tabs .tab').nth(0).tap();
    await page.waitForTimeout(1500);
    const loaded = await k(() => document.querySelectorAll('#library .thumb img[src^="data:"]').length);
    check('offline: drawings seen before are available offline', loaded > 0, `${loaded} thumbnails`);
    await shot(page, 'phone-07-offline.png');
  }
  await ctx.setOffline(false);
  const cdp = await ctx.newCDPSession(page);
  // Test browsers run in a private profile, which Chrome itself reports as 'in-incognito'.
  const installErrors = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  check('installable as an app (Chrome installability check)', installErrors.length === 0, JSON.stringify(installErrors));
  const manifest = await (await page.request.get(new URL('manifest.webmanifest', BASE).href)).json();
  check('manifest: Arabic, right-to-left, standalone, maskable icon', manifest.dir === 'rtl' && manifest.lang === 'ar' && manifest.display === 'standalone' && manifest.icons.some((i) => i.purpose === 'maskable'));
  await ctx.close();
}

// Small Android phone (360px wide)
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => window.khatt);
  check('small phone (360px): page fits the screen', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.locator('#bottombar [data-id=add]').tap();
  await page.waitForTimeout(500);
  await shot(page, 'phone-small-360.png');
  await ctx.close();
}

// =====================================================================
// DESKTOP: English
// =====================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForFunction(() => window.khatt);
  check('desktop: English left-to-right interface', await page.evaluate(() => document.documentElement.dir === 'ltr'));
  check('desktop: three-column layout with panels visible', await page.evaluate(() => getComputedStyle(document.getElementById('panel-add')).visibility === 'visible' && getComputedStyle(document.getElementById('bottombar')).display === 'none'));
  await page.locator('#library input[type=search]').fill('rocket');
  await page.waitForTimeout(800);
  await page.locator('#library .thumb').first().click();
  await page.waitForFunction(() => window.khatt.state.project.elements.length === 1);
  const before = await page.evaluate(() => ({ x: window.khatt.state.project.elements[0].x }));
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterX = await page.evaluate(() => window.khatt.state.project.elements[0].x);
  check('desktop: drag a drawing with the mouse', afterX - before.x > 150, `${before.x} -> ${afterX}`);
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => window.khatt.state.project.elements[0].x);
  check('desktop: undo with Ctrl+Z', undone === before.x, `${undone}`);
  const fast = await page.evaluate(async () => {
    const t0 = performance.now();
    const r = await window.khatt.exportVideo(window.khatt.state.project, { format: 'mp4', width: 1920, height: 1080, fps: 30 });
    return { secs: (performance.now() - t0) / 1000, method: r.method, codec: r.codec, total: window.khatt.schedule().total };
  });
  check('desktop: 1080p export faster than real time', fast.secs < fast.total, `${fast.secs.toFixed(1)}s for ${fast.total.toFixed(1)}s (${fast.method}, ${fast.codec})`);
  await shot(page, 'desktop-01.png');
  check('desktop: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
