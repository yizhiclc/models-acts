import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({entryPoints:['src/main.js'],bundle:true,format:'iife',target:'es2022',minify:true,write:false,outfile:'app.js',loader:{'.wgsl':'text'},legalComments:'inline'});
const js = result.outputFiles.find(x=>x.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css = result.outputFiles.find(x=>x.path.endsWith('.css'))?.text || '';
const html = (await readFile('index.html','utf8')).replace('</head>',`<style>${css}</style></head>`).replace('<script type="module" src="/src/main.js"></script>',()=>`<script>${js}</script>`);
await writeFile('dist/fountain-single.html',html);
await writeFile('../fountain-single.html',html);
console.log(`Self-contained HTML: ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MiB; all JavaScript, shaders and CSS embedded.`);
