import { describe, it, expect } from 'vitest';
import { searchOpenverse, searchCommons, downloadHit, commonsLicenseOk, commonsThumb, OnlineError } from '../src/library/online';

// Sample responses follow the documented shapes of each API. These tests check our
// parsing and licence filtering; they do NOT prove the live services behave this way.
const openverseSample = {
  page_count: 3,
  results: [
    { id: 'a1', title: 'Camel sketch', url: 'https://example.org/camel.svg', thumbnail: 'https://api.openverse.org/v1/images/a1/thumb/', creator: 'Ali', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', foreign_landing_url: 'https://example.org/camel', attribution: '"Camel sketch" by Ali is licensed under CC BY 4.0.', filetype: 'svg' },
    { id: 'a2', title: 'Tree', url: 'https://example.org/tree.jpg', thumbnail: 'https://api.openverse.org/v1/images/a2/thumb/', creator: '', license: 'cc0', license_url: '', foreign_landing_url: 'https://example.org/tree', attribution: '', filetype: 'jpg' },
  ],
};
const commonsSample = {
  continue: { gsroffset: 24 },
  query: {
    pages: [
      { title: 'File:Camel drawing.svg', index: 2, imageinfo: [{ url: 'https://upload.wikimedia.org/a/ab/Camel_drawing.svg', thumburl: 'https://upload.wikimedia.org/thumb/a/ab/Camel_drawing.svg/330px-Camel_drawing.svg.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Camel_drawing.svg', mime: 'image/svg+xml', width: 800, height: 600, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' }, Artist: { value: '<a href="//x">Sara</a>' }, ObjectName: { value: 'Camel drawing' } } }] },
      { title: 'File:Share alike.png', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/x.png', thumburl: 'https://upload.wikimedia.org/thumb/x.png/330px-x.png', mime: 'image/png', width: 4000, height: 3000, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
      { title: 'File:Big photo.jpg', index: 3, imageinfo: [{ url: 'https://upload.wikimedia.org/big.jpg', thumburl: 'https://upload.wikimedia.org/thumb/big.jpg/330px-big.jpg', mime: 'image/jpeg', width: 5000, height: 3000, extmetadata: { LicenseShortName: { value: 'Public domain' } } }] },
    ],
  },
};
const fakeFetch = (body: unknown, seen: string[] = [], status = 200) => (async (url: string) => { seen.push(String(url)); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

describe('Openverse', () => {
  it('asks only for commercially usable licences and keeps attribution', async () => {
    const seen: string[] = [];
    const r = await searchOpenverse('جمل', 1, { 'جمل': 'camel' }, fakeFetch(openverseSample, seen));
    expect(seen[0]).toContain('license=cc0%2Cpdm%2Cby');
    expect(seen[0]).toContain('q=camel');
    expect(r.searchedAs).toBe('camel');
    expect(r.more).toBe(true);
    expect(r.hits[0]).toMatchObject({ isSvg: true, license: 'CC BY 4.0', attribution: expect.stringContaining('Ali') });
    expect(r.hits[1].license).toBe('CC0');
  });
  it('explains rate limits', async () => {
    await expect(searchOpenverse('cat', 1, {}, fakeFetch({}, [], 429))).rejects.toMatchObject({ kind: 'rate' });
  });
});

describe('Wikimedia Commons', () => {
  it('drops share-alike images, sorts by relevance, prefers SVG originals', async () => {
    const seen: string[] = [];
    const r = await searchCommons('camel', 0, true, {}, fakeFetch(commonsSample, seen));
    expect(seen[0]).toContain('origin=*');
    expect(decodeURIComponent(seen[0])).toContain('filetype:drawing');
    expect(r.hits.map((h) => h.title)).toEqual(['Camel drawing', 'Big photo']);
    expect(r.hits[0]).toMatchObject({ isSvg: true, creator: 'Sara', download: ['https://upload.wikimedia.org/a/ab/Camel_drawing.svg'] });
    expect(r.hits[1].download[0]).toContain('/1280px-');
    expect(r.hits[0].attribution).toContain('via Wikimedia Commons');
  });
  it('licence filter', () => {
    for (const ok of ['CC0', 'CC BY 4.0', 'CC-BY-3.0', 'Public domain', 'PD-self']) expect(commonsLicenseOk(ok), ok).toBe(true);
    for (const bad of ['CC BY-SA 4.0', 'CC BY-NC 2.0', 'CC BY-ND 3.0', 'GFDL', '']) expect(commonsLicenseOk(bad), bad).toBe(false);
    expect(commonsThumb('https://u/thumb/a.png/330px-a.png', 1000)).toBe('https://u/thumb/a.png/1280px-a.png');
  });
});

describe('download', () => {
  it('falls back to the next URL and gives a clear error when all are blocked', async () => {
    const hit = { download: ['https://blocked/x.png', 'https://ok/x.png'], isSvg: false } as never;
    const okFetch = (async (u: string) => {
      if (String(u).includes('blocked')) throw new TypeError('Failed to fetch');
      return new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }));
    }) as unknown as typeof fetch;
    expect((await downloadHit(hit, okFetch)).blob.type).toBe('image/png');
    const allBlocked = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(downloadHit(hit, allBlocked)).rejects.toBeInstanceOf(OnlineError);
  });
});
