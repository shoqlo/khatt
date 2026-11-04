import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as hbjs from 'harfbuzzjs';
import { layoutText, isRtlText, type HbModule, type HbFont } from '../src/engine/text';

let hb: HbModule, font: HbFont, upem: number;
beforeAll(() => {
  const data = fs.readFileSync('node_modules/@expo-google-fonts/amiri/400Regular/Amiri_400Regular.ttf');
  const face = new hbjs.Face(new hbjs.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  hb = hbjs as unknown as HbModule;
  font = new hbjs.Font(face) as unknown as HbFont;
  upem = face.upem;
});

describe('Arabic text layout', () => {
  it('detects paragraph direction', () => {
    expect(isRtlText('مرحبا')).toBe(true);
    expect(isRtlText('Hello مرحبا')).toBe(false);
    expect(isRtlText('2025 مرحبا')).toBe(true);
  });
  it('writes Arabic right to left: first-written glyph is right-most', () => {
    const l = layoutText(hb, font, upem, 'مرحبا بالعالم', 100);
    expect(l.rtl).toBe(true);
    const xs = l.glyphs.map((g) => g.x);
    expect(xs[0]).toBeGreaterThan(xs[xs.length - 1]);
    // non-increasing x along writing order (allowing tiny mark offsets)
    let backwards = 0;
    for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1] + 5) backwards++;
    expect(backwards).toBe(0);
  });
  it('joins letters: contextual forms differ from isolated forms', () => {
    // "ببب" uses initial, medial, final forms -> three different glyphs
    const joined = layoutText(hb, font, upem, 'ببب', 100).glyphs.map((g) => g.d);
    expect(new Set(joined).size).toBe(3);
    const isolated = layoutText(hb, font, upem, 'ب', 100).glyphs[0].d;
    expect(joined).not.toContain(isolated);
  });
  it('handles mixed Arabic + Latin + numbers (bidi)', () => {
    const l = layoutText(hb, font, upem, 'سعر iPhone هو 999', 80);
    expect(l.glyphs.length).toBeGreaterThan(10);
    const ltrGlyphs = l.glyphs.filter((g) => !g.rtl);
    expect(ltrGlyphs.length).toBeGreaterThanOrEqual(9); // iPhone + 999
    // the Latin run itself is written left to right
    const iphone = ltrGlyphs.slice(0, 6).map((g) => g.x);
    expect(iphone).toEqual([...iphone].sort((a, b) => a - b));
  });
  it('multi-line text stacks lines and right-aligns RTL "start"', () => {
    const l = layoutText(hb, font, upem, 'سطر أول طويل جدا\nقصير', 60, 'start');
    const lines = [...new Set(l.glyphs.map((g) => Math.round(g.y)))];
    expect(lines.length).toBe(2);
    const second = l.glyphs.filter((g) => Math.round(g.y) === lines[1]);
    expect(Math.max(...second.map((g) => g.x))).toBeGreaterThan(l.width * 0.6);
  });
});
