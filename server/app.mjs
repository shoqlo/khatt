// Local backend for Khatt. Zero dependencies (Node >= 20).
//  - Pixabay proxy: keeps the API key off the client, caches searches 24h (Pixabay
//    requirement), rate-limits to the documented 100 req/60s, and downloads images
//    you actually use into ./data/assets (no permanent hotlinking).
//  - Uploads (images, SVG, audio) and project JSON storage.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webm': 'audio/webm',
};
const EXT_FOR_TYPE = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a', 'audio/webm': '.webm',
};
const DAY = 24 * 60 * 60 * 1000;
const PIXABAY_TYPES = new Set(['all', 'photo', 'illustration', 'vector']);
// Pixabay's `lang` list has no Arabic; Arabic queries are translated client-side.
const PIXABAY_LANGS = new Set(['cs', 'da', 'de', 'en', 'es', 'fr', 'id', 'it', 'hu', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'fi', 'sv', 'tr', 'vi', 'th', 'bg', 'ru', 'el', 'ja', 'ko', 'zh']);

export function createApp({ dataDir, apiKey = '', fetchImpl = globalThis.fetch, staticDir = null, now = () => Date.now() }) {
  const dirs = {
    assets: path.join(dataDir, 'assets'),
    projects: path.join(dataDir, 'projects'),
    cache: path.join(dataDir, 'cache'),
  };
  const ready = Promise.all(Object.values(dirs).map((d) => fs.mkdir(d, { recursive: true })));
  const memCache = new Map();
  const hits = new Map(); // pixabay id -> hit (from cached searches)
  let window = []; // timestamps of upstream requests

  function rateOk() {
    const t = now();
    window = window.filter((x) => t - x < 60_000);
    if (window.length >= 100) return false;
    window.push(t);
    return true;
  }

  async function cached(key, loader) {
    const file = path.join(dirs.cache, crypto.createHash('sha1').update(key).digest('hex') + '.json');
    const m = memCache.get(key);
    if (m && now() - m.at < DAY) return { data: m.data, cached: true };
    try {
      const disk = JSON.parse(await fs.readFile(file, 'utf8'));
      if (now() - disk.at < DAY) { memCache.set(key, disk); return { data: disk.data, cached: true }; }
    } catch { /* miss */ }
    const data = await loader();
    const entry = { at: now(), data };
    memCache.set(key, entry);
    await fs.writeFile(file, JSON.stringify(entry));
    return { data, cached: false };
  }

  async function pixabay(params) {
    if (!apiKey) throw httpError(503, 'Pixabay is not configured. Put PIXABAY_API_KEY=... in .env and restart.');
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const cacheKey = JSON.stringify(params);
    return cached(cacheKey, async () => {
      if (!rateOk()) throw httpError(429, 'Pixabay rate limit reached (100 requests/minute). Try again shortly.');
      let res;
      try { res = await fetchImpl(url); } catch (e) { throw httpError(502, `Could not reach Pixabay: ${e.message}`); }
      if (res.status === 429) throw httpError(429, 'Pixabay rate limit reached. Try again shortly.');
      if (!res.ok) throw httpError(502, `Pixabay error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      return {
        total: json.totalHits ?? 0,
        hits: (json.hits || []).map((h) => ({
          id: h.id, type: h.type, tags: h.tags, user: h.user, pageURL: h.pageURL,
          previewURL: h.previewURL, webformatURL: h.webformatURL,
          width: h.webformatWidth, height: h.webformatHeight, largeImageURL: h.largeImageURL,
        })),
      };
    });
  }

  async function handle(req, res) {
    await ready;
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;

    if (p === '/api/config') return json(res, { pixabay: !!apiKey });

    if (p === '/api/pixabay/search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const type = url.searchParams.get('type') || 'illustration';
      const page = Math.max(1, Math.min(20, parseInt(url.searchParams.get('page') || '1', 10) || 1));
      const lang = url.searchParams.get('lang') || 'en';
      if (!PIXABAY_TYPES.has(type)) throw httpError(400, 'bad type');
      const { data, cached: fromCache } = await pixabay({
        q, image_type: type, page, per_page: 30, safesearch: 'true', lang: PIXABAY_LANGS.has(lang) ? lang : 'en',
      });
      for (const h of data.hits) hits.set(String(h.id), h);
      return json(res, { ...data, hits: data.hits.map(({ largeImageURL, ...rest }) => rest), cached: fromCache });
    }

    if (p === '/api/pixabay/import' && req.method === 'POST') {
      const { id } = JSON.parse((await readBody(req, 10_000)).toString() || '{}');
      if (!/^\d{1,12}$/.test(String(id))) throw httpError(400, 'bad id');
      let hit = hits.get(String(id));
      if (!hit) hit = (await pixabay({ id: String(id) })).data.hits[0];
      if (!hit) throw httpError(404, 'image not found');
      const existing = (await fs.readdir(dirs.assets)).find((f) => f.startsWith(`pixabay-${id}.`));
      let file = existing;
      if (!file) {
        let r;
        try { r = await fetchImpl(hit.largeImageURL || hit.webformatURL); } catch (e) { throw httpError(502, `Download failed: ${e.message}`); }
        if (!r.ok) throw httpError(502, `Download failed (${r.status})`);
        const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
        const ext = EXT_FOR_TYPE[type] || '.jpg';
        file = `pixabay-${id}${ext}`;
        await fs.writeFile(path.join(dirs.assets, file), Buffer.from(await r.arrayBuffer()));
      }
      return json(res, {
        src: `/assets/${file}`,
        source: { provider: 'pixabay', id: String(id), author: hit.user, pageUrl: hit.pageURL, license: 'Pixabay Content License' },
        tags: hit.tags,
      });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const type = (req.headers['content-type'] || '').split(';')[0];
      const ext = EXT_FOR_TYPE[type];
      if (!ext) throw httpError(415, `Unsupported file type: ${type}`);
      const body = await readBody(req, 60 * 1024 * 1024);
      const name = `upload-${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}${ext}`;
      await fs.writeFile(path.join(dirs.assets, name), body);
      return json(res, { src: `/assets/${name}` });
    }

    if (p === '/api/projects' && req.method === 'GET') {
      const files = (await fs.readdir(dirs.projects)).filter((f) => f.endsWith('.json'));
      const list = [];
      for (const f of files) {
        try {
          const proj = JSON.parse(await fs.readFile(path.join(dirs.projects, f), 'utf8'));
          const st = await fs.stat(path.join(dirs.projects, f));
          list.push({ id: proj.id, title: proj.title, elements: proj.elements?.length ?? 0, updated: st.mtimeMs });
        } catch { /* skip corrupt */ }
      }
      return json(res, list.sort((a, b) => b.updated - a.updated));
    }

    const pm = p.match(/^\/api\/projects\/([a-z0-9]{4,40})$/);
    if (pm) {
      const file = path.join(dirs.projects, `${pm[1]}.json`);
      if (req.method === 'GET') {
        try { return send(res, 200, await fs.readFile(file), 'application/json'); } catch { throw httpError(404, 'not found'); }
      }
      if (req.method === 'PUT') {
        const body = await readBody(req, 20 * 1024 * 1024);
        const proj = JSON.parse(body.toString());
        if (proj.id !== pm[1] || proj.version !== 1 || !Array.isArray(proj.elements)) throw httpError(400, 'invalid project');
        await fs.writeFile(file + '.tmp', body);
        await fs.rename(file + '.tmp', file); // atomic save
        return json(res, { ok: true });
      }
      if (req.method === 'DELETE') { await fs.rm(file, { force: true }); return json(res, { ok: true }); }
    }

    if (p.startsWith('/assets/')) return serveFile(res, dirs.assets, p.slice('/assets/'.length));
    if (staticDir && req.method === 'GET') {
      const rel = p === '/' ? 'index.html' : p.slice(1);
      if (existsSync(safeJoin(staticDir, rel) || '')) return serveFile(res, staticDir, rel);
      return serveFile(res, staticDir, 'index.html');
    }
    throw httpError(404, 'not found');
  }

  return async (req, res) => {
    try { await handle(req, res); } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      json(res, { error: e.message || 'error' }, status);
    }
  };
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, obj, status = 200) { send(res, status, JSON.stringify(obj), 'application/json'); }
function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
function safeJoin(root, rel) {
  const full = path.resolve(root, decodeURIComponent(rel));
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}
function serveFile(res, root, rel) {
  const full = safeJoin(root, rel);
  if (!full || !existsSync(full)) throw httpError(404, 'not found');
  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type, 'cache-control': 'public, max-age=3600' };
  // Uploaded SVGs are only ever used as images; stop them running script if opened directly.
  if (type === 'image/svg+xml') headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  res.writeHead(200, headers);
  createReadStream(full).pipe(res);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'file too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function startServer(opts, port = 8787, host = '127.0.0.1') {
  const server = http.createServer(createApp(opts));
  return new Promise((r) => server.listen(port, host, () => r(server)));
}
