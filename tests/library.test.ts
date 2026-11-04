import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { configureLibrary, searchLibrary, drawingSvg, loadLibrary } from '../src/library/builtin';
import { toEnglishQuery, translateArabicWord } from '../src/library/glossary';

beforeAll(() => {
  // Serve public/library from disk (run `node scripts/build-library.mjs` first).
  configureLibrary({
    base: '/',
    fetch: (async (url: string) => {
      const file = path.join('public', String(url));
      if (!fs.existsSync(file)) return new Response('nope', { status: 404 });
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });
});

describe('bundled drawing library', () => {
  it('has thousands of drawings, all with redistributable licences', async () => {
    const lib = await loadLibrary();
    expect(lib.items.length).toBeGreaterThan(10000);
    for (const s of lib.sets) expect(s.license).toMatch(/^(MIT|Apache-2\.0|CC-BY-4\.0)$/);
    expect(lib.cats.find((c) => c.id === 'people')?.ar).toBe('أشخاص');
  });

  it('finds drawings by English and by Arabic (native emoji names and translation)', async () => {
    const en = await searchLibrary('teacher');
    expect(en.items.length).toBeGreaterThan(3);
    const ar = await searchLibrary('معلم');
    expect(ar.items.some((i) => i.name.includes('teacher'))).toBe(true);
    const withArticle = await searchLibrary('المدرسة');
    expect(withArticle.items.some((i) => i.name === 'school')).toBe(true);
    const camel = await searchLibrary('جمل');
    expect(camel.items.some((i) => i.name.includes('camel'))).toBe(true);
    expect(ar.translated).toContain('teacher');
  });

  it('filters by category and style, and returns valid SVG', async () => {
    const lib = await loadLibrary();
    const food = lib.cats.findIndex((c) => c.id === 'food');
    const r = await searchLibrary('', { cat: food, style: 'colour', limit: 10 });
    expect(r.items.length).toBe(10);
    for (const it of r.items) { expect(it.cat).toBe(food); expect(lib.sets[it.set].style).toBe('colour'); }
    const svg = await drawingSvg(r.items[0]);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('<path');
  });

  it('reports unknown Arabic words instead of silently ignoring them', async () => {
    const r = await searchLibrary('كلمةغريبةجدا');
    expect(r.items.length).toBe(0);
    expect(r.unknown).toEqual(['كلمةغريبةجدا']);
  });
});

describe('Arabic glossary', () => {
  it('prefers the checked glossary over the automatic dictionary', () => {
    expect(translateArabicWord('سعيد', { 'سعيد': 'unhappy' })).toEqual(['happy', 'smile']);
    expect(translateArabicWord('بالسيارة')).toEqual(['car']);
    expect(translateArabicWord('كِتَاب')).toEqual(['book']);
  });
  it('keeps English words and reports unknown Arabic', () => {
    const r = toEnglishQuery('rocket كلمةغريبة');
    expect(r.query).toBe('rocket');
    expect(r.unknown).toEqual(['كلمةغريبة']);
  });
});
