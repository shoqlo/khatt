// Core data model. A Project is plain JSON so it can be saved, diffed and undone.

export type RevealMode = 'draw' | 'fade' | 'move-in' | 'none';
export type DrawDirection = 'ltr' | 'rtl';

export interface Camera {
  /** world-space centre of the view */
  x: number;
  y: number;
  /** 1 = the whole 1920x1080 board fills the frame */
  zoom: number;
}

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
  provider: 'tabler' | 'pixabay' | 'upload';
  id: string;
  author?: string;
  pageUrl?: string;
  license: string;
}

export interface AudioTrack {
  src: string;
  name: string;
  duration: number;
  volume: number;
}

export interface Project {
  version: 1;
  id: string;
  title: string;
  board: { width: number; height: number; background: string };
  hand: HandId;
  /** user-supplied hand image; tip is in image pixels */
  customHand: { src: string; tipX: number; tipY: number; scale: number } | null;
  elements: BoardElement[];
  audio: AudioTrack | null;
  /** final camera after the last element; null = whole board */
  endCamera: Camera | null;
  endHold: number;
}

export type HandId = 'marker-right' | 'marker-left' | 'pen-only' | 'none';

export const BOARD_W = 1920;
export const BOARD_H = 1080;

export function newProject(title = 'Untitled'): Project {
  return {
    version: 1,
    id: uid(),
    title,
    board: { width: BOARD_W, height: BOARD_H, background: '#ffffff' },
    hand: 'marker-right',
    customHand: null,
    elements: [],
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
