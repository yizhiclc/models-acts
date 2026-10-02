import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';

// Start Vite before this test. On Windows: BROWSER_CHANNEL=msedge; otherwise
// install Chromium once with `npx playwright install chromium`.
const url=process.env.POND_URL||'http://127.0.0.1:5187';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
const report={date:new Date().toISOString(),url,errors:[],checks:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.__pond?.diagnostics.ready||!document.querySelector('#error').hidden,null,{timeout:60000});
 assert.equal(await page.locator('#error').isVisible(),false,await page.locator('#error-detail').textContent());
 await page.waitForTimeout(2500);
 report.adapter=await page.evaluate(async()=>{const a=(await navigator.gpu.requestAdapter()).info;return {vendor:a.vendor,architecture:a.architecture,description:a.description};});
 const result=await page.evaluate(async()=>{
  const p=__pond,s=p.simulation,N=512,dx=8/N,opts={paused:true,rain:0,wind:0};p.freeze=true;
  const originalMask=s.maskData.slice();s.maskData.set(s.shoreMask);s.device.queue.writeBuffer(s.mask,0,s.maskData);
  const evolve=async(drops,steps)=>{await s.clear();for(const d of drops)s.addDrop(...d);for(let i=0;i<steps;i++)s.step(opts);return s.snapshot();};
  const energy=a=>{let e=0,m=0,finite=true;for(let i=0;i<a.length;i+=2){e+=a[i]*a[i]+.002*a[i+1]*a[i+1];m=Math.max(m,Math.abs(a[i]));finite&&=Number.isFinite(a[i])&&Number.isFinite(a[i+1]);}return {e,max:m,finite};};
  const radius=a=>{let m=0,v=0;for(let z=0;z<N;z++)for(let x=0;x<N;x++){const q=a[(z*N+x)*2]**2,r=Math.hypot((x+.5)*dx,(z+.5)*dx-4);m+=r*q;v+=q;}return m/v;};
  const a=await evolve([[0,0,.004,7]],45),early=energy(a);
  const b=await evolve([[0,0,.004,7]],180),late=energy(b);
  const radial=a=>{let r=0,e=0;for(let z=0;z<N;z++)for(let x=0;x<N;x++){const h=a[(z*N+x)*2],w=h*h;r+=Math.hypot((x+.5)*dx-4,(z+.5)*dx-4)*w;e+=w;}return r/e;};
  const small=await evolve([[0,0,.002,7]],45);
  const aloneA=await evolve([[-.18,0,.004,7]],160),aloneB=await evolve([[.18,0,.003,7]],160),together=await evolve([[-.18,0,.004,7],[.18,0,.003,7]],160);
  let error=0,reference=0;for(let i=0;i<together.length;i+=2){error+=(together[i]-aloneA[i]-aloneB[i])**2;reference+=together[i]**2;}
  const initial=await evolve([[0,0,.004,7]],90);for(let i=0;i<900;i++)s.step(opts);const decayed=await s.snapshot();
  // Insert a reflecting vertical barrier. Its blocked cells must remain exactly
  // zero, and the solution on the source side must differ from open water.
  const open=await evolve([[-.18,0,.004,7]],190);
  for(let z=190;z<322;z++)for(let x=255;x<258;x++)s.maskData[(z*N+x)*2]=1;
  s.device.queue.writeBuffer(s.mask,0,s.maskData);
  const reflected=await evolve([[-.18,0,.004,7]],190);let wallMax=0,diff=0;
  for(let z=190;z<322;z++)for(let x=255;x<258;x++)wallMax=Math.max(wallMax,Math.abs(reflected[(z*N+x)*2]));
  for(let z=210;z<300;z++)for(let x=210;x<254;x++)diff+=(reflected[(z*N+x)*2]-open[(z*N+x)*2])**2;
  s.maskData.set(originalMask);s.device.queue.writeBuffer(s.mask,0,s.maskData);await s.clear();s.encodeSurface();p.freeze=false;
  return {early,late,radiusEarly:radial(a),radiusLate:radial(b),largeSmallAmplitude:early.max/energy(small).max,superpositionRelativeError:Math.sqrt(error/reference),decayEnergyRatio:energy(decayed).e/energy(initial).e,wallMax,reflectedDifference:diff};
 });
 report.physics=result;
 assert.ok(result.early.finite&&result.late.finite);
 assert.ok(result.radiusLate>result.radiusEarly+.1,'Waves must propagate beyond the impact location');
 assert.ok(result.largeSmallAmplitude>5,'Drop momentum must depend strongly on diameter');
 assert.ok(result.superpositionRelativeError<.002,'Independent disturbances must superpose in the same persistent field');
 assert.ok(result.decayEnergyRatio<.2,'Unforced waves must decay');
 assert.equal(result.wallMax,0);assert.ok(result.reflectedDifference>1e-8,'Barrier must alter returning waves');
 report.checks.push('GPU propagation','GPU linear superposition','drop size response','unforced decay','reflecting obstacle');
 await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');
 await page.locator('#drop').click();assert.equal(await page.evaluate(()=>__pond.settings.wind),0);
 for(const view of ['water','leaf','top','overview']){await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(1600);assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed'),'true');}
 await page.locator('#quality').click();await page.waitForTimeout(2500);assert.equal(await page.locator('#quality').getAttribute('aria-pressed'),'true');
 await page.locator('#pause').click();
 await page.locator('#rain').fill('100');await page.locator('#wind').fill('25');
 await page.waitForTimeout(Number(process.env.SOAK_MS||30000));
 report.runtime=await page.evaluate(()=>({diagnostics:__pond.diagnostics,impacts:__pond.simulation.stats,beads:__pond.leafWater.stats,beadCount:__pond.leafWater.count,leaves:__pond.plants.leaves.length,memory:__pond.renderer.info.memory}));
 assert.ok(report.runtime.impacts.waterHits>0&&report.runtime.impacts.leafHits>0);assert.equal(report.runtime.diagnostics.errors.length,0);
 report.checks.push('pause and single-drop controls','all four camera presets','high-quality mode','sustained heavy rain with wind');
 await mkdir('tests/results',{recursive:true});await page.screenshot({path:'tests/results/overview.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);await page.locator('#collapse').click();await page.screenshot({path:'tests/results/mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('mobile viewport');
 await page.setViewportSize({width:1600,height:1000});await page.waitForTimeout(1000);await page.locator('#quality').click();await page.waitForTimeout(1000);assert.equal(await page.locator('#error').isVisible(),false);report.checks.push('window enlargement and quality round trip');
 const fallback=await browser.newPage();await fallback.addInitScript(()=>Object.defineProperty(navigator,'gpu',{get:()=>undefined}));await fallback.goto(url);await fallback.waitForSelector('#error:visible');assert.ok((await fallback.locator('#error-detail').textContent()).includes('WebGPU'));report.checks.push('WebGPU-unavailable message');
 assert.equal(report.errors.length,0,report.errors.join('\n'));
 report.passed=true;console.log(JSON.stringify(report,null,2));
}finally{await mkdir('tests/results',{recursive:true});await writeFile('tests/results/report.json',JSON.stringify(report,null,2));await browser.close();}
