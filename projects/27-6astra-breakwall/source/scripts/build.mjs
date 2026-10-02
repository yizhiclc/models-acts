import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, write: false,
  format: 'iife', target: ['es2020'], minify: true, legalComments: 'inline', charset: 'utf8' });
const css = await fs.readFile(path.join(root, 'src/style.css'), 'utf8');
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace('/* APP_CSS */', () => css).replace('/* APP_JS */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
if (/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)) throw new Error('External runtime dependency detected');
const licenses = [];
for (const name of ['three', 'cannon-es']) licenses.push(`=== ${name} ===\n${await fs.readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`);
html = html.replace('</body>', `<!-- Third-party notices\n${licenses.join('\n\n').replace(/--/g, '—')}\n-->\n</body>`);
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
await fs.writeFile(path.join(root, 'dist/index.html'), html);
await fs.writeFile(path.join(root, 'THIRD_PARTY_LICENSES.txt'), licenses.join('\n\n'));
console.log(`Built dist/index.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB, all runtime dependencies inline.`);
