/* Focused regression for island vegetation. Uses an installed Playwright/Chromium.
 * Checks actual terrain triangles, foliage wind/pause, offline loading and GPU resources. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
 const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,offline:true}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto('file:///'+path.join(root,'掠海长航.html').replaceAll('\\','/'));await page.waitForFunction(()=>!!window.__PELAGIC__);await page.locator('#quality').selectOption('high');await page.locator('#timeAuto').click();
 await page.locator('#flightSpeed').evaluate(el=>{el.value='360';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.evaluate(()=>__PELAGIC__.advance(25,.1));
 let maximumSpeedSamples=0;const length=(await page.evaluate(()=>__PELAGIC__.snapshot())).routeLength;
 for(const mode of ['follow','close']){await page.locator(`[data-camera="${mode}"]`).click();await page.evaluate(()=>__PELAGIC__.advance(3,.1));for(let i=0;i<24;i++){const s=await page.evaluate(t=>__PELAGIC__.advance(t,1/60),length/360/24);assert.ok(s.speed>359&&s.speed<=360);assert.ok(Math.abs(s.targetNDC[0])<.92&&Math.abs(s.targetNDC[1])<.92);assert.ok(s.clearance>7);maximumSpeedSamples++;}}
 await page.locator('#flightSpeed').evaluate(el=>{el.value='106';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.evaluate(()=>__PELAGIC__.advance(24,.1));
 for(const mode of ['follow','close','high','low']){await page.locator(`[data-camera="${mode}"]`).click();await page.evaluate(()=>__PELAGIC__.advance(18,.1));}
 await page.locator('[data-camera="follow"]').click();await page.locator('[data-weather="1"]').click();await page.evaluate(()=>__PELAGIC__.advance(20,.1));
 await page.locator('#timeOfDay').evaluate(el=>{el.value=30;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.evaluate(()=>__PELAGIC__.advance(8,.1));
 await page.locator('#timeOfDay').evaluate(el=>{el.value=900;el.dispatchEvent(new Event('input',{bubbles:true}));});
 // Warm all route sectors; grass and shrubs are culled beyond their fade distances.
 for(let i=0;i<16;i++)await page.evaluate(()=>__PELAGIC__.advance(10,.1));
 const warm=await page.evaluate(()=>__PELAGIC__.snapshot());
 for(let i=0;i<36;i++)await page.evaluate(()=>__PELAGIC__.advance(12,.1));
 const stepped=await page.evaluate(()=>__PELAGIC__.snapshot());
 for(const k of ['geometries','textures','programs'])assert.equal(stepped.render[k],warm.render[k],k+' must remain bounded');
 await page.evaluate(()=>{window.qaIntervals=[];window.qaLast=0;function tick(t){if(!window.qaIntervals)return;if(window.qaLast)qaIntervals.push(t-qaLast);qaLast=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 await page.waitForTimeout(30000);const final=await page.evaluate(()=>__PELAGIC__.snapshot());
 const timing=await page.evaluate(()=>{const a=qaIntervals;window.qaIntervals=null;const b=[...a].sort((x,y)=>x-y);return {frames:a.length,meanIntervalMs:a.reduce((x,y)=>x+y,0)/a.length,p95IntervalMs:b[Math.floor(b.length*.95)]};});
 for(const k of ['geometries','textures','programs'])assert.equal(final.render[k],warm.render[k]);assert.equal(final.render.pixelRatio,1);
 const integration={offline:true,routeLengthMeters:length,maximumSpeed:360,maximumSpeedSamples,viewport:[1600,1000],quality:'high',pixelRatio:1,realSeconds:30,steppedFlightSeconds:stepped.time-warm.time,before:warm.render,after:final.render,timing};
 // New document disposes the application before building an isolated inspection scene.
 await page.goto('about:blank');
 const sources=['vendor/three.min.js','src/world.js','src/spectrum.js','src/vegetation.js','src/environment.js'];
 await page.setContent(sources.map(f=>'<script>'+fs.readFileSync(path.join(root,f),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>').join(''));
 const isolated=await page.evaluate(()=>{
   const P=Pelagic,T=THREE,r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(640,400);r.toneMapping=T.ACESFilmicToneMapping;r.outputColorSpace=T.SRGBColorSpace;
   const scene=new T.Scene();scene.fog=new T.FogExp2();const env=P.createEnvironment(scene,r),cam=new T.PerspectiveCamera(48,1.6,.2,29000),flight=P.makeFlightState();
   scene.updateMatrixWorld(true);const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),origin=new T.Vector3();let checked=0,minEmbed=Infinity,maxEmbed=-Infinity,minRoot=Infinity;
   for(const plan of env.vegetation.plans){
     const terrain=env.land.children.find(m=>m.name===plan.island.name);
     for(const list of [plan.plants,plan.shrubs,plan.grass]){
       for(const p of list)minRoot=Math.min(minRoot,p.y);
       for(let i=0;i<Math.min(14,list.length);i++){
         const p=list[Math.floor(i*list.length/14)];origin.set(p.x,p.y+45,p.z);ray.set(origin,down);const hit=ray.intersectObject(terrain,false)[0];if(!hit)throw new Error('Plant outside rendered island');
         const embed=hit.point.y-p.y;minEmbed=Math.min(minEmbed,embed);maxEmbed=Math.max(maxEmbed,embed);checked++;
       }
     }
   }
   const plan=env.vegetation.plans[0],p=plan.plants.find(p=>p.type===0&&p.y>25&&p.y<75&&p.slope<.38);cam.position.set(p.x+19,p.y+11,p.z+24);cam.position.y=Math.max(cam.position.y,P.islandGround(plan.island,cam.position.x,cam.position.z)+6);cam.lookAt(p.x,p.y+9,p.z);flight.position.set(p.x,p.y+9,p.z);flight.forward.set(0,0,-1);env.update(5,15.2,0,cam,flight,0);
   // Keep lights and only vegetation so the pixel change measures wind, not sea or clouds.
   scene.children.forEach(o=>{o.visible=o.isLight||o===env.vegetation.group;});
   const gl=r.getContext(),read=()=>{r.render(scene,cam);const a=new Uint8Array(640*400*4);gl.readPixels(0,0,640,400,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
   const a=read(),b=read();env.uniforms.uTime.value=5.25;const c=read();let frozen=0,moving=0;
   for(let i=0;i<a.length;i+=4){if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>1)frozen++;if(Math.max(Math.abs(a[i]-c[i]),Math.abs(a[i+1]-c[i+1]),Math.abs(a[i+2]-c[i+2]))>2)moving++;}
   const stats=env.vegetation.stats;env.dispose();r.dispose();return {stats,terrainRaycasts:checked,rootEmbedMeters:[minEmbed,maxEmbed],minimumPlantRootHeight:minRoot,frozenFramesChangedPixels:frozen,windChangedPixels:moving,windTestViewport:[640,400],windIntervalSeconds:.25};
 });
 assert.ok(isolated.rootEmbedMeters[0]>.09&&isolated.rootEmbedMeters[1]<.49,'Roots must meet the actual terrain');assert.ok(isolated.minimumPlantRootHeight>3.85,'Plants cannot grow underwater');assert.equal(isolated.frozenFramesChangedPixels,0);assert.ok(isolated.windChangedPixels>100,'Foliage should move subtly in the wind');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={testedAt:new Date().toISOString(),browser:browser.version(),vegetationSourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/vegetation.js'))).digest('hex'),integration,isolated,errors,externalRequests:requests,limits:['30-second actual rendering, not a multi-hour endurance test.','Only local Chromium and GPU tested; no physical phone benchmark.','Frame intervals are browser scheduling times, not GPU timing queries.']};
 fs.writeFileSync(path.join(root,'tests/vegetation-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
