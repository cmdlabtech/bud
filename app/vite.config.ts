import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
const { version } = JSON.parse(readFileSync(new URL('./app.json', import.meta.url), 'utf8'));
export default defineConfig({
  root: '.',
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '0.0.0.0', port: 5174 },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
