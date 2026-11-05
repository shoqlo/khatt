// Original hand + marker artwork, drawn in code (no third-party assets).
// The pen tip is at (0,0); the hand extends down-right (or down-left when mirrored).
import type { HandId, HandTone } from './types';

export interface CustomHand { image: CanvasImageSource; tipX: number; tipY: number; scale: number }

const SKIN: Record<HandTone, [string, string]> = {
  light: ['#f6d4bb', '#c99a7a'],
  medium: ['#e9b48f', '#a8714f'],
  tan: ['#c68c62', '#8a5a39'],
  dark: ['#8a5838', '#5a3721'],
};

export function drawHand(ctx: CanvasRenderingContext2D, id: HandId, x: number, y: number, size: number, custom?: CustomHand | null,
  opts: { tone?: HandTone; tool?: 'marker' | 'chalk' } = {}) {
  if (id === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  if (custom) {
    ctx.drawImage(custom.image, -custom.tipX * custom.scale, -custom.tipY * custom.scale,
      (custom.image as HTMLImageElement).width * custom.scale, (custom.image as HTMLImageElement).height * custom.scale);
    ctx.restore();
    return;
  }
  const s = size / 100;
  ctx.scale(id === 'marker-left' ? -s : s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.rotate(-0.62);
  if (opts.tool === 'chalk') {
    // a stick of chalk, slightly worn at the tip
    ctx.fillStyle = '#f4f2ea'; ctx.strokeStyle = '#c9c4b5'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(8, 90); ctx.lineTo(-8, 90); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(2, 8, 4, 78);
  } else {
    // marker body
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 10); ctx.lineTo(-4, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e8e8'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    roundRect(ctx, -7, 10, 14, 16, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d6fd6';
    roundRect(ctx, -9, 26, 18, 120, 5); ctx.fill(); ctx.strokeStyle = '#124a91'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, -6, 30, 4, 110, 2); ctx.fill();
  }
  ctx.restore();
  if (id !== 'pen-only') {
    // stylised hand gripping the marker / chalk
    const [skin, line] = SKIN[opts.tone ?? 'medium'];
    ctx.fillStyle = skin; ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 18);
    ctx.bezierCurveTo(30, 14, 44, 22, 48, 34);   // index finger top
    ctx.bezierCurveTo(64, 34, 92, 40, 118, 58);  // back of hand
    ctx.lineTo(150, 110);                        // wrist top
    ctx.lineTo(112, 140);                        // wrist bottom
    ctx.bezierCurveTo(90, 120, 70, 104, 52, 92); // palm
    ctx.bezierCurveTo(36, 84, 24, 66, 26, 54);   // thumb
    ctx.bezierCurveTo(16, 48, 10, 34, 18, 18);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); // finger creases
    ctx.moveTo(46, 36); ctx.bezierCurveTo(52, 46, 52, 56, 46, 64);
    ctx.moveTo(60, 44); ctx.bezierCurveTo(66, 54, 66, 64, 60, 72);
    ctx.stroke();
    ctx.fillStyle = '#3c5a8a'; // sleeve
    ctx.beginPath(); ctx.moveTo(140, 98); ctx.lineTo(190, 70); ctx.lineTo(230, 140); ctx.lineTo(118, 150); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
