import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-expect-error plain JS worker module
import worker from '../cloudflare/pixabay-worker.js';

// Fake Pixabay + an in-memory version of Cloudflare's cache, to test the worker as deployed.
const calls: string[] = [];
const store = new Map<string, Response>();
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls.length = 0; store.clear();
  (globalThis as { caches?: unknown }).caches = { default: { match: async (r: Request) => store.get(r.url)?.clone() ?? null, put: async (r: Request, res: Response) => { store.set(r.url, res); } } };
  globalThis.fetch = (async (u: string) => {
    const url = String(u); calls.push(url);
    if (url.startsWith('https://pixabay.com/api/')) {
      return new Response(JSON.stringify({ totalHits: 1, hits: [{ id: 42, type: 'vector/svg', tags: 'camel, desert', user: 'artist', pageURL: 'https://pixabay.com/x-42/', previewURL: 'https://cdn.pixabay.com/p.png', webformatURL: 'https://cdn.pixabay.com/w.png', webformatWidth: 640, webformatHeight: 480, largeImageURL: 'https://pixabay.com/get/l.png' }] }));
    }
    if (url === 'https://pixabay.com/get/l.png') return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
    return new Response('?', { status: 404 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const env = { PIXABAY_KEY: 'SECRET-KEY', ALLOWED_ORIGINS: 'https://shoqlo.github.io' };
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
    expect(await (await get('/')).json()).toEqual({ ok: true, configured: true });
    const res: Response = await worker.fetch(new Request('https://w.dev/search?q=x'), {}, { waitUntil() {} });
    expect(res.status).toBe(503);
  });
});
