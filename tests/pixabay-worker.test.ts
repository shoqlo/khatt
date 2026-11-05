import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-expect-error plain JS worker module
import worker from '../cloudflare/pixabay-worker.js';

// Fake Pixabay + an in-memory version of Cloudflare's cache, to test the worker as deployed.
const calls: string[] = [];
const auth: string[] = [];
const store = new Map<string, Response>();
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls.length = 0; auth.length = 0; store.clear();
  (globalThis as { caches?: unknown }).caches = { default: { match: async (r: Request) => store.get(r.url)?.clone() ?? null, put: async (r: Request, res: Response) => { store.set(r.url, res); } } };
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    const url = String(u); calls.push(url);
    const a = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (a) auth.push(a);
    if (url.startsWith('https://api.unsplash.com/search/photos')) {
      return new Response(JSON.stringify({ total: 1, results: [{ id: 'Ab3_x9', alt_description: 'camel in desert', width: 4000, height: 3000, user: { name: 'Layla', links: { html: 'https://unsplash.com/@layla' } }, links: { html: 'https://unsplash.com/photos/Ab3_x9', download_location: 'https://api.unsplash.com/photos/Ab3_x9/download?ixid=1' }, urls: { small: 'https://images.unsplash.com/s.jpg', regular: 'https://images.unsplash.com/r.jpg' } }] }));
    }
    if (url.startsWith('https://api.unsplash.com/photos/Ab3_x9/download')) return new Response(JSON.stringify({ url: 'https://images.unsplash.com/full.jpg' }));
    if (url.startsWith('https://api.pexels.com/v1/search')) {
      return new Response(JSON.stringify({ total_results: 1, photos: [{ id: 99, alt: 'palm tree', width: 3000, height: 2000, photographer: 'Omar', photographer_url: 'https://www.pexels.com/@omar', url: 'https://www.pexels.com/photo/99/', src: { medium: 'https://images.pexels.com/m.jpg', large2x: 'https://images.pexels.com/l2.jpg' } }] }));
    }
    if (url.startsWith('https://api.pexels.com/v1/photos/99')) return new Response(JSON.stringify({ id: 99, src: { large2x: 'https://images.pexels.com/l2.jpg' } }));
    if (url === 'https://images.pexels.com/l2.jpg') return new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.startsWith('https://pixabay.com/api/')) {
      return new Response(JSON.stringify({ totalHits: 1, hits: [{ id: 42, type: 'vector/svg', tags: 'camel, desert', user: 'artist', pageURL: 'https://pixabay.com/x-42/', previewURL: 'https://cdn.pixabay.com/p.png', webformatURL: 'https://cdn.pixabay.com/w.png', webformatWidth: 640, webformatHeight: 480, largeImageURL: 'https://pixabay.com/get/l.png' }] }));
    }
    if (url === 'https://pixabay.com/get/l.png') return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
    return new Response('?', { status: 404 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const env = { PIXABAY_KEY: 'SECRET-KEY', UNSPLASH_ACCESS_KEY: 'UNSPLASH-SECRET', PEXELS_API_KEY: 'PEXELS-SECRET', ALLOWED_ORIGINS: 'https://shoqlo.github.io' };
async function get(path: string, origin?: string) {
  const waits: Promise<unknown>[] = [];
  const res: Response = await worker.fetch(new Request(`https://khatt-pixabay.example.workers.dev${path}`, { headers: origin ? { Origin: origin } : {} }), env, { waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
  return res;
}

describe('Pixabay middleman (Cloudflare worker)', () => {
  it('searches for the app, never exposes the key, caches for everyone', async () => {
    const r = await get('/search?q=camel&type=vector', 'https://shoqlo.github.io');
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://shoqlo.github.io');
    const text = await r.text();
    expect(text).not.toContain('SECRET-KEY');
    expect(text).not.toContain('largeImageURL');
    expect(JSON.parse(text).hits[0]).toMatchObject({ id: 42, title: 'camel', user: 'artist' });
    expect(calls[0]).toContain('key=SECRET-KEY');
    const again = await get('/search?q=Camel&type=vector', 'https://shoqlo.github.io');
    expect(again.status).toBe(200);
    expect(calls.filter((c) => c.startsWith('https://pixabay.com/api/')).length).toBe(1); // second search from cache
  });

  it('refuses other websites', async () => {
    const r = await get('/search?q=camel', 'https://someone-else.example');
    expect(r.status).toBe(403);
    expect(calls.length).toBe(0);
  });

  it('passes images through with the headers the app needs to draw them', async () => {
    const r = await get('/image?id=42', 'https://shoqlo.github.io');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/png');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://shoqlo.github.io');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect((await get('/image?id=../../etc', 'https://shoqlo.github.io')).status).toBe(400);
  });

  it('says clearly when the key is missing, and answers a health check', async () => {
    expect(await (await get('/')).json()).toEqual({ ok: true, configured: true, services: { pixabay: true, unsplash: true, pexels: true } });
    const res: Response = await worker.fetch(new Request('https://w.dev/search?q=x'), {}, { waitUntil() {} });
    expect(res.status).toBe(503);
  });
});

describe('Unsplash and Pexels through the same middleman', () => {
  const app = 'https://shoqlo.github.io';
  it('Unsplash: search hides the key, keeps Unsplash photo links (hotlinking) and credits with UTM links', async () => {
    const r = await get('/unsplash/search?q=camel', app);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain('UNSPLASH-SECRET');
    expect(text).not.toContain('download_location');
    const hit = JSON.parse(text).hits[0];
    expect(hit).toMatchObject({ id: 'Ab3_x9', user: 'Layla', imageURL: 'https://images.unsplash.com/r.jpg' });
    expect(hit.userURL).toBe('https://unsplash.com/@layla?utm_source=khatt&utm_medium=referral');
    expect(auth[0]).toBe('Client-ID UNSPLASH-SECRET');
  });
  it('Unsplash: using a photo is reported through its download endpoint', async () => {
    const r = await get('/unsplash/download?id=Ab3_x9', app);
    expect(r.status).toBe(200);
    expect(calls.some((c) => c.startsWith('https://api.unsplash.com/photos/Ab3_x9/download'))).toBe(true);
    expect((await get('/unsplash/download?id=../x', app)).status).toBe(400);
  });
  it('Pexels: search and image pass through with the key in the header only', async () => {
    const r = await get('/pexels/search?q=palm', app);
    const text = await r.text();
    expect(text).not.toContain('PEXELS-SECRET');
    expect(JSON.parse(text).hits[0]).toMatchObject({ id: 99, user: 'Omar', previewURL: 'https://images.pexels.com/m.jpg' });
    expect(auth).toContain('PEXELS-SECRET');
    expect(calls.every((c) => !c.includes('PEXELS-SECRET'))).toBe(true);
    const img = await get('/pexels/image?id=99', app);
    expect(img.headers.get('Content-Type')).toBe('image/jpeg');
    expect(img.headers.get('Access-Control-Allow-Origin')).toBe(app);
  });
  it('a service without a key says so', async () => {
    const res: Response = await worker.fetch(new Request('https://w.dev/pexels/search?q=x'), { PIXABAY_KEY: 'k' }, { waitUntil() {} });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/pexels/);
  });
});
