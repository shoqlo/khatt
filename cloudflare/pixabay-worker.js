// Khatt ⇄ Pixabay middleman (Cloudflare Worker, free plan is enough).
//
// Why: the app is a public website, so a Pixabay key inside it could be copied by anyone.
// This worker keeps the key secret, answers only the app's own website, caches every
// search and image for 24 hours (Pixabay's rule) and passes images on with the headers
// the app needs to draw them.
//
// Setup (Cloudflare dashboard → Workers & Pages → Create → Worker → Edit code → paste this file):
//   Settings → Variables and Secrets:
//     PIXABAY_KEY      (Secret) your key from https://pixabay.com/api/docs/
//     ALLOWED_ORIGINS  (Text)   https://shoqlo.github.io    (comma-separate more sites)
//
// Endpoints:
//   GET /search?q=camel&type=illustration&page=1   -> { total, hits: [{ id, title, user, pageURL, previewURL, width, height, type }] }
//   GET /image?id=123456                           -> the image bytes (1280px), cached
//   GET /                                          -> { ok, configured }   (health check)

const DAY = 24 * 60 * 60;
const TYPES = new Set(['all', 'photo', 'illustration', 'vector']);
const API = 'https://pixabay.com/api/';

// Best-effort guard so one busy moment can't exhaust the key (Pixabay allows 100 requests/minute).
let window = [];
function underLimit(now) {
  window = window.filter((t) => now - t < 60_000);
  if (window.length >= 90) return false;
  window.push(now);
  return true;
}

function corsHeaders(origin, allowed) {
  // Requests typed straight into a browser bar or sent by tools carry no Origin: allowed, so you can test.
  const ok = !origin || allowed.length === 0 || allowed.includes(origin);
  return { ok, headers: { 'Access-Control-Allow-Origin': ok ? origin || '*' : 'null', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });

async function cached(ctx, cache, key, make) {
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  if (res.ok) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${DAY}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}

async function pixabay(env, params) {
  const u = new URL(API);
  u.searchParams.set('key', env.PIXABAY_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (!underLimit(Date.now())) return new Response(JSON.stringify({ error: 'busy' }), { status: 429 });
  return fetch(u.toString(), { headers: { 'User-Agent': 'Khatt whiteboard app' } });
}

export default {
  async fetch(request, env, ctx) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { ok, headers } = corsHeaders(request.headers.get('Origin'), allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, headers);
    if (!ok) return json({ error: 'This middleman only answers the Khatt app.' }, 403, headers);
    const url = new URL(request.url);
    const cache = (globalThis.caches && caches.default) || { match: async () => null, put: async () => {} };

    if (url.pathname === '/' || url.pathname === '') return json({ ok: true, configured: !!env.PIXABAY_KEY }, 200, headers);
    if (!env.PIXABAY_KEY) return json({ error: 'PIXABAY_KEY is not set on this worker.' }, 503, headers);

    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const type = TYPES.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'illustration';
      const page = Math.max(1, Math.min(10, parseInt(url.searchParams.get('page') || '1', 10) || 1));
      if (!q) return json({ total: 0, hits: [] }, 200, headers);
      // One cache entry per query for everybody: repeated searches never reach Pixabay within 24h.
      const key = new Request(`https://cache.khatt/search?q=${encodeURIComponent(q.toLowerCase())}&type=${type}&page=${page}`);
      const res = await cached(ctx, cache, key, async () => {
        const r = await pixabay(env, { q, image_type: type, page, per_page: 30, safesearch: 'true' });
        if (!r.ok) return r;
        const data = await r.json();
        const hits = (data.hits || []).map((h) => ({
          id: h.id, type: h.type, title: (h.tags || '').split(',')[0].trim(), tags: h.tags, user: h.user, pageURL: h.pageURL,
          previewURL: h.previewURL, width: h.webformatWidth, height: h.webformatHeight,
        }));
        return new Response(JSON.stringify({ total: data.totalHits || 0, hits }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      });
      if (res.status === 429) return json({ error: 'busy' }, 429, headers);
      if (!res.ok) return json({ error: `Pixabay answered ${res.status}` }, 502, headers);
      return new Response(res.body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    }

    if (url.pathname === '/image') {
      const id = url.searchParams.get('id') || '';
      if (!/^\d{1,12}$/.test(id)) return json({ error: 'bad id' }, 400, headers);
      const key = new Request(`https://cache.khatt/image/${id}`);
      const res = await cached(ctx, cache, key, async () => {
        const meta = await pixabay(env, { id });
        if (!meta.ok) return meta;
        const hit = (await meta.json()).hits?.[0];
        if (!hit) return new Response('not found', { status: 404 });
        const img = await fetch(hit.largeImageURL || hit.webformatURL);
        if (!img.ok) return new Response('image unavailable', { status: 502 });
        return new Response(img.body, { headers: { 'Content-Type': img.headers.get('Content-Type') || 'image/jpeg' } });
      });
      if (!res.ok) return json({ error: `image ${res.status}` }, res.status === 404 ? 404 : 502, headers);
      return new Response(res.body, { status: 200, headers: { ...headers, 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': `public, max-age=${DAY}` } });
    }

    return json({ error: 'not found' }, 404, headers);
  },
};
