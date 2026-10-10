import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  base: './',
  server: { host: '0.0.0.0', port: 5174 },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
