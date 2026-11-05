// Choosing built-in drawings for the draft maker (shared by the app and the tests).
import { searchLibrary, drawingSvg, itemLabel, type LibIndex, type LibStyle } from '../library/builtin';
import type { DrawingCandidate, Keyword } from './script';

/**
 * storyCharacters: in stories the same characters come back (the bird, the camel, the boy), so
 * reusing a person or animal drawing costs little; settings like the sun should not repeat.
 */
export function libraryCandidates(lib: LibIndex, styleFor: (scene: number) => LibStyle | null, lang: 'ar' | 'en', storyCharacters = false) {
  const characterCats = new Set(['people', 'nature', 'faces'].map((id) => lib.cats.findIndex((c) => c.id === id)));
  const memo = new Map<string, Awaited<ReturnType<typeof searchLibrary>>>();
  const search = async (q: string, style: LibStyle | null) => {
    const key = `${q}|${style}`;
    if (!memo.has(key)) memo.set(key, await searchLibrary(q, { style, limit: 12 }));
    return memo.get(key)!;
  };
  return async (k: Keyword, scene: number, used: Set<string>): Promise<DrawingCandidate | null> => {
    // Arabic words are translated inside the search; English words are tried as written and singular.
    const queries = /[؀-ۿ]/.test(k.word) ? [k.word] : k.english;
    const want = styleFor(scene);
    let best: DrawingCandidate | null = null;
    for (const fresh of [true, false]) for (const style of want ? [want, null] : [null]) {
      for (const q of queries) {
        const r = await search(q, style);
        // Fresh pass: nothing drawn before. Reuse pass: a story's characters may reuse the very same
        // drawing (the bird stays the same bird); anything else must at least be a different drawing.
        const idx = r.items.findIndex((it) => fresh
          ? !used.has(`${it.set}:${it.name}`) && !used.has(`name:${it.name}`)
          : (storyCharacters && characterCats.has(it.cat)) || !used.has(`${it.set}:${it.name}`));
        if (idx < 0) continue;
        const item = r.items[idx];
        // Already drawn earlier in the video, or not in the chosen style: slightly less attractive.
        // The very same character coming back (the word names the drawing exactly) costs nothing:
        // better the same bird again than a phoenix.
        const character = storyCharacters && characterCats.has(item.cat);
        const reuse = fresh ? 0 : character && k.english.includes(item.name) ? 0 : character ? 0.5 : 2;
        const score = (r.scores?.[idx] ?? 0) - reuse - (style || !want ? 0 : 0.25);
        if (best && best.score >= score) continue;
        best = {
          score, name: item.name,
          take: async () => {
            used.add(`${item.set}:${item.name}`);
            used.add(`name:${item.name}`);
            const set = lib.sets[item.set];
            return {
              isSvg: true, svg: await drawingSvg(item), name: itemLabel(item, lang), style: set.style,
              source: { provider: 'library', id: `${set.id}:${item.name}`, set: set.id, author: set.author, license: set.license },
            };
          },
        };
      }
    }
    return best;
  };
}
