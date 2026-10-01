import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  entryPoints:[path.join(root,'src/main.js')],bundle:true,format:'iife',platform:'browser',
  target:['chrome100','firefox100','safari16'],minify:true,legalComments:'inline',
  outfile:path.join(root,'dist/inline.js'),write:false,
});
const js=result.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css=result.outputFiles.find(file=>file.path.endsWith('.css')).text;
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace('</head>','<style>'+css+'</style></head>');
html=html.replace('<script type="module" src="/src/main.js"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');
html=html.replace('<!doctype html>','<!doctype html>\n<!-- Standalone offline edition. Three.js MIT licensed. All geometry and textures are generated locally. -->');
const output=path.join(root,'dist/sydney-opera-house.html');
await writeFile(output,html);
console.log('Offline single-file HTML: '+output+' ('+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB)');
