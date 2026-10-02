import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, minify: true, format: 'iife', target: ['es2020'],
  write: false, legalComments: 'inline', charset: 'utf8',
});
const [template, css, license] = await Promise.all([
  readFile(path.join(root, 'src/index.html'), 'utf8'),
  readFile(path.join(root, 'src/style.css'), 'utf8'),
  readFile(path.join(root, 'node_modules/three/LICENSE'), 'utf8'),
]);
const js = output.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('/* INLINE_STYLES */', css).replace('/* INLINE_SCRIPT */', () => `/*! Three.js 0.180.0 and OrbitControls\n${license}\n*/\n${js}`);
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/index.html'), html);
await writeFile(path.join(root, 'THIRD_PARTY_LICENSES.txt'), `Three.js 0.180.0 (including OrbitControls)\n\n${license}`);
console.log(`Built dist/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB, fully self-contained.`);
