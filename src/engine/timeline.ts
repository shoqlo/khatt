import { BOARD_H, BOARD_W, type BoardElement, type Camera, type Project } from './types';

export interface Bounds { x: number; y: number; w: number; h: number }

export interface Slot {
  id: string;
  start: number;      // camera starts moving
  revealStart: number; // drawing starts
  revealEnd: number;   // drawing ends
  end: number;         // pause ends
}

export interface Schedule {
  slots: Slot[];
  endTransitionStart: number;
  endTransitionEnd: number;
  total: number;
}

export const END_TRANSITION = 1.0;
export const FULL_BOARD: Camera = { x: BOARD_W / 2, y: BOARD_H / 2, zoom: 1 };

export function schedule(p: Project): Schedule {
  let t = 0;
  const slots: Slot[] = [];
  for (const el of p.elements) {
    const { transition, animate, pause } = el.timing;
    const start = t;
    const revealStart = start + Math.max(0, transition);
    const revealEnd = revealStart + Math.max(0, animate);
    const end = revealEnd + Math.max(0, pause);
    slots.push({ id: el.id, start, revealStart, revealEnd, end });
    t = end;
  }
  const endTransitionStart = t;
  const endTransitionEnd = t + (p.elements.length ? END_TRANSITION : 0);
  return { slots, endTransitionStart, endTransitionEnd, total: endTransitionEnd + Math.max(0, p.endHold) };
}

/** 0..1 reveal progress of an element at time t (1 once drawn). */
export function revealProgress(slot: Slot, t: number): number {
  if (slot.revealEnd <= slot.revealStart) return t >= slot.revealStart ? 1 : 0;
  if (t <= slot.revealStart) return 0;
  if (t >= slot.revealEnd) return 1;
  return (t - slot.revealStart) / (slot.revealEnd - slot.revealStart);
}

export function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerpCamera(a: Camera, b: Camera, k: number): Camera {
  // Interpolate zoom in log space so zooming feels uniform.
  const z = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * k);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, zoom: z };
}

export function autoCamera(b: Bounds): Camera {
  const pad = 1.35;
  const zoom = Math.min(BOARD_W / (b.w * pad), BOARD_H / (b.h * pad));
  return clampToBoard({ x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.max(0.5, Math.min(3, zoom)) });
}

/** Keep the view on the board (no grey margin) whenever the zoom allows it. */
export function clampToBoard(c: Camera): Camera {
  const hw = BOARD_W / c.zoom / 2, hh = BOARD_H / c.zoom / 2;
  const cx = hw * 2 >= BOARD_W ? BOARD_W / 2 : Math.min(BOARD_W - hw, Math.max(hw, c.x));
  const cy = hh * 2 >= BOARD_H ? BOARD_H / 2 : Math.min(BOARD_H - hh, Math.max(hh, c.y));
  return { x: cx, y: cy, zoom: c.zoom };
}

export function elementCamera(el: BoardElement, boundsOf: (el: BoardElement) => Bounds): Camera {
  return el.camera ? clampToBoard(el.camera) : autoCamera(boundsOf(el));
}

export function cameraAt(p: Project, s: Schedule, t: number, boundsOf: (el: BoardElement) => Bounds): Camera {
  let prev: Camera = FULL_BOARD;
  for (let i = 0; i < s.slots.length; i++) {
    const slot = s.slots[i];
    const cam = elementCamera(p.elements[i], boundsOf);
    if (t < slot.revealStart) {
      if (t < slot.start) return prev;
      const k = (t - slot.start) / (slot.revealStart - slot.start);
      return lerpCamera(prev, cam, ease(k));
    }
    if (t < slot.end) return cam;
    prev = cam;
  }
  const end = p.endCamera ?? FULL_BOARD;
  if (t < s.endTransitionStart) return prev;
  if (t < s.endTransitionEnd) {
    return lerpCamera(prev, end, ease((t - s.endTransitionStart) / (s.endTransitionEnd - s.endTransitionStart)));
  }
  return end;
}

/**
 * Stretch/shrink every element's animate+pause time so the video ends with the
 * voice-over. Transitions are kept, because squashing camera moves looks jerky.
 */
export function fitToDuration(p: Project, target: number): Project {
  const s = schedule(p);
  const fixed = p.elements.reduce((a, e) => a + e.timing.transition, 0) + (s.endTransitionEnd - s.endTransitionStart) + p.endHold;
  const flexible = p.elements.reduce((a, e) => a + e.timing.animate + e.timing.pause, 0);
  if (flexible <= 0) return p;
  const k = Math.max(0.05, (target - fixed) / flexible);
  return {
    ...p,
    elements: p.elements.map((e) => ({
      ...e,
      timing: { ...e.timing, animate: round2(e.timing.animate * k), pause: round2(e.timing.pause * k) },
    })),
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Index of element whose slot contains t (for "play from here" and UI highlight). */
export function activeIndex(s: Schedule, t: number): number {
  for (let i = 0; i < s.slots.length; i++) if (t < s.slots[i].end) return i;
  return s.slots.length - 1;
}
