import { describe, it, expect } from 'vitest';
import { sketchFromPixels, orderTiles } from '../src/engine/prepare';

function square(w: number, h: number) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 20; y < 40; y++) for (let x = 10; x < 30; x++) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  for (let y = 20; y < 40; y++) for (let x = 70; x < 90; x++) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return px;
}

describe('raster sketch', () => {
  it('finds edges only around the shapes', () => {
    const { sketch } = sketchFromPixels(square(100, 60), 100, 60);
    const alpha = (x: number, y: number) => sketch[(y * 100 + x) * 4 + 3];
    expect(alpha(10, 30)).toBeGreaterThan(0); // left edge of square 1
    expect(alpha(50, 30)).toBe(0);            // empty paper
    expect(alpha(20, 30)).toBe(0);            // flat interior
  });
  it('orders tiles right-to-left for RTL and skips empty paper', () => {
    const { density } = sketchFromPixels(square(100, 60), 100, 60);
    const rtl = orderTiles(density, 100, 60, 'rtl');
    const ltr = orderTiles(density, 100, 60, 'ltr');
    expect(rtl.length).toBeGreaterThan(0);
    expect(rtl.length).toBeLessThan(Math.ceil(100 / 8) * Math.ceil(60 / 8));
    expect(rtl[0].x).toBeGreaterThan(50);
    expect(ltr[0].x).toBeLessThan(50);
  });
});

describe('glyph contour flattening', () => {
  it('measures straight and curved contours like the browser would', async () => {
    const { flattenGlyphContour, resample } = await import('../src/engine/prepare');
    const sq = flattenGlyphContour('M0,0L100,0L100,100L0,100Z');
    expect(sq.length).toBeCloseTo(400, 6);
    const pts = resample(sq, 25, 40);
    expect(pts.length).toBe(16);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1].x).toBeCloseTo(0, 6);
    // quarter circle-ish quadratic: length between chord (141.4) and control polygon (200)
    const q = flattenGlyphContour('M0,0Q100,0 100,100');
    expect(q.length).toBeGreaterThan(141.4);
    expect(q.length).toBeLessThan(200);
  });
});
