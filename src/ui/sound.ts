// Sound in the editor: plays every clip (background + each scene's voice) in sync with the
// drawing, records the microphone, and measures recordings. One shared AudioContext, which
// phones only allow to start from a tap, so unlockAudio() is called at the start of taps.
import type { Project } from '../engine/types';
import { audioClips } from '../engine/scenes';
import { schedule } from '../engine/timeline';
import { resolveUrl } from '../storage/db';
import { musicLoop, musicStyleOf } from '../engine/music';
import { duckPoints, scheduleClip } from '../engine/mixer';

type AC = typeof AudioContext;
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    const C: AC = window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;
    ctx = new C();
  }
  return ctx;
}

/** Call synchronously inside a tap/click handler (before any await) so phones allow sound. */
export function unlockAudio() {
  const c = audioContext();
  if (c.state === 'suspended') c.resume().catch(() => {});
}

const buffers = new Map<string, Promise<AudioBuffer>>();
export function loadBuffer(src: string): Promise<AudioBuffer> {
  const style = musicStyleOf(src);
  if (style) return musicLoop(style); // generated on the device, cached per style
  let p = buffers.get(src);
  if (!p) {
    p = (async () => {
      const bytes = await (await fetch(await resolveUrl(src))).arrayBuffer();
      return audioContext().decodeAudioData(bytes);
    })();
    buffers.set(src, p);
    p.catch(() => buffers.delete(src));
  }
  return p;
}

/** Decode a recording/upload once to get its exact length (recorded files often have no duration header). */
export async function blobDuration(blob: Blob): Promise<number> {
  const buf = await audioContext().decodeAudioData(await blob.arrayBuffer());
  return buf.duration;
}

export function preloadProjectSound(p: Project) {
  for (const c of audioClips(p)) loadBuffer(c.src).catch(() => {});
}

let session: { sources: AudioBufferSourceNode[]; ctxStart: number; t0: number } | null = null;

/** Start every clip that is still audible at time t0. Returns false if there is no sound. */
export async function startPlayback(p: Project, t0: number): Promise<boolean> {
  stopPlayback();
  const all = audioClips(p, schedule(p));
  const clips = all.filter((c) => c.start + c.duration > t0);
  if (!clips.length) return false;
  const c = audioContext();
  const loaded = await Promise.all(clips.map(async (clip) => ({ clip, buf: await loadBuffer(clip.src).catch(() => null) })));
  const ctxStart = c.currentTime + 0.05;
  const duck = duckPoints(all);
  const sources: AudioBufferSourceNode[] = [];
  for (const { clip, buf } of loaded) {
    if (!buf) continue;
    const node = scheduleClip(c, buf, clip, t0, ctxStart, duck);
    if (node) sources.push(node);
  }
  session = { sources, ctxStart, t0 };
  return sources.length > 0;
}

/** Current video time while sound plays (the sound is the clock, so drawing stays in sync). */
export function playbackTime(): number | null {
  if (!session || !ctx) return null;
  return session.t0 + Math.max(0, ctx.currentTime - session.ctxStart);
}

export function stopPlayback() {
  if (!session) return;
  for (const s of session.sources) { try { s.stop(); } catch { /* already stopped */ } }
  session = null;
}

/** Play one clip on its own (e.g. to listen to a scene's recording). Returns a stop function. */
export async function previewClip(src: string, volume = 1, onEnd?: () => void): Promise<() => void> {
  stopPlayback();
  const buf = await loadBuffer(src);
  const c = audioContext();
  const node = c.createBufferSource();
  node.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = volume;
  node.connect(gain).connect(c.destination);
  node.onended = () => onEnd?.();
  node.start();
  return () => { try { node.stop(); } catch { /* ended */ } };
}

// ---------------- microphone ----------------
export interface Recording {
  /** start capturing (the microphone is already open, so this is instant) */
  begin: () => void;
  stop: () => Promise<Blob>;
  cancel: () => void;
  /** 0..1 input level, for a live meter */
  level: () => number;
}

function recorderType(): string | undefined {
  const prefs = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return prefs.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
}

export async function startRecording(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record sound.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const type = recorderType();
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const c = audioContext();
  const analyser = c.createAnalyser();
  analyser.fftSize = 512;
  const srcNode = c.createMediaStreamSource(stream);
  srcNode.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const done = () => { stream.getTracks().forEach((tr) => tr.stop()); srcNode.disconnect(); };
  return {
    begin: () => { if (rec.state === 'inactive') rec.start(250); },
    level: () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / data.length) * 3);
    },
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { done(); resolve(new Blob(chunks, { type: (rec.mimeType || chunks[0]?.type || 'audio/webm').split(';')[0] })); };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop!(new Event('stop'));
    }),
    cancel: () => { try { if (rec.state !== 'inactive') rec.stop(); } catch { /* inactive */ } done(); },
  };
}
