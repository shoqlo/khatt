// Arabic-first text layout: Unicode bidi -> HarfBuzz shaping -> glyph outlines.
// Output glyphs carry `order` = logical (writing) order, so the renderer draws
// Arabic right-to-left and Latin left-to-right, with letters correctly joined.
import bidiFactory from 'bidi-js';

// Minimal structural types so this module works with harfbuzzjs in Node and the browser.
export interface HbFont {
  glyphToPath(gid: number): string;
  hExtents(): { ascender: number; descender: number; lineGap: number };
}
export interface HbModule {
  Buffer: new () => {
    addText(t: string): void;
    guessSegmentProperties(): void;
    setDirection(d: number): void;
    getGlyphInfos(): { codepoint: number; cluster: number }[];
    getGlyphPositions(): { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
  };
  shape(font: HbFont, buffer: unknown): void;
}

export interface LaidGlyph {
  d: string;          // outline in font units, y-up
  x: number;          // pen position in px (y-down layout space)
  y: number;          // baseline in px
  scale: number;      // px per font unit
  order: number;      // logical writing order
  rtl: boolean;
}

export interface TextLayout {
  glyphs: LaidGlyph[];
  width: number;
  height: number;
  rtl: boolean; // base paragraph direction
}

const RTL = 5;
const LTR = 4;
const bidi = bidiFactory();

export function isRtlText(text: string): boolean {
  const m = text.match(/[֐-ࣿיִ-﷿ﹰ-﻿A-Za-z]/);
  return !!m && !/[A-Za-z]/.test(m[0]);
}

interface Run { start: number; end: number; level: number } // end exclusive

function levelRuns(levels: Uint8Array, start: number, end: number): Run[] {
  const runs: Run[] = [];
  let s = start;
  for (let i = start + 1; i <= end; i++) {
    if (i === end || levels[i] !== levels[s]) {
      runs.push({ start: s, end: i, level: levels[s] });
      s = i;
    }
  }
  return runs;
}

/** UAX#9 rule L2 applied to whole runs. */
function visualOrder(runs: Run[]): Run[] {
  const out = runs.slice();
  if (!out.length) return out;
  const max = Math.max(...out.map((r) => r.level));
  const minOdd = Math.min(...out.map((r) => r.level).filter((l) => l % 2 === 1), max + 1);
  for (let lvl = max; lvl >= minOdd; lvl--) {
    let i = 0;
    while (i < out.length) {
      if (out[i].level >= lvl) {
        let j = i;
        while (j < out.length && out[j].level >= lvl) j++;
        const seg = out.slice(i, j).reverse();
        out.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  return out;
}

export function layoutText(
  hb: HbModule,
  font: HbFont,
  upem: number,
  text: string,
  size: number,
  align: 'start' | 'center' | 'end' = 'start',
  /** false = measure only (no glyph outlines): much faster, for word-wrapping */
  paths = true,
): TextLayout {
  const scale = size / upem;
  const ext = font.hExtents();
  const ascent = ext.ascender * scale;
  const descent = -ext.descender * scale;
  const lineHeight = Math.max(size * 1.5, ascent + descent + ext.lineGap * scale);
  const baseRtl = isRtlText(text);
  const lines = text.split('\n');

  type Line = { glyphs: Omit<LaidGlyph, 'y'>[]; width: number };
  const laid: Line[] = [];
  let lineOffset = 0;
  for (const line of lines) {
    const glyphs: Omit<LaidGlyph, 'y'>[] = [];
    let pen = 0;
    if (line.length) {
      const { levels } = bidi.getEmbeddingLevels(line, baseRtl ? 'rtl' : 'ltr');
      const runs = visualOrder(levelRuns(levels, 0, line.length));
      for (const run of runs) {
        const rtl = run.level % 2 === 1;
        const buf = new hb.Buffer();
        buf.addText(line.slice(run.start, run.end));
        buf.guessSegmentProperties();
        buf.setDirection(rtl ? RTL : LTR);
        hb.shape(font, buf);
        const infos = buf.getGlyphInfos();
        const pos = buf.getGlyphPositions();
        for (let i = 0; i < infos.length; i++) {
          const d = paths ? font.glyphToPath(infos[i].codepoint) : '';
          if (d) {
            glyphs.push({
              d,
              x: pen + pos[i].xOffset * scale,
              scale,
              // writing order: line offset + logical character index
              order: lineOffset + run.start + infos[i].cluster + (rtl ? 0 : i * 1e-6),
              rtl,
            });
          }
          pen += pos[i].xAdvance * scale;
        }
      }
    }
    laid.push({ glyphs, width: pen });
    lineOffset += line.length + 1;
  }

  const width = Math.max(1, ...laid.map((l) => l.width));
  const height = Math.max(lineHeight, lines.length * lineHeight);
  const out: LaidGlyph[] = [];
  laid.forEach((l, li) => {
    const slack = width - l.width;
    // "start" is the right edge for RTL paragraphs.
    const shift = align === 'center' ? slack / 2 : (align === 'start') === baseRtl ? slack : 0;
    const baseline = li * lineHeight + (lineHeight - (ascent + descent)) / 2 + ascent;
    for (const g of l.glyphs) out.push({ ...g, x: g.x + shift, y: baseline });
  });
  // Ties: within an RTL cluster (e.g. lam-alef ligature + marks) keep base glyph first.
  out.sort((a, b) => a.order - b.order);
  return { glyphs: out, width, height, rtl: baseRtl };
}
