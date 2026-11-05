// Site settings read at start-up from config.json (next to index.html), so connections can be
// changed by editing one small file, without touching the code.
//   { "middleman": "https://khatt-pixabay.NAME.workers.dev" }
// The middleman (cloudflare/pixabay-worker.js) says which picture services have keys.
export interface Services { pixabay: boolean; unsplash: boolean; pexels: boolean }
export interface AppConfig { middleman: string; services: Services }

const NONE: Services = { pixabay: false, unsplash: false, pexels: false };
let config: AppConfig = { middleman: '', services: { ...NONE } };

export async function loadConfig(): Promise<AppConfig> {
  let middleman = '';
  let legacyPixabay = false;
  try {
    const res = await fetch('./config.json', { cache: 'no-cache' });
    if (res.ok) {
      const c = await res.json();
      const link = typeof c.middleman === 'string' && c.middleman ? c.middleman : typeof c.pixabayProxy === 'string' ? c.pixabayProxy : '';
      legacyPixabay = !c.middleman && !!c.pixabayProxy;
      middleman = link.replace(/\/+$/, '');
    }
  } catch { /* offline or missing */ }
  let services: Services = { ...NONE };
  if (middleman) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(`${middleman}/`, { signal: ctl.signal });
      clearTimeout(timer);
      const h = await r.json();
      services = { pixabay: !!h.services?.pixabay || (legacyPixabay && !!h.configured), unsplash: !!h.services?.unsplash, pexels: !!h.services?.pexels };
      try { localStorage.setItem('khatt.services', JSON.stringify(services)); } catch { /* ignore */ }
    } catch {
      // Offline: remember what was available last time (searches will say "offline" anyway).
      try { services = { ...NONE, ...JSON.parse(localStorage.getItem('khatt.services') || '{}') }; } catch { /* ignore */ }
    }
  }
  config = { middleman, services };
  return config;
}

export const appConfig = () => config;
