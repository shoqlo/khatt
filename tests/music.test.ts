import { describe, it, expect } from 'vitest';
import { chordTones, RECIPES, loopSeconds, musicStyleOf, musicSrc, isMusicSrc, MUSIC_STYLES } from '../src/engine/music';
import { duckPoints, levelAt, musicFades } from '../src/engine/mixer';
import type { AudioClip } from '../src/engine/scenes';

describe('generated music', () => {
  it('is stored as a recipe, not audio', () => {
    for (const s of MUSIC_STYLES) {
      expect(isMusicSrc(musicSrc(s))).toBe(true);
      expect(musicStyleOf(musicSrc(s))).toBe(s);
    }
    expect(musicStyleOf('music:nope')).toBeNull();
    expect(musicStyleOf('asset:abc')).toBeNull();
  });
  it('builds real chords: major, minor and maqam Hijaz', () => {
    expect(chordTones(RECIPES.calm, 0)).toEqual([60, 64, 67]); // C E G
    expect(chordTones(RECIPES.calm, 5)).toEqual([69, 72, 76]); // A C E (A minor)
    expect(chordTones(RECIPES.oriental, 0)).toEqual([62, 66, 69]); // D F# A: Hijaz on D
    expect(chordTones(RECIPES.oriental, 6)).toEqual([72, 75, 79]); // C Eb G
  });
  it('loops last a whole number of bars', () => {
    for (const s of MUSIC_STYLES) {
      const bar = (4 * 60) / RECIPES[s].bpm;
      expect(loopSeconds(s) / bar).toBeCloseTo(RECIPES[s].prog.length * 4, 6);
    }
  });
});

describe('music under voices', () => {
  const clip = (start: number, duration: number, kind: AudioClip['kind'] = 'scene'): AudioClip => ({ src: 'x', start, duration, volume: 1, kind });
  it('drops while a voice speaks and comes back after', () => {
    const pts = duckPoints([clip(0, 60, 'background'), clip(5, 4)], 0.35);
    expect(levelAt(pts, 2)).toBe(1);
    expect(levelAt(pts, 6)).toBe(0.35);
    expect(levelAt(pts, 10)).toBe(1);
  });
  it('stays down across short gaps between voices (no pumping)', () => {
    const pts = duckPoints([clip(2, 3), clip(5.5, 3), clip(12, 2)]);
    expect(levelAt(pts, 5.2)).toBeLessThan(1);
    expect(levelAt(pts, 10)).toBe(1);
    expect(pts).toHaveLength(4);
  });
  it('fades fit very short videos', () => {
    expect(musicFades(60)).toEqual({ fadeIn: 1.5, fadeOut: 3 });
    const f = musicFades(4);
    expect(f.fadeIn + f.fadeOut).toBeLessThanOrEqual(4);
  });
});
