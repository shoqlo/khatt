import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { configureLibrary, loadLibrary, type LibIndex } from '../src/library/builtin';
import { keywords, splitScenes, FIRST_PICTURE } from '../src/generator/script';
import { libraryCandidates } from '../src/generator/pick';

// A real 2-minute Arabic children's story: every scene must get a fitting picture.
let lib: LibIndex;
beforeAll(async () => {
  configureLibrary({ base: '/', fetch: (async (u: string) => new Response(fs.readFileSync(path.join('public', String(u))))) as typeof fetch });
  lib = await loadLibrary();
});

async function picks(text: string, story: boolean) {
  const cand = libraryCandidates(lib, () => 'colour', 'ar', story);
  const used = new Set<string>();
  const out: (string | null)[] = [];
  for (const [i, scene] of splitScenes(text).entries()) {
    let best: { name: string; total: number; take: () => Promise<unknown> } | null = null;
    for (const k of keywords(scene, lib.dict).slice(0, 10)) {
      const c = await cand(k, i, used);
      if (c && (!best || c.score + k.prior > best.total)) best = { name: c.name, total: c.score + k.prior, take: c.take };
    }
    if (best && best.total >= FIRST_PICTURE) { await best.take(); out.push(best.name); } else out.push(null);
  }
  return out;
}

describe('picture choice for a real story', () => {
  it('picks a fitting picture for every scene of "Salem and the little bird"', async () => {
    const got = await picks(fs.readFileSync('tests/fixtures/story-salem.txt', 'utf8'), true);
    // Scene 5 "رأيا طائراً صغيراً عطشان تحت شجرةٍ يابسة": the thirsty bird (طائراً, with tanween) is the subject.
    expect(got).toEqual(['bird', 'desert', 'sun', 'droplet', 'bird', 'bird', 'star', 'bird', 'palm-tree', 'house', 'red-heart']);
  });
  it('understands possessive and tanween endings, but not verbs for two people', async () => {
    const got = await picks('مع تطبيقنا اطلب من هاتفك.\n\nوجد عصفوراً صغيراً.\n\nوأكلا تحت ظل النخلة.', false);
    expect(got[0]).toBe('mobile-phone');   // هاتفك = your phone
    expect(got[1]).toBe('bird');           // عصفوراً = a bird (tanween)
    expect(got[2]).toBe('palm-tree');      // أكلا = they both ate: not "food"
  });
  it('avoids the traps that used to fool it', async () => {
    const got = await picks('رأى الطائر في السماء.\n\nعاد بطريق الواحة.\n\nظهر القمر في الليل.', true);
    expect(got[0]).toBe('bird');            // not "طائرة" (airplane)
    expect(got[1]).not.toBe('penguin');     // "بطريق" here = "by the road"
    expect(got[2]).toMatch(/moon|star/);    // not "moon cake"
  });
});
