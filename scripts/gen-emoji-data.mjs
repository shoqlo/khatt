// Regenerates scripts/data/emoji-meta.json and scripts/data/ar-en.json from Unicode CLDR.
// Only needed when updating emoji data (the output is committed):
//   npm i --no-save cldr-annotations-modern cldr-annotations-derived-modern unicode-emoji-json
//   node scripts/gen-emoji-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.CLDR_NODE_MODULES ? path.join(process.env.CLDR_NODE_MODULES, 'x.js') : import.meta.url);
const byEmoji = req('unicode-emoji-json/data-by-emoji.json');
const groups = req('unicode-emoji-json/data-by-group.json').map((g) => g.name ?? g.group);
const load = (pkg, file, key) => req(`${pkg}/${file}`)[key].annotations;
const enBase = load('cldr-annotations-modern', 'annotations/en/annotations.json', 'annotations');
const arBase = load('cldr-annotations-modern', 'annotations/ar/annotations.json', 'annotations');
const enDer = load('cldr-annotations-derived-modern', 'annotationsDerived/en/annotations.json', 'annotationsDerived');
const arDer = load('cldr-annotations-derived-modern', 'annotationsDerived/ar/annotations.json', 'annotationsDerived');

const TONE = /[\u{1F3FB}-\u{1F3FF}]/u;
const stripFe0f = (s) => s.replace(/️/g, '');
const lookup = (tables, ch) => {
  for (const t of tables) {
    const hit = t[ch] ?? t[stripFe0f(ch)];
    if (hit) return hit;
  }
  return null;
};
// Find annotations for an emoji; fall back to its light-skin-tone variant and strip the tone wording.
function annotations(ch, base, der, toneWords) {
  let a = lookup([base, der], ch);
  if (a) return { tts: a.tts?.[0] ?? '', kw: a.default ?? [] };
  const cps = [...stripFe0f(ch)];
  const toned = [cps[0], '\u{1F3FB}', ...cps.slice(1)].join('');
  a = lookup([der], toned);
  if (!a) return null;
  const clean = (s) => toneWords.reduce((x, re) => x.replace(re, ''), s).replace(/[،,:]\s*$/u, '').trim();
  return { tts: clean(a.tts?.[0] ?? ''), kw: (a.default ?? []).map(clean).filter((k) => k && !TONE.test(k)) };
}
const AR_TONE = [/[:،]?\s*و?بشرة بلون [^،:]*/gu];
const EN_TONE = [/[:,]?\s*(light|medium-light|medium|medium-dark|dark) skin tone/gu];

const AR_STOP = new Set(['و', 'في', 'من', 'على', 'إلى', 'مع', 'بشرة', 'بلون', 'وجه']);
const EN_STOP = new Set(['of', 'the', 'a', 'an', 'and', 'with', 'in', 'on', 'for', 'to', 'face', 'skin', 'tone', 'button', 'symbol', 'sign', 'mark']);
const normAr = (w) => w.replace(/[ً-ٰٟـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي');
const arTokens = (s) => s.split(/[\s،,:|()«»"]+/u).map(normAr).filter((w) => w.length > 1 && !AR_STOP.has(w) && /[؀-ۿ]/.test(w));
const enTokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !EN_STOP.has(w));

const meta = {};
const pairs = []; // [arTokens[], enTokens[]]
let missingAr = 0;
for (const [ch, d] of Object.entries(byEmoji)) {
  const slug = d.slug.replace(/_/g, '-');
  const en = annotations(ch, enBase, enDer, EN_TONE) ?? { tts: d.name, kw: [] };
  const ar = annotations(ch, arBase, arDer, AR_TONE);
  if (!ar) missingAr++;
  const enWords = [...new Set([...enTokens(en.tts || d.name), ...en.kw.flatMap(enTokens)])];
  const arPhrases = ar ? [...new Set([ar.tts, ...ar.kw].filter(Boolean))] : [];
  meta[slug] = { g: groups.indexOf(d.group), en: enWords.join(' '), ar: arPhrases.join(' | ') };
  if (ar) pairs.push([[...new Set(arPhrases.flatMap(arTokens))], enWords]);
}

// Arabic word -> English words, by consensus over all emoji that share the Arabic word.
const df = new Map();
const co = new Map();
for (const [ars, ens] of pairs) {
  for (const a of ars) {
    df.set(a, (df.get(a) ?? 0) + 1);
    let m = co.get(a);
    if (!m) co.set(a, (m = new Map()));
    for (const e of ens) m.set(e, (m.get(e) ?? 0) + 1);
  }
}
// Precision over coverage: keep a word only if it occurs in 2+ emoji names, or is an emoji's
// whole name (e.g. "قطة" = cat). One-off words (often adjectives like "طويلة") mistranslate.
const wholeNames = new Set(pairs.filter(([ars]) => ars.length).map(([ars]) => ars[0]));
const dict = {};
for (const [a, m] of co) {
  const n = df.get(a);
  if (n < 2 && !wholeNames.has(a)) continue;
  const ranked = [...m.entries()].filter(([, c]) => c / n >= 0.5).sort((x, y) => y[1] - x[1] || x[0].length - y[0].length);
  if (ranked.length) dict[a] = ranked.slice(0, 3).map(([e]) => e).join(' ');
}

const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'emoji-meta.json'), JSON.stringify({ groups, emoji: meta }));
fs.writeFileSync(path.join(out, 'ar-en.json'), JSON.stringify(dict));
console.log(`emoji: ${Object.keys(meta).length} (no Arabic name: ${missingAr}), Arabic words: ${Object.keys(dict).length}`);
