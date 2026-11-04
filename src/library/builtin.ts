// The bundled drawing library (built by scripts/build-library.mjs into public/library/).
import { arabicCandidates, hasArabic, translateArabicWord } from './glossary';

export type LibStyle = 'hand' | 'line' | 'colour';
export interface LibSet {
  id: string; name: string; style: LibStyle; w: number; h: number; count: number;
  license: string; licenseUrl?: string; author?: string; authorUrl?: string;
}
export interface LibCat { id: string; en: string; ar: string }
export interface LibItem { set: number; name: string; cat: number; chunk: number; en: string; ar: string; tokens: string[]; arNorm: string }
export interface LibIndex { sets: LibSet[]; cats: LibCat[]; items: LibItem[]; dict: Record<string, string> }

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
      arNorm: ar ? ` ${ar.split(/[\s|]+/).map((w) => arabicCandidates(w)[0]).join(' ')} ` : '',
    }));
    return { sets: raw.sets, cats: raw.cats, items, dict: raw.dict };
  })();
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export interface SearchOptions { cat?: number | null; style?: LibStyle | null; limit?: number; offset?: number }
export interface SearchResult { items: LibItem[]; total: number; translated?: string; unknown: string[] }

function scoreEnglish(item: LibItem, word: string): number {
  let best = 0;
  for (const t of item.tokens) {
    if (t === word) return 3;
    if (t.startsWith(word) && word.length >= 3) best = Math.max(best, 2);
    else if (word.length >= 4 && t.includes(word)) best = Math.max(best, 1);
  }
  return best;
}

export async function searchLibrary(query: string, o: SearchOptions = {}): Promise<SearchResult> {
  const lib = await loadLibrary();
  const limit = o.limit ?? 60, offset = o.offset ?? 0;
  const pool = lib.items.filter((it) => (o.cat == null || it.cat === o.cat) && (!o.style || lib.sets[it.set].style === o.style));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { items: pool.slice(offset, offset + limit), total: pool.length, unknown: [] };

  // Each query word becomes a group of alternatives; every group must match.
  const groups: { ar: string[]; en: string[] }[] = [];
  const translatedWords: string[] = [];
  const unknown: string[] = [];
  for (const w of words) {
    if (hasArabic(w)) {
      const en = translateArabicWord(w, lib.dict);
      const ar = arabicCandidates(w);
      groups.push({ ar, en });
      if (en.length) translatedWords.push(en[0]);
      else unknown.push(w);
    } else groups.push({ ar: [], en: [w] });
  }
  const scored: { it: LibItem; s: number }[] = [];
  for (const it of pool) {
    let total = 0;
    for (const g of groups) {
      let s = 0;
      // Native Arabic names (emoji drawings) are the strongest match.
      if (it.arNorm) for (const a of g.ar) if (it.arNorm.includes(` ${a} `)) { s = 4; break; }
      if (!s) for (const e of g.en) s = Math.max(s, scoreEnglish(it, e));
      if (!s) { total = -1; break; }
      total += s;
    }
    if (total > 0) scored.push({ it, s: total - it.name.split('-').length * 0.05 });
  }
  scored.sort((a, b) => b.s - a.s || a.it.set - b.it.set);
  return {
    items: scored.slice(offset, offset + limit).map((x) => x.it),
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
