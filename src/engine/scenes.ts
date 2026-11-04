// Scenes: consecutive elements that share a narration and (optionally) a voice recording.
// Elements stay in one flat, ordered list; each carries the id of its scene, and the
// elements of a scene are always kept next to each other.
import { newScene, FRAMES, type AudioTrack, type BoardElement, type Project, type Scene } from './types';
import { schedule, type Schedule } from './timeline';

/** Bring any project (including ones saved before scenes existed) into a consistent shape. Mutates and returns p. */
export function normalizeProject(p: Project): Project {
  if (!p.aspect || !FRAMES[p.aspect]) p.aspect = 'landscape';
  if (!Array.isArray(p.scenes)) p.scenes = [];
  if (!p.scenes.length) p.scenes.push(newScene('1'));
  for (const s of p.scenes) {
    s.narration ??= '';
    s.voice ??= null;
    s.title ??= '';
  }
  const ids = new Set(p.scenes.map((s) => s.id));
  let last = p.scenes[0].id;
  for (const e of p.elements) {
    if (!e.scene || !ids.has(e.scene)) e.scene = last; // older projects: everything joins the first scene
    last = e.scene;
  }
  // Keep each scene's elements together, in scene order (stable).
  const order = new Map(p.scenes.map((s, i) => [s.id, i]));
  p.elements = p.elements.map((e, i) => ({ e, i })).sort((a, b) => order.get(a.e.scene!)! - order.get(b.e.scene!)! || a.i - b.i).map((x) => x.e);
  return p;
}

export interface SceneSpan {
  scene: Scene;
  index: number;
  start: number;
  end: number;
  /** element indices (inclusive); first = -1 when the scene is empty */
  first: number;
  last: number;
}

export function sceneSpans(p: Project, s: Schedule = schedule(p)): SceneSpan[] {
  const spans: SceneSpan[] = [];
  let t = 0;
  p.scenes.forEach((scene, index) => {
    let first = -1, last = -1;
    p.elements.forEach((e, i) => { if (e.scene === scene.id) { if (first < 0) first = i; last = i; } });
    const start = first >= 0 ? s.slots[first].start : t;
    const end = last >= 0 ? s.slots[last].end : t;
    spans.push({ scene, index, start, end, first, last });
    t = end;
  });
  return spans;
}

export const sceneElements = (p: Project, sceneId: string): BoardElement[] => p.elements.filter((e) => e.scene === sceneId);

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Stretch or shrink the scene's drawing and pause times so the scene lasts as long as its voice
 * (plus a short breath). Camera moves are kept as they are.
 */
export function fitSceneToVoice(p: Project, sceneId: string, breath = 0.4): boolean {
  const scene = p.scenes.find((s) => s.id === sceneId);
  const els = sceneElements(p, sceneId);
  if (!scene?.voice || !els.length) return false;
  const fixed = els.reduce((a, e) => a + e.timing.transition, 0);
  const flexible = els.reduce((a, e) => a + e.timing.animate + e.timing.pause, 0);
  const target = scene.voice.duration + breath;
  if (flexible <= 0) {
    els[els.length - 1].timing.pause = round2(Math.max(0, target - fixed));
    return true;
  }
  const k = Math.max(0.1, (target - fixed) / flexible);
  for (const e of els) {
    // Never rush a drawing below MIN_DRAW seconds: a very short voice note leaves a little silence instead.
    e.timing.animate = round2(Math.max(MIN_DRAW, e.timing.animate * k));
    e.timing.pause = round2(e.timing.pause * k);
  }
  return true;
}

/** Shortest time a drawing or text may take to appear when fitting to a voice. */
export const MIN_DRAW = 0.6;

export interface AudioClip { src: string; start: number; volume: number; duration: number; kind: 'background' | 'scene'; sceneId?: string }

/** Every sound in the video and when it starts: the background track at 0, each scene's voice when its scene begins. */
export function audioClips(p: Project, s: Schedule = schedule(p)): AudioClip[] {
  const clips: AudioClip[] = [];
  if (p.audio) clips.push({ src: p.audio.src, start: 0, volume: p.audio.volume, duration: p.audio.duration, kind: 'background' });
  for (const span of sceneSpans(p, s)) {
    const v: AudioTrack | null = span.scene.voice;
    if (v && span.first >= 0) clips.push({ src: v.src, start: span.start, volume: v.volume, duration: v.duration, kind: 'scene', sceneId: span.scene.id });
  }
  return clips;
}

/** Where a new element for this scene goes: right after the scene's last element. */
export function insertIndexForScene(p: Project, sceneId: string): number {
  const order = p.scenes.findIndex((s) => s.id === sceneId);
  let idx = 0;
  p.elements.forEach((e, i) => {
    const o = p.scenes.findIndex((s) => s.id === e.scene);
    if (o <= order) idx = i + 1;
  });
  return idx;
}

export function moveScene(p: Project, sceneId: string, delta: -1 | 1): boolean {
  const i = p.scenes.findIndex((s) => s.id === sceneId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.scenes.length) return false;
  [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
  normalizeProject(p);
  return true;
}

export function deleteScene(p: Project, sceneId: string): void {
  p.scenes = p.scenes.filter((s) => s.id !== sceneId);
  p.elements = p.elements.filter((e) => e.scene !== sceneId);
  normalizeProject(p);
}

/** Subtitles: one caption per scene from its narration; falls back to on-screen text when there is none. */
export function sceneCaptions(p: Project, s: Schedule = schedule(p)): { a: number; b: number; text: string }[] {
  const spans = sceneSpans(p, s).filter((sp) => sp.scene.narration.trim() && sp.first >= 0);
  if (spans.length) return spans.map((sp) => ({ a: sp.start, b: sp.end, text: sp.scene.narration.trim() }));
  const cues: { a: number; b: number; text: string }[] = [];
  p.elements.forEach((el, i) => {
    if (el.kind === 'text' && el.text.trim()) cues.push({ a: s.slots[i].revealStart, b: s.total, text: el.text.trim() });
  });
  for (let i = 0; i < cues.length - 1; i++) cues[i].b = cues[i + 1].a;
  return cues;
}
