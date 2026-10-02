import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BUILD} from '../src/physics.js';
const root=new URL('../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=p=>readFileSync(new URL(p,root));
const reports=['validation-report.json','quark-starship-validation.json','quark-engine-validation.json','quark-standalone-validation.json','quark-rendering-validation.json'].map(file=>{
 const report=JSON.parse(read('data/'+file));assert.equal(report.status,'PASS',file);assert.equal(report.build,BUILD,file);
 return {file:'data/'+file,build:report.build,status:report.status,checks:Array.isArray(report.checks)?report.checks.length:report.checks,sha256:hash(read('data/'+file))};
});
const bundle=read('dist/index.html'),standalone=readFileSync(new URL('../GPT6Astra max 火箭模拟.html',root));assert.equal(hash(bundle),hash(standalone));
function collect(relative){const p=new URL(relative,root);return statSync(p).isDirectory()?readdirSync(p).sort().flatMap(n=>collect(relative+'/'+n)):[relative];}
const files=['src','scripts','data','dist','README.md','index.html','package.json','package-lock.json','vite.config.js','THIRD_PARTY_NOTICES.txt'].flatMap(collect).filter(p=>p!=='data/delivery-manifest.json').map(file=>({file,bytes:statSync(new URL(file,root)).size,sha256:hash(read(file))}));
const manifest={build:BUILD,createdAt:new Date().toISOString(),standalone:{file:'GPT6Astra max 火箭模拟.html',bytes:bundle.length,sha256:hash(bundle),matchesDist:true},reports,totalChecks:reports.reduce((n,r)=>n+r.checks,0),files};
writeFileSync(new URL('data/delivery-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({build:BUILD,checks:manifest.totalChecks,files:files.length,standaloneSHA256:hash(bundle)}));
