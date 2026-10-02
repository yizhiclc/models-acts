/* Optional end-to-end QA: npm install --no-save playwright, then node tests/browser.cjs.
 * PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE may point at existing local installations.
 * QA_SECONDS defaults to 120 real seconds. This does not change the artwork itself. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,offline:true});
 const page=await context.newPage(),errors=[],externalRequests=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
 const check=(name,data=true)=>{checks.push({name,result:'pass',data});console.log('PASS '+name);};
 const snap=()=>page.evaluate(()=>window.__PELAGIC__.snapshot());
 const advance=(seconds,dt=.10)=>page.evaluate(([s,d])=>window.__PELAGIC__.advance(s,d),[seconds,dt]);
 const setHour=hour=>page.locator('#timeOfDay').evaluate((el,value)=>{el.value=String(Math.round(value*60));el.dispatchEvent(new Event('input',{bubbles:true}));},hour);
 const play=async running=>{if((await snap()).running!==running)await page.locator('#playButton').click();};
 const autoTime=async running=>{if((await snap()).autoTime!==running)await page.locator('#timeAuto').click();};
 await page.goto('file:///'+path.join(root,'掠海长航.html').replaceAll('\\','/'));await page.waitForFunction(()=>!!window.__PELAGIC__);
 await page.waitForTimeout(900);let a=await snap();assert.ok(a.time>=0&&a.distance>=0);assert.ok(a.render.triangles>100000);check('offline file renders without negative first-frame time');
 await play(false);await autoTime(false);a=await snap();await page.waitForTimeout(650);let b=await snap();assert.equal(b.distance,a.distance);assert.equal(b.time,a.time);assert.equal(b.hour,a.hour);check('flight and daylight pause independently');
 await autoTime(true);a=await snap();await page.waitForTimeout(650);b=await snap();assert.ok(b.hour>a.hour);assert.equal(b.distance,a.distance);await autoTime(false);check('daylight continues while flight is paused');
 a=await snap();await setHour(23+59/60);await autoTime(true);b=await advance(2);assert.ok(b.hour<.1);assert.equal(b.distance,a.distance);await autoTime(false);check('24-hour wrap and manual time preserve flight position');
 await setHour(12);await advance(1);a=await snap();await setHour(0);await advance(1);b=await snap();assert.ok(a.sun[1]>.99&&b.moon[1]>.99);assert.ok(a.daylight>.99&&b.daylight<.01);check('sun, moon and daylight track clock');
 await setHour(16.6);await page.locator('[data-weather="1"]').click();a=await snap();assert.ok(a.weather<1);b=await advance(12);assert.ok(b.weather>.98);await page.locator('[data-weather="0"]').click();b=await advance(12);assert.ok(b.weather<.02);check('weather transitions smoothly in both directions');
 const visibleChecks=[];
 for(const mode of ['follow','close','high']){
   await page.locator(`[data-camera="${mode}"]`).click();await advance(7);await play(true);
   for(let i=0;i<36;i++){
    b=await advance(b.routeLength/b.nominalSpeed/36,.10);const [x,y,z]=b.targetNDC;
    assert.ok(Math.abs(x)<.92&&Math.abs(y)<.92&&z>-1&&z<1,mode+' target must remain visible at '+b.progress);
    assert.ok(b.clearance>8);visibleChecks.push({mode,progress:b.progress,x,y});
   }
   await play(false);
 }
 check('continuous following across three full route laps',{samples:visibleChecks.length,maxScreenX:Math.max(...visibleChecks.map(v=>Math.abs(v.x))),maxScreenY:Math.max(...visibleChecks.map(v=>Math.abs(v.y)))});
 await page.locator('[data-camera="low"]').click();await advance(9);a=await snap();await play(true);await advance(8);await play(false);b=await snap();assert.ok(Math.hypot(...b.camera.map((v,i)=>v-a.camera[i]))<.005);assert.ok(b.distance>a.distance);assert.ok(await page.locator('#returnFollow').isVisible());await page.locator('#returnFollow').click();await advance(7);b=await snap();assert.equal(b.mode,'follow');assert.ok(Math.abs(b.targetNDC[0])<.2);check('fixed sea camera permits fly-by and returns to follow');
 a=await snap();await page.mouse.move(770,520);await page.mouse.down();await page.mouse.move(965,640,{steps:12});await page.mouse.up();await advance(4);b=await snap();assert.ok(Math.hypot(...b.camera.map((v,i)=>v-a.camera[i]))>4);await page.mouse.wheel(0,300);await advance(4);check('drag orbit and wheel zoom');
 await page.locator('#restartButton').click();await play(false);b=await snap();assert.ok(b.time<1&&b.distance<b.nominalSpeed);assert.equal(b.mode,'follow');check('restart clears elapsed flight and returns to designed view');
 await page.locator('#speedButton').click();await play(true);a=await snap();b=await advance(2);await play(false);assert.equal(a.rate,1.5);assert.ok(Math.abs((b.distance-a.distance)-a.nominalSpeed*3)<9);check('playback multiplier follows simulated movement');
 assert.equal(await page.locator('#flightSpeed').getAttribute('min'),'80');assert.equal(await page.locator('#flightSpeed').getAttribute('max'),'360');assert.ok((await snap()).routeLength>25000);check('extended route exceeds 25 km and speed control spans 80–360 m/s');
 await page.locator('#flightSpeed').evaluate(el=>{el.value='360';el.dispatchEvent(new Event('input',{bubbles:true}));});await play(true);a=await snap();b=await advance(1);assert.ok(b.speed>a.speed&&b.speed<150);b=await advance(18);assert.ok(Math.abs(b.speed-360)<1);check('actual airspeed accelerates smoothly to the new 360 m/s maximum',{actual:b.speed});
 const highSpeedViews=[];
 for(const mode of ['follow','close']){await page.locator(`[data-camera="${mode}"]`).click();await advance(3);for(let i=0;i<36;i++){b=await advance(b.routeLength/360/36,1/60);assert.ok(Math.abs(b.targetNDC[0])<.92&&Math.abs(b.targetNDC[1])<.92&&b.targetNDC[2]<1,'High-speed target must remain visible');assert.ok(b.clearance>7);highSpeedViews.push(b.targetNDC);}}
 check('360 m/s following stays stable over two full extended-route laps',{samples:highSpeedViews.length,maxScreenX:Math.max(...highSpeedViews.map(v=>Math.abs(v[0]))),maxScreenY:Math.max(...highSpeedViews.map(v=>Math.abs(v[1])))});
 await page.locator('#flightSpeed').evaluate(el=>{el.value='80';el.dispatchEvent(new Event('input',{bubbles:true}));});a=await snap();b=await advance(1);assert.ok(b.speed<a.speed&&b.speed>250);b=await advance(16);assert.ok(Math.abs(b.speed-80)<1);check('actual airspeed decelerates smoothly to the new 80 m/s minimum',{actual:b.speed});
 await page.locator('#engineQuick').click();a=await snap();b=await advance(9);assert.equal(b.engineOn,false);assert.ok(b.speed<a.speed&&b.speed>0);assert.ok(b.thrust<.001);assert.ok(b.temperature>0&&b.temperature<a.temperature);await play(false);a=await snap();await advance(3);b=await snap();assert.equal(b.temperature,a.temperature);assert.equal(b.thrust,a.thrust);check('engine shutdown fades thrust and jet, coasts and cools; pause freezes cooling');
 await page.locator('#engineQuick').click();await page.locator('#flightSpeed').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},b.nominalSpeed);await play(true);b=await advance(18);assert.ok(b.engineOn&&b.thrust>.5&&Math.abs(b.speed-b.nominalSpeed)<1);check('engine restart restores thrust, heat and requested speed');await play(false);
 await page.locator('#view').focus();await page.keyboard.press('Space');assert.equal((await snap()).running,true);await page.keyboard.press('Space');assert.equal((await snap()).running,false);check('keyboard pause and resume');
 await page.locator('#audioButton').click();await page.locator('#audioButton').click();await page.locator('#audioButton').click();b=await snap();assert.equal(b.audio.contexts,1);assert.equal(b.audio.sound,true);await page.locator('#audioButton').click();check('sound reuses one audio context; repeated toggles do not stack graphs');
 await play(true);await page.locator('#directorButton').click();assert.equal((await snap()).director,true);await advance(19);assert.equal((await snap()).mode,'close');await page.mouse.move(800,480);await page.mouse.down();await page.mouse.move(850,500);await page.mouse.up();assert.equal((await snap()).director,false);check('director advances shots and yields to pointer input');
 await page.locator('[data-camera="follow"]').click();await autoTime(true);await page.locator('[data-weather="1"]').click();await advance(15);
 // Warm up every route sector before comparing bounded renderer allocations.
 for(let i=0;i<12;i++)await advance(20);
 const warm=await snap();
 const simulatedStart=performance.now();for(let i=0;i<12;i++)await advance(60);const accelerated=await snap();
 assert.equal(accelerated.render.geometries,warm.render.geometries);assert.equal(accelerated.render.textures,warm.render.textures);assert.equal(accelerated.render.programs,warm.render.programs);
 check('accelerated clock stepping retains bounded GPU resources',{simulatedSeconds:accelerated.time-warm.time,before:warm.render,after:accelerated.render,wallSeconds:(performance.now()-simulatedStart)/1000});
 // Count real requestAnimationFrame intervals independently of the UI's diagnostic FPS.
 await page.evaluate(()=>{window.__qaTiming={frames:0,last:0,intervals:[]};function count(now){const q=window.__qaTiming;if(!q)return;if(q.last)q.intervals.push(now-q.last);q.last=now;q.frames++;requestAnimationFrame(count);}requestAnimationFrame(count);});
 const wallSeconds=Number(process.env.QA_SECONDS)||120,realStart=Date.now(),realSamples=[];
 for(let i=0;i<Math.ceil(wallSeconds/15);i++){await page.waitForTimeout(Math.min(15000,wallSeconds*1000-(Date.now()-realStart)));realSamples.push(await snap());console.log('RUN '+Math.round((Date.now()-realStart)/1000)+'s, resources '+JSON.stringify(realSamples.at(-1).render));if(Date.now()-realStart>=wallSeconds*1000)break;}
 const actualSeconds=(Date.now()-realStart)/1000,final=await snap();
 assert.equal(final.render.geometries,warm.render.geometries);assert.equal(final.render.textures,warm.render.textures);assert.equal(final.render.programs,warm.render.programs);assert.ok(final.distance>accelerated.distance);
 const timing=await page.evaluate(()=>{const q=window.__qaTiming;window.__qaTiming=null;const all=q.intervals,sorted=[...all].sort((a,b)=>a-b);return {frames:q.frames,meanFrameMs:all.reduce((a,b)=>a+b,0)/all.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],firstQuarterMeanMs:all.slice(0,all.length/4).reduce((a,b)=>a+b,0)/Math.floor(all.length/4),lastQuarterMeanMs:all.slice(-Math.floor(all.length/4)).reduce((a,b)=>a+b,0)/Math.floor(all.length/4)};});
 check('real continuous rendering without resource growth',{actualSeconds,timing,before:accelerated.render,after:final.render});
 const gl=await page.evaluate(()=>{const g=document.getElementById('view').getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,offline:true});const mp=await mobile.newPage();await mp.goto('file:///'+path.join(root,'掠海长航.html').replaceAll('\\','/'));await mp.waitForFunction(()=>!!window.__PELAGIC__);await mp.waitForTimeout(800);assert.equal(await mp.locator('#environment').evaluate(el=>el.inert),true);assert.equal(await mp.evaluate(()=>document.body.scrollWidth),390);const mobileState=await mp.evaluate(()=>window.__PELAGIC__.snapshot());assert.ok(Math.abs(mobileState.targetNDC[0])<.2);check('narrow-screen layout keeps controls and target within viewport');
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);check('zero JavaScript/GLSL errors and zero online resource requests');
 const report={testedAt:new Date().toISOString(),browser:browser.version(),renderer:gl,viewport:[1600,1000],singleFileOffline:true,checks,errors,externalRequests,finalSnapshot:final,limits:['Audio graph behavior was checked, not subjective sound quality.','No multi-hour endurance test.','Only installed Chromium and the local GPU were exercised; mobile was viewport emulation.']};
 fs.writeFileSync(path.join(root,'tests/browser-results.json'),JSON.stringify(report,null,2));console.log('REPORT tests/browser-results.json');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
