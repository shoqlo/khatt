import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787', '/assets': 'http://127.0.0.1:8787' } },
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, assetsDir: 'static' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
