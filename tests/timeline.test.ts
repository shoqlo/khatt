import { describe, it, expect } from 'vitest';
import { schedule, revealProgress, cameraAt, fitToDuration, FULL_BOARD, autoCamera } from '../src/engine/timeline';
import { newProject, defaultTiming, type SvgElement } from '../src/engine/types';

const svgEl = (id: string, x = 0): SvgElement => ({
  id, name: id, kind: 'svg', svg: '<svg/>', color: null, strokeWidth: null, x, y: 0, scale: 1, rotation: 0, opacity: 1,
  mode: 'draw', direction: 'rtl', timing: { transition: 1, animate: 2, pause: 1 }, camera: null,
});
const bounds = () => ({ x: 100, y: 100, w: 200, h: 100 });

describe('timeline', () => {
  it('lays out slots back to back', () => {
    const p = newProject(); p.elements = [svgEl('a'), svgEl('b')]; p.endHold = 2;
    const s = schedule(p);
    expect(s.slots.map((x) => [x.start, x.revealStart, x.revealEnd, x.end])).toEqual([[0, 1, 3, 4], [4, 5, 7, 8]]);
    expect(s.total).toBe(8 + 1 + 2);
  });
  it('reveal progress is clamped and handles zero-length animation', () => {
    const slot = { id: 'a', start: 0, revealStart: 1, revealEnd: 3, end: 4 };
    expect(revealProgress(slot, 0.5)).toBe(0);
    expect(revealProgress(slot, 2)).toBeCloseTo(0.5);
    expect(revealProgress(slot, 9)).toBe(1);
    expect(revealProgress({ ...slot, revealEnd: 1 }, 1)).toBe(1);
  });
  it('camera starts on the full board, frames each element, returns at the end', () => {
    const p = newProject(); p.elements = [svgEl('a')]; p.endHold = 1;
    const s = schedule(p);
    expect(cameraAt(p, s, 0, bounds)).toEqual(FULL_BOARD);
    expect(cameraAt(p, s, 2, bounds)).toEqual(autoCamera(bounds()));
    expect(cameraAt(p, s, s.total, bounds)).toEqual(FULL_BOARD);
    const mid = cameraAt(p, s, 0.5, bounds);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(autoCamera(bounds()).zoom);
  });
  it('fitToDuration makes the video end with the voice-over', () => {
    const p = newProject(); p.elements = [svgEl('a'), svgEl('b'), svgEl('c')];
    const fitted = fitToDuration(p, 30);
    expect(schedule(fitted).total).toBeCloseTo(30, 0);
    expect(fitted.elements[0].timing.transition).toBe(1); // camera moves are not squashed
  });
  it('default timing is sane', () => {
    const d = defaultTiming();
    expect(d.animate).toBeGreaterThan(0);
  });
});

describe('camera clamping', () => {
  it('never shows past the board edge', async () => {
    const { clampToBoard } = await import('../src/engine/timeline');
    const c = clampToBoard({ x: 1900, y: 20, zoom: 2 });
    expect(c.x + 1920 / 2 / 2).toBeLessThanOrEqual(1920);
    expect(c.y - 1080 / 2 / 2).toBeGreaterThanOrEqual(0);
    expect(clampToBoard({ x: 5, y: 5, zoom: 0.8 })).toEqual({ x: 960, y: 540, zoom: 0.8 });
  });
});
