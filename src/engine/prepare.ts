// Turns board elements into draw-ready strokes. Browser only (uses SVG DOM for
// path lengths). Results are cached per element content.
import type { BoardElement, ImageElement, SvgElement, TextElement } from './types';
import { layoutText } from './text';
import { getFont } from './fonts';
import { resolveUrl } from '../storage/db';

export interface Pt { x: number; y: number }

export interface Stroke {
  path: Path2D;
  matrix: DOMMatrix;      // stroke-local -> element-local
  length: number;
  stroke: string | null;  // null => outline drawn with fill colour, thin
  fill: string | null;
  /** filled once this stroke's outline is complete (whole glyph for text, so holes stay holes) */
  fillPath: Path2D | null;
  width: number;
  samples: Pt[];          // element-local points every `length/(n-1)`
  cap: CanvasLineCap;
  join: CanvasLineJoin;
}

export interface PreparedVector {
  kind: 'vector';
  w: number;
  h: number;
  strokes: Stroke[];
  total: number;
}

export interface PreparedRaster {
  kind: 'raster';
  w: number;
  h: number;
  image: CanvasImageSource;
  sketch: HTMLCanvasElement; // edge drawing
  tiles: { x: number; y: number; w: number; h: number; fwd: boolean }[];
}

export type Prepared = PreparedVector | PreparedRaster;

const cache = new Map<string, Promise<Prepared>>();

export function cacheKey(el: BoardElement): string {
  switch (el.kind) {
    case 'svg': return `svg|${el.direction}|${el.color}|${el.strokeWidth}|${el.svg}`;
    case 'image': return `img|${el.direction}|${el.src}`;
    case 'text': return `txt|${el.font}|${el.size}|${el.color}|${el.align}|${el.text}`;
  }
}

export function prepare(el: BoardElement): Promise<Prepared> {
  const key = cacheKey(el);
  let p = cache.get(key);
  if (!p) {
    p = el.kind === 'svg' ? prepareSvg(el) : el.kind === 'text' ? prepareText(el) : prepareImage(el);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Synchronous lookup for the render loop; undefined while still preparing. */
const ready = new Map<string, Prepared>();
export function getPrepared(el: BoardElement): Prepared | undefined {
  const key = cacheKey(el);
  const r = ready.get(key);
  if (r) return r;
  prepare(el).then((v) => ready.set(key, v)).catch((e) => console.error('prepare failed', el.name, e));
  return undefined;
}
export async function prepareAll(els: BoardElement[]): Promise<void> {
  await Promise.all(els.map(async (el) => ready.set(cacheKey(el), await prepare(el))));
}

// ---------- shared SVG measuring host ----------
let host: SVGSVGElement | null = null;
function measureHost(): SVGSVGElement {
  if (!host) {
    host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('style', 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;contain:strict');
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Points along a stroke for the hand to follow. getPointAtLength is slow on long paths,
 * so sample as coarsely as the hand allows: `step` is in the path's own units.
 */
function sample(geom: SVGGeometryElement, length: number, step = 3, cap = 120): Pt[] {
  const n = Math.max(2, Math.min(cap, Math.ceil(length / step)));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = geom.getPointAtLength((length * i) / (n - 1));
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function shapeToD(el: Element): string | null {
  const n = (a: string) => parseFloat(el.getAttribute(a) || '0');
  switch (el.tagName.toLowerCase()) {
    case 'path': return el.getAttribute('d');
    case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? d + 'Z' : d;
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      let rx = n('rx') || n('ry'); rx = Math.min(rx, w / 2, h / 2);
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${rx} 0 0 1 ${x + w} ${y + rx}V${y + h - rx}A${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${rx} 0 0 1 ${x} ${y + h - rx}V${y + rx}A${rx} ${rx} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx'), cy = n('cy');
      const rx = el.tagName.toLowerCase() === 'circle' ? n('r') : n('rx');
      const ry = el.tagName.toLowerCase() === 'circle' ? n('r') : n('ry');
      // Start at the top and go round, like a person would draw it.
      return `M${cx} ${cy - ry}A${rx} ${ry} 0 1 1 ${cx} ${cy + ry}A${rx} ${ry} 0 1 1 ${cx} ${cy - ry}Z`;
    }
  }
  return null;
}

const paintable = (v: string) => v && v !== 'none' && !v.startsWith('url(') && v !== 'rgba(0, 0, 0, 0)';

async function prepareSvg(el: SvgElement): Promise<PreparedVector> {
  const doc = new DOMParser().parseFromString(el.svg, 'image/svg+xml');
  const src = doc.documentElement;
  if (src.tagName.toLowerCase() !== 'svg') throw new Error('Not an SVG');
  const vb = (src.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const w = vb.length === 4 ? vb[2] : parseFloat(src.getAttribute('width') || '100');
  const h = vb.length === 4 ? vb[3] : parseFloat(src.getAttribute('height') || '100');
  const ox = vb.length === 4 ? vb[0] : 0;
  const oy = vb.length === 4 ? vb[1] : 0;

  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `${ox} ${oy} ${w} ${h}`);
  svg.style.color = el.color || '#1f1f1f';
  sanitizeSvg(svg);
  const root = measureHost();
  root.appendChild(svg);
  try {
    const strokes: Stroke[] = [];
    const geoms = Array.from(svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')) as SVGGeometryElement[];
    for (const g of geoms) {
      if (g.closest('defs,clipPath,mask,symbol,pattern,marker')) continue;
      const d = shapeToD(g);
      if (!d) continue;
      const cs = getComputedStyle(g);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const strokeColor = paintable(cs.stroke) ? cs.stroke : null;
      const fillColor = paintable(cs.fill) ? cs.fill : null;
      if (!strokeColor && !fillColor) continue;
      let length = 0;
      try { length = g.getTotalLength(); } catch { /* empty path */ }
      if (!(length > 0)) continue;
      const ctm = g.getCTM() || svg.createSVGMatrix();
      // getCTM includes the viewBox offset; move into 0..w space.
      const m = new DOMMatrix([ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f]);
      const local = sample(g, length).map((p) => { const q = m.transformPoint(p); return { x: q.x, y: q.y }; });
      strokes.push({
        path: new Path2D(d),
        matrix: m,
        length,
        stroke: el.color && strokeColor ? el.color : strokeColor,
        fill: el.color && fillColor && !strokeColor ? el.color : fillColor,
        fillPath: fillColor ? new Path2D(d) : null,
        width: el.strokeWidth ?? (parseFloat(cs.strokeWidth) || 1),
        samples: local,
        cap: (cs.strokeLinecap as CanvasLineCap) || 'round',
        join: (cs.strokeLinejoin as CanvasLineJoin) || 'round',
      });
    }
    orderStrokes(strokes, el.direction);
    return { kind: 'vector', w, h, strokes, total: strokes.reduce((a, s) => a + s.length, 0) };
  } finally {
    svg.remove();
  }
}

/** Untrusted SVG goes into the live DOM for measuring: strip anything executable. */
export function sanitizeSvg(root: Element) {
  root.querySelectorAll('script,foreignObject,iframe,object,embed,animate,set,animateTransform,animateMotion').forEach((n) => n.remove());
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'xlink:href') && !a.value.startsWith('#')) el.removeAttribute(a.name);
    }
  }
}

/** Keep author order for LTR; for RTL draw from the right-hand side first. */
function orderStrokes(strokes: Stroke[], dir: 'ltr' | 'rtl') {
  if (dir !== 'rtl') return;
  const cx = (s: Stroke) => s.samples.reduce((a, p) => a + p.x, 0) / s.samples.length;
  strokes.sort((a, b) => cx(b) - cx(a));
}

async function prepareText(el: TextElement): Promise<PreparedVector> {
  const f = await getFont(el.font);
  const layout = layoutText(f.hb, f.font, f.upem, el.text || ' ', el.size, el.align);
  const strokes: Stroke[] = [];
  const outlineWidth = Math.max(1, el.size / 45);
  for (const g of layout.glyphs) {
    // Font units are y-up; flip into layout space.
    const m = new DOMMatrix([g.scale, 0, 0, -g.scale, g.x, g.y]);
    // Split a glyph into its closed contours so the pen lifts between them.
    const contours = g.d.split(/(?=M)/).filter((c) => c.length > 2);
    const whole = new Path2D(g.d);
    const firstOfGlyph = strokes.length;
    for (const c of contours) {
      const flat = flattenGlyphContour(c);
      if (!(flat.length > 0)) continue;
      const samples = resample(flat, 25, 40).map((p) => { const q = m.transformPoint(p); return { x: q.x, y: q.y }; });
      strokes.push({
        path: new Path2D(c), matrix: m, length: flat.length, stroke: null, fill: el.color, fillPath: null,
        width: outlineWidth / g.scale, samples, cap: 'round', join: 'round',
      });
    }
    if (strokes.length > firstOfGlyph) strokes[strokes.length - 1].fillPath = whole;
  }
  return { kind: 'vector', w: layout.width, h: layout.height, strokes, total: strokes.reduce((a, s) => a + s.length, 0) };
}

// ---------------- glyph contour flattening (pure, unit-tested) ----------------
// HarfBuzz outlines use only absolute M/L/Q/C/Z, so they can be walked in one pass
// instead of hundreds of slow getPointAtLength() calls.
export interface Flat { pts: Pt[]; cum: number[]; length: number }

export function flattenGlyphContour(d: string): Flat {
  const nums = (s: string) => s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const pts: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 }, start: Pt = { x: 0, y: 0 };
  for (const m of d.matchAll(/([MLQCZ])([^MLQCZ]*)/gi)) {
    const cmd = m[1].toUpperCase(), a = nums(m[2]);
    if (cmd === 'M') { cur = { x: a[0], y: a[1] }; start = cur; pts.push(cur); }
    else if (cmd === 'L') { for (let i = 0; i + 1 < a.length; i += 2) { cur = { x: a[i], y: a[i + 1] }; pts.push(cur); } }
    else if (cmd === 'Q') {
      for (let i = 0; i + 3 < a.length; i += 4) {
        const p0 = cur, c = { x: a[i], y: a[i + 1] }, p1 = { x: a[i + 2], y: a[i + 3] };
        for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y }); }
        cur = p1;
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < a.length; i += 6) {
        const p0 = cur, c1 = { x: a[i], y: a[i + 1] }, c2 = { x: a[i + 2], y: a[i + 3] }, p1 = { x: a[i + 4], y: a[i + 5] };
        for (let k = 1; k <= 12; k++) {
          const t = k / 12, u = 1 - t;
          pts.push({ x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y });
        }
        cur = p1;
      }
    } else if (cmd === 'Z') { cur = start; pts.push(start); }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, length: cum[cum.length - 1] ?? 0 };
}

/** Evenly spaced points along a flattened contour (every `step` units, at most `cap`). */
export function resample(f: Flat, step: number, cap: number): Pt[] {
  const n = Math.max(2, Math.min(cap, Math.ceil(f.length / step)));
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (f.length * i) / (n - 1);
    while (j < f.cum.length - 1 && f.cum[j] < target) j++;
    const a = f.pts[j - 1], b = f.pts[j] ?? a;
    const seg = f.cum[j] - f.cum[j - 1] || 1;
    const k = Math.min(1, Math.max(0, (target - f.cum[j - 1]) / seg));
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  }
  return out;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = await resolveUrl(src);
  await img.decode();
  return img;
}

async function prepareImage(el: ImageElement): Promise<PreparedRaster> {
  const img = await loadImage(el.src);
  const w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, 900 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, sw, sh);
  const src = ctx.getImageData(0, 0, sw, sh);
  const { sketch, density } = sketchFromPixels(src.data, sw, sh);
  const out = document.createElement('canvas');
  out.width = sw; out.height = sh;
  out.getContext('2d')!.putImageData(new ImageData(sketch, sw, sh), 0, 0);
  const tiles = orderTiles(density, sw, sh, el.direction).map((t) => ({ x: t.x / k, y: t.y / k, w: t.w / k, h: t.h / k, fwd: t.fwd }));
  return { kind: 'raster', w, h, image: img, sketch: out, tiles };
}

// ---------- raster sketch (pure, unit-tested) ----------

/** Sobel edges -> dark pencil lines on transparent background, plus edge density grid. */
export function sketchFromPixels(px: Uint8ClampedArray, w: number, h: number) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = px[j + 3] / 255;
    // transparent pixels count as white paper
    g[i] = ((0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]) * a + 255 * (1 - a));
  }
  const mag = new Float32Array(w * h);
  let max = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  const sketch = new Uint8ClampedArray(w * h * 4);
  const threshold = 0.12;
  for (let i = 0; i < mag.length; i++) {
    const v = mag[i] / max;
    if (v > threshold) {
      const a = Math.min(1, (v - threshold) * 2.2);
      sketch[i * 4] = sketch[i * 4 + 1] = sketch[i * 4 + 2] = 30;
      sketch[i * 4 + 3] = Math.round(a * 235);
    }
  }
  return { sketch, density: { mag, max, threshold } };
}

export function orderTiles(
  d: { mag: Float32Array; max: number; threshold: number },
  w: number, h: number, dir: 'ltr' | 'rtl',
) {
  const cell = Math.max(8, Math.round(Math.max(w, h) / 22));
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const tiles: { x: number; y: number; w: number; h: number; fwd: boolean }[] = [];
  for (let r = 0; r < rows; r++) {
    const ltr = (r % 2 === 0) === (dir === 'ltr'); // serpentine
    for (let k = 0; k < cols; k++) {
      const c = ltr ? k : cols - 1 - k;
      const x0 = c * cell, y0 = r * cell;
      const x1 = Math.min(w, x0 + cell), y1 = Math.min(h, y0 + cell);
      let hits = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d.mag[y * w + x] / d.max > d.threshold) hits++;
      if (hits / ((x1 - x0) * (y1 - y0)) > 0.01) tiles.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, fwd: ltr });
    }
  }
  return tiles;
}
