const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text())});
  const pass=(name,evidence={})=>{checks.push({name,passed:true,...evidence});console.log('PASS',name,JSON.stringify(evidence).slice(0,400));};
  await page.goto(pathToFileURL(process.env.STANDALONE_HTML||path.join(root,'dist/index.html')).href);await page.waitForFunction(()=>window.astra?.ready,null,{timeout:60000});
  const advance=async n=>{while(n>1/240){const step=Math.min(n,10);await page.evaluate(s=>astra.advance(s),step);n-=step;}};
  await advance(55);await page.locator('#engine-panel-toggle').click();
  const physical=()=>page.evaluate(()=>{const s=astra.simulation;return JSON.stringify({t:s.t,q:s.attitude,p:[s.x,s.y,s.z],w:s.angularVelocity,fuel:s.fuel,valves:s.allEngines().map(e=>[e.valve,e.thrust,e.gimbal])});});
  const before=await physical(),gpuBefore=await page.evaluate(()=>astra.gpuEvidence());
  await page.locator('[data-engine-switch="B2"]').click();await page.locator('#attitude-control').uncheck();await page.waitForTimeout(300);
  assert.equal(await physical(),before);assert.deepEqual(await page.evaluate(()=>astra.gpuEvidence()),gpuBefore);pass('Paused engine and attitude commands leave rigid state, fuel and every GPU storage set frozen');
  await advance(1);const cut=await page.evaluate(()=>({engine:astra.simulation.engines.find(e=>e.id==='B2'),commands:astra.simulation.engineCommands,gpu:astra.gpuEvidence()}));
  assert.equal(cut.engine.thrust,0);assert.equal(cut.engine.enabled,false);assert.equal(cut.commands[0].ids[0],'B2');
  const off=await page.evaluate(()=>astra.gpuEvidence());await advance(1);const later=await page.evaluate(()=>astra.gpuEvidence());
  assert.equal(later.fields.plume.emitters.B2.active,0);assert.equal(later.fields.plume.emitters.B2.generations,off.fields.plume.emitters.B2.generations);assert(later.fields.plume.emitters.B1.generations>off.fields.plume.emitters.B1.generations);pass('B2 GPU emission stops and ages out while B1 keeps emitting',{B2:later.fields.plume.emitters.B2,B1:later.fields.plume.emitters.B1});
  await advance(7);await page.evaluate(()=>{astra.scene.autoCamera=false;astra.setCamera('follow');astra.render()});
  const pose=await page.evaluate(()=>{const s=astra.simulation,w=astra.scene;return {q:s.attitude,meshQ:w.rocket.quaternion.toArray(),p:[s.x,s.y,s.z],meshP:w.rocket.position.toArray(),omega:s.angularVelocity,torque:s.torqueEngine,pods:w.enginePods.map(p=>p.quaternion.toArray()),directions:s.engines.map(e=>e.direction)};});
  assert.deepEqual(pose.q,pose.meshQ);assert.deepEqual(pose.p,pose.meshP);assert.equal(pose.pods.length,33);assert(Math.abs(pose.p[2])>1);assert(pose.omega.every(n=>Math.abs(n)>1e-5));pass('Visible body uses the authoritative 3D quaternion and develops three-axis engine-out motion',pose);
  await page.screenshot({path:path.join(root,'data/preview-engine-out.png')});
  await page.locator('[data-engine-switch="B2"]').click();await advance(1);const restored=await page.evaluate(()=>({thrust:astra.simulation.engines.find(e=>e.id==='B2').thrust,visual:astra.scene.cinematic.boosterExhausts[1].power.value}));assert(restored.thrust>100000);assert(restored.visual>.2);pass('Restoring an inhibited engine permits physical spool-up and its own flame',restored);
  await page.locator('#engine-cut-booster').click();await advance(1);const coast=await page.evaluate(()=>({thrust:astra.simulation.thrust,engines:astra.simulation.engines.map(e=>e.thrust),ay:astra.simulation.ay,commands:astra.simulation.engineCommands.length}));assert.equal(coast.thrust,0);assert(coast.engines.every(v=>v===0));assert(coast.ay<0);pass('All booster engine cut removes propulsive acceleration',coast);
  await page.evaluate(()=>astra.reset());await advance(30);
  await page.locator('[data-throttle-manual="booster"]').check();
  const probes=[];
  for(const value of [30,60,90]){
   await page.locator('[data-throttle="booster"]').fill(String(value));await advance(2);
   probes.push(await page.evaluate(()=>({command:astra.simulation.manualThrottle.booster,thrust:astra.simulation.thrust,ay:astra.simulation.ay})));
  }
  assert(probes[0].thrust<probes[1].thrust&&probes[1].thrust<probes[2].thrust);assert(probes[0].ay<0&&probes[2].ay>0);pass('Manual throttle UI changes delivered thrust and net acceleration', {probes});
  await page.evaluate(()=>astra.reset());await page.locator('.engine-schedule summary').click();await page.locator('#engine-altitude').fill('0.5');await page.locator('#engine-schedule-add').click();await advance(40);
  const scheduled=await page.evaluate(()=>astra.simulation.engineCommands.find(e=>e.source==='altitude'));assert(scheduled&&scheduled.altitude>=500&&scheduled.altitude<505);pass('The altitude UI schedules an actual physics-step shutdown',scheduled);
  assert.equal(errors.length,0,errors.join('\n'));pass('No JavaScript, WGSL or WebGPU errors');
  fs.writeFileSync(path.join(root,'data',(process.env.BROWSER_TEST_ID||'quark')+'-engine-validation.json'),JSON.stringify({status:'PASS',build:await page.evaluate(()=>astra.diagnostics().build),browser:await browser.version(),checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

