import { frameOf, type BoardElement, type Camera, type Project } from './types';
import { getPrepared, setInk, type Prepared, type PreparedRaster, type PreparedVector, type Pt } from './prepare';
import { drawBoard, boardInk, boardTool } from './board';
import { cameraAt, ease, revealProgress, schedule, type Bounds, type Schedule } from './timeline';
import { drawHand, type CustomHand } from './hand';

export function elementSize(el: BoardElement): { w: number; h: number } {
  const p = getPrepared(el);
  if (p) return { w: p.w, h: p.h };
  if (el.kind === 'image') return { w: el.width, h: el.height };
  return { w: 200, h: 200 };
}

export function boundsOf(el: BoardElement): Bounds {
  const { w, h } = elementSize(el);
  return { x: el.x, y: el.y, w: w * el.scale, h: h * el.scale };
}

/** World -> canvas pixels. At zoom 1 one frame of world units (frameW wide) fills the canvas. */
export function viewMatrix(cam: Camera, cw: number, ch: number, frameW: number): DOMMatrix {
  const k = cam.zoom * (cw / frameW);
  return new DOMMatrix([k, 0, 0, k, cw / 2 - cam.x * k, ch / 2 - cam.y * k]);
}

/** Extra motion on top of an element's own placement (entrance, emphasis, exit, morph). */
export interface Motion { dx?: number; dy?: number; scale?: number; rot?: number; alpha?: number }

function elementMatrix(el: BoardElement, w: number, h: number, mo: Motion = {}): DOMMatrix {
  const k = mo.scale ?? 1;
  return new DOMMatrix()
    .translate(el.x + (mo.dx ?? 0) + (w * el.scale) / 2, el.y + (mo.dy ?? 0) + (h * el.scale) / 2)
    .rotate(el.rotation + (mo.rot ?? 0))
    .scale(el.scale * k * (el.flipX ? -1 : 1), el.scale * k * (el.flipY ? -1 : 1))
    .translate(-w / 2, -h / 2);
}

const STROKE_PHASE = 0.85;

function drawVector(ctx: CanvasRenderingContext2D, p: PreparedVector, progress: number): Pt | null {
  const drawPhase = Math.min(1, progress / STROKE_PHASE);
  const fillRamp = Math.max(0, (progress - STROKE_PHASE) / (1 - STROKE_PHASE));
  const drawn = drawPhase * p.total;
  const window = Math.max(1, 0.06 * p.total);
  let acc = 0;
  let tip: Pt | null = null;
  for (const s of p.strokes) {
    const portion = Math.max(0, Math.min(s.length, drawn - acc));
    if (portion <= 0) break;
    ctx.save();
    ctx.transform(s.matrix.a, s.matrix.b, s.matrix.c, s.matrix.d, s.matrix.e, s.matrix.f);
    if (s.fillPath && s.fill && portion >= s.length) {
      const a = progress >= 1 ? 1 : Math.max(fillRamp, Math.min(1, (drawn - acc - s.length) / window));
      if (a > 0) {
        ctx.globalAlpha *= a;
        ctx.fillStyle = s.fill;
        ctx.fill(s.fillPath);
        ctx.globalAlpha /= a;
      }
    }
    const color = s.stroke ?? s.fill;
    if (color && (s.stroke || progress < 1)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = s.width;
      ctx.lineCap = s.cap;
      ctx.lineJoin = s.join;
      if (portion < s.length) ctx.setLineDash([portion, s.length + 1]);
      ctx.stroke(s.path);
    }
    ctx.restore();
    if (portion < s.length) {
      const f = (portion / s.length) * (s.samples.length - 1);
      const i = Math.floor(f);
      const a = s.samples[i], b = s.samples[Math.min(i + 1, s.samples.length - 1)];
      tip = { x: a.x + (b.x - a.x) * (f - i), y: a.y + (b.y - a.y) * (f - i) };
    }
    acc += s.length;
  }
  return progress >= 1 ? null : tip;
}

const SKETCH_PHASE = 0.7;

function drawRaster(ctx: CanvasRenderingContext2D, p: PreparedRaster, progress: number): Pt | null {
  const n = p.tiles.length;
  if (!n || progress >= 1) {
    ctx.globalAlpha *= n ? 1 : progress;
    ctx.drawImage(p.image, 0, 0, p.w, p.h);
    return null;
  }
  const sp = Math.min(1, progress / SKETCH_PHASE);
  const done = sp * n;
  const full = Math.floor(done);
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < Math.min(full, n); i++) { const t = p.tiles[i]; ctx.rect(t.x, t.y, t.w + 0.5, t.h + 0.5); }
  let tip: Pt | null = null;
  if (full < n) {
    const t = p.tiles[full];
    const frac = done - full;
    const forward = t.fwd; // serpentine: alternate rows sweep back
    const x0 = forward ? t.x : t.x + t.w * (1 - frac);
    ctx.rect(x0, t.y, t.w * frac, t.h);
    tip = { x: forward ? t.x + t.w * frac : t.x + t.w * (1 - frac), y: t.y + t.h * 0.6 };
  }
  ctx.clip();
  ctx.drawImage(p.sketch, 0, 0, p.w, p.h);
  ctx.restore();
  const colour = Math.max(0, (progress - SKETCH_PHASE) / (1 - SKETCH_PHASE));
  if (colour > 0) {
    ctx.globalAlpha *= colour;
    ctx.drawImage(p.image, 0, 0, p.w, p.h);
  }
  return progress < SKETCH_PHASE ? tip : null;
}

/** Draw one element; returns the pen tip in world space if it is mid-draw. */
export function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, prep: Prepared, progress: number, boardW = 1920, motion: Motion = {}): Pt | null {
  if (progress <= 0) return null;
  const mo = { ...motion };
  const mode = el.mode;
  ctx.save();
  ctx.globalAlpha *= el.opacity * (mo.alpha ?? 1);
  if (mode === 'move-in' && progress < 1) {
    const from = el.direction === 'rtl' ? boardW + 200 - el.x : -(prep.w * el.scale + el.x + 200);
    mo.dx = (mo.dx ?? 0) + from * (1 - ease(progress));
  } else if ((mode === 'fade' || mode === 'morph') && progress < 1) {
    ctx.globalAlpha *= progress;
  }
  const m = elementMatrix(el, prep.w, prep.h, mo);
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  const drawP = mode === 'draw' ? progress : 1;
  let tip: Pt | null = null;
  if (prep.kind === 'vector') tip = drawVector(ctx, prep, drawP);
  else tip = drawRaster(ctx, prep, drawP);
  ctx.restore();
  if (!tip || el.noHand || mode !== 'draw') return null;
  const w = m.transformPoint(tip);
  return { x: w.x, y: w.y };
}

const EXIT_SECONDS = 0.6;

/** Emphasis (while paused after drawing) and exit (when the scene ends). null = gone. */
export function motionAt(el: BoardElement, slot: Schedule['slots'][number], t: number, sceneEnd: number, prep: Prepared, boardW: number): Motion | null {
  const mo: Motion = {};
  if (el.emphasis && el.emphasis !== 'none' && t > slot.revealEnd && t < slot.end) {
    const u = (t - slot.revealEnd) / (slot.end - slot.revealEnd);
    const env = Math.sin(Math.PI * u); // starts and ends at rest
    if (el.emphasis === 'pulse') mo.scale = 1 + 0.09 * Math.abs(Math.sin(2 * Math.PI * u)) * env;
    if (el.emphasis === 'wiggle') mo.rot = 5 * Math.sin(6 * Math.PI * u) * env;
    if (el.emphasis === 'bounce') mo.dy = -0.08 * prep.h * el.scale * Math.abs(Math.sin(3 * Math.PI * u)) * env;
  }
  if (el.exit && el.exit !== 'none' && t > sceneEnd) {
    const pe = Math.min(1, (t - sceneEnd) / EXIT_SECONDS);
    if (pe >= 1) return null;
    if (el.exit === 'fade') mo.alpha = 1 - pe;
    if (el.exit === 'move-out') {
      const away = el.direction === 'rtl' ? -(el.x + prep.w * el.scale + 200) : boardW + 200 - el.x;
      mo.dx = (mo.dx ?? 0) + away * ease(pe);
    }
  }
  return mo;
}

/** VideoScribe-style morph: the previous picture turns into this one (moves, resizes, cross-fades). */
function drawMorph(ctx: CanvasRenderingContext2D, from: BoardElement, to: BoardElement, toPrep: Prepared, p: number, boardW: number) {
  const fromPrep = getPrepared(from);
  const a = boundsOf(from), b = boundsOf(to);
  const k = ease(p);
  const r = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
  const fit = (el: BoardElement, prep: Prepared) => {
    const s = Math.min(r.w / (prep.w * el.scale), r.h / (prep.h * el.scale)) * el.scale;
    return { ...el, mode: 'none' as const, scale: s, x: r.x + (r.w - prep.w * s) / 2, y: r.y + (r.h - prep.h * s) / 2, rotation: from.rotation + (to.rotation - from.rotation) * k };
  };
  if (fromPrep) drawElement(ctx, fit(from, fromPrep), fromPrep, 1, boardW, { alpha: 1 - k });
  drawElement(ctx, fit(to, toPrep), toPrep, 1, boardW, { alpha: k });
}

const sceneEndCache = new WeakMap<Schedule, Map<string, number>>();
function sceneEnds(p: Project, s: Schedule): Map<string, number> {
  let m = sceneEndCache.get(s);
  if (!m) {
    m = new Map();
    p.elements.forEach((e, i) => m!.set(e.scene ?? '', Math.max(m!.get(e.scene ?? '') ?? 0, s.slots[i].end)));
    sceneEndCache.set(s, m);
  }
  return m;
}

export interface FrameOptions {
  /** override camera (editor view) */
  camera?: Camera;
  /** draw every element fully (editing) */
  showAll?: boolean;
  selectedId?: string | null;
  customHand?: CustomHand | null;
  sched?: Schedule;
}

export function renderFrame(ctx: CanvasRenderingContext2D, p: Project, t: number, o: FrameOptions = {}): { pending: number } {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const s = o.sched ?? schedule(p);
  const cam = o.camera ?? cameraAt(p, s, t, boundsOf);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(0, 0, cw, ch);
  const v = viewMatrix(cam, cw, ch, frameOf(p).w);
  ctx.setTransform(v);
  setInk(boardInk(p));
  drawBoard(ctx, p);
  let pending = 0;
  let tip: Pt | null = null;
  const sceneEnd = o.showAll ? null : sceneEnds(p, s);
  p.elements.forEach((el, i) => {
    const prep = getPrepared(el);
    if (!prep) { pending++; return; }
    const progress = o.showAll ? 1 : revealProgress(s.slots[i], t);
    let tp: Pt | null = null;
    if (!o.showAll) {
      // An element that the next one morphs into stops being drawn on its own once the morph starts.
      const next = p.elements[i + 1];
      if (next?.mode === 'morph' && t >= s.slots[i + 1].revealStart) return;
      if (el.mode === 'morph' && i > 0 && progress > 0 && progress < 1) { drawMorph(ctx, p.elements[i - 1], el, prep, progress, p.board.width); return; }
      const mo = motionAt(el, s.slots[i], t, sceneEnd?.get(el.scene ?? '') ?? Infinity, prep, p.board.width);
      if (mo === null) return; // already left the board
      tp = drawElement(ctx, el, prep, progress, p.board.width, mo);
    } else {
      tp = drawElement(ctx, el, prep, progress, p.board.width);
    }
    if (tp) tip = tp;
    if (o.selectedId === el.id) {
      const b = boundsOf(el);
      ctx.save();
      ctx.strokeStyle = '#1d6fd6';
      ctx.lineWidth = 2 / v.a;
      ctx.setLineDash([8 / v.a, 6 / v.a]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  });
  if (tip && p.hand !== 'none') {
    const scr = v.transformPoint(tip as Pt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawHand(ctx, p.hand, scr.x, scr.y, ch * 0.22, o.customHand, { tone: p.handTone ?? 'medium', tool: boardTool(p) });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { pending };
}
