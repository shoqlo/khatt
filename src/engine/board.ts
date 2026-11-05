// Board looks (like a whiteboard, chalkboard, glassboard, notepad…): the background drawn behind
// everything, the default ink for line drawings and text, and the tool in the hand.
import type { BoardStyle, Project } from './types';

export type { BoardStyle };
export type Tool = 'marker' | 'chalk';

interface Look { ink: string; tool: Tool; base: string | null; grain: number; dark: boolean }
export const BOARD_LOOKS: Record<BoardStyle, Look> = {
  whiteboard: { ink: '#1f1f1f', tool: 'marker', base: null, grain: 0, dark: false }, // uses the chosen board colour
  blackboard: { ink: '#f2f0e9', tool: 'chalk', base: '#1f2427', grain: 0.07, dark: true },
  greenboard: { ink: '#f2f0e9', tool: 'chalk', base: '#24453b', grain: 0.07, dark: true },
  glass: { ink: '#e6f6ff', tool: 'marker', base: '#13222c', grain: 0, dark: true },
  notepad: { ink: '#1d2a5a', tool: 'marker', base: '#fffdf5', grain: 0.025, dark: false },
  sketchbook: { ink: '#2b2622', tool: 'marker', base: '#f5eddc', grain: 0.06, dark: false },
  grid: { ink: '#1f1f1f', tool: 'marker', base: '#ffffff', grain: 0, dark: false },
};

export const boardStyle = (p: Pick<Project, 'board'>): BoardStyle => (p.board.style && BOARD_LOOKS[p.board.style] ? p.board.style : 'whiteboard');
export const boardInk = (p: Pick<Project, 'board'>) => BOARD_LOOKS[boardStyle(p)].ink;
export const boardTool = (p: Pick<Project, 'board'>) => BOARD_LOOKS[boardStyle(p)].tool;
/** Dark boards (chalk, glass): charts use colours stepped for a dark surface. */
export const boardIsDark = (p: Pick<Project, 'board'>) => BOARD_LOOKS[boardStyle(p)].dark;

// A small tile of random specks (chalk dust / paper grain), made once per colour and repeated.
const grainTiles = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
function grainTile(light: boolean): HTMLCanvasElement | OffscreenCanvas {
  const key = light ? 'light' : 'dark';
  let c = grainTiles.get(key);
  if (c) return c;
  const size = 256;
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${0.15 + rnd() * 0.5})` : `rgba(60,40,20,${0.12 + rnd() * 0.4})`;
    const r = rnd() * 1.4 + 0.3;
    g.beginPath(); g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2); g.fill();
  }
  grainTiles.set(key, c);
  return c;
}

/** Draw the board (in world coordinates: the view transform is already set). */
export function drawBoard(ctx: CanvasRenderingContext2D, p: Project) {
  const look = BOARD_LOOKS[boardStyle(p)];
  const W = p.board.width, H = p.board.height;
  ctx.save();
  ctx.fillStyle = look.base ?? p.board.background;
  ctx.fillRect(0, 0, W, H);
  const style = boardStyle(p);
  if (style === 'glass') {
    // A soft sheen across the glass.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(120,180,210,0.10)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)'); g.addColorStop(0.55, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (look.grain > 0) {
    const pat = ctx.createPattern(grainTile(look.dark) as CanvasImageSource, 'repeat');
    if (pat) { ctx.globalAlpha = look.grain * 4; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  if (style === 'notepad' || style === 'grid') {
    const step = Math.max(40, Math.round(Math.min(W, H) / 18));
    ctx.lineWidth = 2;
    ctx.strokeStyle = style === 'notepad' ? 'rgba(80,130,200,0.35)' : 'rgba(80,130,200,0.18)';
    ctx.beginPath();
    for (let y = step * (style === 'notepad' ? 2 : 1); y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    if (style === 'grid') for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    ctx.stroke();
    if (style === 'notepad') {
      // Margin line on the reading side (right for Arabic boards).
      ctx.strokeStyle = 'rgba(220,70,70,0.45)';
      const mx = p.board.marginSide === 'left' ? step * 1.6 : W - step * 1.6;
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H); ctx.stroke();
    }
  }
  ctx.restore();
}
