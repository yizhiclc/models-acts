import fs from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve('dist');
let html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
html = await replaceAsync(html, /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, async (all, src) => {
  const code = await fs.readFile(path.join(directory, src), 'utf8');
  return '<script type="module">' + code.replace(/<\/script/gi, '<\\/script') + '</script>';
});
html = await replaceAsync(html, /<link\b[^>]*href="([^"]+\.css)"[^>]*>/g, async (all, src) => {
  return '<style>' + await fs.readFile(path.join(directory, src), 'utf8') + '</style>';
});
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');
const license = await fs.readFile(path.resolve('THIRD-PARTY-NOTICES.txt'),'utf8');
html = html.replace('</head>', '<!-- Third-party notice: Three.js\n' + license.replace(/--/g,'—') + '\n-->\n</head>');
await fs.writeFile(path.resolve('../海湾航记.html'), html);
console.log('Standalone HTML: ../海湾航记.html (' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MiB)');
async function replaceAsync(value, pattern, callback) {
  const found = [...value.matchAll(pattern)];
  const replacements = await Promise.all(found.map(match => callback(...match)));
  let i = 0;
  return value.replace(pattern, () => replacements[i++]);
}
