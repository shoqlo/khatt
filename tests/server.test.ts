import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
// @ts-expect-error plain JS module
import { createApp } from '../server/app.mjs';

function fakePixabay() {
  const calls: string[] = [];
  const fetchImpl = async (u: URL | string) => {
    const url = String(u);
    calls.push(url);
    if (url.startsWith('https://pixabay.com/api/')) {
      return new Response(JSON.stringify({ totalHits: 1, hits: [{ id: 42, type: 'illustration', tags: 'school, book', user: 'artist', pageURL: 'https://pixabay.com/x-42/', previewURL: 'https://cdn/p.png', webformatURL: 'https://cdn/w.png', webformatWidth: 640, webformatHeight: 480, largeImageURL: 'https://cdn/l.png' }] }), { status: 200 });
    }
    if (url === 'https://cdn/l.png') return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('nope', { status: 404 });
  };
  return { calls, fetchImpl };
}

async function call(app: (req: http.IncomingMessage, res: http.ServerResponse) => void, method: string, url: string, body?: string) {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, body, headers: body ? { 'content-type': 'application/json' } : {} });
  const text = await res.text();
  server.close();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khatt-')); });

describe('server', () => {
  it('reports Pixabay off without a key and refuses searches', async () => {
    const app = createApp({ dataDir: dir });
    expect((await call(app, 'GET', '/api/config')).json).toEqual({ pixabay: false });
    expect((await call(app, 'GET', '/api/pixabay/search?q=x')).status).toBe(503);
  });
  it('caches searches for 24h, hides large URLs, and never exposes the key', async () => {
    const { calls, fetchImpl } = fakePixabay();
    let now = 1_000_000;
    const app = createApp({ dataDir: dir, apiKey: 'SECRET', fetchImpl, now: () => now });
    const a = await call(app, 'GET', '/api/pixabay/search?q=school&type=vector');
    expect(a.status).toBe(200);
    expect(a.json.hits[0].largeImageURL).toBeUndefined();
    expect(JSON.stringify(a.json)).not.toContain('SECRET');
    const b = await call(app, 'GET', '/api/pixabay/search?q=school&type=vector');
    expect(b.json.cached).toBe(true);
    expect(calls.length).toBe(1);
    now += 25 * 3600 * 1000;
    await call(app, 'GET', '/api/pixabay/search?q=school&type=vector');
    expect(calls.length).toBe(2);
  });
  it('rate-limits to 100 upstream requests per minute', async () => {
    const { fetchImpl } = fakePixabay();
    const app = createApp({ dataDir: dir, apiKey: 'k', fetchImpl, now: () => 5 });
    let last = 0;
    for (let i = 0; i < 101; i++) last = (await call(app, 'GET', `/api/pixabay/search?q=q${i}`)).status;
    expect(last).toBe(429);
  });
  it('downloads imported images locally instead of hotlinking', async () => {
    const { fetchImpl } = fakePixabay();
    const app = createApp({ dataDir: dir, apiKey: 'k', fetchImpl });
    await call(app, 'GET', '/api/pixabay/search?q=school');
    const r = await call(app, 'POST', '/api/pixabay/import', JSON.stringify({ id: 42 }));
    expect(r.json.src).toBe('/assets/pixabay-42.png');
    expect(r.json.source).toMatchObject({ provider: 'pixabay', author: 'artist', license: 'Pixabay Content License' });
    expect(fs.existsSync(path.join(dir, 'assets', 'pixabay-42.png'))).toBe(true);
  });
  it('saves and lists projects, rejects bad ids and path traversal', async () => {
    const app = createApp({ dataDir: dir });
    const proj = { version: 1, id: 'abc123', title: 'درس', elements: [] };
    expect((await call(app, 'PUT', '/api/projects/abc123', JSON.stringify(proj))).status).toBe(200);
    expect((await call(app, 'GET', '/api/projects')).json[0]).toMatchObject({ id: 'abc123', title: 'درس' });
    expect((await call(app, 'PUT', '/api/projects/abc123', JSON.stringify({ ...proj, id: 'other' }))).status).toBe(400);
    expect((await call(app, 'GET', '/assets/..%2f..%2fetc%2fpasswd')).status).toBe(404);
  });
});
