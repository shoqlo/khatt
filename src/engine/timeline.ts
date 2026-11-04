import { frameOf, type BoardElement, type Camera, type Project } from './types';

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

type Shape = Pick<Project, 'aspect' | 'board'>;

/** Camera that shows the whole board inside the video frame. */
export function fullView(p: Shape): Camera {
  const f = frameOf(p);
  return { x: p.board.width / 2, y: p.board.height / 2, zoom: Math.min(f.w / p.board.width, f.h / p.board.height) };
}

/** Zoom range for editing and auto-framing: from the whole board up to 8x closer than one frame. */
export function zoomLimits(p: Shape) {
  return { min: fullView(p).zoom * 0.5, max: 8 };
}

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

export function autoCamera(b: Bounds, p: Shape): Camera {
  const f = frameOf(p);
  const pad = 1.35;
  const zoom = Math.min(f.w / (b.w * pad), f.h / (b.h * pad));
  const full = fullView(p).zoom;
  return clampToBoard({ x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.max(Math.min(0.5, full), Math.min(3, zoom)) }, p);
}

/** Keep the view on the board (no grey margin) whenever the zoom allows it. */
export function clampToBoard(c: Camera, p: Shape): Camera {
  const f = frameOf(p);
  const W = p.board.width, H = p.board.height;
  const hw = f.w / c.zoom / 2, hh = f.h / c.zoom / 2;
  const cx = hw * 2 >= W ? W / 2 : Math.min(W - hw, Math.max(hw, c.x));
  const cy = hh * 2 >= H ? H / 2 : Math.min(H - hh, Math.max(hh, c.y));
  return { x: cx, y: cy, zoom: c.zoom };
}

export function elementCamera(el: BoardElement, p: Shape, boundsOf: (el: BoardElement) => Bounds): Camera {
  return el.camera ? clampToBoard(el.camera, p) : autoCamera(boundsOf(el), p);
}

export function cameraAt(p: Project, s: Schedule, t: number, boundsOf: (el: BoardElement) => Bounds): Camera {
  const full = fullView(p);
  let prev: Camera = full;
  for (let i = 0; i < s.slots.length; i++) {
    const slot = s.slots[i];
    const cam = elementCamera(p.elements[i], p, boundsOf);
    if (t < slot.revealStart) {
      if (t < slot.start) return prev;
      const k = (t - slot.start) / (slot.revealStart - slot.start);
      return lerpCamera(prev, cam, ease(k));
    }
    if (t < slot.end) return cam;
    prev = cam;
  }
  const end = p.endCamera ?? full;
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
