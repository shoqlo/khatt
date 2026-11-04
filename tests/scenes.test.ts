import { describe, it, expect } from 'vitest';
import { newProject, newScene, type SvgElement, type Project } from '../src/engine/types';
import { normalizeProject, sceneSpans, fitSceneToVoice, audioClips, insertIndexForScene, moveScene, deleteScene, sceneCaptions } from '../src/engine/scenes';
import { schedule } from '../src/engine/timeline';

const el = (id: string, scene?: string): SvgElement => ({
  id, name: id, kind: 'svg', svg: '<svg/>', color: null, strokeWidth: null, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
  mode: 'draw', direction: 'rtl', timing: { transition: 1, animate: 2, pause: 1 }, camera: null, scene,
});
const voice = (d: number) => ({ src: `asset:${d}`, name: 'v', duration: d, volume: 1 });

function twoScenes(): Project {
  const p = newProject();
  const s2 = newScene('2');
  p.scenes.push(s2);
  p.elements = [el('a', p.scenes[0].id), el('b', s2.id), el('c', s2.id)];
  return p;
}

describe('scenes', () => {
  it('migrates projects saved before scenes existed', () => {
    const old = { ...newProject(), scenes: undefined, aspect: undefined } as unknown as Project;
    old.elements = [el('a'), el('b')];
    const p = normalizeProject(old);
    expect(p.aspect).toBe('landscape');
    expect(p.scenes).toHaveLength(1);
    expect(p.elements.every((e) => e.scene === p.scenes[0].id)).toBe(true);
  });

  it('keeps each scene together and in scene order', () => {
    const p = twoScenes();
    p.elements = [p.elements[1], p.elements[0], p.elements[2]]; // b (scene 2), a (scene 1), c (scene 2)
    normalizeProject(p);
    expect(p.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('computes scene start/end from its elements', () => {
    const p = twoScenes();
    const spans = sceneSpans(p);
    expect(spans.map((s) => [s.start, s.end, s.first, s.last])).toEqual([[0, 4, 0, 0], [4, 12, 1, 2]]);
  });

  it('fits a scene to its voice without touching camera moves', () => {
    const p = twoScenes();
    p.scenes[1].voice = voice(12);
    fitSceneToVoice(p, p.scenes[1].id, 0.4);
    const spans = sceneSpans(p);
    expect(spans[1].end - spans[1].start).toBeCloseTo(12.4, 1);
    expect(p.elements[1].timing.transition).toBe(1);
    expect(spans[0].end).toBe(4); // other scenes unchanged
  });

  it('places each voice at the start of its scene, background at 0', () => {
    const p = twoScenes();
    p.audio = { src: 'asset:bg', name: 'bg', duration: 30, volume: 0.3 };
    p.scenes[0].voice = voice(3);
    p.scenes[1].voice = voice(5);
    const clips = audioClips(p, schedule(p));
    expect(clips.map((c) => [c.kind, c.start, c.volume])).toEqual([['background', 0, 0.3], ['scene', 0, 1], ['scene', 4, 1]]);
  });

  it('inserts new elements at the end of the chosen scene', () => {
    const p = twoScenes();
    expect(insertIndexForScene(p, p.scenes[0].id)).toBe(1);
    expect(insertIndexForScene(p, p.scenes[1].id)).toBe(3);
  });

  it('moves and deletes whole scenes', () => {
    const p = twoScenes();
    const [s1, s2] = p.scenes;
    moveScene(p, s2.id, -1);
    expect(p.scenes.map((s) => s.id)).toEqual([s2.id, s1.id]);
    expect(p.elements.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    deleteScene(p, s2.id);
    expect(p.elements.map((e) => e.id)).toEqual(['a']);
    deleteScene(p, s1.id);
    expect(p.scenes).toHaveLength(1); // always at least one scene to add to
  });

  it('subtitles follow scene narration', () => {
    const p = twoScenes();
    p.scenes[0].narration = 'مرحبا بكم';
    p.scenes[1].narration = 'الجمل سفينة الصحراء';
    expect(sceneCaptions(p).map((c) => [c.a, c.b, c.text])).toEqual([[0, 4, 'مرحبا بكم'], [4, 12, 'الجمل سفينة الصحراء']]);
  });
});

describe('fitting to a very short voice note', () => {
  it('keeps each drawing at least MIN_DRAW seconds', async () => {
    const { MIN_DRAW } = await import('../src/engine/scenes');
    const p = twoScenes();
    p.scenes[1].voice = voice(0.5);
    fitSceneToVoice(p, p.scenes[1].id);
    for (const e of p.elements.slice(1)) expect(e.timing.animate).toBeGreaterThanOrEqual(MIN_DRAW);
  });
});
