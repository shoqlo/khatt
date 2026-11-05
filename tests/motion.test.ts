import { describe, it, expect } from 'vitest';
import { motionAt } from '../src/engine/render';
import type { BoardElement } from '../src/engine/types';
import type { Prepared } from '../src/engine/prepare';

const el = (o: Partial<BoardElement> = {}) => ({ id: 'a', name: 'a', kind: 'svg', svg: '', color: null, strokeWidth: null, x: 100, y: 100, scale: 1, rotation: 0, opacity: 1, mode: 'draw', direction: 'rtl', timing: { transition: 1, animate: 2, pause: 2 }, camera: null, ...o }) as BoardElement;
const prep = { kind: 'vector', w: 200, h: 100, strokes: [], total: 0 } as unknown as Prepared;
const slot = { id: 'a', start: 0, revealStart: 1, revealEnd: 3, end: 5 };

describe('emphasis and exit', () => {
  it('pulse grows while paused and is back at rest when the pause ends', () => {
    const e = el({ emphasis: 'pulse' });
    expect(motionAt(e, slot, 2, Infinity, prep, 1920)!.scale).toBeUndefined(); // still drawing
    expect(motionAt(e, slot, 3.5, Infinity, prep, 1920)!.scale!).toBeGreaterThan(1.02);
    expect(motionAt(e, slot, 4.999, Infinity, prep, 1920)!.scale!).toBeCloseTo(1, 2);
  });
  it('wiggle turns both ways; bounce goes up', () => {
    const rots = [3.2, 3.4, 3.6, 3.8, 4.0].map((t) => motionAt(el({ emphasis: 'wiggle' }), slot, t, Infinity, prep, 1920)!.rot!);
    expect(Math.max(...rots)).toBeGreaterThan(0);
    expect(Math.min(...rots)).toBeLessThan(0);
    expect(motionAt(el({ emphasis: 'bounce' }), slot, 3.4, Infinity, prep, 1920)!.dy!).toBeLessThan(0);
  });
  it('exit fades or moves out after its scene ends, then is gone', () => {
    expect(motionAt(el({ exit: 'fade' }), slot, 5.3, 5, prep, 1920)!.alpha!).toBeCloseTo(0.5, 1);
    expect(motionAt(el({ exit: 'fade' }), slot, 5.7, 5, prep, 1920)).toBeNull();
    // right-to-left boards: things leave towards the left (the way the story moves)
    expect(motionAt(el({ exit: 'move-out', direction: 'rtl' }), slot, 5.3, 5, prep, 1920)!.dx!).toBeLessThan(0);
    expect(motionAt(el({ exit: 'move-out', direction: 'ltr' }), slot, 5.3, 5, prep, 1920)!.dx!).toBeGreaterThan(0);
    expect(motionAt(el({ exit: 'none' }), slot, 9, 5, prep, 1920)).toEqual({});
  });
});
