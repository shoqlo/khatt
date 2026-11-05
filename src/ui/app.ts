// Shared editor state and actions used by every panel.
import { newProject, newScene, uid, defaultTiming, frameOf, type BoardElement, type Camera, type Project, type TextElement, type SvgElement, type ImageElement, type FontId, type AssetSource } from '../engine/types';
import { prepare, prepareAll, setInk } from '../engine/prepare';
import { boardInk, boardIsDark } from '../engine/board';
import { buildChartSvg, type ChartSpec } from '../engine/chart';
import { fullView } from '../engine/timeline';
import { normalizeProject, insertIndexForScene, fitSceneToVoice } from '../engine/scenes';
import { preloadProjectSound, blobDuration } from './sound';
import type { CustomHand } from '../engine/hand';
import { isRtlText } from '../engine/text';
import { putProject, putAsset, resolveUrl, requestPersistence, storageIsVolatile } from '../storage/db';
import { t, getLang } from './i18n';
import { toast } from './toast';

export const state = {
  project: newProject(),
  selected: null as string | null,
  /** selected scene (when no element is selected) */
  scene: null as string | null,
  /** when set, the next drawing/photo picked replaces this element instead of adding one */
  replaceTarget: null as string | null,
  view: { x: 960, y: 540, zoom: 1 } as Camera,
  playing: false,
  time: 0,
  tab: 'icons' as 'icons' | 'online' | 'text' | 'chart' | 'upload' | 'audio',
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
  openSheet: (_s: 'add' | 'edit' | '') => {},
  play: undefined as ((from?: number) => void) | undefined,
  stop: undefined as (() => void) | undefined,
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
  state.project = normalizeProject({ ...newProject(), ...p });
  state.selected = null;
  state.scene = null;
  state.replaceTarget = null;
  state.time = 0;
  state.view = fullView(state.project);
  undoStack.length = 0; redoStack.length = 0;
  lastSnapshot = JSON.stringify(state.project);
  afterLoad();
}

export function afterLoad() {
  normalizeProject(state.project);
  if (state.selected && !findEl(state.selected)) state.selected = null;
  if (state.scene && !state.project.scenes.some((s) => s.id === state.scene)) state.scene = null;
  preloadProjectSound(state.project);
  loadCustomHand();
  setInk(boardInk(state.project));
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

/** The scene new elements go into: the selected scene, else the selected element's scene, else the last scene. */
export function currentSceneId(): string {
  const p = state.project;
  if (state.scene && p.scenes.some((s) => s.id === state.scene)) return state.scene;
  const sel = state.selected ? findEl(state.selected) : undefined;
  return sel?.scene ?? p.scenes[p.scenes.length - 1].id;
}

export function addScene(): string {
  const p = state.project;
  const s = newScene(String(p.scenes.length + 1));
  const after = p.scenes.findIndex((x) => x.id === currentSceneId());
  p.scenes.splice(after + 1, 0, s);
  state.scene = s.id;
  state.selected = null;
  normalizeProject(p);
  commit();
  return s.id;
}

/** Attach a recording/upload to a scene and stretch the scene to the voice. */
export async function setSceneVoice(sceneId: string, blob: Blob, name: string) {
  const scene = state.project.scenes.find((s) => s.id === sceneId);
  if (!scene) return;
  const duration = await blobDuration(blob);
  const src = await putAsset(blob, name);
  scene.voice = { src, name, duration, volume: 1 };
  fitSceneToVoice(state.project, sceneId);
  preloadProjectSound(state.project);
  commit();
}

async function addElement(e: BoardElement) {
  let size: { w: number; h: number };
  try {
    size = await prepare(e);
  } catch (err) {
    toast(`${t('error')}: ${(err as Error).message}`, 'error');
    return;
  }
  const target = state.replaceTarget ? findEl(state.replaceTarget) : undefined;
  if (state.replaceTarget) { state.replaceTarget = null; document.body.classList.remove('replacing'); ui.renderTabs(); }
  if (target) return replaceElement(target, e, size);
  // Place near the centre of the current view, nudged so new things don't stack exactly.
  // Zoomed out over a multi-scene board (e.g. right after the draft played), the view's centre
  // falls between scenes: put it in its own scene's frame instead, and show that scene.
  e.scene = currentSceneId();
  const sceneCam = state.project.elements.find((x) => x.scene === e.scene && x.camera)?.camera;
  if (sceneCam && state.view.zoom < 0.9) state.view = { ...sceneCam };
  const n = state.project.elements.length;
  e.x = Math.round(state.view.x - (size.w * e.scale) / 2 + ((n % 5) - 2) * 30);
  e.y = Math.round(state.view.y - (size.h * e.scale) / 2 + ((n % 3) - 1) * 30);
  state.project.elements.splice(insertIndexForScene(state.project, e.scene), 0, e);
  state.selected = e.id;
  await prepareAll([e]);
  commit();
  toast(t('added'), 'ok', 1200);
  ui.closeSheetOnPhone();
}

/** Swap a drawing for another one: same place, same size on screen, same timing and scene. */
async function replaceElement(target: BoardElement, e: BoardElement, size: { w: number; h: number }) {
  const old = await prepare(target).catch(() => null);
  const ow = old ? old.w * target.scale : 300, oh = old ? old.h * target.scale : 300;
  const scale = Math.min(ow / size.w, oh / size.h);
  const cx = target.x + ow / 2, cy = target.y + oh / 2;
  const merged = {
    ...e, id: target.id, scene: target.scene, timing: target.timing, mode: target.mode, direction: target.direction,
    camera: target.camera, noHand: target.noHand, rotation: target.rotation, opacity: target.opacity,
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(cx - (size.w * scale) / 2), y: Math.round(cy - (size.h * scale) / 2),
  } as BoardElement;
  if (merged.kind === 'svg' && e.kind === 'svg' && e.strokeWidth != null) merged.strokeWidth = Math.round((e.strokeWidth * e.scale / scale) * 100) / 100;
  const i = state.project.elements.indexOf(target);
  state.project.elements[i] = merged;
  state.selected = merged.id;
  await prepareAll([merged]);
  commit();
  toast(t('replaced'), 'ok', 1200);
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

/** A chart the hand draws: built from its data, editable in the Edit panel. */
export async function addChart(spec: ChartSpec) {
  const rtl = isRtlText(spec.title) || spec.labels.some(isRtlText);
  let svg: string;
  try { svg = await buildChartSvg(spec, { rtl, dark: boardIsDark(state.project) }); } catch (err) { toast(`${t('error')}: ${(err as Error).message}`, 'error'); return; }
  const f = frameOf(state.project);
  const scale = Math.round(((Math.min(f.w, f.h) * 0.8) / 1000) * 100) / 100;
  const e: SvgElement = {
    ...base(spec.title || t('chart')), kind: 'svg', svg, color: null, strokeWidth: null, scale, chart: spec,
    direction: rtl ? 'rtl' : 'ltr',
    timing: { ...defaultTiming(), animate: Math.min(10, 3 + spec.labels.length * 0.7) },
  };
  return addElement(e);
}

/** Rebuild a chart's drawing after its data, direction or the board look changed. */
export async function rebuildChart(e: SvgElement) {
  if (!e.chart) return;
  e.svg = await buildChartSvg(e.chart, { rtl: e.direction === 'rtl', dark: boardIsDark(state.project) });
  if (e.chart.title.trim()) e.name = e.chart.title.slice(0, 24);
  await prepareAll([e]);
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

/** A picture used straight from its web link (Unsplash's rule: no copy on the device). */
export function addImageUrl(name: string, url: string, width: number, height: number, source?: AssetSource) {
  const scale = Math.min(1, 700 / Math.max(width, height));
  const e: ImageElement = { ...base(name), kind: 'image', src: url, width, height, scale: Math.round(scale * 100) / 100, source };
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

/** Move an element one step earlier/later inside its own scene. */
export function moveEl(id: string, delta: -1 | 1) {
  const els = state.project.elements;
  const i = els.findIndex((e) => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= els.length || els[j].scene !== els[i].scene) return;
  [els[i], els[j]] = [els[j], els[i]];
  commit();
}

export function canMoveEl(id: string, delta: -1 | 1): boolean {
  const els = state.project.elements;
  const i = els.findIndex((e) => e.id === id);
  const j = i + delta;
  return i >= 0 && j >= 0 && j < els.length && els[j].scene === els[i].scene;
}

export function moveElToScene(id: string, sceneId: string) {
  const el = findEl(id);
  if (!el || el.scene === sceneId) return;
  state.project.elements = state.project.elements.filter((e) => e !== el);
  el.scene = sceneId;
  state.project.elements.splice(insertIndexForScene(state.project, sceneId), 0, el);
  normalizeProject(state.project);
  commit();
}
