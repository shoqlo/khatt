// Keyless search of open image libraries, straight from the user's phone/computer
// (no server, no API key). Only licences that allow commercial use AND modification
// without share-alike are offered: CC0, Public Domain, CC BY. Every hit carries the
// attribution text the licence needs.
import { hasArabic, toEnglishQuery } from './glossary';

export type Provider = 'openverse' | 'wikimedia' | 'pixabay';

export interface OnlineHit {
  provider: Provider;
  id: string;
  title: string;
  thumb: string;          // for display only (an <img>, never drawn to the canvas)
  isSvg: boolean;
  creator: string;
  license: string;        // e.g. "CC BY 4.0", "CC0", "Public domain"
  licenseUrl: string;
  pageUrl: string;
  attribution: string;    // ready to paste into a video description
  download: string[];     // URLs to try, best first
}

export interface OnlineResult { hits: OnlineHit[]; more: boolean; searchedAs: string; unknown: string[] }

export class OnlineError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'rate' | 'server' | 'blocked') { super(message); }
}

const UA = 'Khatt/0.2 (whiteboard animation app)';

async function getJson(url: string, fetchImpl: typeof fetch, headers: Record<string, string> = {}) {
  let res: Response;
  try { res = await fetchImpl(url, { headers }); } catch { throw new OnlineError('No connection to the image library.', 'offline'); }
  if (res.status === 429) throw new OnlineError('Too many searches in a short time. Wait a minute and try again.', 'rate');
  if (!res.ok) throw new OnlineError(`The image library answered with an error (${res.status}).`, 'server');
  return res.json();
}

function query(q: string, dict: Record<string, string>) {
  if (!hasArabic(q)) return { text: q.trim(), unknown: [] as string[] };
  const t = toEnglishQuery(q, dict);
  return { text: t.query, unknown: t.unknown };
}

// ---------------- Openverse (openverse.org) ----------------
export async function searchOpenverse(q: string, page: number, dict: Record<string, string> = {}, fetchImpl: typeof fetch = fetch): Promise<OnlineResult> {
  const { text, unknown } = query(q, dict);
  if (!text) return { hits: [], more: false, searchedAs: '', unknown };
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', text);
  u.searchParams.set('license', 'cc0,pdm,by');
  u.searchParams.set('page', String(page));
  u.searchParams.set('page_size', '20');
  u.searchParams.set('mature', 'false');
  const json = await getJson(u.toString(), fetchImpl);
  const hits: OnlineHit[] = (json.results ?? []).map((r: Record<string, string>) => {
    const lic = r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Public domain' : `CC ${String(r.license).toUpperCase()} ${r.license_version ?? ''}`.trim();
    return {
      provider: 'openverse', id: String(r.id), title: r.title || 'Untitled',
      thumb: r.thumbnail || r.url, isSvg: r.filetype === 'svg',
      creator: r.creator || 'Unknown', license: lic, licenseUrl: r.license_url || '', pageUrl: r.foreign_landing_url || r.url,
      attribution: r.attribution || `"${r.title}" by ${r.creator}, ${lic}`,
      download: [r.url, r.thumbnail].filter(Boolean),
    } satisfies OnlineHit;
  });
  return { hits, more: page < (json.page_count ?? 1), searchedAs: text, unknown };
}

// ---------------- Pixabay (through the app's own middleman, which holds the key) ----------------
export async function searchPixabay(q: string, page: number, drawingsOnly: boolean, proxy: string, dict: Record<string, string> = {}, fetchImpl: typeof fetch = fetch): Promise<OnlineResult> {
  // Pixabay has no Arabic search, so Arabic words are translated first.
  const { text, unknown } = query(q, dict);
  if (!text || !proxy) return { hits: [], more: false, searchedAs: text, unknown };
  const u = new URL(`${proxy}/search`);
  u.searchParams.set('q', text);
  u.searchParams.set('type', drawingsOnly ? 'illustration' : 'all');
  u.searchParams.set('page', String(page));
  const json = await getJson(u.toString(), fetchImpl);
  const hits: OnlineHit[] = (json.hits ?? []).map((h: { id: number; title: string; user: string; pageURL: string; previewURL: string; type: string }) => ({
    provider: 'pixabay', id: String(h.id), title: h.title || 'Pixabay', thumb: h.previewURL, isSvg: false,
    creator: h.user || 'Pixabay', license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/',
    pageUrl: h.pageURL, attribution: `Image by ${h.user} from Pixabay`,
    download: [`${proxy}/image?id=${h.id}`],
  } satisfies OnlineHit));
  return { hits, more: hits.length >= 30 && page < 10, searchedAs: text, unknown };
}

// ---------------- Wikimedia Commons ----------------
const ALLOWED = /^(cc0|cc zero|public domain|pd|pdm|cc[- ]by[- ]?\d(\.\d)?|cc by \d(\.\d)?)/i;
const DISALLOWED = /(sa|nc|nd)\b/i;
export function commonsLicenseOk(short: string): boolean {
  const s = short.trim();
  return ALLOWED.test(s) && !DISALLOWED.test(s.replace(/^cc0/i, ''));
}
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

// Wikimedia only serves thumbnails at standard widths.
const STD_WIDTHS = [330, 500, 960, 1280, 1920];
export function commonsThumb(url: string, width: number): string {
  const w = STD_WIDTHS.find((x) => x >= width) ?? 1920;
  return url.replace(/\/(\d+)px-/, `/${w}px-`);
}

export async function searchCommons(q: string, offset: number, drawingsOnly: boolean, dict: Record<string, string> = {}, fetchImpl: typeof fetch = fetch): Promise<OnlineResult> {
  const { text, unknown } = query(q, dict);
  // Commons has Arabic descriptions too, so search the Arabic words as well as the translation.
  const terms = hasArabic(q) ? (text ? `${q.trim()} OR ${text}` : q.trim()) : text;
  if (!terms) return { hits: [], more: false, searchedAs: '', unknown };
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const params: Record<string, string> = {
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '24', gsroffset: String(offset),
    gsrsearch: `${terms} ${drawingsOnly ? 'filetype:drawing' : 'filetype:bitmap|drawing'}`,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '330',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ObjectName',
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const json = await getJson(u.toString(), fetchImpl, { 'Api-User-Agent': UA });
  const pages: Record<string, unknown>[] = (json.query?.pages ?? []).slice().sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  const hits: OnlineHit[] = [];
  for (const p of pages) {
    const ii = (p.imageinfo as Record<string, unknown>[] | undefined)?.[0] as Record<string, any> | undefined;
    if (!ii) continue;
    const md = ii.extmetadata ?? {};
    const license = String(md.LicenseShortName?.value ?? '');
    if (!commonsLicenseOk(license)) continue;
    const title = stripHtml(String(md.ObjectName?.value ?? String(p.title).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')));
    const creator = stripHtml(String(md.Artist?.value ?? 'Unknown')) || 'Unknown';
    const isSvg = ii.mime === 'image/svg+xml';
    hits.push({
      provider: 'wikimedia', id: String(p.title), title, thumb: ii.thumburl ?? ii.url, isSvg, creator,
      license, licenseUrl: String(md.LicenseUrl?.value ?? ''), pageUrl: ii.descriptionurl ?? '',
      attribution: `"${title}" by ${creator}, ${license}${md.LicenseUrl?.value ? ` (${md.LicenseUrl.value})` : ''}, via Wikimedia Commons`,
      download: isSvg ? [ii.url] : [ii.width > 1280 && ii.thumburl ? commonsThumb(ii.thumburl, 1280) : ii.url, ii.thumburl].filter(Boolean),
    });
  }
  return { hits, more: !!json.continue, searchedAs: terms, unknown };
}

/** Fetch the chosen image so it can be stored on the device and drawn (needs CORS). */
export async function downloadHit(hit: OnlineHit, fetchImpl: typeof fetch = fetch): Promise<{ blob: Blob; isSvg: boolean }> {
  for (const url of hit.download) {
    try {
      const res = await fetchImpl(url, { mode: 'cors' });
      if (!res.ok) continue;
      const blob = await res.blob();
      const isSvg = hit.isSvg || blob.type === 'image/svg+xml';
      if (!isSvg && !blob.type.startsWith('image/')) continue;
      return { blob, isSvg };
    } catch { /* try the next URL */ }
  }
  throw new OnlineError(
    navigator.onLine === false ? 'No connection to the image library.' : 'This image cannot be downloaded into the app (the website hosting it does not allow it). Please choose another one.',
    navigator.onLine === false ? 'offline' : 'blocked',
  );
}
