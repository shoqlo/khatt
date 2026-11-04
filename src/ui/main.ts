import './styles.css';
import { newProject, type Camera, type Project } from '../engine/types';
import { renderFrame, boundsOf, viewMatrix, elementSize } from '../engine/render';
import { schedule, FULL_BOARD, activeIndex, autoCamera } from '../engine/timeline';
import { prepareAll } from '../engine/prepare';
import { exportVideo } from '../engine/export';
import { getProject, listProjects } from '../storage/db';
import { state, ui, commit, undo, redo, loadProject, findEl, removeEl, audioEl, isPhone } from './app';
import { renderTabs } from './panels';
import { renderProps } from './props';
import { openMenu, openExport, openProjects } from './dialogs';
import { h } from './dom';
import { t, getLang, setLang } from './i18n';
import { toast } from './toast';

const $ = (id: string) => document.getElementById(id)!;
const canvas = h('canvas', { id: 'stage', tabindex: 0, 'aria-label': 'board' }) as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ---------------- sheets (phone) ----------------
type Sheet = '' | 'add' | 'edit';
function setSheet(s: Sheet) {
  document.body.dataset.sheet = s;
  renderBottomBar();
  requestAnimationFrame(requestDraw);
}
const sheet = () => (document.body.dataset.sheet ?? '') as Sheet;
ui.closeSheetOnPhone = () => { if (isPhone()) setSheet(''); };

// ---------------- drawing & playback ----------------
let drawQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

function draw() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
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
  // While the voice-over plays it is the master clock, so drawing stays in sync with it.
  if (state.project.audio && !audioEl.paused && audioEl.currentTime > 0 && audioEl.currentTime < audioEl.duration) state.time = audioEl.currentTime;
  else state.time += dt;
  if (state.time >= total) { state.time = total; stop(); }
  draw();
  if (state.playing) requestAnimationFrame(tick);
}

async function play(from?: number) {
  if (isPhone()) setSheet('');
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
  renderTransport(); renderBottomBar();
}

function stop() {
  state.playing = false;
  audioEl.pause();
  renderTransport(); renderBottomBar();
  requestDraw();
}

// ---------------- stage: mouse + touch ----------------
function toWorld(px: number, py: number, cam: Camera = state.view) {
  const r = canvas.getBoundingClientRect();
  const dpr = canvas.width / r.width;
  return viewMatrix(cam, canvas.width, canvas.height).inverse().transformPoint({ x: (px - r.left) * dpr, y: (py - r.top) * dpr });
}

function hitTest(x: number, y: number) {
  const els = state.project.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const b = boundsOf(els[i]);
    const pad = isPhone() ? 20 : 0; // fingers are less precise than a mouse
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return els[i];
  }
}

const pointers = new Map<number, { x: number; y: number }>();
type Gesture =
  | { kind: 'move'; id: string; dx: number; dy: number; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; moved: boolean }
  | { kind: 'pinch'; d0: number; c0: { x: number; y: number }; cam: Camera; el?: { id: string; scale: number; cx: number; cy: number; w: number; h: number } };
let gesture: Gesture | null = null;
let lastTap = { time: 0, x: 0, y: 0 };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

canvas.addEventListener('pointerdown', (e) => {
  if (state.playing) stop();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const c0 = mid(a, b);
    const g: Gesture = { kind: 'pinch', d0: Math.max(10, dist(a, b)), c0, cam: { ...state.view } };
    // Two fingers that started on the selected drawing resize it; otherwise they zoom the view.
    if (gesture?.kind === 'move') {
      const el = findEl(gesture.id);
      if (el) {
        const { w, h: eh } = elementSize(el);
        g.el = { id: el.id, scale: el.scale, cx: el.x + (w * el.scale) / 2, cy: el.y + (eh * el.scale) / 2, w, h: eh };
      }
    }
    gesture = g;
    return;
  }
  if (pointers.size > 2) return;
  const w = toWorld(e.clientX, e.clientY);
  const hit = hitTest(w.x, w.y);
  if (hit) {
    if (state.selected !== hit.id) { state.selected = hit.id; ui.renderPanels(); renderBottomBar(); }
    gesture = { kind: 'move', id: hit.id, dx: w.x - hit.x, dy: w.y - hit.y, moved: false };
  } else {
    gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...state.view }, moved: false };
  }
  requestDraw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const k = dist(a, b) / gesture.d0;
    const c = mid(a, b);
    if (gesture.el) {
      const el = findEl(gesture.el.id);
      if (el) {
        el.scale = Math.max(0.02, Math.min(60, gesture.el.scale * k));
        el.x = Math.round(gesture.el.cx - (gesture.el.w * el.scale) / 2);
        el.y = Math.round(gesture.el.cy - (gesture.el.h * el.scale) / 2);
      }
    } else {
      // Zoom around the fingers and follow them as they move.
      const zoom = Math.max(0.25, Math.min(8, gesture.cam.zoom * k));
      const anchor = toWorld(gesture.c0.x, gesture.c0.y, gesture.cam);
      state.view = { ...gesture.cam, zoom };
      const now = toWorld(c.x, c.y);
      state.view.x += anchor.x - now.x; state.view.y += anchor.y - now.y;
    }
  } else if (gesture.kind === 'move') {
    const w = toWorld(e.clientX, e.clientY);
    const el = findEl(gesture.id);
    if (!el) return;
    if (!gesture.moved && Math.hypot(w.x - gesture.dx - el.x, w.y - gesture.dy - el.y) < 2) return;
    el.x = Math.round(w.x - gesture.dx); el.y = Math.round(w.y - gesture.dy);
    gesture.moved = true;
  } else if (gesture.kind === 'pan') {
    const r = canvas.getBoundingClientRect();
    const k = (r.width / 1920) * gesture.cam.zoom;
    if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 4) gesture.moved = true;
    state.view = { ...gesture.cam, x: gesture.cam.x - (e.clientX - gesture.sx) / k, y: gesture.cam.y - (e.clientY - gesture.sy) / k };
  }
  requestDraw();
});

function endPointer(e: PointerEvent) {
  if (!pointers.delete(e.pointerId)) return;
  const g = gesture;
  if (g?.kind === 'pinch') {
    if (g.el) commit({ rerender: false });
    if (pointers.size === 0) gesture = null;
    return; // ignore the remaining finger until all are lifted
  }
  if (pointers.size) return;
  gesture = null;
  if (g?.kind === 'move' && g.moved) commit({ rerender: false });
  if (g?.kind === 'pan' && !g.moved) {
    // Tap on empty board: deselect; double-tap: show the whole board.
    const now = performance.now();
    if (now - lastTap.time < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) state.view = { ...FULL_BOARD };
    lastTap = { time: now, x: e.clientX, y: e.clientY };
    if (state.selected) { state.selected = null; ui.renderPanels(); renderBottomBar(); }
  }
  if (g?.kind === 'move' && !g.moved && isPhone()) {
    const now = performance.now();
    if (now - lastTap.time < 350) setSheet('edit'); // double-tap a drawing to edit it
    lastTap = { time: now, x: e.clientX, y: e.clientY };
  }
  requestDraw();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY);
  state.view = { ...state.view, zoom: Math.max(0.25, Math.min(8, state.view.zoom * Math.exp(-e.deltaY * 0.0015))) };
  const after = toWorld(e.clientX, e.clientY);
  state.view.x += before.x - after.x; state.view.y += before.y - after.y;
  requestDraw();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (e.key === ' ') { e.preventDefault(); state.playing ? stop() : play(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) removeEl(state.selected);
});

// ---------------- chrome ----------------
function renderAll() {
  document.title = `${state.project.title} – ${t('appName')}`;
  renderHeader();
  renderTabs();
  renderPanels();
  renderTransport();
  renderBottomBar();
  $('sheet-add-title').textContent = t('add');
  $('sheet-edit-title').textContent = t('edit');
  document.querySelectorAll('.sheet-close').forEach((b) => b.setAttribute('aria-label', t('close')));
  requestDraw();
}
function renderPanels() { renderProps(); renderTimeline(); }

function renderHeader() {
  $('header').replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, 'خ'), h('span', { class: 'brand-name' }, t('appName'))),
    h('input', {
      class: 'title', value: state.project.title, 'aria-label': 'title', dir: 'auto',
      oninput: (e: Event) => { state.project.title = (e.target as HTMLInputElement).value; document.title = `${state.project.title} – ${t('appName')}`; commit({ rerender: false }); },
    }),
    h('button', { class: 'icon', onclick: undo, title: `${t('undo')} (Ctrl+Z)`, 'aria-label': t('undo') }, '↶'),
    h('button', { class: 'icon', onclick: redo, title: `${t('redo')} (Ctrl+Shift+Z)`, 'aria-label': t('redo') }, '↷'),
    h('span', { id: 'status', class: 'status' }, state.saveStatus),
    h('span', { class: 'spacer' }),
    h('button', { class: 'desktop-only', onclick: openProjects }, t('projects')),
    h('button', { class: 'desktop-only', onclick: () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderAll(); } }, t('lang')),
    h('button', { class: 'desktop-only', onclick: openMenu }, `☰ ${t('menu')}`),
    h('button', { class: 'primary desktop-only', onclick: () => { if (state.playing) stop(); openExport(); } }, t('export')),
  );
}

function renderBottomBar() {
  const s = sheet();
  const btn = (id: string, icon: string, label: string, on: () => void, extra = '') =>
    h('button', { class: `bb ${extra}`, 'data-id': id, onclick: on, 'aria-label': label }, h('span', { class: 'bb-icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'bb-label' }, label));
  $('bottombar').replaceChildren(
    btn('add', '＋', t('add'), () => setSheet(s === 'add' ? '' : 'add'), s === 'add' ? 'active' : ''),
    btn('edit', '✎', t('edit'), () => setSheet(s === 'edit' ? '' : 'edit'), `${s === 'edit' ? 'active' : ''} ${state.selected ? 'has-selection' : ''}`),
    btn('play', state.playing ? '❚❚' : '▶', state.playing ? t('pause') : t('play'), () => (state.playing ? stop() : play()), 'play'),
    btn('export', '⤓', t('export'), () => { if (state.playing) stop(); openExport(); }),
    btn('menu', '☰', t('menu'), openMenu),
  );
}

function renderTimeline() {
  const s = schedule(state.project);
  const box = $('timeline');
  box.replaceChildren(...state.project.elements.map((e, i) => {
    const dur = s.slots[i].end - s.slots[i].start;
    const card = h('div', {
      class: 'card' + (state.selected === e.id ? ' selected' : ''), draggable: 'true', 'data-id': e.id, role: 'button', tabindex: 0,
      style: `flex-basis:${Math.max(84, Math.min(260, dur * 26))}px`,
      onclick: () => {
        state.selected = e.id;
        if (!state.playing) state.view = e.camera ?? autoCamera(boundsOf(e));
        renderPanels(); renderBottomBar(); requestDraw();
      },
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
  if (!state.project.elements.length) box.append(h('div', { class: 'note empty' }, isPhone() ? t('emptyBoard') : t('emptyBoardDesktop')));
  updateTransport();
}

function renderTransport() {
  const total = schedule(state.project).total;
  $('transport').replaceChildren(
    h('button', { class: 'primary desktop-only', onclick: () => (state.playing ? stop() : play()) }, state.playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`),
    h('button', {
      class: 'desktop-only',
      onclick: () => {
        const i = state.project.elements.findIndex((e) => e.id === state.selected);
        play(i >= 0 ? schedule(state.project).slots[i].start : 0);
      },
    }, t('fromSelected')),
    h('input', {
      type: 'range', id: 'scrub', min: 0, max: total, step: 0.01, value: state.time, 'aria-label': 'time',
      oninput: (e: Event) => {
        state.time = parseFloat((e.target as HTMLInputElement).value);
        if (!state.playing) { state.playing = true; draw(); state.playing = false; }
        updateTransport();
      },
    }),
    h('span', { id: 'clock', dir: 'ltr' }),
  );
  updateTransport();
}

function updateTransport() {
  const total = schedule(state.project).total;
  const clock = document.getElementById('clock');
  if (clock) clock.textContent = `${state.time.toFixed(1)} / ${total.toFixed(1)}s`;
  const scrub = document.getElementById('scrub') as HTMLInputElement | null;
  if (scrub) { scrub.max = String(total); if (state.playing) scrub.value = String(state.time); }
  if (state.playing) {
    const i = activeIndex(schedule(state.project), state.time);
    document.querySelectorAll('#timeline .card').forEach((c, k) => c.classList.toggle('playing', k === i));
  }
}

ui.renderAll = renderAll;
ui.renderPanels = renderPanels;
ui.renderTimeline = renderTimeline;
ui.requestDraw = requestDraw;

// ---------------- service worker (offline + installable) ----------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // Reload only when the person accepted an update (not when the first install takes control).
  let updating = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (w: ServiceWorker | null) => {
      if (!w || !navigator.serviceWorker.controller) return; // first install: nothing to update
      toast(t('updateReady'), 'info', 0, { label: t('reload'), run: () => { updating = true; w.postMessage('SKIP_WAITING'); } });
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
  }).catch((e) => console.warn('service worker', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
}

// ---------------- boot ----------------
async function boot() {
  setLang(getLang());
  $('stage-wrap').append(canvas);
  new ResizeObserver(requestDraw).observe(canvas);
  document.querySelectorAll('.sheet-close').forEach((b) => b.addEventListener('click', () => setSheet('')));
  window.matchMedia('(max-width: 899px)').addEventListener('change', () => { setSheet(''); renderAll(); });
  window.addEventListener('online', () => document.body.classList.remove('offline'));
  window.addEventListener('offline', () => { document.body.classList.add('offline'); toast(t('offline'), 'warn', 6000); });
  let initial: Project | null = null;
  try {
    const current = localStorage.getItem('khatt.current');
    if (current) initial = await getProject(current);
    if (!initial) { const list = await listProjects(); if (list[0]) initial = await getProject(list[0].id); }
  } catch { /* storage unavailable: start fresh */ }
  loadProject(initial ?? newProject(t('untitled')));
  registerServiceWorker();
  // Hook for automated tests.
  (window as unknown as { khatt: unknown }).khatt = {
    state, play, stop, commit, exportVideo, elementSize, setSheet, schedule: () => schedule(state.project),
    seek: (time: number) => { const was = state.playing; state.time = time; state.playing = true; draw(); state.playing = was; },
  };
}
boot();
