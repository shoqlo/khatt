import { hasArabic, toEnglishQuery } from './glossary';

export interface IconHit { id: string; name: string; svg: string }

let tabler: { icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }>; width?: number; height?: number } | null = null;

export async function loadTabler() {
  tabler ??= (await import('@iconify-json/tabler/icons.json')).default as unknown as typeof tabler;
  return tabler!;
}

export function tablerSvg(body: string, w = 24, h = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

/** Search the bundled Tabler line-icon set (MIT, ~6,000 stroke icons; ideal for drawing). */
export async function searchIcons(q: string, limit = 120): Promise<{ hits: IconHit[]; translated?: string; unknown: string[] }> {
  const set = await loadTabler();
  let query = q.trim().toLowerCase();
  let translated: string | undefined;
  let unknown: string[] = [];
  if (hasArabic(query)) {
    const t = toEnglishQuery(query);
    query = t.query; unknown = t.unknown; translated = t.query;
  }
  const words = query.split(/\s+/).filter(Boolean);
  const names = Object.keys(set.icons);
  const scored: { name: string; score: number }[] = [];
  for (const name of names) {
    if (!words.length) { scored.push({ name, score: 0 }); continue; }
    const parts = name.split('-');
    let score = 0;
    for (const w of words) {
      if (parts[0] === w) score += 4;
      else if (parts.includes(w)) score += 3;
      else if (name.includes(w)) score += 1;
      else { score = -1; break; }
    }
    if (score > 0) {
      if (name.endsWith('-filled')) score -= 0.5; // line versions draw better
      score -= parts.length * 0.05;
      scored.push({ name, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    hits: scored.slice(0, limit).map(({ name }) => ({ id: `tabler:${name}`, name, svg: tablerSvg(set.icons[name].body, set.width, set.height) })),
    translated, unknown,
  };
}

export interface PixabayHit {
  id: number; type: string; tags: string; user: string; pageURL: string;
  previewURL: string; webformatURL: string; width: number; height: number;
}

export async function pixabayConfigured(): Promise<boolean> {
  try { return (await (await fetch('/api/config')).json()).pixabay === true; } catch { return false; }
}

export async function searchPixabay(q: string, type: 'illustration' | 'vector' | 'photo' | 'all', page = 1) {
  let query = q;
  let translated: string | undefined;
  if (hasArabic(q)) { query = toEnglishQuery(q).query; translated = query; }
  const u = new URLSearchParams({ q: query, type, page: String(page), lang: 'en' });
  const res = await fetch(`/api/pixabay/search?${u}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return { ...(body as { total: number; hits: PixabayHit[]; cached: boolean }), translated };
}

export async function importPixabay(id: number) {
  const res = await fetch('/api/pixabay/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as { src: string; source: { provider: 'pixabay'; id: string; author: string; pageUrl: string; license: string }; tags: string };
}

export async function uploadFile(file: File): Promise<string> {
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.src;
}
