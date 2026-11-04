import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// minimal .env loader (KEY=VALUE lines)
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const port = Number(process.env.PORT || 8787);
const dist = path.join(root, 'dist');
await startServer({
  dataDir: path.resolve(root, process.env.DATA_DIR || 'data'),
  apiKey: process.env.PIXABAY_API_KEY || '',
  staticDir: fs.existsSync(dist) ? dist : null,
}, port, process.env.HOST || '127.0.0.1');
console.log(`Khatt server on http://${process.env.HOST || '127.0.0.1'}:${port}  (Pixabay: ${process.env.PIXABAY_API_KEY ? 'on' : 'off — set PIXABAY_API_KEY in .env'})`);
