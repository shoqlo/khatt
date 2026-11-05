// Khatt picture middleman (Cloudflare Worker, free plan is enough).
// One worker for Pixabay, Unsplash and Pexels: it keeps every API key secret, answers only the
// app's own website, and follows each service's rules.
//
// Why: the app is a public website, so keys inside it could be copied by anyone.
//
// Setup (Cloudflare dashboard → Workers & Pages → Create → Worker → Edit code → paste this file):
//   Settings → Variables and Secrets (add only the services you want):
//     PIXABAY_KEY          (Secret) https://pixabay.com/api/docs/
//     UNSPLASH_ACCESS_KEY  (Secret) "Access Key" of your app at https://unsplash.com/oauth/applications
//     PEXELS_API_KEY       (Secret) https://www.pexels.com/api/
//     ALLOWED_ORIGINS      (Text)   https://shoqlo.github.io    (comma-separate more sites)
//
// Endpoints (all GET):
//   /                         -> { ok, services: { pixabay, unsplash, pexels } }  (which keys are set)
//   /pixabay/search?q=&type=&page=   /pixabay/image?id=      (also /search and /image, older links)
//   /unsplash/search?q=&page=        /unsplash/download?id=  (Unsplash: photos are shown from Unsplash's own
//                                                             links; this records that a photo was used)
//   /pexels/search?q=&page=          /pexels/image?id=

const DAY = 24 * 60 * 60;
const UTM = 'utm_source=khatt&utm_medium=referral';

// Best-effort guard so one busy moment can't exhaust a key.
const windows = {};
function underLimit(service, perMinute) {
  const now = Date.now();
  windows[service] = (windows[service] || []).filter((t) => now - t < 60_000);
  if (windows[service].length >= perMinute) return false;
  windows[service].push(now);
  return true;
}

function corsHeaders(origin, allowed) {
  // Requests typed straight into a browser bar or sent by tools carry no Origin: allowed, so you can test.
  const ok = !origin || allowed.length === 0 || allowed.includes(origin);
  return { ok, headers: { 'Access-Control-Allow-Origin': ok ? origin || '*' : 'null', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
const withUtm = (u) => (u ? `${u}${u.includes('?') ? '&' : '?'}${UTM}` : u);

async function cached(ctx, cache, key, seconds, make) {
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  if (res.ok && seconds > 0) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${seconds}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}

const busy = () => new Response(JSON.stringify({ error: 'busy' }), { status: 429 });
const jsonBody = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// ---------------- Pixabay (cache 24h is one of its rules) ----------------
async function pixabayApi(env, params) {
  const u = new URL('https://pixabay.com/api/');
  u.searchParams.set('key', env.PIXABAY_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (!underLimit('pixabay', 90)) return busy();
  return fetch(u.toString(), { headers: { 'User-Agent': 'Khatt whiteboard app' } });
}
const PIXABAY_TYPES = new Set(['all', 'photo', 'illustration', 'vector']);
async function pixabaySearch(env, ctx, cache, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const type = PIXABAY_TYPES.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'illustration';
  const page = Math.max(1, Math.min(10, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  if (!q) return jsonBody({ total: 0, hits: [] });
  const key = new Request(`https://cache.khatt/pixabay?q=${encodeURIComponent(q.toLowerCase())}&type=${type}&page=${page}`);
  return cached(ctx, cache, key, DAY, async () => {
    const r = await pixabayApi(env, { q, image_type: type, page, per_page: 30, safesearch: 'true' });
    if (!r.ok) return r;
    const data = await r.json();
    return jsonBody({
      total: data.totalHits || 0,
      hits: (data.hits || []).map((h) => ({
        id: h.id, type: h.type, title: (h.tags || '').split(',')[0].trim(), tags: h.tags, user: h.user, pageURL: h.pageURL,
        previewURL: h.previewURL, width: h.webformatWidth, height: h.webformatHeight,
      })),
    });
  });
}
async function pixabayImage(env, ctx, cache, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return new Response('bad id', { status: 400 });
  return cached(ctx, cache, new Request(`https://cache.khatt/pixabay-image/${id}`), DAY, async () => {
    const meta = await pixabayApi(env, { id });
    if (!meta.ok) return meta;
    const hit = (await meta.json()).hits?.[0];
    if (!hit) return new Response('not found', { status: 404 });
    const img = await fetch(hit.largeImageURL || hit.webformatURL);
    if (!img.ok) return new Response('image unavailable', { status: 502 });
    return new Response(img.body, { headers: { 'Content-Type': img.headers.get('Content-Type') || 'image/jpeg' } });
  });
}

// ---------------- Unsplash (photos are hotlinked; uses are reported to Unsplash) ----------------
function unsplashApi(env, path) {
  if (!underLimit('unsplash', 40)) return Promise.resolve(busy());
  return fetch(`https://api.unsplash.com${path}`, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' } });
}
async function unsplashSearch(env, ctx, cache, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  if (!q) return jsonBody({ total: 0, hits: [] });
  const key = new Request(`https://cache.khatt/unsplash?q=${encodeURIComponent(q.toLowerCase())}&page=${page}`);
  return cached(ctx, cache, key, 60 * 60, async () => {
    const r = await unsplashApi(env, `/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=30&content_filter=high`);
    if (!r.ok) return r;
    const data = await r.json();
    return jsonBody({
      total: data.total || 0,
      hits: (data.results || []).map((p) => ({
        id: p.id, title: p.alt_description || p.description || 'Unsplash', user: p.user?.name, userURL: withUtm(p.user?.links?.html),
        pageURL: withUtm(p.links?.html), previewURL: p.urls?.small, imageURL: p.urls?.regular, width: p.width, height: p.height,
      })),
    });
  });
}
async function unsplashDownload(env, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^[\w-]{4,40}$/.test(id)) return new Response('bad id', { status: 400 });
  // Unsplash's download endpoint: records that the photo was used (required by its API guidelines).
  const r = await unsplashApi(env, `/photos/${id}/download`);
  if (!r.ok) return r;
  return jsonBody({ ok: true });
}

// ---------------- Pexels ----------------
function pexelsApi(env, path) {
  if (!underLimit('pexels', 45)) return Promise.resolve(busy());
  return fetch(`https://api.pexels.com/v1${path}`, { headers: { Authorization: env.PEXELS_API_KEY } });
}
async function pexelsSearch(env, ctx, cache, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  if (!q) return jsonBody({ total: 0, hits: [] });
  const key = new Request(`https://cache.khatt/pexels?q=${encodeURIComponent(q.toLowerCase())}&page=${page}`);
  return cached(ctx, cache, key, DAY, async () => {
    const r = await pexelsApi(env, `/search?query=${encodeURIComponent(q)}&page=${page}&per_page=30`);
    if (!r.ok) return r;
    const data = await r.json();
    return jsonBody({
      total: data.total_results || 0,
      hits: (data.photos || []).map((p) => ({
        id: p.id, title: p.alt || 'Pexels', user: p.photographer, userURL: p.photographer_url, pageURL: p.url,
        previewURL: p.src?.medium, width: p.width, height: p.height,
      })),
    });
  });
}
async function pexelsImage(env, ctx, cache, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return new Response('bad id', { status: 400 });
  return cached(ctx, cache, new Request(`https://cache.khatt/pexels-image/${id}`), DAY, async () => {
    const meta = await pexelsApi(env, `/photos/${id}`);
    if (!meta.ok) return meta;
    const p = await meta.json();
    const img = await fetch(p.src?.large2x || p.src?.large || p.src?.original);
    if (!img.ok) return new Response('image unavailable', { status: 502 });
    return new Response(img.body, { headers: { 'Content-Type': img.headers.get('Content-Type') || 'image/jpeg' } });
  });
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
    const services = { pixabay: !!env.PIXABAY_KEY, unsplash: !!env.UNSPLASH_ACCESS_KEY, pexels: !!env.PEXELS_API_KEY };
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return json({ ok: true, configured: services.pixabay, services }, 200, headers);

    const routes = {
      '/search': ['pixabay', () => pixabaySearch(env, ctx, cache, url)],
      '/image': ['pixabay', () => pixabayImage(env, ctx, cache, url)],
      '/pixabay/search': ['pixabay', () => pixabaySearch(env, ctx, cache, url)],
      '/pixabay/image': ['pixabay', () => pixabayImage(env, ctx, cache, url)],
      '/unsplash/search': ['unsplash', () => unsplashSearch(env, ctx, cache, url)],
      '/unsplash/download': ['unsplash', () => unsplashDownload(env, url)],
      '/pexels/search': ['pexels', () => pexelsSearch(env, ctx, cache, url)],
      '/pexels/image': ['pexels', () => pexelsImage(env, ctx, cache, url)],
    };
    const route = routes[path];
    if (!route) return json({ error: 'not found' }, 404, headers);
    const [service, run] = route;
    if (!services[service]) return json({ error: `The ${service} key is not set on this worker.` }, 503, headers);
    const res = await run();
    if (res.status === 429) return json({ error: 'busy' }, 429, headers);
    if (res.status === 400 || res.status === 404) return json({ error: await res.text() }, res.status, headers);
    if (!res.ok) return json({ error: `${service} answered ${res.status}` }, 502, headers);
    const type = res.headers.get('Content-Type') || 'application/json; charset=utf-8';
    const extra = type.startsWith('image/') ? { 'Cache-Control': `public, max-age=${DAY}` } : {};
    return new Response(res.body, { status: 200, headers: { ...headers, ...extra, 'Content-Type': type } });
  },
};
