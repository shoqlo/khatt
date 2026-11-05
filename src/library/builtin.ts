// The bundled drawing library (built by scripts/build-library.mjs into public/library/).
import { arabicCandidates, hasArabic, translateArabicWord } from './glossary';

export type LibStyle = 'hand' | 'line' | 'colour';
export interface LibSet {
  id: string; name: string; style: LibStyle; w: number; h: number; count: number;
  license: string; licenseUrl?: string; author?: string; authorUrl?: string;
}
export interface LibCat { id: string; en: string; ar: string }
export interface LibItem { set: number; name: string; cat: number; chunk: number; en: string; ar: string; tokens: string[]; nameTokens: Set<string>; arNorm: string; arMain: string[] }
export interface LibIndex {
  sets: LibSet[]; cats: LibCat[]; items: LibItem[]; dict: Record<string, string>;
  /** word -> drawings containing it (English name words / Arabic name words) */
  enIdx: Map<string, number[]>; arIdx: Map<string, number[]>;
  /** exact drawing name -> drawings (the glossary can point at a specific drawing, e.g. "red-heart") */
  nameIdx: Map<string, number[]>;
}

type RawIndex = { v: number; sets: LibSet[]; cats: LibCat[]; items: [number, string, number, number, string?, string?][]; dict: Record<string, string> };

let base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** For tests: load the library from somewhere else. */
export function configureLibrary(opts: { base?: string; fetch?: typeof fetch }) {
  if (opts.base) base = opts.base;
  if (opts.fetch) fetchImpl = opts.fetch;
  indexPromise = null;
  chunks.clear();
}

let indexPromise: Promise<LibIndex> | null = null;
export function loadLibrary(): Promise<LibIndex> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const res = await fetchImpl(`${base}library/index.json`);
    if (!res.ok) throw new Error(`Drawing library unavailable (${res.status})`);
    const raw = (await res.json()) as RawIndex;
    const items: LibItem[] = raw.items.map(([set, name, cat, chunk, en = '', ar = '']) => ({
      set, name, cat, chunk, en, ar,
      tokens: [...new Set([...name.split('-'), ...en.split(' ')].filter(Boolean))],
      nameTokens: new Set(name.split('-')),
      arNorm: ar ? ` ${ar.split(/[\s|]+/).map((w) => arabicCandidates(w)[0]).join(' ')} ` : '',
      // words of the drawing's own Arabic name (first phrase), for ranking exact names first
      arMain: ar ? ar.split(' | ')[0].split(/\s+/).map((w) => arabicCandidates(w)[0]) : [],
    }));
    const enIdx = new Map<string, number[]>(), arIdx = new Map<string, number[]>(), nameIdx = new Map<string, number[]>();
    const push = (m: Map<string, number[]>, k: string, i: number) => { const a = m.get(k); if (!a) m.set(k, [i]); else if (a[a.length - 1] !== i) a.push(i); };
    items.forEach((it, i) => {
      for (const tok of it.tokens) push(enIdx, tok, i);
      push(nameIdx, it.name, i);
      if (it.arNorm) for (const w of it.arNorm.trim().split(' ')) push(arIdx, w, i);
    });
    return { sets: raw.sets, cats: raw.cats, items, dict: raw.dict, enIdx, arIdx, nameIdx };
  })();
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export interface SearchOptions { cat?: number | null; style?: LibStyle | null; limit?: number; offset?: number }
export interface SearchResult {
  items: LibItem[]; total: number; translated?: string; unknown: string[];
  /** match strength per item: 5 exact Arabic name, 3 exact English word, 2.5 first word of an Arabic name, 2 partial, 1.5 keyword only */
  scores?: number[];
}

// Real word endings only: "book" finds "books", "camp" finds "camping", but "boot" must not find "booth".
const SUFFIXES = new Set(['s', 'es', 'ies', 'ing', 'ed', 'er', 'ers']);
// A word in the drawing's own name counts more than one of its extra keywords
// ("droplet" for water beats "shower", which is only tagged "water").
function scoreEnglish(item: LibItem, word: string): number {
  let best = 0;
  const parts = item.name.split('-');
  for (const t of item.tokens) {
    const inName = item.nameTokens.has(t);
    if (t === word) best = Math.max(best, inName ? (parts[parts.length - 1] === t ? 3.25 : 3) : 2.5);
    else if (word.length >= 3 && t.startsWith(word) && SUFFIXES.has(t.slice(word.length))) best = Math.max(best, inName ? 2 : 1.75);
    else if (word.length >= 5 && t.length > word.length + 3 && t.includes(word)) best = Math.max(best, 1); // e.g. "water" in "watermelon"
  }
  return best;
}

/**
 * Arabic match. Scale (shared with scoreEnglish): exact Arabic name 5 > English translation 3 >
 * first word of a longer Arabic name 2.5 > word inside a name 2 > keyword only 1.5.
 * ("قمر" must find the moon, not "قمر صناعي" = satellite.)
 */
function scoreArabic(item: LibItem, cands: string[]): number {
  if (!item.arNorm) return 0;
  for (const a of cands) if (item.arMain.length === 1 && item.arMain[0] === a) return 5;
  for (const a of cands) if (item.arMain[0] === a) return 2.5;
  for (const a of cands) if (item.arMain.includes(a)) return 2;
  for (const a of cands) if (item.arNorm.includes(` ${a} `)) return 1.5;
  return 0;
}

/** English words whose best drawing is not the one a plain name match finds (food → plate, not a can). */
const EN_PREFER: Record<string, string> = {
  food: 'fork-and-knife-with-plate', meal: 'fork-and-knife-with-plate', meals: 'fork-and-knife-with-plate', restaurant: 'fork-and-knife-with-plate',
  team: 'users', idea: 'light-bulb', water: 'droplet', box: 'package', app: 'mobile-phone',
};
/** "no-entry", "non-potable-water": only when the query itself says no. */
const NEGATIVE = /^(no|non|not)-/;

export async function searchLibrary(query: string, o: SearchOptions = {}): Promise<SearchResult> {
  const lib = await loadLibrary();
  const limit = o.limit ?? 60, offset = o.offset ?? 0;
  const pool = lib.items.filter((it) => (o.cat == null || it.cat === o.cat) && (!o.style || lib.sets[it.set].style === o.style));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { items: pool.slice(offset, offset + limit), total: pool.length, unknown: [] };

  // Each query word becomes a group of alternatives; every group must match.
  const groups: { ar: string[]; en: string[]; prefer?: string }[] = [];
  const translatedWords: string[] = [];
  const unknown: string[] = [];
  for (const w of words) {
    if (hasArabic(w)) {
      const en = translateArabicWord(w, lib.dict);
      const ar = arabicCandidates(w);
      groups.push({ ar, en });
      if (en.length) translatedWords.push(en[0]);
      else unknown.push(w);
    } else groups.push({ ar: [], en: EN_PREFER[w] ? [EN_PREFER[w], w] : [w], prefer: EN_PREFER[w] });
  }
  // Candidates from the word index (every group must match), instead of scanning every drawing.
  const inPool = (it: LibItem) => (o.cat == null || it.cat === o.cat) && (!o.style || lib.sets[it.set].style === o.style);
  const sets: Set<number>[] = groups.map((g) => {
    const c = new Set<number>();
    for (const e of g.en) for (const suf of ['', ...SUFFIXES]) for (const i of lib.enIdx.get(e + suf) ?? []) c.add(i);
    for (const e of g.en) for (const i of lib.nameIdx.get(e) ?? []) c.add(i);
    for (const a of g.ar) for (const i of lib.arIdx.get(a) ?? []) c.add(i);
    return c;
  });
  const both = sets.reduce((acc, c) => new Set([...acc].filter((i) => c.has(i))));
  let candidates = [...both].map((i) => lib.items[i]).filter(inPool);
  // Nothing indexed: fall back to a scan for words inside longer names (e.g. "water" in "watermelon").
  if (!candidates.length) candidates = pool;
  const scored: { it: LibItem; s: number }[] = [];
  for (const it of candidates) {
    let total = 0;
    for (const g of groups) {
      let s = scoreArabic(it, g.ar);
      // A curated drawing name (hyphenated in the glossary, or from EN_PREFER) is an exact pick: 4.
      for (const e of g.en) s = Math.max(s, it.name === g.prefer || (e.includes('-') && it.name === e) ? 4 : e.includes('-') ? 0 : scoreEnglish(it, e));
      if (!s) { total = -1; break; }
      total += s;
    }
    const negative = NEGATIVE.test(it.name) && !words.some((w) => w === 'no' || w === 'not' || w === 'non' || w === 'لا' || w === 'ممنوع');
    if (total > 0) scored.push({ it, s: total - it.name.split('-').length * 0.05 - (negative ? 1.5 : 0) });
  }
  scored.sort((a, b) => b.s - a.s || a.it.set - b.it.set);
  return {
    items: scored.slice(offset, offset + limit).map((x) => x.it),
    scores: scored.slice(offset, offset + limit).map((x) => Math.round(x.s * 100) / 100),
    total: scored.length,
    translated: groups.some((g) => g.ar.length) ? translatedWords.join(' ') : undefined,
    unknown,
  };
}

const chunks = new Map<string, Promise<Record<string, string | [string, number, number]>>>();
function loadChunk(setId: string, n: number) {
  const key = `${setId}/${n}`;
  let p = chunks.get(key);
  if (!p) {
    p = fetchImpl(`${base}library/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`Drawing unavailable (${r.status})`);
      return r.json();
    });
    chunks.set(key, p);
    p.catch(() => chunks.delete(key));
  }
  return p;
}

/** Full SVG markup for a library drawing. */
export async function drawingSvg(item: LibItem): Promise<string> {
  const lib = await loadLibrary();
  const set = lib.sets[item.set];
  const entry = (await loadChunk(set.id, item.chunk))[item.name];
  if (entry == null) throw new Error(`Drawing ${item.name} not found`);
  const [body, w, h] = typeof entry === 'string' ? [entry, set.w, set.h] : entry;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

export function itemLabel(item: LibItem, lang: 'ar' | 'en'): string {
  if (lang === 'ar' && item.ar) return item.ar.split(' | ')[0];
  return item.name.replace(/-/g, ' ');
}
