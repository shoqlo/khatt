import { describe, it, expect } from 'vitest';
import { schedule, revealProgress, cameraAt, fitToDuration, fullView, autoCamera, clampToBoard } from '../src/engine/timeline';
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
    expect(cameraAt(p, s, 0, bounds)).toEqual(fullView(p));
    expect(cameraAt(p, s, 2, bounds)).toEqual(autoCamera(bounds(), p));
    expect(cameraAt(p, s, s.total, bounds)).toEqual(fullView(p));
    const mid = cameraAt(p, s, 0.5, bounds);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(autoCamera(bounds(), p).zoom);
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

describe('camera clamping and video shapes', () => {
  it('never shows past the board edge', () => {
    const p = newProject();
    const c = clampToBoard({ x: 1900, y: 20, zoom: 2 }, p);
    expect(c.x + 1920 / 2 / 2).toBeLessThanOrEqual(1920);
    expect(c.y - 1080 / 2 / 2).toBeGreaterThanOrEqual(0);
    expect(clampToBoard({ x: 5, y: 5, zoom: 0.8 }, p)).toEqual({ x: 960, y: 540, zoom: 0.8 });
  });
  it('a vertical project is a 1080x1920 frame', () => {
    const p = newProject('v', 'portrait');
    expect(p.board).toMatchObject({ width: 1080, height: 1920 });
    expect(fullView(p)).toEqual({ x: 540, y: 960, zoom: 1 });
  });
  it('a board bigger than one frame zooms out to show everything at the end', () => {
    const p = newProject();
    p.board.width = 1920 * 3; p.board.height = 1080 * 2;
    const f = fullView(p);
    expect(f.zoom).toBeCloseTo(1 / 3);
    expect(f.x).toBe(2880);
    // one frame-sized cell is framed at zoom ~1
    expect(autoCamera({ x: 1920, y: 0, w: 1920 / 1.35, h: 1080 / 1.35 }, p).zoom).toBeCloseTo(1);
  });
});
