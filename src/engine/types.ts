// Core data model. A Project is plain JSON so it can be saved, diffed and undone.

export type RevealMode = 'draw' | 'fade' | 'move-in' | 'none';
export type DrawDirection = 'ltr' | 'rtl';

export interface Camera {
  /** world-space centre of the view */
  x: number;
  y: number;
  /** 1 = one frame of world units fills the video (1920x1080 landscape, 1080x1920 vertical, 1080x1080 square) */
  zoom: number;
}

/** Video shape. Landscape for YouTube/presentations; vertical for WhatsApp Status, TikTok, Reels; square for Instagram. */
export type Aspect = 'landscape' | 'portrait' | 'square';
export const FRAMES: Record<Aspect, { w: number; h: number }> = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

export interface Timing {
  /** seconds the camera spends travelling to this element */
  transition: number;
  /** seconds spent drawing / revealing */
  animate: number;
  /** seconds to hold after reveal */
  pause: number;
}

interface BaseElement {
  id: string;
  name: string;
  x: number; // world-space top-left
  y: number;
  scale: number;
  rotation: number; // degrees
  opacity: number;
  mode: RevealMode;
  direction: DrawDirection;
  timing: Timing;
  /** explicit camera for this element; null = auto-frame the element */
  camera: Camera | null;
  /** hide the hand while revealing this element */
  noHand?: boolean;
  /** id of the scene this element belongs to */
  scene?: string;
}

export interface SvgElement extends BaseElement {
  kind: 'svg';
  svg: string; // full <svg> markup
  color: string | null; // override for currentColor / stroke
  strokeWidth: number | null;
  source?: AssetSource;
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  src: string; // local URL (never a hotlink)
  width: number; // natural size
  height: number;
  source?: AssetSource;
}

export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  font: FontId;
  size: number; // px in world units
  color: string;
  align: 'start' | 'center' | 'end';
}

export type BoardElement = SvgElement | ImageElement | TextElement;

export type FontId = 'amiri' | 'amiri-bold' | 'cairo';

export interface AssetSource {
  provider: 'library' | 'openverse' | 'wikimedia' | 'pixabay' | 'unsplash' | 'pexels' | 'upload';
  id: string;
  /** library set id (for licence lookup) */
  set?: string;
  author?: string;
  pageUrl?: string;
  license: string;
  /** full credit line, when the licence requires one */
  attribution?: string;
}

export interface AudioTrack {
  src: string;
  name: string;
  duration: number;
  volume: number;
}

/** A scene groups consecutive elements and can carry its own narration and voice recording. */
export interface Scene {
  id: string;
  title: string;
  /** what is said in this scene: shown while recording, used for subtitles */
  narration: string;
  voice: AudioTrack | null;
}

export interface Project {
  version: 1;
  id: string;
  title: string;
  aspect: Aspect;
  /** the drawing surface; can be larger than one frame (scenes laid out side by side) */
  board: { width: number; height: number; background: string };
  hand: HandId;
  /** user-supplied hand image; tip is in image pixels */
  customHand: { src: string; tipX: number; tipY: number; scale: number } | null;
  elements: BoardElement[];
  scenes: Scene[];
  /** background music, or one voice-over for the whole video */
  audio: AudioTrack | null;
  /** final camera after the last element; null = whole board */
  endCamera: Camera | null;
  endHold: number;
}

export type HandId = 'marker-right' | 'marker-left' | 'pen-only' | 'none';

export const BOARD_W = 1920;
export const BOARD_H = 1080;

export function newScene(title: string): Scene {
  return { id: uid(), title, narration: '', voice: null };
}

export function frameOf(p: Pick<Project, 'aspect'>): { w: number; h: number } {
  return FRAMES[p.aspect] ?? FRAMES.landscape;
}

export function newProject(title = 'Untitled', aspect: Aspect = 'landscape'): Project {
  const f = FRAMES[aspect];
  return {
    version: 1,
    id: uid(),
    title,
    aspect,
    board: { width: f.w, height: f.h, background: '#ffffff' },
    hand: 'marker-right',
    customHand: null,
    elements: [],
    scenes: [newScene('1')],
    audio: null,
    endCamera: null,
    endHold: 2,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultTiming(): Timing {
  return { transition: 0.8, animate: 2.5, pause: 0.7 };
}
