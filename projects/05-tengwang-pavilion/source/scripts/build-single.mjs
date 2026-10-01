import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, '..', '滕王阁-单文件.html');

// A classic IIFE embeds Three.js and all addons, avoiding ES-module/file-origin
// restrictions and any dependency on a server or an import map.
const result = await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  logLevel: 'warn',
  build: {
    write: false,
    emptyOutDir: false,
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: false,
    lib: {
      entry: resolve(projectRoot, 'src/main.js'),
      name: 'TengwangPavilion',
      formats: ['iife'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const chunks = outputs.filter(item => item.type === 'chunk');
const styles = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const otherAssets = outputs.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css'));
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length || otherAssets.length) {
  throw new Error('Standalone export must contain exactly one fully bundled script and inline CSS only.');
}

const js = chunks[0].code.replace(/<\/script/gi, '<\\/script');
new Script(js, { filename: 'tengwang-embedded.js' });
const css = styles.map(item => String(item.source)).join('\n').replace(/<\/style/gi, '<\\/style');
const icon = await readFile(resolve(projectRoot, 'public/favicon.svg'));
const template = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
const entryPattern = /<script\s+type="module"\s+src="\/src\/main\.js"><\/script>/;
if (!entryPattern.test(template)) throw new Error('The HTML entry point has changed; update the standalone exporter.');

const html = template
  .replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${icon.toString('base64')}"`)
  .replace('</head>', () => `    <style>${css}</style>\n  </head>`)
  .replace(entryPattern, () => `<script>${js}</script>`);

// Guard the actual HTML tags, excluding harmless library strings inside JS.
const documentShell = html.replace(/<script>[\s\S]*?<\/script>/g, '<script></script>');
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref="(?!data:)/i.test(documentShell)) {
  throw new Error('The generated document still references an external script or stylesheet.');
}

await writeFile(outputPath, html, 'utf8');
console.log(`Standalone HTML: ${outputPath}`);
console.log(`${Buffer.byteLength(html).toLocaleString()} bytes; ${chunks.length} inline script; ${styles.length} inline stylesheet; no external assets.`);
