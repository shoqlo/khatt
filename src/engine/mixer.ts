// Shared by live playback and export: places one sound clip in an audio context, with the
// generated music looping and fading, and the background lowered while a voice speaks.
import type { AudioClip } from './scenes';
import { isMusicSrc, MUSIC_FADE_IN, MUSIC_FADE_OUT } from './music';

export interface DuckPoint { t: number; level: number }

/** Background level relative to its volume: drops to `depth` while scene voices play. */
export function duckPoints(clips: AudioClip[], depth = 0.35): DuckPoint[] {
  const spans = clips.filter((c) => c.kind === 'scene' && c.duration > 0).map((c) => [c.start, c.start + c.duration]).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    // Short gaps between voices don't bring the music back up (it would pump).
    if (last && s[0] - last[1] < 1) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return merged.flatMap(([a, b]) => [{ t: Math.max(0, a - 0.15), level: depth }, { t: b + 0.2, level: 1 }]);
}

export function levelAt(points: DuckPoint[], t: number): number {
  let level = 1;
  for (const p of points) if (p.t <= t) level = p.level;
  return level;
}

/** Fade lengths for a generated track (shorter for very short videos). */
export function musicFades(duration: number) {
  return { fadeIn: Math.min(MUSIC_FADE_IN, duration * 0.3), fadeOut: Math.min(MUSIC_FADE_OUT, duration * 0.3) };
}

/**
 * Schedule `clip` so that video time `t0` happens at context time `when`.
 * Returns the source node (to stop it later), or null if the clip is already over.
 */
export function scheduleClip(ctx: BaseAudioContext, buf: AudioBuffer, clip: AudioClip, t0: number, when: number, duck: DuckPoint[]): AudioBufferSourceNode | null {
  const end = clip.start + clip.duration;
  if (end <= t0) return null;
  const at = (vt: number) => when + (vt - t0);
  const startVt = Math.max(t0, clip.start);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  const fade = ctx.createGain(), duckGain = ctx.createGain(), vol = ctx.createGain();
  vol.gain.value = clip.volume;
  node.connect(fade).connect(duckGain).connect(vol).connect(ctx.destination);
  const music = isMusicSrc(clip.src);
  const offset = startVt - clip.start;
  if (music) {
    node.loop = true;
    node.start(at(startVt), offset % buf.duration);
    const { fadeIn, fadeOut } = musicFades(clip.duration);
    const level = (vt: number) => Math.max(0, Math.min(1, (vt - clip.start) / fadeIn, (end - vt) / fadeOut));
    const outStart = Math.max(startVt, end - fadeOut);
    fade.gain.setValueAtTime(level(startVt), at(startVt));
    if (startVt < clip.start + fadeIn) fade.gain.linearRampToValueAtTime(1, at(Math.min(clip.start + fadeIn, outStart)));
    fade.gain.setValueAtTime(level(outStart), at(outStart));
    fade.gain.linearRampToValueAtTime(0, at(end));
    node.stop(at(end) + 0.05);
  } else {
    node.start(at(startVt), offset);
  }
  if (clip.kind === 'background') {
    duckGain.gain.setValueAtTime(levelAt(duck, startVt), at(startVt));
    for (const p of duck) if (p.t > startVt) duckGain.gain.setTargetAtTime(p.level, at(p.t), 0.12);
  }
  return node;
}
