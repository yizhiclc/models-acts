import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // The 3D engine is deliberately bundled locally for the offline edition.
    chunkSizeWarningLimit: 700,
  },
});
