import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
await mkdir(new URL('assets/', root), { recursive: true });
const result = await build({
  entryPoints: [new URL('src/app.js', root).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  bundle: true, minify: true, format: 'iife', target: ['es2022'],
  legalComments: 'eof', write: false,
});
const js = result.outputFiles[0].text;
const css = await readFile(new URL('src/style.css', root), 'utf8');
const template = await readFile(new URL('src/template.html', root), 'utf8');
const dependencies = ['three', 'fflate', 'lucide', 'esbuild'];
const notices = [
  'THIRD-PARTY NOTICES',
  '',
  'CIE (2019), Colour-matching functions of CIE 1931 standard colorimetric observer.',
  'DOI: 10.25039/CIE.DS.xvudnb9b',
  'Source: https://files.cie.co.at/CIE_xyz_1931_2deg.csv',
  'License: Creative Commons Attribution-ShareAlike 4.0 International.',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'The original table is unmodified. The blackbody color table is a derived dataset',
  'created by integrating Planck spectra against the CIE data and converting XYZ',
  'to linear sRGB; it is also provided under CC BY-SA 4.0.',
  '',
];
for (const name of dependencies) {
  const pkg = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), 'utf8'));
  const license = name === 'esbuild' ? 'LICENSE.md' : 'LICENSE';
  notices.push(`${name} ${pkg.version}`, await readFile(new URL(`node_modules/${name}/${license}`, root), 'utf8'), '');
}
await writeFile(new URL('THIRD_PARTY_NOTICES.txt', root), notices.join('\n'));
const page = template.replace('/* APP_STYLES */', () => css)
  + `\n<!--\n${notices.join('\n').replace(/-->/g, '-- >')}\n-->\n`;
await writeFile(new URL('assets/app.js', root), js);
await writeFile(new URL('index.html', root), page.replace('<!-- APP_SCRIPT -->', '<script src="./assets/app.js"></script>'));
const standalone = page.replace('<!-- APP_SCRIPT -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(new URL('../BlackHole.html', root), standalone);
console.log(`Built offline project and standalone HTML (${(Buffer.byteLength(standalone) / 1048576).toFixed(2)} MiB).`);
