import './styles.css';
import { newProject, uid, defaultTiming, type BoardElement, type Camera, type Project, type TextElement, type SvgElement, type ImageElement, type HandId, type FontId } from '../engine/types';
import { renderFrame, boundsOf, viewMatrix, elementSize } from '../engine/render';
import { schedule, fitToDuration, FULL_BOARD, activeIndex, autoCamera } from '../engine/timeline';
import { prepare, prepareAll } from '../engine/prepare';
import { exportVideo, exportSrt, type ExportFormat } from '../engine/export';
import { FONTS } from '../engine/fonts';
import type { CustomHand } from '../engine/hand';
import { isRtlText } from '../engine/text';
import { searchIcons, searchPixabay, importPixabay, uploadFile, pixabayConfigured, type PixabayHit } from '../library/library';
import { h, field, num, range, select, download, add } from './dom';
import { t, getLang, setLang, type Key } from './i18n';

// ---------------- state ----------------
const state = {
  project: newProject(),
  selected: null as string | null,
  view: { ...FULL_BOARD } as Camera,
  playing: false,
  time: 0,
  tab: 'icons' as 'icons' | 'pixabay' | 'text' | 'upload' | 'audio',
  saveStatus: '' as string,
  customHand: null as CustomHand | null,
};
const undoStack: string[] = [];
const redoStack: string[] = [];
let lastSnapshot = '';

const $ = (id: string) => document.getElementById(id)!;
const canvas = h('canvas', { id: 'stage', tabindex: 0 }) as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const audioEl = new Audio();

// ---------------- persistence & history ----------------
let saveTimer = 0;
function commit(opts: { rerender?: boolean } = {}) {
  const snap = JSON.stringify(state.project);
  if (snap !== lastSnapshot) {
    if (lastSnapshot) undoStack.push(lastSnapshot);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = snap;
    scheduleSave();
  }
  if (opts.rerender !== false) renderPanels();
  requestDraw();
}

let coalesceTimer = 0;
/** For sliders/typing: update now, record one undo step when the user pauses. */
function softCommit() {
  requestDraw();
  renderTimeline();
  clearTimeout(coalesceTimer);
  coalesceTimer = window.setTimeout(() => commit({ rerender: false }), 400);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus(t('saving'));
  saveTimer = window.setTimeout(save, 700);
}

async function save() {
  const body = JSON.stringify(state.project);
  try { localStorage.setItem('khatt.last', body); } catch { /* ignore */ }
  try {
    const r = await fetch(`/api/projects/${state.project.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
    setStatus(r.ok ? t('saved') : t('saveFailed'));
  } catch { setStatus(t('saveFailed')); }
}

function setStatus(s: string) { state.saveStatus = s; const el = document.getElementById('status'); if (el) el.textContent = s; }

function undo() {
  if (!undoStack.length) return;
  redoStack.push(lastSnapshot);
  lastSnapshot = undoStack.pop()!;
  state.project = JSON.parse(lastSnapshot);
  afterLoad(); scheduleSave();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(lastSnapshot);
  lastSnapshot = redoStack.pop()!;
  state.project = JSON.parse(lastSnapshot);
  afterLoad(); scheduleSave();
}

function loadProject(p: Project, resetHistory = true) {
  state.project = { ...newProject(), ...p };
  state.selected = null;
  state.time = 0;
  if (resetHistory) { undoStack.length = 0; redoStack.length = 0; lastSnapshot = JSON.stringify(state.project); }
  afterLoad();
}

function afterLoad() {
  if (state.selected && !el(state.selected)) state.selected = null;
  const a = state.project.audio;
  if (a && audioEl.dataset.src !== a.src) { audioEl.src = a.src; audioEl.dataset.src = a.src; }
  if (!a) { audioEl.removeAttribute('src'); delete audioEl.dataset.src; }
  loadCustomHand();
  prepareAll(state.project.elements).finally(requestDraw);
  renderAll();
}

async function loadCustomHand() {
  const c = state.project.customHand;
  if (!c) { state.customHand = null; return; }
  const img = new Image();
  img.src = c.src;
  try { await img.decode(); state.customHand = { image: img, tipX: c.tipX, tipY: c.tipY, scale: c.scale }; requestDraw(); } catch { state.customHand = null; }
}

const el = (id: string) => state.project.elements.find((e) => e.id === id);
const selectedEl = () => (state.selected ? el(state.selected) : undefined);

// ---------------- adding elements ----------------
function placeNew<T extends BoardElement>(e: T, w: number, h: number): T {
  // Place new elements near the centre of the current view, nudged so they don't stack exactly.
  const n = state.project.elements.length;
  e.x = Math.round(state.view.x - (w * e.scale) / 2 + ((n % 5) - 2) * 30);
  e.y = Math.round(state.view.y - (h * e.scale) / 2 + ((n % 3) - 1) * 30);
  return e;
}

const rtlDefault = () => getLang() === 'ar';

function base(name: string) {
  return {
    id: uid(), name, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, mode: 'draw' as const,
    direction: (rtlDefault() ? 'rtl' : 'ltr') as 'rtl' | 'ltr', timing: defaultTiming(), camera: null,
  };
}

async function addElement(e: BoardElement) {
  try {
    const p = await prepare(e);
    placeNew(e, p.w, p.h);
  } catch (err) { alert(String(err)); return; }
  state.project.elements.push(e);
  state.selected = e.id;
  await prepareAll([e]);
  commit();
}

function addSvg(name: string, svg: string, source?: SvgElement['source']) {
  const scale = /viewBox="0 0 24 24"/.test(svg) ? 12 : 1;
  const e: SvgElement = { ...base(name), kind: 'svg', svg, color: null, strokeWidth: scale === 12 ? 1.4 : null, scale, source };
  return addElement(e);
}

async function addImage(name: string, src: string, source?: ImageElement['source']) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
  const e: ImageElement = { ...base(name), kind: 'image', src, width: img.naturalWidth, height: img.naturalHeight, scale: Math.round(scale * 100) / 100, source };
  return addElement(e);
}

function addText(text: string, font: FontId, size: number, color: string) {
  const rtl = isRtlText(text);
  const e: TextElement = {
    ...base(text.slice(0, 24)), kind: 'text', text, font, size, color, align: 'center',
    direction: rtl ? 'rtl' : 'ltr',
    timing: { ...defaultTiming(), animate: Math.min(8, Math.max(1.5, text.length * 0.12)) },
  };
  return addElement(e);
}

// ---------------- drawing & playback ----------------
let drawQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

function draw() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(r.width * dpr)), hh = Math.max(2, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  const { pending } = renderFrame(ctx, state.project, state.time, {
    camera: state.playing ? undefined : state.view,
    showAll: !state.playing,
    selectedId: state.playing ? null : state.selected,
    customHand: state.customHand,
  });
  if (pending) setTimeout(requestDraw, 100);
  updateTransport();
}

let lastTick = 0;
function tick(now: number) {
  if (!state.playing) return;
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  const total = schedule(state.project).total;
  // Audio is the master clock while it plays, so drawing stays in sync with the voice.
  if (state.project.audio && !audioEl.paused && audioEl.currentTime > 0 && audioEl.currentTime < audioEl.duration) state.time = audioEl.currentTime;
  else state.time += dt;
  if (state.time >= total) { state.time = total; stop(); }
  draw();
  if (state.playing) requestAnimationFrame(tick);
}

async function play(from?: number) {
  await prepareAll(state.project.elements);
  const total = schedule(state.project).total;
  state.time = from ?? (state.time >= total - 0.05 ? 0 : state.time);
  state.playing = true;
  if (state.project.audio) {
    audioEl.volume = state.project.audio.volume;
    audioEl.currentTime = state.time;
    audioEl.play().catch(() => { /* autoplay blocked; visuals still run */ });
  }
  lastTick = performance.now();
  requestAnimationFrame(tick);
  renderTransport();
}

function stop() {
  state.playing = false;
  audioEl.pause();
  renderTransport();
  requestDraw();
}

// ---------------- stage interaction ----------------
function screenToWorld(px: number, py: number) {
  const r = canvas.getBoundingClientRect();
  const dpr = canvas.width / r.width;
  const m = viewMatrix(state.view, canvas.width, canvas.height).inverse();
  return m.transformPoint({ x: (px - r.left) * dpr, y: (py - r.top) * dpr });
}

function hitTest(x: number, y: number): BoardElement | undefined {
  const els = state.project.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const b = boundsOf(els[i]);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return els[i];
  }
}

let drag: null | { kind: 'move'; id: string; dx: number; dy: number; moved: boolean } | { kind: 'pan'; sx: number; sy: number; cam: Camera } = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state.playing) stop();
  canvas.setPointerCapture(e.pointerId);
  const w = screenToWorld(e.clientX, e.clientY);
  const hit = hitTest(w.x, w.y);
  if (hit) {
    if (state.selected !== hit.id) { state.selected = hit.id; renderPanels(); }
    drag = { kind: 'move', id: hit.id, dx: w.x - hit.x, dy: w.y - hit.y, moved: false };
  } else {
    if (state.selected) { state.selected = null; renderPanels(); }
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...state.view } };
  }
  requestDraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.kind === 'move') {
    const w = screenToWorld(e.clientX, e.clientY);
    const it = el(drag.id);
    if (!it) return;
    it.x = Math.round(w.x - drag.dx); it.y = Math.round(w.y - drag.dy);
    drag.moved = true;
  } else {
    const r = canvas.getBoundingClientRect();
    const k = (r.width / 1920) * drag.cam.zoom;
    state.view = { ...drag.cam, x: drag.cam.x - (e.clientX - drag.sx) / k, y: drag.cam.y - (e.clientY - drag.sy) / k };
  }
  requestDraw();
});
canvas.addEventListener('pointerup', () => {
  if (drag?.kind === 'move' && drag.moved) commit({ rerender: false });
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = screenToWorld(e.clientX, e.clientY);
  const zoom = Math.max(0.25, Math.min(6, state.view.zoom * Math.exp(-e.deltaY * 0.0015)));
  state.view = { ...state.view, zoom };
  const after = screenToWorld(e.clientX, e.clientY);
  state.view.x += before.x - after.x; state.view.y += before.y - after.y;
  requestDraw();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (e.key === ' ') { e.preventDefault(); state.playing ? stop() : play(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { removeEl(state.selected); }
});

function removeEl(id: string) {
  state.project.elements = state.project.elements.filter((x) => x.id !== id);
  if (state.selected === id) state.selected = null;
  commit();
}

// ---------------- UI rendering ----------------
function renderAll() {
  document.title = `${state.project.title} – ${t('appName')}`;
  renderHeader();
  renderTabs();
  renderPanels();
  renderTransport();
  requestDraw();
}

function renderPanels() { renderProps(); renderTimeline(); }

function renderHeader() {
  $('header').replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'خ'), t('appName')),
    h('input', {
      class: 'title', value: state.project.title, 'aria-label': 'title',
      oninput: (e: Event) => { state.project.title = (e.target as HTMLInputElement).value; softCommit(); },
    }),
    h('button', { onclick: () => { loadProject(newProject(t('untitled'))); commit(); } }, t('new')),
    h('button', { onclick: openProjects }, t('open')),
    h('button', { onclick: undo, title: 'Ctrl+Z' }, t('undo')),
    h('button', { onclick: redo, title: 'Ctrl+Shift+Z' }, t('redo')),
    h('span', { id: 'status', class: 'status' }, state.saveStatus),
    h('span', { class: 'spacer' }),
    h('button', { onclick: () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderAll(); } }, t('lang')),
    h('button', { class: 'primary', onclick: openExport }, t('export')),
  );
}

function renderTabs() {
  const tabs: [typeof state.tab, Key][] = [['icons', 'icons'], ['pixabay', 'pixabay'], ['text', 'text'], ['upload', 'upload'], ['audio', 'audio']];
  $('tabs').replaceChildren(...tabs.map(([id, k]) => h('button', {
    class: state.tab === id ? 'tab active' : 'tab', onclick: () => { state.tab = id; renderTabs(); },
  }, t(k))));
  const body = $('library');
  body.replaceChildren();
  if (state.tab === 'icons') renderIconsTab(body);
  if (state.tab === 'pixabay') renderPixabayTab(body);
  if (state.tab === 'text') renderTextTab(body);
  if (state.tab === 'upload') renderUploadTab(body);
  if (state.tab === 'audio') renderAudioTab(body);
}

let iconQuery = '';
function renderIconsTab(body: HTMLElement) {
  const grid = h('div', { class: 'grid' });
  const note = h('div', { class: 'note' });
  const run = async () => {
    const { hits, translated, unknown } = await searchIcons(iconQuery, 90);
    note.textContent = [translated !== undefined ? `${t('searchedAs')}: ${translated || '—'}` : '', unknown.length ? `${t('unknownWords')}: ${unknown.join('، ')}` : ''].filter(Boolean).join(' · ');
    grid.replaceChildren(...(hits.length ? hits.map((hit) => {
      const b = h('button', { class: 'thumb', title: hit.name, onclick: () => addSvg(hit.name, hit.svg, { provider: 'tabler', id: hit.name, license: 'MIT (Tabler Icons)' }) });
      const img = h('img', { alt: hit.name, loading: 'lazy', src: 'data:image/svg+xml;utf8,' + encodeURIComponent(hit.svg.replace('<svg ', '<svg color="#222" ')) });
      b.append(img);
      return b;
    }) : [h('div', { class: 'note' }, t('noResults'))]));
  };
  let timer = 0;
  body.append(
    h('input', { type: 'search', dir: 'auto', placeholder: t('searchIcons'), value: iconQuery, oninput: (e: Event) => { iconQuery = (e.target as HTMLInputElement).value; clearTimeout(timer); timer = window.setTimeout(run, 200); } }),
    note, grid,
    h('div', { class: 'credit' }, 'Tabler Icons — MIT licence'),
  );
  run();
}

let pxQuery = '', pxType: 'illustration' | 'vector' | 'photo' | 'all' = 'illustration', pxPage = 1;
function renderPixabayTab(body: HTMLElement) {
  const grid = h('div', { class: 'grid photos' });
  const note = h('div', { class: 'note' });
  const more = h('button', { class: 'more', hidden: true, onclick: () => { pxPage++; run(true); } }, t('more'));
  pixabayConfigured().then((ok) => { if (!ok) note.textContent = t('pixabayOff'); });
  const run = async (append = false) => {
    if (!pxQuery.trim()) return;
    if (!append) { pxPage = 1; grid.replaceChildren(); }
    note.textContent = '…';
    try {
      const r = await searchPixabay(pxQuery, pxType, pxPage);
      note.textContent = [r.translated !== undefined ? `${t('searchedAs')}: ${r.translated || '—'}` : '', `${r.total}`].filter(Boolean).join(' · ');
      grid.append(...r.hits.map((hit: PixabayHit) => h('button', {
        class: 'thumb', title: `${hit.tags} — ${hit.user}`,
        onclick: async (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.disabled = true;
          try {
            const imp = await importPixabay(hit.id);
            await addImage(hit.tags.split(',')[0] || 'pixabay', imp.src, imp.source);
          } catch (err) { alert(String((err as Error).message)); } finally { btn.disabled = false; }
        },
      }, h('img', { src: hit.previewURL, alt: hit.tags, loading: 'lazy' }))));
      more.hidden = r.hits.length < 30;
    } catch (err) { note.textContent = (err as Error).message; }
  };
  body.append(
    h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
      h('input', { type: 'search', dir: 'auto', placeholder: t('searchPixabay'), value: pxQuery, oninput: (e: Event) => { pxQuery = (e.target as HTMLInputElement).value; } }),
      select(pxType, [['illustration', t('illustration')], ['vector', t('vector')], ['photo', t('photo')], ['all', t('all')]], (v) => { pxType = v; run(); })),
    h('div', { class: 'note' }, t('pixabayHint')),
    note, grid, more,
    h('a', { class: 'credit', href: 'https://pixabay.com/', target: '_blank', rel: 'noopener' }, 'Images from Pixabay'),
  );
  if (pxQuery) run();
}

function renderTextTab(body: HTMLElement) {
  let font: FontId = 'amiri', size = 96, color = '#1f1f1f';
  const ta = h('textarea', { dir: 'auto', rows: 5, placeholder: t('textPlaceholder') }) as HTMLTextAreaElement;
  body.append(
    ta,
    field(t('font'), select(font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => (font = v))),
    field(t('size'), num(size, (v) => (size = v), { min: 8, max: 600, step: 1 })),
    field(t('colour'), h('input', { type: 'color', value: color, oninput: (e: Event) => (color = (e.target as HTMLInputElement).value) })),
    h('button', { class: 'primary', onclick: () => { if (ta.value.trim()) addText(ta.value, font, size, color); } }, t('addText')),
  );
}

function renderUploadTab(body: HTMLElement) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const src = await uploadFile(f);
      if (f.type === 'image/svg+xml') await addSvg(f.name.replace(/\.svg$/i, ''), await f.text(), { provider: 'upload', id: src, license: 'user' });
      else await addImage(f.name, src, { provider: 'upload', id: src, license: 'user' });
    } catch (err) { alert((err as Error).message); }
    input.value = '';
  });
  body.append(h('div', { class: 'note' }, t('uploadHint')), input);
}

let recorder: MediaRecorder | null = null;
function renderAudioTab(body: HTMLElement) {
  const a = state.project.audio;
  const input = h('input', { type: 'file', accept: 'audio/*' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (f) await setAudio(f, f.name);
  });
  const rec = h('button', {
    onclick: async () => {
      if (recorder) { recorder.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks: Blob[] = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((tr) => tr.stop());
          const type = (recorder?.mimeType || 'audio/webm').split(';')[0];
          recorder = null;
          await setAudio(new File(chunks, 'recording', { type }), 'recording');
        };
        recorder.start();
        renderTabs();
      } catch (err) { alert((err as Error).message); }
    },
  }, recorder ? `■ ${t('stop')}` : `● ${t('record')}`);
  add(body,
    h('h3', {}, t('voice')),
    a ? h('div', { class: 'note' }, `${a.name} — ${a.duration.toFixed(1)}s`) : h('div', { class: 'note' }, t('noAudio')),
    input, rec,
    a && field(t('volume'), range(a.volume, (v) => { a.volume = v; audioEl.volume = v; softCommit(); }, 0, 1, 0.05)),
    a && h('button', { onclick: () => { state.project = fitToDuration(state.project, a.duration); commit(); } }, t('fitAudio')),
    a && h('button', { onclick: () => { state.project.audio = null; afterLoad(); commit(); } }, t('remove')),
  );
}

async function setAudio(f: File, name: string) {
  try {
    const src = await uploadFile(f);
    const probe = new Audio(src);
    await new Promise((r, j) => { probe.onloadedmetadata = r; probe.onerror = () => j(new Error('Could not read audio file')); });
    let duration = probe.duration;
    if (!Number.isFinite(duration)) { // MediaRecorder webm has no duration header
      const buf = await new AudioContext().decodeAudioData(await f.arrayBuffer());
      duration = buf.duration;
    }
    state.project.audio = { src, name, duration, volume: 1 };
    afterLoad();
    commit();
    renderTabs();
  } catch (err) { alert((err as Error).message); }
}

function renderProps() {
  const box = $('props');
  box.replaceChildren();
  const e = selectedEl();
  if (!e) return renderProjectProps(box);
  const upd = () => softCommit();
  const reprep = () => { prepareAll([e]).then(requestDraw); softCommit(); };
  add(box,
    h('h3', {}, t('element')),
    field(t('name'), h('input', { value: e.name, oninput: (ev: Event) => { e.name = (ev.target as HTMLInputElement).value; upd(); } })),
    e.kind === 'text' && h('textarea', { dir: 'auto', rows: 3, value: e.text, oninput: (ev: Event) => { e.text = (ev.target as HTMLTextAreaElement).value; reprep(); } }),
    e.kind === 'text' && field(t('font'), select(e.font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => { e.font = v; reprep(); })),
    e.kind === 'text' && field(t('size'), num(e.size, (v) => { e.size = v; reprep(); }, { min: 8, max: 600, step: 1 })),
    e.kind === 'text' && field(t('colour'), h('input', { type: 'color', value: e.color, oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } })),
    e.kind === 'text' && field(t('align'), select(e.align, [['start', t('alignStart')], ['center', t('alignCenter')], ['end', t('alignEnd')]], (v) => { e.align = v; reprep(); })),
    e.kind === 'svg' && field(t('colourOverride'), h('input', { type: 'color', value: e.color ?? '#1f1f1f', oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } })),
    e.kind === 'svg' && field(t('strokeWidth'), num(e.strokeWidth ?? 2, (v) => { e.strokeWidth = v; reprep(); }, { min: 0.1, max: 40, step: 0.1 })),
    field(t('reveal'), select(e.mode, [['draw', t('draw')], ['fade', t('fade')], ['move-in', t('moveIn')], ['none', t('none')]], (v) => { e.mode = v; upd(); })),
    field(t('direction'), select(e.direction, [['rtl', t('rtl')], ['ltr', t('ltr')]], (v) => { e.direction = v; reprep(); })),
    h('div', { class: 'triple' },
      field(t('transition'), num(e.timing.transition, (v) => { e.timing.transition = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('animate'), num(e.timing.animate, (v) => { e.timing.animate = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('pauseT'), num(e.timing.pause, (v) => { e.timing.pause = Math.max(0, v); upd(); }, { min: 0, step: 0.1 }))),
    field(t('scale'), num(e.scale, (v) => { e.scale = Math.max(0.01, v); upd(); }, { min: 0.01, step: e.scale >= 4 ? 0.5 : 0.05 })),
    field(t('rotation'), range(e.rotation, (v) => { e.rotation = v; upd(); }, -180, 180, 1)),
    field(t('opacity'), range(e.opacity, (v) => { e.opacity = v; upd(); }, 0.05, 1, 0.05)),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!e.noHand, onchange: (ev: Event) => { e.noHand = (ev.target as HTMLInputElement).checked; upd(); } }), t('hideHand')),
    h('div', { class: 'field' }, h('span', {}, `${t('camera')}: ${e.camera ? t('cameraSet') : t('cameraAuto')}`),
      h('div', { class: 'row' },
        h('button', { onclick: () => { e.camera = { ...state.view }; commit(); } }, t('setCamera')),
        h('button', { onclick: () => { e.camera = null; state.view = autoCamera(boundsOf(e)); commit(); } }, t('autoCamera')))),
    e.kind !== 'text' && e.source && e.source.provider !== 'upload' && h('div', { class: 'credit' },
      `${t('credit')}: `, e.source.pageUrl ? h('a', { href: e.source.pageUrl, target: '_blank', rel: 'noopener' }, e.source.author || e.source.provider) : e.source.id, ` · ${e.source.license}`),
    h('div', { class: 'row' },
      h('button', { onclick: () => { const c = structuredClone(e); c.id = uid(); c.x += 40; c.y += 40; state.project.elements.splice(state.project.elements.indexOf(e) + 1, 0, c); state.selected = c.id; commit(); } }, t('duplicate')),
      h('button', { class: 'danger', onclick: () => removeEl(e.id) }, t('del'))),
  );
}

function renderProjectProps(box: HTMLElement) {
  const p = state.project;
  const handFile = h('input', { type: 'file', accept: 'image/png,image/webp' }) as HTMLInputElement;
  handFile.addEventListener('change', async () => {
    const f = handFile.files?.[0];
    if (!f) return;
    const src = await uploadFile(f);
    p.customHand = { src, tipX: 0, tipY: 0, scale: 0.5 };
    await loadCustomHand(); commit();
  });
  add(box,
    h('h3', {}, t('project')),
    field(t('hand'), select(p.hand, [['marker-right', t('handRight')], ['marker-left', t('handLeft')], ['pen-only', t('penOnly')], ['none', t('noHand')]] as [HandId, string][], (v) => { p.hand = v; commit(); })),
    field(t('customHand'), handFile),
    p.customHand && h('div', { class: 'triple' },
      field(t('tipX'), num(p.customHand.tipX, (v) => { p.customHand!.tipX = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('tipY'), num(p.customHand.tipY, (v) => { p.customHand!.tipY = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('handScale'), num(p.customHand.scale, (v) => { p.customHand!.scale = v; loadCustomHand(); softCommit(); }, { step: 0.05, min: 0.05 }))),
    p.customHand && h('button', { onclick: () => { p.customHand = null; loadCustomHand(); commit(); } }, t('remove')),
    field(t('background'), h('input', { type: 'color', value: p.board.background, oninput: (e: Event) => { p.board.background = (e.target as HTMLInputElement).value; softCommit(); } })),
    field(t('endHold'), num(p.endHold, (v) => { p.endHold = Math.max(0, v); softCommit(); }, { min: 0 })),
    h('div', { class: 'note' }, t('stageHelp')),
  );
}

function renderTimeline() {
  const s = schedule(state.project);
  const box = $('timeline');
  box.replaceChildren(...state.project.elements.map((e, i) => {
    const dur = s.slots[i].end - s.slots[i].start;
    const card = h('div', {
      class: 'card' + (state.selected === e.id ? ' selected' : ''), draggable: 'true', 'data-id': e.id,
      style: `flex-basis:${Math.max(90, dur * 28)}px`,
      onclick: () => { state.selected = e.id; if (!state.playing) state.view = e.camera ?? autoCamera(boundsOf(e)); renderPanels(); requestDraw(); },
    },
      h('div', { class: 'card-kind' }, e.kind === 'text' ? 'T' : e.kind === 'image' ? '▣' : '✎', ` ${i + 1}`),
      h('div', { class: 'card-name', dir: 'auto' }, e.name),
      h('div', { class: 'card-time' }, `${dur.toFixed(1)}s`));
    card.addEventListener('dragstart', (ev) => ev.dataTransfer?.setData('text/plain', e.id));
    card.addEventListener('dragover', (ev) => ev.preventDefault());
    card.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const from = ev.dataTransfer?.getData('text/plain');
      const els = state.project.elements;
      const a = els.findIndex((x) => x.id === from), b = els.indexOf(e);
      if (a < 0 || a === b) return;
      const [moved] = els.splice(a, 1);
      els.splice(b, 0, moved);
      commit();
    });
    return card;
  }));
  if (!state.project.elements.length) box.append(h('div', { class: 'note' }, t('emptyBoard')));
  const tot = document.getElementById('total');
  if (tot) tot.textContent = `${t('total')}: ${s.total.toFixed(1)}s`;
}

function renderTransport() {
  const total = schedule(state.project).total;
  $('transport').replaceChildren(
    h('button', { class: 'primary', id: 'play', onclick: () => (state.playing ? stop() : play()) }, state.playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`),
    h('button', {
      onclick: () => {
        const i = state.project.elements.findIndex((e) => e.id === state.selected);
        play(i >= 0 ? schedule(state.project).slots[i].start : 0);
      },
    }, t('fromSelected')),
    h('input', {
      type: 'range', id: 'scrub', min: 0, max: total, step: 0.01, value: state.time,
      oninput: (e: Event) => {
        state.time = parseFloat((e.target as HTMLInputElement).value);
        if (!state.playing) { state.playing = true; draw(); state.playing = false; }
        updateTransport();
      },
    }),
    h('span', { id: 'clock' }),
    h('span', { id: 'total', class: 'total' }),
  );
  updateTransport();
  renderTimelineHighlight();
}

function updateTransport() {
  const total = schedule(state.project).total;
  const clock = document.getElementById('clock');
  if (clock) clock.textContent = `${state.time.toFixed(1)} / ${total.toFixed(1)}s`;
  const tot = document.getElementById('total');
  if (tot) tot.textContent = `${t('total')}: ${total.toFixed(1)}s`;
  const scrub = document.getElementById('scrub') as HTMLInputElement | null;
  if (scrub) { scrub.max = String(total); if (state.playing) scrub.value = String(state.time); }
  renderTimelineHighlight();
}

function renderTimelineHighlight() {
  if (!state.playing) return;
  const i = activeIndex(schedule(state.project), state.time);
  document.querySelectorAll('#timeline .card').forEach((c, k) => c.classList.toggle('playing', k === i));
}

// ---------------- dialogs ----------------
async function openProjects() {
  const list = await fetch('/api/projects').then((r) => r.json()).catch(() => []);
  const dlg = h('dialog', { class: 'dialog' },
    h('h3', {}, t('projects')),
    h('div', { class: 'list' }, (list as { id: string; title: string; elements: number; updated: number }[]).map((p) =>
      h('div', { class: 'row' },
        h('button', { class: 'grow', dir: 'auto', onclick: async () => { const proj = await fetch(`/api/projects/${p.id}`).then((r) => r.json()); loadProject(proj); dlg.close(); } },
          `${p.title} · ${p.elements} · ${new Date(p.updated).toLocaleString(getLang())}`),
        h('button', { class: 'danger', title: t('delProject'), onclick: async () => { if (confirm(t('confirmDelete'))) { await fetch(`/api/projects/${p.id}`, { method: 'DELETE' }); dlg.close(); openProjects(); } } }, '✕')))),
    h('button', { onclick: () => dlg.close() }, t('close')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function openExport() {
  if (state.playing) stop();
  let format: ExportFormat = 'mp4', res = '1080', fps = 30;
  let abort: AbortController | null = null;
  const bar = h('progress', { max: 1, value: 0 }) as HTMLProgressElement;
  const msg = h('div', { class: 'note' });
  const out = h('div', { class: 'row' });
  const startBtn = h('button', {
    class: 'primary', onclick: async () => {
      abort = new AbortController();
      startBtn.disabled = true; out.replaceChildren(); msg.textContent = t('exporting');
      const [w, hh] = res === '1080' ? [1920, 1080] : res === '720' ? [1280, 720] : [854, 480];
      const t0 = performance.now();
      try {
        const r = await exportVideo(state.project, { format, width: w, height: hh, fps, signal: abort.signal, customHand: state.customHand, onProgress: (f) => (bar.value = f) });
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        msg.textContent = `${t('done')} — ${r.frames} frames, ${r.codec}${r.withAudio ? ' + audio' : ''}, ${(r.blob.size / 1e6).toFixed(1)} MB, ${secs}s`;
        const name = `${state.project.title || 'khatt'}.${r.ext}`;
        out.replaceChildren(h('button', { class: 'primary', onclick: () => download(r.blob, name) }, `${t('download')} .${r.ext}`));
        download(r.blob, name);
      } catch (err) {
        msg.textContent = (err as Error).message;
      } finally { startBtn.disabled = false; abort = null; }
    },
  }, t('start'));
  const dlg = h('dialog', { class: 'dialog' },
    h('h3', {}, t('exportTitle')),
    field(t('format'), select(format, [['mp4', 'MP4 (H.264)'], ['webm', 'WebM (VP9)'], ['gif', 'GIF']], (v) => (format = v))),
    field(t('resolution'), select(res, [['1080', '1080p'], ['720', '720p'], ['480', '480p']], (v) => (res = v))),
    field(t('fps'), select(String(fps), [['30', '30'], ['25', '25'], ['24', '24']], (v) => (fps = Number(v)))),
    bar, msg, out,
    h('div', { class: 'row' },
      startBtn,
      h('button', { onclick: () => download(new Blob([exportSrt(state.project)], { type: 'application/x-subrip' }), `${state.project.title || 'khatt'}.srt`) }, t('subtitles')),
      h('button', { onclick: () => { abort?.abort(); dlg.close(); } }, t('close'))));
  dlg.addEventListener('close', () => { abort?.abort(); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------- boot ----------------
async function boot() {
  setLang(getLang());
  $('stage-wrap').append(canvas);
  new ResizeObserver(requestDraw).observe(canvas);
  let initial: Project | null = null;
  try {
    const list = await fetch('/api/projects').then((r) => (r.ok ? r.json() : []));
    if (list[0]) initial = await fetch(`/api/projects/${list[0].id}`).then((r) => r.json());
  } catch { /* server offline */ }
  if (!initial) { try { const s = localStorage.getItem('khatt.last'); if (s) initial = JSON.parse(s); } catch { /* ignore */ } }
  loadProject(initial ?? newProject(t('untitled')));
  // test hook
  (window as unknown as { khatt: unknown }).khatt = {
    state, play, stop, commit, exportVideo, elementSize, schedule: () => schedule(state.project),
    seek: (time: number) => { const was = state.playing; state.time = time; state.playing = true; draw(); state.playing = was; },
  };
}
boot();
