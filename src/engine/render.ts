import { BOARD_W, type BoardElement, type Camera, type Project } from './types';
import { getPrepared, type Prepared, type PreparedRaster, type PreparedVector, type Pt } from './prepare';
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

export function viewMatrix(cam: Camera, cw: number, ch: number): DOMMatrix {
  const k = cam.zoom * (cw / BOARD_W);
  return new DOMMatrix([k, 0, 0, k, cw / 2 - cam.x * k, ch / 2 - cam.y * k]);
}

function elementMatrix(el: BoardElement, w: number, h: number, dx = 0): DOMMatrix {
  return new DOMMatrix()
    .translate(el.x + dx + (w * el.scale) / 2, el.y + (h * el.scale) / 2)
    .rotate(el.rotation)
    .scale(el.scale)
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
export function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, prep: Prepared, progress: number): Pt | null {
  if (progress <= 0) return null;
  let dx = 0;
  let mode = el.mode;
  ctx.save();
  ctx.globalAlpha *= el.opacity;
  if (mode === 'move-in' && progress < 1) {
    const from = el.direction === 'rtl' ? BOARD_W + 200 - el.x : -(prep.w * el.scale + el.x + 200);
    dx = from * (1 - ease(progress));
  } else if (mode === 'fade' && progress < 1) {
    ctx.globalAlpha *= progress;
  }
  const m = elementMatrix(el, prep.w, prep.h, dx);
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
  const v = viewMatrix(cam, cw, ch);
  ctx.setTransform(v);
  ctx.fillStyle = p.board.background;
  ctx.fillRect(0, 0, p.board.width, p.board.height);
  let pending = 0;
  let tip: Pt | null = null;
  p.elements.forEach((el, i) => {
    const prep = getPrepared(el);
    if (!prep) { pending++; return; }
    const progress = o.showAll ? 1 : revealProgress(s.slots[i], t);
    const tp = drawElement(ctx, el, prep, progress);
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
    drawHand(ctx, p.hand, scr.x, scr.y, ch * 0.22, o.customHand);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { pending };
}
