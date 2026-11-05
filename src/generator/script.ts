// Script -> first-draft video. Rule-based and fully on-device (no AI service, no key):
// split into scenes, pick key words, find drawings, lay each scene out in its own
// frame-sized cell of the board, and time it from reading speed. Everything it makes is a
// normal, editable project.
import { newProject, newScene, uid, frameOf, FRAMES, type Aspect, type BoardElement, type FontId, type Project, type SvgElement, type TextElement, type ImageElement, type AssetSource } from '../engine/types';
import { normalizeArabic, hasArabic, arabicCandidates, translateArabicWord, inGlossary, inGlossaryExact } from '../library/glossary';

export type VideoType = 'lesson' | 'explainer' | 'story' | 'promo';
export type StyleChoice = 'hand' | 'line' | 'colour' | 'mixed';

// ---------------- text analysis (pure) ----------------
const AR_STOP = new Set([
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'الذي', 'التي', 'الذين', 'اللذين', 'او', 'أو', 'ثم', 'لكن', 'بل',
  'قد', 'لقد', 'كان', 'كانت', 'يكون', 'تكون', 'هو', 'هي', 'هم', 'هن', 'انا', 'نحن', 'انت', 'انتم', 'كل', 'بعض', 'اي', 'ما', 'ماذا', 'لماذا', 'كيف',
  'متي', 'اين', 'هل', 'لا', 'لم', 'لن', 'ان', 'إن', 'أن', 'اذا', 'إذا', 'لو', 'حتي', 'عند', 'عندما', 'بين', 'بعد', 'قبل', 'فوق', 'تحت', 'ايضا', 'جدا', 'فقط',
  'كما', 'مثل', 'غير', 'ذات', 'ذو', 'لدي', 'لها', 'له', 'لهم', 'بها', 'به', 'فيها', 'فيه', 'منها', 'منه', 'عليها', 'عليه', 'اليها', 'اليه', 'هناك', 'هنا',
  'الان', 'كذلك', 'يا', 'ايها', 'التي', 'وهو', 'وهي', 'وفي', 'ومن', 'وعلى', 'او', 'لان', 'لأن', 'حيث', 'كي', 'لكي', 'منذ', 'خلال', 'نحو', 'عبر', 'دون',
  'سوف', 'ليس', 'ليست', 'يمكن', 'تستطيع', 'يستطيع', 'جميع', 'اكثر', 'اقل', 'كثير', 'قليل', 'احد', 'اخري', 'اخر', 'نفس', 'عدة', 'تم', 'وقد', 'فقد',
]);
const EN_STOP = new Set('a an the and or but if then so of to in on at by for with from into over under about as is are was were be been being it its this that these those there here we you he she they i me my our your their his her them us do does did done can could will would should may might must not no yes very just also more most much many some any all each every than too only own same such both few other again once up down out off'.split(' '));

/** Split a script into scenes: by blank lines; long paragraphs are split by sentences. */
export function splitScenes(script: string, maxScenes = 20): string[] {
  const clean = script.replace(/\r/g, '').trim();
  if (!clean) return [];
  let parts = clean.split(/\n\s*\n+/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  // One long block: split into sentences and regroup to ~12–30 words per scene.
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const out: string[] = [];
  for (const part of parts) {
    if (words(part) <= 40) { out.push(part); continue; }
    const sentences = part.split(/(?<=[.!?؟؛])\s+/).filter(Boolean);
    let cur = '';
    for (const s of sentences) {
      if (cur && words(cur) + words(s) > 30) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
  }
  parts = out;
  // Too many scenes: merge neighbours, shortest pairs first.
  while (parts.length > maxScenes) {
    let best = 0;
    for (let i = 1; i < parts.length - 1; i++) if (words(parts[i]) + words(parts[i + 1]) < words(parts[best]) + words(parts[best + 1])) best = i;
    parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`);
  }
  return parts;
}

/** The short line written on the board: the first sentence, trimmed to a few words. */
export function keyPhrase(text: string, maxWords = 9): string {
  const first = text.split(/(?<=[.!?؟؛:])\s+/)[0].replace(/[.!?؟؛:،,]+$/u, '').trim();
  const w = first.split(/\s+/);
  return w.length <= maxWords ? first : `${w.slice(0, maxWords).join(' ')}…`;
}

export interface Keyword {
  word: string; english: string[]; arabic: string[];
  /** how much to trust a picture found for this word: checked glossary and nouns up, likely verbs down */
  prior: number;
}

/** Content words worth illustrating, in order of appearance, with their English search terms. */
export function keywords(text: string, dict: Record<string, string> = {}): Keyword[] {
  const seen = new Set<string>();
  const out: Keyword[] = [];
  for (let raw of text.split(/[\s،,.!?؟؛:()«»"'\-–—]+/u)) {
    if (!raw) continue;
    if (hasArabic(raw)) {
      const n = normalizeArabic(raw);
      const stems = arabicCandidates(raw);
      if (n.length < 3 || stems.some((s) => AR_STOP.has(s))) continue;
      const key = stems[stems.length > 1 ? 1 : 0];
      if (seen.has(key)) continue;
      seen.add(key);
      // و/ف/ب/ك/ل joined to a checked word: search the word itself ("بطريق" = "by the road" here, not "penguin").
      const bare = /^[وفبكل]/.test(n) && n.length > 3 && inGlossaryExact(n.slice(1)) && !inGlossaryExact(n) ? raw.slice(1) : null;
      if (bare) raw = bare;
      const glossary = inGlossary(raw);
      // "ال" (the), with or without a joined و/ف/ب/ك/ل, or tanween at the end: almost certainly a noun.
      const noun = /^(و|ف|ب|ك|ل)?ال/.test(n) || /[\u064B-\u064D]$/.test(raw.replace(/[\u0640]/g, ''));
      // Present-tense verbs start with ي/ت/ن/أ (يطير، تعيش): they rarely make good pictures.
      const verbish = !glossary && !noun && /^[يتنأا]/.test(n) && n.length >= 4 && n.length <= 6;
      out.push({ word: raw, english: translateArabicWord(raw, dict), arabic: stems, prior: (glossary ? 1 : 0) + (noun ? 0.5 : 0) - (verbish ? 1.5 : 0) });
    } else {
      const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (w.length < 3 || EN_STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      out.push({ word: raw, english: [w, w.endsWith('s') ? w.slice(0, -1) : ''].filter(Boolean), arabic: [], prior: 0 });
    }
  }
  // Words we can translate/illustrate first, keeping script order otherwise.
  return out.map((k, i) => ({ k, i })).sort((a, b) => Number(b.k.english.length > 0) - Number(a.k.english.length > 0) || a.i - b.i).map((x) => x.k);
}

// ---------------- layout (pure) ----------------
export interface Rect { x: number; y: number; w: number; h: number }

/** Board big enough for every scene in its own frame-sized cell, shaped like the frame (no grey bars at the end). */
export function gridLayout(n: number, aspect: Aspect, rtl: boolean) {
  const f = FRAMES[aspect];
  const gap = 0.12;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = f.w * (1 + gap), ch = f.h * (1 + gap);
  let W = cols * cw, H = rows * ch;
  if (W / H > f.w / f.h) H = W * (f.h / f.w); else W = H * (f.w / f.h);
  const ox = (W - cols * cw) / 2 + (f.w * gap) / 2, oy = (H - rows * ch) / 2 + (f.h * gap) / 2;
  const cells: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const col = rtl ? cols - 1 - c : c; // Arabic: first scene top-right, reading right to left
    cells.push({ x: ox + col * cw, y: oy + r * ch, w: f.w, h: f.h });
  }
  return { board: { width: Math.round(W), height: Math.round(H) }, cells };
}

type Slot = 'text' | 'a' | 'b';
/** Where text and pictures go inside one scene, as fractions of the frame. */
export function sceneTemplate(aspect: Aspect, type: VideoType, rtl: boolean): Record<Slot, Rect> {
  const mirror = (r: Rect): Rect => (rtl ? r : { ...r, x: 1 - r.x - r.w });
  if (aspect === 'landscape') {
    if (type === 'story') return { a: { x: 0.2, y: 0.07, w: 0.6, h: 0.6 }, text: { x: 0.08, y: 0.72, w: 0.84, h: 0.2 }, b: mirror({ x: 0.72, y: 0.08, w: 0.2, h: 0.3 }) };
    return { text: mirror({ x: 0.5, y: 0.1, w: 0.44, h: 0.42 }), a: mirror({ x: 0.06, y: 0.1, w: 0.4, h: 0.8 }), b: mirror({ x: 0.58, y: 0.57, w: 0.3, h: 0.33 }) };
  }
  if (aspect === 'portrait') {
    if (type === 'story') return { a: { x: 0.1, y: 0.1, w: 0.8, h: 0.5 }, text: { x: 0.08, y: 0.64, w: 0.84, h: 0.24 }, b: { x: 0.3, y: 0.89, w: 0.4, h: 0.09 } };
    return { text: { x: 0.08, y: 0.07, w: 0.84, h: 0.25 }, a: { x: 0.12, y: 0.35, w: 0.76, h: 0.38 }, b: { x: 0.28, y: 0.76, w: 0.44, h: 0.18 } };
  }
  if (type === 'story') return { a: { x: 0.15, y: 0.07, w: 0.7, h: 0.6 }, text: { x: 0.08, y: 0.71, w: 0.84, h: 0.22 }, b: mirror({ x: 0.74, y: 0.05, w: 0.2, h: 0.2 }) };
  return { text: { x: 0.08, y: 0.06, w: 0.84, h: 0.26 }, a: mirror({ x: 0.08, y: 0.36, w: 0.5, h: 0.56 }), b: mirror({ x: 0.62, y: 0.46, w: 0.3, h: 0.4 }) };
}

export const WORDS_PER_SECOND: Record<VideoType, number> = { lesson: 2.0, explainer: 2.2, story: 2.0, promo: 2.6 };

/** How long a scene stays on screen if read aloud at the type's pace. */
export function sceneSeconds(text: string, type: VideoType): number {
  const n = text.split(/\s+/).filter(Boolean).length;
  return Math.min(25, Math.max(3.5, n / WORDS_PER_SECOND[type] + 1.2));
}

/** Spread a scene's time over its elements: camera move, drawing, then pauses fill the rest. */
export function timeScene(els: BoardElement[], seconds: number, firstInVideo: boolean) {
  els.forEach((e, i) => {
    const transition = i === 0 ? (firstInVideo ? 0.6 : 1.1) : 0.25;
    const animate = e.kind === 'text' ? Math.min(3, 0.8 + e.text.length * 0.045) : 2.4;
    e.timing = { transition, animate, pause: 0.2 };
  });
  const used = els.reduce((a, e) => a + e.timing.transition + e.timing.animate + e.timing.pause, 0);
  if (used < seconds) {
    const extra = seconds - used;
    // Most of the spare time after the last element, so the scene "breathes" while the narrator talks.
    els[els.length - 1].timing.pause += extra * 0.6;
    const each = (extra * 0.4) / els.length;
    for (const e of els) e.timing.animate += each;
  } else {
    const k = Math.max(0.4, (seconds - els.reduce((a, e) => a + e.timing.transition, 0)) / els.reduce((a, e) => a + e.timing.animate + e.timing.pause, 0));
    for (const e of els) { e.timing.animate *= k; e.timing.pause *= k; }
  }
  for (const e of els) for (const k of ['transition', 'animate', 'pause'] as const) e.timing[k] = Math.round(e.timing[k] * 100) / 100;
}

// ---------------- generation (browser) ----------------
export interface DrawingPick { svg?: string; blob?: Blob; isSvg: boolean; name: string; source: AssetSource; style?: 'hand' | 'line' | 'colour' }

/** A possible picture for a key word; nothing is used until take() is called. */
export interface DrawingCandidate { score: number; name: string; take: () => Promise<DrawingPick> }

export interface GeneratorDeps {
  /** best built-in drawing for a key word, with its match strength (see searchLibrary scores) */
  candidate: (k: Keyword, scene: number, used: Set<string>) => Promise<DrawingCandidate | null>;
  /** optional: a picture from the internet when the built-in library has nothing good */
  online?: (k: Keyword, used: Set<string>) => Promise<DrawingPick | null>;
  /** size of a prepared element (for fitting into its slot) */
  measure: (el: BoardElement) => Promise<{ w: number; h: number }>;
  /** wrap text into lines that fit a width at a size; returns the laid-out text and its size */
  fitText: (text: string, font: FontId, box: { w: number; h: number }, maxSize: number) => Promise<{ text: string; size: number }>;
  /** store a picked picture (photo/raster) and return an image element source */
  storeImage: (blob: Blob, name: string) => Promise<{ src: string; width: number; height: number }>;
  dict: Record<string, string>;
  onProgress?: (done: number, total: number) => void;
}

export interface ScriptOptions {
  script: string;
  type: VideoType;
  aspect: Aspect;
  style: StyleChoice;
  photos: Blob[];
  title?: string;
}

/** Minimum match strength (search score + word trust) to put a picture in a scene. */
export const FIRST_PICTURE = 2.75;
export const SECOND_PICTURE = 3.5;

const FONT_FOR: Record<VideoType, FontId> = { lesson: 'amiri-bold', explainer: 'cairo', story: 'amiri', promo: 'cairo' };

function fitInto(el: BoardElement, size: { w: number; h: number }, r: Rect) {
  const s = Math.min(r.w / size.w, r.h / size.h);
  el.scale = Math.round(s * 1000) / 1000;
  el.x = Math.round(r.x + (r.w - size.w * s) / 2);
  el.y = Math.round(r.y + (r.h - size.h * s) / 2);
}

export async function generateProject(o: ScriptOptions, deps: GeneratorDeps): Promise<Project> {
  const texts = splitScenes(o.script);
  if (!texts.length) throw new Error('empty script');
  const rtl = hasArabic(o.script);
  const p = newProject(o.title || keyPhrase(texts[0], 6), o.aspect);
  p.scenes = [];
  const { board, cells } = gridLayout(texts.length, o.aspect, rtl);
  p.board.width = board.width; p.board.height = board.height;
  const f = frameOf(p);
  const tpl = sceneTemplate(o.aspect, o.type, rtl);
  const used = new Set<string>();
  const font = FONT_FOR[o.type];
  const baseSize = Math.round(Math.min(f.w, f.h) * (o.type === 'promo' ? 0.085 : 0.072));
  const dir = rtl ? 'rtl' : 'ltr';

  for (let i = 0; i < texts.length; i++) {
    deps.onProgress?.(i, texts.length);
    const text = texts[i];
    const cell = cells[i];
    const scene = newScene(String(i + 1));
    scene.narration = text;
    p.scenes.push(scene);
    const abs = (r: Rect): Rect => ({ x: cell.x + r.x * f.w, y: cell.y + r.y * f.h, w: r.w * f.w, h: r.h * f.h });
    const camera = { x: cell.x + f.w / 2, y: cell.y + f.h / 2, zoom: 1 };
    const base = { rotation: 0, opacity: 1, mode: 'draw' as const, direction: dir as 'rtl' | 'ltr', camera, scene: scene.id, timing: { transition: 1, animate: 2, pause: 0.5 } };
    const els: BoardElement[] = [];

    // Words on the board
    const phrase = keyPhrase(text, o.type === 'story' ? 14 : 9);
    const box = abs(tpl.text);
    const fitted = await deps.fitText(phrase, font, box, baseSize);
    const textEl: TextElement = { ...base, id: uid(), name: phrase.slice(0, 24), kind: 'text', text: fitted.text, font, size: fitted.size, color: o.type === 'promo' && i === texts.length - 1 ? '#c0392b' : '#1f1f1f', align: 'center', x: 0, y: 0, scale: 1 };
    fitInto(textEl, await deps.measure(textEl), box);

    // Pictures: a drawing for the strongest key word, a photo of the user's if given, else a second drawing
    const pics: BoardElement[] = [];
    const kws = keywords(text, deps.dict).slice(0, 10);
    const want = o.type === 'story' || o.aspect === 'square' ? 1 : 2;
    const photo = o.photos[i];
    // Compare every key word's best drawing and keep the strongest, not just the first word that matches.
    const pool: { c: DrawingCandidate; total: number; order: number }[] = [];
    for (const [order, k] of kws.entries()) {
      const c = await deps.candidate(k, i, used);
      if (c) pool.push({ c, total: c.score + k.prior, order });
    }
    pool.sort((a, b) => b.total - a.total || a.order - b.order);
    const names = new Set<string>();
    for (const x of pool) {
      if (pics.length >= (photo ? 1 : want)) break;
      if (x.total < (pics.length ? SECOND_PICTURE : FIRST_PICTURE)) break; // weak matches are worse than no picture
      if (names.has(x.c.name)) continue;
      names.add(x.c.name);
      pics.push(await toElement(await x.c.take(), base, deps));
    }
    if (!pics.length && !photo && deps.online) {
      for (const k of kws.slice(0, 4)) {
        const pick = await deps.online(k, used);
        if (pick) { pics.push(await toElement(pick, base, deps)); break; }
      }
    }
    if (photo) {
      const stored = await deps.storeImage(photo, `photo ${i + 1}`);
      const img: ImageElement = { ...base, id: uid(), name: `photo ${i + 1}`, kind: 'image', src: stored.src, width: stored.width, height: stored.height, x: 0, y: 0, scale: 1, source: { provider: 'upload', id: `photo ${i + 1}`, license: 'own' } };
      pics.push(img);
    }
    const slots: Rect[] = [abs(tpl.a), abs(tpl.b)];
    for (let j = 0; j < pics.length; j++) {
      const el = pics[j];
      fitInto(el, await deps.measure(el), slots[j] ?? slots[0]);
      // Icon-style line art is designed with thin pens at 24px; keep a marker-like line on the board.
      const style = (el as SvgElement & { _style?: string })._style;
      if (el.kind === 'svg' && (style === 'line' || style === 'hand')) el.strokeWidth = Math.round(((style === 'hand' ? 13 : 11) / el.scale) * 100) / 100;
      delete (el as SvgElement & { _style?: string })._style;
    }
    // No picture found: the words get the whole scene.
    if (!pics.length && o.type !== 'story') {
      const big = { x: cell.x + f.w * 0.08, y: cell.y + f.h * 0.12, w: f.w * 0.84, h: f.h * 0.76 };
      const again = await deps.fitText(keyPhrase(text, 16), font, big, Math.round(baseSize * 1.2));
      textEl.text = again.text; textEl.size = again.size;
      fitInto(textEl, await deps.measure(textEl), big);
    }

    // Order: lessons and adverts write the words first; explainers and stories draw first.
    const ordered = o.type === 'lesson' || o.type === 'promo' ? [textEl, ...pics] : [...pics, textEl];
    timeScene(ordered, sceneSeconds(text, o.type), i === 0);
    p.elements.push(...ordered);
  }
  deps.onProgress?.(texts.length, texts.length);
  p.endHold = 2.5;
  return p;
}

async function toElement(pick: DrawingPick, base: Omit<SvgElement, 'id' | 'name' | 'kind' | 'svg' | 'color' | 'strokeWidth' | 'x' | 'y' | 'scale'>, deps: GeneratorDeps): Promise<BoardElement> {
  if (pick.isSvg && pick.svg) {
    const el: SvgElement & { _style?: string } = { ...base, id: uid(), name: pick.name, kind: 'svg', svg: pick.svg, color: null, strokeWidth: null, x: 0, y: 0, scale: 1, source: pick.source, _style: pick.style };
    return el;
  }
  const stored = await deps.storeImage(pick.blob!, pick.name);
  const img: ImageElement = { ...base, id: uid(), name: pick.name, kind: 'image', src: stored.src, width: stored.width, height: stored.height, x: 0, y: 0, scale: 1, source: pick.source };
  return img;
}
