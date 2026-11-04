import { describe, it, expect } from 'vitest';
import { splitScenes, keyPhrase, keywords, gridLayout, sceneSeconds, timeScene, sceneTemplate } from '../src/generator/script';
import type { TextElement, SvgElement } from '../src/engine/types';

describe('script splitting', () => {
  it('one scene per paragraph', () => {
    expect(splitScenes('الجمل حيوان صبور.\n\nيعيش في الصحراء.\n\n\nيحبه الأطفال.')).toEqual(['الجمل حيوان صبور.', 'يعيش في الصحراء.', 'يحبه الأطفال.']);
  });
  it('a long paragraph is split at sentences into scenes of readable length', () => {
    const long = Array.from({ length: 8 }, (_, i) => `هذه الجملة رقم ${i + 1} تتحدث عن موضوع مهم جدا للطلاب في المدرسة.`).join(' ');
    const scenes = splitScenes(long);
    expect(scenes.length).toBeGreaterThan(2);
    for (const s of scenes) expect(s.split(/\s+/).length).toBeLessThanOrEqual(32);
  });
  it('never more than the maximum number of scenes', () => {
    const many = Array.from({ length: 30 }, (_, i) => `فقرة ${i}`).join('\n\n');
    expect(splitScenes(many, 20)).toHaveLength(20);
  });
  it('empty script has no scenes', () => expect(splitScenes('  \n\n ')).toEqual([]));
});

describe('key phrase and key words', () => {
  it('writes the first sentence, trimmed', () => {
    expect(keyPhrase('الجمل حيوان صبور. يعيش في الصحراء.')).toBe('الجمل حيوان صبور');
    expect(keyPhrase('one two three four five six seven eight nine ten eleven', 5)).toBe('one two three four five…');
  });
  it('skips filler words and puts drawable words first', () => {
    const k = keywords('يستطيع الجمل أن يعيش في الصحراء');
    const words = k.map((x) => x.word);
    expect(words).not.toContain('أن');
    expect(words).not.toContain('في');
    expect(words[0]).toBe('الجمل');
    expect(k[0].english).toContain('camel');
    expect(k.find((x) => x.word === 'الصحراء')?.english).toContain('desert');
  });
  it('works for English scripts', () => {
    expect(keywords('The camel lives in the desert').map((k) => k.english[0])).toEqual(['camel', 'lives', 'desert']);
  });
});

describe('layout', () => {
  it('board has the video shape, so the final zoom-out has no grey bars', () => {
    for (const aspect of ['landscape', 'portrait', 'square'] as const) {
      for (const n of [1, 3, 6, 11]) {
        const { board, cells } = gridLayout(n, aspect, true);
        const f = { landscape: 16 / 9, portrait: 9 / 16, square: 1 }[aspect];
        expect(board.width / board.height).toBeCloseTo(f, 2);
        expect(cells).toHaveLength(n);
        for (const c of cells) { expect(c.x + c.w).toBeLessThanOrEqual(board.width + 1); expect(c.y + c.h).toBeLessThanOrEqual(board.height + 1); }
      }
    }
  });
  it('Arabic videos start top-right and read right to left', () => {
    const rtl = gridLayout(4, 'landscape', true).cells;
    expect(rtl[0].x).toBeGreaterThan(rtl[1].x);
    const ltr = gridLayout(4, 'landscape', false).cells;
    expect(ltr[0].x).toBeLessThan(ltr[1].x);
  });
  it('templates keep everything inside the frame', () => {
    for (const aspect of ['landscape', 'portrait', 'square'] as const) for (const type of ['lesson', 'explainer', 'story', 'promo'] as const) {
      for (const r of Object.values(sceneTemplate(aspect, type, true))) {
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1); expect(r.y + r.h).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('timing', () => {
  it('reading speed decides scene length, within limits', () => {
    expect(sceneSeconds('كلمة', 'lesson')).toBe(3.5);
    expect(sceneSeconds(Array(40).fill('كلمة').join(' '), 'lesson')).toBeCloseTo(21.2, 1);
    expect(sceneSeconds(Array(400).fill('w').join(' '), 'promo')).toBe(25);
  });
  it('a scene’s elements add up to its length', () => {
    const text = { kind: 'text', text: 'مرحبا بكم', timing: { transition: 0, animate: 0, pause: 0 } } as TextElement;
    const svg = { kind: 'svg', timing: { transition: 0, animate: 0, pause: 0 } } as SvgElement;
    timeScene([text, svg], 9, false);
    const sum = [text, svg].reduce((a, e) => a + e.timing.transition + e.timing.animate + e.timing.pause, 0);
    expect(sum).toBeCloseTo(9, 1);
    expect(text.timing.transition).toBeGreaterThan(svg.timing.transition); // camera moves only at the scene start
  });
});
