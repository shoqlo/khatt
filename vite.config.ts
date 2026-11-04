import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** Writes dist/sw.js with the list of files to keep offline and a version hash. */
function serviceWorker(): Plugin {
  return {
    name: 'khatt-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      const all = walk(dist).filter((f) => f !== 'sw.js');
      // Precache the app itself + library index; individual drawings are cached when first used.
      const precache = all.filter((f) => !f.startsWith('library/') || f === 'library/index.json').filter((f) => !f.endsWith('.map'));
      const hash = (files: string[]) => {
        const h = crypto.createHash('sha256');
        for (const f of files.sort()) h.update(f).update(fs.readFileSync(path.join(dist, f)));
        return h.digest('hex').slice(0, 12);
      };
      const version = hash(precache);
      const libVersion = hash(all.filter((f) => f.startsWith('library/')));
      const sw = fs.readFileSync('src/sw.js', 'utf8')
        .replaceAll('__VERSION__', version)
        .replaceAll('__LIBVERSION__', libVersion)
        .replaceAll('__PRECACHE__', JSON.stringify(['./', ...precache.map((f) => `./${f}`)]));
      if (/__(VERSION|LIBVERSION|PRECACHE)__/.test(sw)) throw new Error('service worker template not fully filled');
      fs.writeFileSync(path.join(dist, 'sw.js'), sw);
      console.log(`service worker ${version}: ${precache.length} files precached`);
    },
  };
}

export default defineConfig({
  base: './', // works on any host and any sub-folder (e.g. GitHub Pages)
  plugins: [serviceWorker()],
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsDir: 'static' },
  preview: { port: 4173, host: '127.0.0.1' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
