import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const output = resolve(root, '../rain-lotus.html');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g)];
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length !== 1) {
  throw new Error('Expected a single bundled script and stylesheet. Rebuild before packaging.');
}
async function asset(url) {
  const path = resolve(dist, url.replace(/^\//, ''));
  if (!path.startsWith(dist + sep)) throw new Error('Asset is outside the build directory.');
  return readFile(path, 'utf8');
}
const js = await asset(scripts[0][1]);
const css = await asset(styles[0][1]);
// Replacement callbacks preserve literal dollar signs in the generated code.
html = html.replace(scripts[0][0], () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace(styles[0][0], () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`);
const license = await readFile(resolve(root, 'THREE-LICENSE.txt'), 'utf8');
html = html.replace('<head>', () => `<head>\n<!-- Standalone offline build. Three.js license:\n${license.replace(/-->/g, '-- >')}\n-->`);
html = html.replace('并通过 localhost 或 HTTPS 打开。', '支持时可直接打开本文件；若浏览器限制本地 WebGPU，请通过 localhost 或 HTTPS 打开。');
await writeFile(output, html, 'utf8');
console.log(`Standalone HTML: ${output} (${(await stat(output)).size.toLocaleString()} bytes)`);
