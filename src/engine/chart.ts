// Charts drawn by the hand: bar, line and pie. A chart is an SVG element that keeps its data
// (`chart` spec) so it can be edited and rebuilt. Labels are turned into glyph outlines with
// HarfBuzz, so Arabic is joined correctly and the hand writes it like any other text.
//
// Colours follow a validated categorical order (colour-blind checked against every board look);
// every coloured shape also has an ink outline and a written label, so colour never carries
// meaning alone.
import type { FontId } from './types';
import { layoutText, type HbFont, type HbModule } from './text';

export type ChartKind = 'bar' | 'line' | 'pie';

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  labels: string[];
  values: number[];
  font: FontId;
  /** bars / line colour; null = first colour of the palette. Pie slices always use the palette order. */
  color: string | null;
  /** numbers on bars and points, percentages in the pie key */
  showValues: boolean;
  /** written after each number, e.g. "%" or "ريال" */
  unit: string;
  /** ١٢٣ instead of 123 */
  arabicDigits: boolean;
}

export const CHART_LIMIT = 12; // categories for bar and line
export const PIE_LIMIT = 8; // slices; the rest are folded into "Other"

/** Same eight hues for light and dark boards, each stepped for its surface. Fixed order, never cycled. */
export const PALETTE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const PALETTE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface ShapeFont { hb: HbModule; font: HbFont; upem: number }
export interface ChartOptions { rtl: boolean; dark: boolean }

export function newChartSpec(kind: ChartKind, arabic: boolean): ChartSpec {
  return arabic
    ? { kind, title: 'المبيعات', labels: ['يناير', 'فبراير', 'مارس', 'أبريل'], values: [12, 19, 15, 24], font: 'cairo', color: null, showValues: true, unit: '', arabicDigits: false }
    : { kind, title: 'Sales', labels: ['Jan', 'Feb', 'Mar', 'Apr'], values: [12, 19, 15, 24], font: 'cairo', color: null, showValues: true, unit: '', arabicDigits: false };
}

const round = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

export function formatValue(v: number, spec: Pick<ChartSpec, 'unit' | 'arabicDigits'>): string {
  const n = new Intl.NumberFormat(spec.arabicDigits ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }).format(v);
  const unit = spec.unit.trim();
  if (!unit) return n;
  if (unit === '%' || unit === '٪') return n + (spec.arabicDigits ? '٪' : '%');
  return `${n} ${unit}`;
}

/** Percentages that add up to exactly 100 (largest remainder). */
export function percentages(values: number[]): number[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, v) => a + v, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

/** Keep the biggest slices; the rest become one "Other" slice. */
export function foldSlices(labels: string[], values: number[], max = PIE_LIMIT): { labels: string[]; values: number[] } {
  if (labels.length <= max) return { labels, values };
  const idx = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
  const keep = new Set(idx.slice(0, max - 1));
  const other = idx.slice(max - 1).reduce((a, i) => a + Math.max(0, values[i]), 0);
  const kept = labels.map((_, i) => i).filter((i) => keep.has(i));
  return {
    labels: [...kept.map((i) => labels[i]), labels.some(hasArabic) ? 'أخرى' : 'Other'],
    values: [...kept.map((i) => values[i]), other],
  };
}

/** HarfBuzz outline (font units, y up, absolute M/L/Q/C/Z) -> chart units (y down). */
function mapOutline(d: string, k: number, ox: number, oy: number): string {
  let out = '';
  for (const m of d.matchAll(/([MLQCZ])([^MLQCZ]*)/gi)) {
    const a = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const pts: string[] = [];
    for (let i = 0; i + 1 < a.length; i += 2) pts.push(`${round(ox + a[i] * k)} ${round(oy - a[i + 1] * k)}`);
    out += m[1].toUpperCase() + pts.join(' ');
  }
  return out;
}

type Anchor = 'start' | 'middle' | 'end';
interface Label { paths: string[]; width: number; /** baseline of the last line */ last: number }

/**
 * One <path> per glyph, in writing order. `x` is the anchor point and `y` the first baseline.
 * Too wide for `maxW`: break at the space nearest the middle, then shrink (down to 55%).
 */
function label(f: ShapeFont, text: string, size: number, x: number, y: number, anchor: Anchor, maxW = Infinity): Label {
  let t = text.trim();
  if (!t) return { paths: [], width: 0, last: y };
  let s = size;
  let l = layoutText(f.hb, f.font, f.upem, t, s, 'center', false);
  if (l.width > maxW && t.includes(' ')) {
    const spaces = [...t.matchAll(/ /g)].map((m) => m.index!);
    const mid = t.length / 2;
    const at = spaces.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    t = `${t.slice(0, at)}\n${t.slice(at + 1)}`;
    l = layoutText(f.hb, f.font, f.upem, t, s, 'center', false);
  }
  if (l.width > maxW) s = Math.max(size * 0.55, (s * maxW) / l.width);
  l = layoutText(f.hb, f.font, f.upem, t, s, 'center', true);
  const left = anchor === 'middle' ? x - l.width / 2 : anchor === 'end' ? x - l.width : x;
  const ys = l.glyphs.map((g) => g.y);
  const first = ys.length ? Math.min(...ys) : 0;
  const paths = l.glyphs.map((g) => mapOutline(g.d, g.scale, left + g.x, y + (g.y - first)));
  return { paths, width: l.width, last: y + (ys.length ? Math.max(...ys) - first : 0) };
}

const glyphPaths = (lb: Label, w = 1.1) => lb.paths.map((d) => `<path d="${d}" fill="currentColor" stroke="none" stroke-width="${w}"/>`).join('');

/** The chart as SVG markup (ink = currentColor, so it follows the board look). */
export function chartSvg(spec: ChartSpec, f: ShapeFont, o: ChartOptions): string {
  const palette = o.dark ? PALETTE_DARK : PALETTE_LIGHT;
  const series = spec.color || palette[0];
  const W = 1000;
  const pad = 40;
  const parts: string[] = [];
  let top = pad;
  if (spec.title.trim()) {
    const tl = label(f, spec.title, 52, W / 2, 78, 'middle', W - 2 * pad);
    parts.push(glyphPaths(tl, 1.4));
    top = tl.last + 52;
  }
  if (spec.kind === 'pie') return pie(spec, f, o, palette, parts, top);

  const n = Math.max(1, Math.min(CHART_LIMIT, spec.labels.length, spec.values.length));
  const labels = spec.labels.slice(0, n);
  const values = spec.values.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0));
  const H = 700;
  const base = H - 110; // x axis
  const valueRoom = spec.showValues ? 56 : 16;
  const plotTop = top + valueRoom;
  const plotH = base - plotTop;
  // Axis on the side where reading starts.
  const axisX = o.rtl ? W - pad : pad;
  const x0 = o.rtl ? pad : pad + 30, x1 = o.rtl ? W - pad - 30 : W - pad;
  const slot = (x1 - x0) / n;
  const cx = (i: number) => (o.rtl ? x1 - slot * (i + 0.5) : x0 + slot * (i + 0.5));
  const min = spec.kind === 'line' ? Math.min(0, ...values) : 0;
  const max = Math.max(...values, min + 1e-9);
  const span = max - min || 1;
  // Below-zero lines keep a strip under the lowest point for its number.
  const floor = spec.kind === 'line' && min < 0 && spec.showValues ? 64 : 0;
  const py = (v: number) => base - floor - ((v - min) / span) * (plotH - 10 - floor);
  // With negative numbers the line chart's horizontal axis sits at zero, not at the bottom.
  const zeroY = spec.kind === 'line' && min < 0 ? round(py(0)) : base;
  parts.push(`<path d="M${axisX} ${round(top + 6)}V${base}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`);
  parts.push(`<path d="M${axisX} ${zeroY}H${o.rtl ? pad : W - pad}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`);
  // Labels a little narrower than their slot so neighbours never run together.
  const catLabel = (i: number) => glyphPaths(label(f, labels[i] ?? '', 30, cx(i), base + 44, 'middle', slot * 0.86));

  if (spec.kind === 'bar') {
    const tallest = Math.max(...values.map((v) => Math.max(0, v)), 0) || 1;
    const bw = Math.min(150, slot * 0.62);
    values.forEach((v, i) => {
      const hgt = Math.max(3, (Math.max(0, v) / tallest) * plotH);
      const l = round(cx(i) - bw / 2), r = round(cx(i) + bw / 2), y = round(base - hgt);
      const rad = Math.min(8, hgt / 2, bw / 4);
      // Up one side, across the top (rounded ends), down the other: the way a hand draws a bar.
      const d = o.rtl
        ? `M${r} ${base}V${round(y + rad)}Q${r} ${y} ${round(r - rad)} ${y}H${round(l + rad)}Q${l} ${y} ${l} ${round(y + rad)}V${base}`
        : `M${l} ${base}V${round(y + rad)}Q${l} ${y} ${round(l + rad)} ${y}H${round(r - rad)}Q${r} ${y} ${r} ${round(y + rad)}V${base}`;
      parts.push(`<path d="${d}Z" fill="${series}" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`);
      if (spec.showValues) parts.push(glyphPaths(label(f, formatValue(v, spec), 30, cx(i), y - 16, 'middle', slot)));
      parts.push(catLabel(i));
    });
  } else {
    labels.forEach((_, i) => parts.push(catLabel(i)));
    const pts = values.map((v, i) => [round(cx(i)), round(py(v))]);
    parts.push(`<path d="M${pts.map((p) => p.join(' ')).join('L')}" fill="none" stroke="${series}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
    pts.forEach(([x, y], i) => {
      parts.push(`<circle cx="${x}" cy="${y}" r="10" fill="${series}" stroke="currentColor" stroke-width="3"/>`);
      if (!spec.showValues) return;
      // A dip (lower than its neighbours) gets its number underneath, clear of the line.
      const nb = [values[i - 1], values[i + 1]].filter((v) => v !== undefined);
      const below = nb.length > 0 && nb.every((v) => v > values[i]) && y + 44 <= base - 8;
      parts.push(glyphPaths(label(f, formatValue(values[i], spec), 28, x, below ? y + 44 : y - 24, 'middle', slot)));
    });
  }
  return wrap(W, H, parts, spec);
}

function pie(spec: ChartSpec, f: ShapeFont, o: ChartOptions, palette: string[], parts: string[], top: number): string {
  const W = 1000, pad = 40;
  const n = Math.min(spec.labels.length, spec.values.length);
  const { labels, values } = foldSlices(spec.labels.slice(0, n), spec.values.slice(0, n).map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0)));
  const pct = percentages(values);
  const R = 230;
  const H = top + 2 * R + pad + 10;
  const cy = top + R + 10;
  // Pie on the side where reading starts, its key on the other side.
  const cx = o.rtl ? W - pad - R : pad + R;
  const total = values.reduce((a, v) => a + v, 0);
  const keyEdge = o.rtl ? cx - R - 50 : cx + R + 50; // the key's start edge (next to the pie)
  const rowH = 54;
  const keyTop = cy - (labels.length * rowH) / 2 + rowH / 2;
  let angle = -Math.PI / 2;
  const dir = o.rtl ? -1 : 1; // counter-clockwise for right-to-left readers
  labels.forEach((name, i) => {
    const colour = palette[i % palette.length];
    if (values[i] > 0 && total > 0) {
      const sweep = (values[i] / total) * Math.PI * 2;
      const a2 = angle + dir * sweep;
      const p1 = [round(cx + R * Math.cos(angle)), round(cy + R * Math.sin(angle))];
      const p2 = [round(cx + R * Math.cos(a2)), round(cy + R * Math.sin(a2))];
      const large = sweep > Math.PI ? 1 : 0;
      const sw = o.rtl ? 0 : 1;
      const d = sweep >= Math.PI * 2 - 1e-6
        ? `M${cx} ${cy - R}A${R} ${R} 0 1 ${sw} ${cx} ${cy + R}A${R} ${R} 0 1 ${sw} ${cx} ${cy - R}Z`
        : `M${cx} ${cy}L${p1.join(' ')}A${R} ${R} 0 ${large} ${sw} ${p2.join(' ')}Z`;
      parts.push(`<path d="${d}" fill="${colour}" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`);
      angle = a2;
    }
    const y = keyTop + i * rowH;
    const sx = o.rtl ? keyEdge - 30 : keyEdge;
    parts.push(`<rect x="${round(sx)}" y="${round(y - 15)}" width="30" height="30" rx="5" fill="${colour}" stroke="currentColor" stroke-width="2.5"/>`);
    const text = spec.showValues ? `${name}  ${formatValue(pct[i], { unit: '%', arabicDigits: spec.arabicDigits })}` : name;
    const tx = o.rtl ? sx - 16 : sx + 46;
    const room = o.rtl ? tx - pad : W - pad - tx;
    parts.push(glyphPaths(label(f, text, 30, tx, y + 11, o.rtl ? 'end' : 'start', room)));
  });
  return wrap(W, Math.round(H), parts, spec);
}

function wrap(W: number, H: number, parts: string[], spec: ChartSpec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${esc(spec.title || spec.kind)}</title>${parts.join('')}</svg>`;
}

/** Browser helper: load the label font, then build the SVG. */
export async function buildChartSvg(spec: ChartSpec, o: ChartOptions): Promise<string> {
  const { getFont } = await import('./fonts');
  return chartSvg(spec, await getFont(spec.font), o);
}
