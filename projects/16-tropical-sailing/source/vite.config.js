import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 10000000, chunkSizeWarningLimit: 1800,
    rollupOptions: { output: { inlineDynamicImports: true } } }
});
