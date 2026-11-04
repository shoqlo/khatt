// Shared editor state and actions used by every panel.
import { newProject, uid, defaultTiming, type BoardElement, type Camera, type Project, type TextElement, type SvgElement, type ImageElement, type FontId, type AssetSource } from '../engine/types';
import { prepare, prepareAll } from '../engine/prepare';
import { FULL_BOARD } from '../engine/timeline';
import type { CustomHand } from '../engine/hand';
import { isRtlText } from '../engine/text';
import { putProject, putAsset, resolveUrl, requestPersistence, storageIsVolatile } from '../storage/db';
import { t, getLang } from './i18n';
import { toast } from './toast';

export const state = {
  project: newProject(),
  selected: null as string | null,
  view: { ...FULL_BOARD } as Camera,
  playing: false,
  time: 0,
  tab: 'icons' as 'icons' | 'online' | 'text' | 'upload' | 'audio',
  saveStatus: '',
  customHand: null as CustomHand | null,
};

/** Rendering hooks, filled in by main.ts (keeps panels free of import cycles). */
export const ui = {
  renderAll: () => {},
  renderPanels: () => {},
  renderTimeline: () => {},
  renderTabs: () => {},
  requestDraw: () => {},
  closeSheetOnPhone: () => {},
};

export const isPhone = () => window.matchMedia('(max-width: 899px)').matches;

// ---------------- history & saving ----------------
const undoStack: string[] = [];
const redoStack: string[] = [];
let lastSnapshot = '';
let saveTimer = 0;
let persistedAsked = false;

export function commit(opts: { rerender?: boolean } = {}) {
  const snap = JSON.stringify(state.project);
  if (snap !== lastSnapshot) {
    if (lastSnapshot) undoStack.push(lastSnapshot);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = snap;
    scheduleSave();
  }
  if (opts.rerender !== false) ui.renderPanels();
  ui.requestDraw();
}

let coalesceTimer = 0;
/** For sliders/typing: update now, record one undo step when the user pauses. */
export function softCommit() {
  ui.requestDraw();
  ui.renderTimeline();
  clearTimeout(coalesceTimer);
  coalesceTimer = window.setTimeout(() => commit({ rerender: false }), 400);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus(t('saving'));
  saveTimer = window.setTimeout(save, 600);
}

/** Save right away if a save is pending (used when the app is hidden or closed). */
export function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  save();
}
// Phones suspend backgrounded apps without warning: save the moment the app is hidden.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);

export async function save() {
  saveTimer = 0;
  try {
    await putProject(state.project);
    try { localStorage.setItem('khatt.current', state.project.id); } catch { /* ignore */ }
    setStatus(t('saved'));
    if (!persistedAsked) { persistedAsked = true; requestPersistence(); }
    if (storageIsVolatile) warnVolatileOnce();
  } catch (e) {
    console.error(e);
    setStatus(t('saveFailed'));
  }
}

let warned = false;
function warnVolatileOnce() { if (!warned) { warned = true; toast(t('volatile'), 'warn', 9000); } }

export function setStatus(s: string) {
  state.saveStatus = s;
  const el = document.getElementById('status');
  if (el) el.textContent = s;
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(lastSnapshot);
  lastSnapshot = undoStack.pop()!;
  state.project = JSON.parse(lastSnapshot);
  afterLoad(); scheduleSave();
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(lastSnapshot);
  lastSnapshot = redoStack.pop()!;
  state.project = JSON.parse(lastSnapshot);
  afterLoad(); scheduleSave();
}

export function loadProject(p: Project) {
  state.project = { ...newProject(), ...p };
  state.selected = null;
  state.time = 0;
  state.view = { ...FULL_BOARD };
  undoStack.length = 0; redoStack.length = 0;
  lastSnapshot = JSON.stringify(state.project);
  afterLoad();
}

export const audioEl = new Audio();

export function afterLoad() {
  if (state.selected && !findEl(state.selected)) state.selected = null;
  const a = state.project.audio;
  if (a && audioEl.dataset.src !== a.src) {
    audioEl.dataset.src = a.src;
    resolveUrl(a.src).then((u) => { audioEl.src = u; }).catch((e) => toast(String(e.message), 'error'));
  }
  if (!a) { audioEl.removeAttribute('src'); delete audioEl.dataset.src; }
  loadCustomHand();
  prepareAll(state.project.elements).catch((e) => toast(String(e.message), 'error')).finally(ui.requestDraw);
  ui.renderAll();
}

export async function loadCustomHand() {
  const c = state.project.customHand;
  if (!c) { state.customHand = null; ui.requestDraw(); return; }
  try {
    const img = new Image();
    img.src = await resolveUrl(c.src);
    await img.decode();
    state.customHand = { image: img, tipX: c.tipX, tipY: c.tipY, scale: c.scale };
  } catch { state.customHand = null; }
  ui.requestDraw();
}

export const findEl = (id: string) => state.project.elements.find((e) => e.id === id);
export const selectedEl = () => (state.selected ? findEl(state.selected) : undefined);

// ---------------- adding elements ----------------
function base(name: string) {
  return {
    id: uid(), name, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, mode: 'draw' as const,
    direction: (getLang() === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr', timing: defaultTiming(), camera: null,
  };
}

async function addElement(e: BoardElement) {
  try {
    const p = await prepare(e);
    // Place near the centre of the current view, nudged so new things don't stack exactly.
    const n = state.project.elements.length;
    e.x = Math.round(state.view.x - (p.w * e.scale) / 2 + ((n % 5) - 2) * 30);
    e.y = Math.round(state.view.y - (p.h * e.scale) / 2 + ((n % 3) - 1) * 30);
  } catch (err) {
    toast(`${t('error')}: ${(err as Error).message}`, 'error');
    return;
  }
  state.project.elements.push(e);
  state.selected = e.id;
  await prepareAll([e]);
  commit();
  toast(t('added'), 'ok', 1200);
  ui.closeSheetOnPhone();
}

export function addSvg(name: string, svg: string, source?: AssetSource, style?: 'hand' | 'line' | 'colour') {
  const vb = svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/);
  const size = vb ? Math.max(parseFloat(vb[1]), parseFloat(vb[2])) : 300;
  const scale = Math.round((320 / size) * 100) / 100;
  // Icon-style line art is drawn with a 2px pen at 24px; scaled up 13x that is too heavy for a board.
  const strokeWidth = style === 'line' ? Math.round((14 / scale) * 100) / 100 : null;
  const e: SvgElement = { ...base(name), kind: 'svg', svg, color: null, strokeWidth, scale, source };
  return addElement(e);
}

export async function addImageBlob(name: string, blob: Blob, source?: AssetSource) {
  const src = await putAsset(blob, name);
  const img = new Image();
  img.src = await resolveUrl(src);
  await img.decode();
  const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
  const e: ImageElement = { ...base(name), kind: 'image', src, width: img.naturalWidth, height: img.naturalHeight, scale: Math.round(scale * 100) / 100, source };
  return addElement(e);
}

export function addText(text: string, font: FontId, size: number, color: string) {
  const rtl = isRtlText(text);
  const e: TextElement = {
    ...base(text.slice(0, 24)), kind: 'text', text, font, size, color, align: 'center',
    direction: rtl ? 'rtl' : 'ltr',
    timing: { ...defaultTiming(), animate: Math.min(8, Math.max(1.5, text.length * 0.12)) },
  };
  return addElement(e);
}

export function removeEl(id: string) {
  state.project.elements = state.project.elements.filter((x) => x.id !== id);
  if (state.selected === id) state.selected = null;
  commit();
}

export function moveEl(id: string, delta: -1 | 1) {
  const els = state.project.elements;
  const i = els.findIndex((e) => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= els.length) return;
  [els[i], els[j]] = [els[j], els[i]];
  commit();
}
