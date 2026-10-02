import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ resolve:{alias:[{find:/^three$/,replacement:'three/webgpu'}]}, plugins: [viteSingleFile()], build: { target: 'es2022', chunkSizeWarningLimit: 1700 }, server: { port: 5173, strictPort: true } });
