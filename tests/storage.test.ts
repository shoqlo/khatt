import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { putProject, getProject, listProjects, deleteProject, putAsset, getAsset, resolveUrl, exportProjectFile, importProjectFile } from '../src/storage/db';
import { newProject, type ImageElement } from '../src/engine/types';

const img = (src: string): ImageElement => ({
  id: 'i1', name: 'pic', kind: 'image', src, width: 10, height: 10, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
  mode: 'draw', direction: 'rtl', timing: { transition: 1, animate: 1, pause: 1 }, camera: null,
});

describe('on-device storage', () => {
  it('saves, lists newest first, loads and deletes projects', async () => {
    const a = newProject('أول'); const b = newProject('second');
    await putProject(a); await new Promise((r) => setTimeout(r, 5)); await putProject(b);
    const list = await listProjects();
    expect(list.map((p) => p.title).slice(0, 2)).toEqual(['second', 'أول']);
    expect((await getProject(a.id))?.title).toBe('أول');
    expect(await getProject(a.id)).not.toHaveProperty('updated');
    await deleteProject(a.id);
    expect(await getProject(a.id)).toBeNull();
  });

  it('stores files once by content and resolves them to loadable URLs', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const r1 = await putAsset(blob, 'a.png');
    const r2 = await putAsset(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'copy.png');
    expect(r1).toMatch(/^asset:[0-9a-f]{64}$/);
    expect(r2).toBe(r1);
    expect(new Uint8Array(await (await getAsset(r1))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await resolveUrl(r1)).toMatch(/^blob:/);
    expect(await resolveUrl('/static/x.png')).toBe('/static/x.png');
    await expect(resolveUrl('asset:' + '0'.repeat(64))).rejects.toThrow(/missing/);
  });

  it('round-trips a project file with its pictures to another device', async () => {
    const ref = await putAsset(new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/jpeg' }));
    const p = newProject('درس'); p.elements.push(img(ref));
    const file = await exportProjectFile(p);
    const imported = await importProjectFile(file, () => 'newid123');
    expect(imported.id).toBe('newid123');
    expect(imported.title).toBe('درس');
    expect((imported.elements[0] as ImageElement).src).toBe(ref);
    await expect(importProjectFile(new Blob(['{"hello":1}']), () => 'x')).rejects.toThrow(/not a Khatt project/);
  });

  it("carries every scene's voice recording, and keeps generated music as its recipe", async () => {
    const voice = await putAsset(new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/webm' }));
    const p = newProject('قصة');
    p.scenes[0].voice = { src: voice, name: 'تسجيل', duration: 3, volume: 1 };
    p.audio = { src: 'music:story', name: 'حكاية', duration: 0, volume: 0.35 };
    const data = JSON.parse(await (await exportProjectFile(p)).text());
    expect(Object.keys(data.assets)).toContain(voice);
    expect(data.assets['music:story']).toBeUndefined();
    const imported = await importProjectFile(new Blob([JSON.stringify(data)]), () => 'copy');
    expect(imported.scenes[0].voice?.src).toBe(voice);
    expect(imported.audio?.src).toBe('music:story');
  });
});
