import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
const html = new URL('../dist/index.html', import.meta.url);
const license = readFileSync(new URL('../node_modules/three/LICENSE', import.meta.url), 'utf8');
writeFileSync(html, readFileSync(html, 'utf8').replace('</head>', `<!-- Third-party notice: Three.js and OrbitControls\n${license}\n-->\n</head>`));
copyFileSync(new URL('../dist/index.html', import.meta.url), new URL('../../GPT6Astra max 火箭模拟.html', import.meta.url));
console.log('Standalone HTML: outputs/GPT6Astra max 火箭模拟.html');
