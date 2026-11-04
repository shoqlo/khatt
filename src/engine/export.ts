// In-browser export: no upload, no render queue.
//  1. Fast path: WebCodecs (Chrome/Edge/Android, Safari 26+): renders faster than real time.
//  2. Fallback: MediaRecorder records the canvas in real time (older iPhones, browsers
//     without audio encoding) so the video still gets its sound.
//  3. GIF: works everywhere, no sound.
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Project } from './types';
import { renderFrame } from './render';
import { prepareAll } from './prepare';
import { schedule } from './timeline';
import { audioClips, sceneCaptions } from './scenes';
import type { CustomHand } from './hand';
import { resolveUrl } from '../storage/db';

export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportMethod = 'webcodecs' | 'realtime' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  customHand?: CustomHand | null;
  /** created inside the click handler so iOS lets it play sound */
  audioContext?: AudioContext;
  forceMethod?: ExportMethod;
}

export interface ExportResult {
  blob: Blob; mime: string; ext: string; frames: number; withAudio: boolean; codec: string; method: ExportMethod;
}

/** Video bitrate: whiteboard frames are simple, so ~0.07 bits/pixel is plenty (≈2 Mbps at 720p30). */
export const bitrate = (w: number, h: number, fps: number) => Math.round(w * h * fps * 0.07);

export async function planExport(p: Project, format: ExportFormat): Promise<{ method: ExportMethod; silent: boolean }> {
  if (format === 'gif') return { method: 'gif', silent: true };
  const fastVideo = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  const hasSound = audioClips(p).length > 0;
  const fastAudio = !hasSound || (typeof AudioEncoder !== 'undefined' && !!(await pickAudioCodec(format, 48000, 2)));
  if (fastVideo && fastAudio) return { method: 'webcodecs', silent: false };
  if (canRecord()) return { method: 'realtime', silent: false };
  if (fastVideo) return { method: 'webcodecs', silent: hasSound };
  throw new Error('This browser cannot make videos. Export a GIF, or update the browser.');
}

export async function exportVideo(p: Project, o: ExportOptions): Promise<ExportResult> {
  await prepareAll(p.elements);
  const plan = o.forceMethod ? { method: o.forceMethod, silent: false } : await planExport(p, o.format);
  if (plan.method === 'gif') return exportGif(p, o);
  if (plan.method === 'realtime') return exportRealtime(p, o);
  return exportWebCodecs(p, o, plan.silent);
}

// ---------------- WebCodecs ----------------
async function pickVideoCodec(fmt: 'mp4' | 'webm', w: number, h: number, fps: number) {
  const candidates = fmt === 'mp4'
    ? [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['vp09.00.40.08', 'vp9'], ['av01.0.08M.08', 'av1']]
    : [['vp09.00.40.08', 'V_VP9'], ['vp8', 'V_VP8'], ['av01.0.08M.08', 'V_AV1']];
  for (const [codec, muxCodec] of candidates) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate: bitrate(w, h, fps), framerate: fps };
    if (codec.startsWith('avc')) (config as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, muxCodec };
    } catch { /* try next */ }
  }
  return null;
}

async function pickAudioCodec(fmt: string, sampleRate: number, channels: number) {
  if (typeof AudioEncoder === 'undefined') return null;
  const candidates = fmt === 'mp4' ? [['mp4a.40.2', 'aac'], ['opus', 'opus']] : [['opus', 'A_OPUS']];
  for (const [codec, muxCodec] of candidates) {
    const config: AudioEncoderConfig = { codec, sampleRate, numberOfChannels: channels, bitrate: 128_000 };
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, muxCodec };
    } catch { /* next */ }
  }
  return null;
}

/**
 * Mix every clip (background track + each scene's voice, at its start time) into one
 * stereo buffer as long as the video.
 */
export async function renderMix(p: Project, duration: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  const clips = audioClips(p);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  for (const c of clips) {
    if (c.start >= duration) continue;
    const bytes = await (await fetch(await resolveUrl(c.src))).arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes);
    const node = ctx.createBufferSource();
    node.buffer = decoded;
    const gain = ctx.createGain();
    gain.gain.value = c.volume;
    node.connect(gain).connect(ctx.destination);
    node.start(c.start);
  }
  return ctx.startRendering();
}

async function exportWebCodecs(p: Project, o: ExportOptions, dropAudio: boolean): Promise<ExportResult> {
  const w = o.width & ~1, h = o.height & ~1;
  const sched = schedule(p);
  const frames = Math.max(1, Math.ceil(sched.total * o.fps));
  // Try the requested container first; fall back to the other one rather than failing.
  let fmt = o.format as 'mp4' | 'webm';
  let video = await pickVideoCodec(fmt, w, h, o.fps);
  if (!video) { fmt = fmt === 'mp4' ? 'webm' : 'mp4'; video = await pickVideoCodec(fmt, w, h, o.fps); }
  if (!video) throw new Error('This device cannot encode video at this size. Try a lower quality or GIF.');
  const { config, muxCodec } = video;

  const sampleRate = 48000;
  const hasSound = audioClips(p, sched).length > 0;
  const audioCodec = hasSound && !dropAudio ? await pickAudioCodec(fmt, sampleRate, 2) : null;
  const audioBuf = audioCodec ? await renderMix(p, sched.total, sampleRate) : null;

  const muxer: { addVideoChunk: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata) => void; addAudioChunk: (c: EncodedAudioChunk, m?: EncodedAudioChunkMetadata) => void; finalize: () => void; target: { buffer: ArrayBuffer } } =
    fmt === 'mp4'
      ? new Mp4Muxer({
          target: new Mp4Target(),
          video: { codec: muxCodec as 'avc', width: w, height: h, frameRate: o.fps },
          audio: audioBuf ? { codec: audioCodec!.muxCodec as 'aac', numberOfChannels: 2, sampleRate } : undefined,
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
        })
      : new WebmMuxer({
          target: new WebmTarget(),
          video: { codec: muxCodec, width: w, height: h, frameRate: o.fps },
          audio: audioBuf ? { codec: audioCodec!.muxCodec, numberOfChannels: 2, sampleRate } : undefined,
          firstTimestampBehavior: 'offset',
        });

  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure(config);

  if (audioBuf) {
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
    aenc.configure(audioCodec!.config);
    const chunk = 4800;
    const l = audioBuf.getChannelData(0), r = audioBuf.getChannelData(1);
    for (let i = 0; i < audioBuf.length; i += chunk) {
      const n = Math.min(chunk, audioBuf.length - i);
      const data = new Float32Array(n * 2);
      data.set(l.subarray(i, i + n), 0);
      data.set(r.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sampleRate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  try {
    for (let f = 0; f < frames; f++) {
      if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (failure) throw failure;
      renderFrame(ctx, p, f / o.fps, { sched, customHand: o.customHand });
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f / o.fps) * 1e6), duration: Math.round(1e6 / o.fps) });
      venc.encode(frame, { keyFrame: f % (o.fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
      if (f % 10 === 0) { o.onProgress?.(f / frames); await new Promise((r) => setTimeout(r, 0)); }
    }
    await venc.flush();
  } finally {
    if (venc.state !== 'closed') venc.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  o.onProgress?.(1);
  const mime = fmt === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([muxer.target.buffer], { type: mime }), mime, ext: fmt, frames, withAudio: !!audioBuf, codec: config.codec, method: 'webcodecs' };
}

// ---------------- real-time recording fallback ----------------
export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

function recorderMime(format: ExportFormat): string {
  const mp4 = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of format === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm]) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

async function exportRealtime(p: Project, o: ExportOptions): Promise<ExportResult> {
  const sched = schedule(p);
  const total = sched.total;
  const w = o.width & ~1, h = o.height & ~1;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  // Safari only streams canvases that are in the document.
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  renderFrame(ctx, p, 0, { sched, customHand: o.customHand });
  const stream = canvas.captureStream(o.fps);

  const ownCtx = !o.audioContext;
  let ac: AudioContext | null = o.audioContext ?? null;
  let src: AudioBufferSourceNode | null = null;
  const hasSound = audioClips(p, sched).length > 0;
  if (hasSound) {
    ac ??= new AudioContext();
    await ac.resume();
    const buf = (await renderMix(p, total, ac.sampleRate))!;
    const dest = ac.createMediaStreamDestination();
    src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const mimeType = recorderMime(o.format);
  const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: bitrate(w, h, o.fps) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  try {
    rec.start(500);
    src?.start();
    const t0 = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (o.signal?.aborted) { reject(new DOMException('Export cancelled', 'AbortError')); return; }
        const t = (performance.now() - t0) / 1000;
        renderFrame(ctx, p, Math.min(t, total), { sched, customHand: o.customHand });
        o.onProgress?.(Math.min(1, t / total));
        if (t >= total) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    try { src?.stop(); } catch { /* not started */ }
    stream.getTracks().forEach((tr) => tr.stop());
    canvas.remove();
    if (ownCtx) ac?.close();
  }
  const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
  return {
    blob: new Blob(chunks, { type }), mime: type, ext: type.includes('mp4') ? 'mp4' : 'webm',
    frames: Math.round(total * o.fps), withAudio: hasSound, codec: rec.mimeType || type, method: 'realtime',
  };
}

// ---------------- GIF ----------------
async function exportGif(p: Project, o: ExportOptions): Promise<ExportResult> {
  const sched = schedule(p);
  const fps = Math.min(o.fps, 15);
  const w = Math.min(o.width, 960), h = Math.round((w * o.height) / o.width);
  const frames = Math.max(1, Math.ceil(sched.total * fps));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let f = 0; f < frames; f++) {
    if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    renderFrame(ctx, p, f / fps, { sched, customHand: o.customHand });
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay });
    if (f % 5 === 0) { o.onProgress?.(f / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  gif.finish();
  o.onProgress?.(1);
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), mime: 'image/gif', ext: 'gif', frames, withAudio: false, codec: 'gif', method: 'gif' };
}

/** Subtitles (.srt): one caption per scene narration, or per on-screen text when there is no narration. */
export function exportSrt(p: Project): string {
  const cues = sceneCaptions(p, schedule(p));
  const ts = (x: number) => {
    const ms = Math.round(x * 1000);
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n');
}
