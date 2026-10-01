import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // The complete WebGL runtime is local; its compressed transfer is ~140 kB.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
