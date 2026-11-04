// In-browser export: no upload, no render queue.
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Project } from './types';
import { renderFrame } from './render';
import { prepareAll } from './prepare';
import { schedule } from './timeline';
import type { CustomHand } from './hand';

export type ExportFormat = 'mp4' | 'webm' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  customHand?: CustomHand | null;
}

export interface ExportResult { blob: Blob; mime: string; ext: string; frames: number; withAudio: boolean; codec: string }

export async function exportVideo(p: Project, o: ExportOptions): Promise<ExportResult> {
  await prepareAll(p.elements);
  if (o.format === 'gif') return exportGif(p, o);
  return exportWebCodecs(p, o);
}

async function pickVideoCodec(fmt: 'mp4' | 'webm', w: number, h: number, fps: number) {
  const candidates = fmt === 'mp4'
    ? [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['vp09.00.40.08', 'vp9'], ['av01.0.08M.08', 'av1']]
    : [['vp09.00.40.08', 'V_VP9'], ['vp8', 'V_VP8'], ['av01.0.08M.08', 'V_AV1']];
  for (const [codec, muxCodec] of candidates) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate: Math.round(w * h * fps * 0.12), framerate: fps };
    if (codec.startsWith('avc')) (config as VideoEncoderConfig & { avc?: { format: 'avc' } }).avc = { format: 'avc' };
    try {
      const r = await VideoEncoder.isConfigSupported(config);
      if (r.supported) return { config, muxCodec };
    } catch { /* try next */ }
  }
  throw new Error(`This browser cannot encode ${fmt.toUpperCase()} video. Try ${fmt === 'mp4' ? 'WebM' : 'MP4'} or GIF.`);
}

async function pickAudioCodec(fmt: 'mp4' | 'webm', sampleRate: number, channels: number) {
  const candidates = fmt === 'mp4' ? [['mp4a.40.2', 'aac'], ['opus', 'opus']] : [['opus', 'A_OPUS']];
  for (const [codec, muxCodec] of candidates) {
    const config: AudioEncoderConfig = { codec, sampleRate, numberOfChannels: channels, bitrate: 128_000 };
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, muxCodec };
    } catch { /* next */ }
  }
  return null;
}

async function decodeAudio(src: string, duration: number, volume: number, sampleRate = 48000): Promise<AudioBuffer> {
  const bytes = await (await fetch(src)).arrayBuffer();
  const tmp = new OfflineAudioContext(2, 1, sampleRate);
  const decoded = await tmp.decodeAudioData(bytes);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const node = ctx.createBufferSource();
  node.buffer = decoded;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  node.connect(gain).connect(ctx.destination);
  node.start();
  return ctx.startRendering();
}

async function exportWebCodecs(p: Project, o: ExportOptions): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs support. Use GIF, or a current Chrome/Edge.');
  const fmt = o.format as 'mp4' | 'webm';
  const w = o.width & ~1, h = o.height & ~1;
  const sched = schedule(p);
  const frames = Math.max(1, Math.ceil(sched.total * o.fps));
  const { config, muxCodec } = await pickVideoCodec(fmt, w, h, o.fps);

  const sampleRate = 48000;
  const audioCodec = p.audio ? await pickAudioCodec(fmt, sampleRate, 2) : null;
  const audioBuf = p.audio && audioCodec ? await decodeAudio(p.audio.src, sched.total, p.audio.volume, sampleRate) : null;

  const muxer: { addVideoChunk: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata) => void; addAudioChunk: (c: EncodedAudioChunk, m?: EncodedAudioChunkMetadata) => void; finalize: () => void } =
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
  for (let f = 0; f < frames; f++) {
    if (o.signal?.aborted) { venc.close(); throw new DOMException('Export cancelled', 'AbortError'); }
    if (failure) throw failure;
    renderFrame(ctx, p, f / o.fps, { sched, customHand: o.customHand });
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f / o.fps) * 1e6), duration: Math.round(1e6 / o.fps) });
    venc.encode(frame, { keyFrame: f % (o.fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
    if (f % 10 === 0) { o.onProgress?.(f / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;
  muxer.finalize();
  const buffer = (muxer as unknown as { target: { buffer: ArrayBuffer } }).target.buffer;
  o.onProgress?.(1);
  const mime = fmt === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([buffer], { type: mime }), mime, ext: fmt, frames, withAudio: !!audioBuf, codec: config.codec };
}

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
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), mime: 'image/gif', ext: 'gif', frames, withAudio: false, codec: 'gif' };
}

/** Subtitles from text elements: each caption shows from when it starts being written until the next one. */
export function exportSrt(p: Project): string {
  const s = schedule(p);
  const cues: { a: number; b: number; text: string }[] = [];
  p.elements.forEach((el, i) => {
    if (el.kind !== 'text' || !el.text.trim()) return;
    cues.push({ a: s.slots[i].revealStart, b: s.total, text: el.text.trim() });
  });
  for (let i = 0; i < cues.length - 1; i++) cues[i].b = cues[i + 1].a;
  const ts = (x: number) => {
    const ms = Math.round(x * 1000);
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n');
}
