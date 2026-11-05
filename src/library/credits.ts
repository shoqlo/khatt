import type { Project } from '../engine/types';
import type { LibSet } from './builtin';

const isFree = (license: string) => /^(cc0|public domain|pd)/i.test(license.trim());

/**
 * Credit lines a creator must publish with the video (e.g. in its description).
 * CC BY material needs attribution; CC0 / public-domain / MIT / Apache drawings don't.
 */
export function projectCredits(p: Project, sets: LibSet[]): string[] {
  const lines = new Set<string>();
  for (const e of p.elements) {
    if (e.kind === 'text' || !e.source) continue;
    const s = e.source;
    if (s.provider === 'library') {
      const set = sets.find((x) => x.id === s.set);
      if (set && /^CC-BY/i.test(set.license)) {
        lines.add(`${set.name} by ${set.author ?? 'unknown'}, ${set.license.replace(/-/g, ' ')}${set.licenseUrl ? ` (${set.licenseUrl})` : ''}`);
      }
    } else if ((s.provider === 'openverse' || s.provider === 'wikimedia') && !isFree(s.license)) {
      lines.add(s.attribution || `${s.id} by ${s.author ?? 'unknown'}, ${s.license}`);
    } else if (s.provider === 'unsplash' || s.provider === 'pexels') {
      // Their licences don't require it, but both services ask apps to credit the photographer.
      lines.add(s.attribution || `Photo by ${s.author ?? 'unknown'} on ${s.provider === 'unsplash' ? 'Unsplash' : 'Pexels'}`);
    }
  }
  return [...lines];
}
