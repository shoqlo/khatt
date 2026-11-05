import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as hbjs from 'harfbuzzjs';
import type { HbModule, HbFont } from '../src/engine/text';
import { chartSvg, percentages, foldSlices, formatValue, newChartSpec, PALETTE_LIGHT, PALETTE_DARK, type ShapeFont, type ChartSpec } from '../src/engine/chart';

let f: ShapeFont;
beforeAll(() => {
  const data = fs.readFileSync('node_modules/@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf');
  const face = new hbjs.Face(new hbjs.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  f = { hb: hbjs as unknown as HbModule, font: new hbjs.Font(face) as unknown as HbFont, upem: face.upem };
});

const spec = (o: Partial<ChartSpec> = {}): ChartSpec => ({ ...newChartSpec('bar', true), ...o });
const fills = (svg: string, colour: string) => [...svg.matchAll(new RegExp(`fill="${colour}"`, 'g'))].length;
/** x of the first point of each bar path (bars start at the baseline on one side) */
const barXs = (svg: string, colour: string) => [...svg.matchAll(new RegExp(`<path d="M([\\d.]+) [\\d.]+V[^"]*" fill="${colour}"`, 'g'))].map((m) => Number(m[1]));

describe('chart numbers', () => {
  it('percentages always add up to 100', () => {
    for (const vals of [[1, 1, 1], [12, 19, 15, 24], [0.5, 0.25, 0.25], [7, 0, 3]]) {
      expect(percentages(vals).reduce((a, v) => a + v, 0)).toBe(100);
    }
    expect(percentages([0, 0])).toEqual([0, 0]);
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
  });
  it('folds the smallest slices into "Other" past eight', () => {
    const labels = Array.from({ length: 11 }, (_, i) => `ب${i}`);
    const values = Array.from({ length: 11 }, (_, i) => 11 - i);
    const r = foldSlices(labels, values);
    expect(r.labels).toHaveLength(8);
    expect(r.labels[7]).toBe('أخرى');
    expect(r.values[7]).toBe(4 + 3 + 2 + 1);
    expect(r.values.reduce((a, v) => a + v, 0)).toBe(values.reduce((a, v) => a + v, 0));
  });
  it('writes numbers with Arabic digits and units when asked', () => {
    expect(formatValue(1250.5, { unit: '', arabicDigits: false })).toBe('1,250.5');
    expect(formatValue(45, { unit: '%', arabicDigits: true })).toBe('٤٥٪');
    expect(formatValue(30, { unit: 'ريال', arabicDigits: false })).toBe('30 ريال');
  });
});

describe('chart drawing', () => {
  it('bar chart: one bar per row, laid out right-to-left for Arabic', () => {
    const svg = chartSvg(spec(), f, { rtl: true, dark: false });
    expect(svg.startsWith('<svg')).toBe(true);
    const xs = barXs(svg, PALETTE_LIGHT[0]);
    expect(xs).toHaveLength(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1]); // first row on the right
    const ltr = barXs(chartSvg(spec(), f, { rtl: false, dark: false }), PALETTE_LIGHT[0]);
    for (let i = 1; i < ltr.length; i++) expect(ltr[i]).toBeGreaterThan(ltr[i - 1]);
  });
  it('the tallest bar is the biggest number', () => {
    const svg = chartSvg(spec({ values: [5, 40, 10], labels: ['أ', 'ب', 'ج'], showValues: false }), f, { rtl: true, dark: false });
    const tops = [...svg.matchAll(/<path d="M[\d.]+ ([\d.]+)V([\d.]+)/g)].map((m) => Number(m[2]));
    // bar paths are the ones with a fill colour; check via heights of filled shapes
    const bars = [...svg.matchAll(new RegExp(`<path d="M[\\d.]+ ([\\d.]+)V([\\d.]+)[^"]*" fill="${PALETTE_LIGHT[0]}"`, 'g'))].map((m) => Number(m[1]) - Number(m[2]));
    expect(bars.indexOf(Math.max(...bars))).toBe(1);
    expect(tops.length).toBeGreaterThan(0);
  });
  it('labels become glyph outlines (no <text>), in ink colour', () => {
    const svg = chartSvg(spec(), f, { rtl: true, dark: false });
    expect(svg).not.toContain('<text');
    expect(fills(svg, 'currentColor')).toBeGreaterThan(20); // title + 4 labels + 4 numbers
  });
  it('pie: one slice per non-zero row in palette order, key for every row', () => {
    const svg = chartSvg(spec({ kind: 'pie', values: [50, 0, 30, 20] }), f, { rtl: true, dark: true });
    const slices = [...svg.matchAll(/<path d="M[\d.]+ [\d.]+L[^"]*A[^"]*" fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(slices).toEqual([PALETTE_DARK[0], PALETTE_DARK[2], PALETTE_DARK[3]]);
    expect([...svg.matchAll(/<rect /g)]).toHaveLength(4);
  });
  it('pie with a single row is a full circle', () => {
    const svg = chartSvg(spec({ kind: 'pie', labels: ['كل'], values: [10] }), f, { rtl: false, dark: false });
    expect(svg).toMatch(/A230 230 0 1 1 [\d.]+ [\d.]+A230 230 0 1 1/);
  });
  it('line: one line through all points, a marker on each', () => {
    const svg = chartSvg(spec({ kind: 'line', values: [3, -2, 8, 5] }), f, { rtl: false, dark: false });
    expect([...svg.matchAll(/<circle /g)]).toHaveLength(4);
    const line = svg.match(/<path d="(M[^"]+)" fill="none" stroke="#2a78d6" stroke-width="6"/);
    expect(line).not.toBeNull();
    expect(line![1].split('L')).toHaveLength(4);
  });
  it('custom colour is used for bars and the line', () => {
    expect(chartSvg(spec({ color: '#aa3300' }), f, { rtl: true, dark: false })).toContain('fill="#aa3300"');
  });
  it('a very long title wraps instead of running off the board', () => {
    const svg = chartSvg(spec({ title: 'نسبة الطلاب الذين أنهوا الواجبات المنزلية في الوقت المحدد خلال الفصل الدراسي الأول' }), f, { rtl: true, dark: false });
    const xs = [...svg.matchAll(/d="M([\d.-]+) /g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1000);
  });
});
