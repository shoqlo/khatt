// Site settings read at start-up from config.json (next to index.html), so connections can be
// changed by editing one small file, without touching the code.
export interface AppConfig {
  /** link of the Pixabay middleman (Cloudflare worker); empty = Pixabay is off */
  pixabayProxy: string;
}

let config: AppConfig = { pixabayProxy: '' };

export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('./config.json', { cache: 'no-cache' });
    if (res.ok) {
      const c = await res.json();
      config = { pixabayProxy: typeof c.pixabayProxy === 'string' ? c.pixabayProxy.replace(/\/+$/, '') : '' };
    }
  } catch { /* offline or missing: keep defaults */ }
  return config;
}

export const appConfig = () => config;
