// Background music made on the device. Every sound is synthesised here (oscillators and noise:
// no samples, no recordings), so the tracks are original and need no licence or credit.
// A track is stored as a recipe ("music:calm"), not as audio: it costs no space, and it always
// lasts exactly as long as the video. A short loop is rendered once and repeated seamlessly.

export type MusicStyle = 'calm' | 'bright' | 'story' | 'focus' | 'oriental';
export const MUSIC_STYLES: MusicStyle[] = ['calm', 'bright', 'story', 'focus', 'oriental'];
export const MUSIC_PREFIX = 'music:';

export const isMusicSrc = (src: string) => src.startsWith(MUSIC_PREFIX);
export const musicSrc = (style: MusicStyle) => `${MUSIC_PREFIX}${style}`;
export function musicStyleOf(src: string): MusicStyle | null {
  const s = src.slice(MUSIC_PREFIX.length) as MusicStyle;
  return isMusicSrc(src) && MUSIC_STYLES.includes(s) ? s : null;
}

/** Seconds of fade at the start and end of the video. */
export const MUSIC_FADE_IN = 1.5;
export const MUSIC_FADE_OUT = 3;
/** Suggested level under a voice. */
export const MUSIC_VOLUME = 0.35;

type Drums = 'none' | 'soft' | 'maqsum';
interface Layer { wave: OscillatorType; octave: number; pattern: number[]; decay: number; gain: number }
interface Recipe {
  bpm: number;
  root: number; // MIDI note of the tonic
  scale: number[]; // 7 notes, semitones above the tonic
  prog: number[]; // one chord per bar: scale degree of its root
  pad: number; // pad level (0 = none)
  bass: number[]; // per eighth note: 1 = play the chord root
  arpA: Layer | null; // first half of the loop
  arpB: Layer | null; // second half adds this
  drumsA: Drums;
  drumsB: Drums;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10]; // maqam Hijaz on the tonic (no quarter tones needed)

export const RECIPES: Record<MusicStyle, Recipe> = {
  // slow, warm, for lessons and calm explainers
  calm: {
    bpm: 68, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], pad: 0.5, bass: [1, 0, 0, 0, 0, 0, 0, 0],
    arpA: { wave: 'sine', octave: 1, pattern: [0, -1, 1, -1, 2, -1, 1, -1], decay: 1.4, gain: 0.16 },
    arpB: { wave: 'sine', octave: 2, pattern: [-1, 2, -1, 1, -1, 0, -1, 1], decay: 1.1, gain: 0.07 },
    drumsA: 'none', drumsB: 'none',
  },
  // upbeat, for promos and good news
  bright: {
    bpm: 112, root: 55, scale: MAJOR, prog: [0, 3, 5, 4], pad: 0.28, bass: [1, 0, 0, 1, 1, 0, 0, 0],
    arpA: { wave: 'triangle', octave: 1, pattern: [0, 1, 2, 1, 0, 1, 2, 1], decay: 0.35, gain: 0.13 },
    arpB: { wave: 'square', octave: 2, pattern: [2, -1, 1, -1, 2, -1, 0, -1], decay: 0.18, gain: 0.025 },
    drumsA: 'soft', drumsB: 'soft',
  },
  // music-box over soft strings, for stories
  story: {
    bpm: 80, root: 62, scale: MINOR, prog: [0, 5, 2, 6], pad: 0.42, bass: [1, 0, 0, 0, 1, 0, 0, 0],
    arpA: { wave: 'sine', octave: 1, pattern: [0, 2, 1, 2, 0, 2, 1, 2], decay: 0.9, gain: 0.12 },
    arpB: { wave: 'sine', octave: 2, pattern: [2, -1, -1, 1, -1, -1, 0, -1], decay: 1.6, gain: 0.08 },
    drumsA: 'none', drumsB: 'none',
  },
  // steady pulse that stays out of the way, for long explanations
  focus: {
    bpm: 90, root: 57, scale: MINOR, prog: [0, 3, 5, 4], pad: 0.35, bass: [1, 0, 1, 0, 1, 0, 1, 0],
    arpA: { wave: 'triangle', octave: 1, pattern: [0, 0, 1, 0, 2, 0, 1, 0], decay: 0.25, gain: 0.09 },
    arpB: null,
    drumsA: 'none', drumsB: 'soft',
  },
  // Hijaz colour with a maqsum hand-drum rhythm
  oriental: {
    bpm: 96, root: 62, scale: HIJAZ, prog: [0, 1, 6, 0], pad: 0.3, bass: [1, 0, 0, 1, 0, 0, 1, 0],
    arpA: { wave: 'triangle', octave: 1, pattern: [0, 1, 2, 1, 0, -1, 1, 2], decay: 0.4, gain: 0.12 },
    arpB: { wave: 'sawtooth', octave: 1, pattern: [2, -1, 1, -1, 0, -1, 1, -1], decay: 0.3, gain: 0.03 },
    drumsA: 'maqsum', drumsB: 'maqsum',
  },
};

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Chord tones (MIDI) for a bar: root, third, fifth of the scale degree. */
export function chordTones(r: Pick<Recipe, 'root' | 'scale'>, degree: number): number[] {
  const tone = (i: number) => r.root + r.scale[i % 7] + 12 * Math.floor(i / 7);
  return [tone(degree), tone(degree + 2), tone(degree + 4)];
}

/** Bars per loop: the progression twice plainly, then twice with the extra layer. */
export const loopBars = (r: Recipe) => r.prog.length * 4;
export const loopSeconds = (style: MusicStyle) => (loopBars(RECIPES[style]) * 4 * 60) / RECIPES[style].bpm;

type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number, seed: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = seed;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return b;
}

/** A soft room: decaying stereo noise. */
function reverbImpulse(ctx: Ctx, seconds: number): AudioBuffer {
  const n = Math.ceil(seconds * ctx.sampleRate);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let s = 1234 + ch * 777;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
  }
  return b;
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
}

function tone(ctx: Ctx, out: AudioNode, t: number, freq: number, wave: OscillatorType, gain: number, decay: number) {
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

function pad(ctx: Ctx, out: AudioNode, t: number, dur: number, notes: number[], level: number) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1100;
  f.Q.value = 0.4;
  const g = ctx.createGain();
  env(g, t, level / notes.length, Math.min(0.9, dur * 0.3), dur * 0.55, dur * 0.5);
  f.connect(g).connect(out);
  for (const m of notes) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(m);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.22;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur * 1.45);
    }
  }
}

function kick(ctx: Ctx, out: AudioNode, t: number, gain: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.32);
}

function noiseHit(ctx: Ctx, out: AudioNode, noise: AudioBuffer, t: number, type: BiquadFilterType, freq: number, q: number, gain: number, decay: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  s.connect(f).connect(g).connect(out);
  s.start(t, (t * 7.31) % 0.5);
  s.stop(t + decay + 0.02);
}

// Maqsum (a common Arabic rhythm) in eighth notes: dum tak . tak dum . tak .
const MAQSUM = ['D', 'T', '', 'T', 'D', '', 'T', ''];

function drums(ctx: Ctx, out: AudioNode, noise: AudioBuffer, kind: Drums, barT: number, eighth: number) {
  if (kind === 'soft') {
    for (const beat of [0, 2]) kick(ctx, out, barT + beat * 2 * eighth, 0.5);
    for (let i = 1; i < 8; i += 2) noiseHit(ctx, out, noise, barT + i * eighth, 'highpass', 7000, 0.7, 0.05, 0.04);
  } else if (kind === 'maqsum') {
    MAQSUM.forEach((hit, i) => {
      const t = barT + i * eighth;
      if (hit === 'D') { kick(ctx, out, t, 0.42); noiseHit(ctx, out, noise, t, 'lowpass', 300, 0.8, 0.12, 0.18); }
      if (hit === 'T') noiseHit(ctx, out, noise, t, 'bandpass', 2600, 1.4, 0.32, 0.09);
    });
  }
}

/**
 * Loops are rendered once at this rate and played back at any rate (the audio engine converts).
 * Background music under a voice loses nothing audible, and it renders much faster on phones.
 */
export const MUSIC_RATE = 32000;

/** Render one seamless loop: the reverb tail after its end is folded back onto its start. */
export async function renderLoop(style: MusicStyle, sampleRate = MUSIC_RATE): Promise<AudioBuffer> {
  const r = RECIPES[style];
  const beat = 60 / r.bpm, bar = beat * 4, eighth = beat / 2;
  const bars = loopBars(r);
  const len = bars * bar;
  const tail = 2.5;
  const ctx = new OfflineAudioContext(2, Math.ceil((len + tail) * sampleRate), sampleRate);
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -16;
  master.ratio.value = 3;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  master.connect(out).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(ctx, 1.8);
  const wet = ctx.createGain();
  wet.gain.value = style === 'bright' ? 0.18 : 0.32;
  verb.connect(wet).connect(master);
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(verb);
  const noise = noiseBuffer(ctx, 1, 99);

  // Notes are created bar by bar just before they play (render pauses for it): a graph holding
  // every note of the loop at once makes rendering several times slower.
  const scheduleBar = (b: number) => {
    const t = b * bar;
    const second = b >= bars / 2;
    const chord = chordTones(r, r.prog[b % r.prog.length]);
    if (r.pad) pad(ctx, bus, t, bar, chord, r.pad);
    r.bass.forEach((on, i) => { if (on) tone(ctx, bus, t + i * eighth, midiHz(chord[0] - 24), 'sine', 0.32, Math.min(bar, eighth * 3.5)); });
    for (const layer of second ? [r.arpA, r.arpB] : [r.arpA]) {
      if (!layer) continue;
      layer.pattern.forEach((k, i) => {
        if (k < 0) return;
        tone(ctx, bus, t + i * eighth, midiHz(chord[k] + 12 * (layer.octave - 1)), layer.wave, layer.gain, layer.decay);
      });
    }
    drums(ctx, master, noise, second ? r.drumsB : r.drumsA, t, eighth);
  };
  scheduleBar(0);
  for (let b = 1; b < bars; b++) {
    ctx.suspend(Math.max(0, b * bar - 0.2)).then(() => { scheduleBar(b); return ctx.resume(); });
  }
  const rendered = await ctx.startRendering();
  const n = Math.round(len * sampleRate);
  const loop = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate });
  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch), dst = loop.getChannelData(ch);
    dst.set(src.subarray(0, n));
    for (let i = n; i < src.length; i++) dst[i - n] += src[i];
  }
  return loop;
}

const loops = new Map<MusicStyle, Promise<AudioBuffer>>();
/** The loop for a style, rendered once per session and shared by preview, playback and export. */
export function musicLoop(style: MusicStyle): Promise<AudioBuffer> {
  let p = loops.get(style);
  if (!p) {
    p = renderLoop(style);
    loops.set(style, p);
    p.catch(() => loops.delete(style));
  }
  return p;
}
