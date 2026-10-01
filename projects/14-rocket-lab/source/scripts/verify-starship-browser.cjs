// Optional dependency: Playwright; run against the built standalone file.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {nominal,event,advanceTo}=require('./browser-flight.cjs'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1800,height:1120}}),errors=[],external=[],checks=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  const pass=(name,evidence={})=>{checks.push({name,passed:true,...evidence});console.log('PASS',name,JSON.stringify(evidence).slice(0,500));};
  await page.goto(pathToFileURL(process.env.STANDALONE_HTML||path.join(root,'dist/index.html')).href);await page.waitForFunction(()=>window.astra?.ready,null,{timeout:60000});
  await page.evaluate(()=>{astra.scene.controls.enableDamping=false;astra.scene.autoCamera=false;});
  const shot=async(name,mode)=>{await page.evaluate(mode=>{if(mode)astra.setCamera(mode);astra.render();},mode);await page.waitForTimeout(80);await page.screenshot({path:path.join(root,'data','preview-'+name+'.png')});};
  assert.equal(await page.evaluate(()=>astra.scene.renderer.backend.isWebGPUBackend),true);
  const engines=await page.evaluate(()=>({booster:astra.scene.enginePods.length,ship:astra.scene.upperEnginePods.length,fixed:astra.simulation.engines.filter(e=>!e.gimbalLimit).length}));assert.deepEqual(engines,{booster:33,ship:6,fixed:20});pass('Single-file WebGPU initialization; 33 booster and 6 ship engines with 20 fixed outer nozzles',engines);
  await shot('standby','launch');await shot('pad','pad');await shot('range','range');
  await page.evaluate(()=>{
   window.capturePixels=async()=>{
    const w=astra.scene,r=w.renderer,d=r.backend.device;w.render(astra.simulation);const tex=r.backend.getContext().getCurrentTexture(),width=r.domElement.width,height=r.domElement.height,stride=Math.ceil(width*4/256)*256;
    const buffer=d.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=d.createCommandEncoder();encoder.copyTextureToBuffer({texture:tex},{buffer,bytesPerRow:stride},{width,height});d.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);const pixels=new Uint8Array(buffer.getMappedRange()).slice();buffer.unmap();buffer.destroy();return {pixels,width,height,stride};
   };
   window.pixelDifference=(a,b)=>{let changed=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const at=y*a.stride+x*4;if(Math.max(...[0,1,2].map(k=>Math.abs(a.pixels[at+k]-b.pixels[at+k])))>15)changed++;}return changed;};
  });
  const thermal=async(label)=>{
   await page.evaluate(()=>{astra.setCamera('inspect');astra.render();});await page.waitForTimeout(100);
   const frozen=await page.evaluate(async()=>({state:JSON.stringify(astra.simulation.snapshot()),gpu:await astra.gpuEvidence()}));
   await page.evaluate(async()=>{window.beforeHeat=await capturePixels();});await page.locator('#heat-toggle').click();await page.waitForTimeout(100);
   const result=await page.evaluate(async()=>({changedPixels:pixelDifference(beforeHeat,await capturePixels()),surface:astra.scene.thermal.metadata()}));assert(result.changedPixels>500);assert(result.surface.enabled);
   await shot('thermal-'+label+'-on');await page.locator('#heat-toggle').click();await page.waitForTimeout(100);
   assert.equal(await page.evaluate(async()=>pixelDifference(beforeHeat,await capturePixels())),0);
   assert.deepEqual(await page.evaluate(async()=>({state:JSON.stringify(astra.simulation.snapshot()),gpu:await astra.gpuEvidence()})),frozen);
   pass('Visible, reversible heat-flux coloring with frozen CPU and GPU during '+label,result);
  };
  await thermal('standby');await advanceTo(page,9);await shot('ignition','launch');
  const ignition=await page.evaluate(()=>astra.gpuEvidence());assert(ignition.fields.plume.active>1000);assert(ignition.fields.steam.active>1000);assert(ignition.fields.dust.generationTotal>0);pass('Deluge, engine exhaust and ground dust have separately populated GPU state',{active:Object.fromEntries(Object.entries(ignition.fields).map(([n,f])=>[n,f.active]))});
  const stats=name=>page.evaluate(async name=>{
   const w=astra.scene,f=w.effects.fields[name],u=w.effects.u,upper=name==='upperPlume',n=upper?6:33,prefix=upper?'ship':'engine',body=upper?astra.simulation.upper:astra.simulation;
   const positions=new Float32Array(await w.renderer.getArrayBufferAsync(f.position.value)),states=new Float32Array(await w.renderer.getArrayBufferAsync(f.state.value)),stride=positions.length/f.count;
   let active=0,ahead=0,sum=0,samples=0;const lengths=[];
   for(let i=0;i<f.count;i++)if(states[i*4+3]>.5){const e=i%n,nozzle=u[prefix+'Nozzle'].array[e],dir=u[prefix+'Direction'].array[e],delta=nozzle.clone().set(positions[i*stride]-nozzle.x,positions[i*stride+1]-nozzle.y,positions[i*stride+2]-nozzle.z),axial=delta.dot(dir);active++;if(axial< -2)ahead++;lengths.push(axial);if(axial>35&&axial<80){sum+=Math.sqrt(Math.max(0,delta.lengthSq()-axial*axial));samples++;}}
   lengths.sort((a,b)=>a-b);return {active,ahead,fractionAhead:ahead/Math.max(1,active),radialMean:sum/Math.max(1,samples),radialSamples:samples,downstreamP95:lengths[Math.floor(lengths.length*.95)],stride,altitude:body.altitude,pressure:body.pressure,halfAngle:body.exhaust.halfAngle};
  },name);
  await advanceTo(page,30);await shot('long-plume','follow');const low=await stats('plume');assert(low.active>30000);assert(low.downstreamP95>250);assert(low.fractionAhead<.005);pass('Long persistent exhaust spans over two representative stack lengths',low);
  const mach=await page.evaluate(async()=>{
   const w=astra.scene,ex=w.cinematic.boosterExhausts,updates=ex.map(e=>e.update);ex.forEach(e=>e.update=()=>{});await new Promise(r=>setTimeout(r,100));const before=await capturePixels(),cells=ex.reduce((n,e)=>n+e.cells.filter(c=>c.visible).length,0);
   ex.forEach(e=>{e.contrast.value=0;e.cells.forEach(c=>c.visible=false);});await new Promise(r=>setTimeout(r,100));const changedPixels=pixelDifference(before,await capturePixels());ex.forEach((e,i)=>e.update=updates[i]);w.cinematic.update(astra.simulation);await new Promise(r=>setTimeout(r,100));return {cells,changedPixels,restoredDifference:pixelDifference(before,await capturePixels())};
  });assert(mach.cells>=100);assert(mach.changedPixels>100);assert.equal(mach.restoredDifference,0);pass('Mach cells change actual rendered pixels and restore exactly',mach);
  await thermal('ascent');await advanceTo(page,130);await shot('vacuum-expansion','follow');const high=await stats('plume');assert(high.altitude>50000);assert(high.radialMean>low.radialMean*2);assert(high.fractionAhead<.005);pass('GPU plume widens with falling pressure at high altitude',{low,high});
  const joint=await page.evaluate(()=>{const w=astra.scene;w.scene.updateMatrixWorld(true);w.interstageShell.geometry.computeBoundingBox();w.payloadShell.geometry.computeBoundingBox();const a=w.camera.position.clone().set(0,w.interstageShell.geometry.boundingBox.max.y,0),b=w.camera.position.clone().set(0,w.payloadShell.geometry.boundingBox.min.y,0);w.interstageShell.localToWorld(a);w.payloadShell.localToWorld(b);return {gap:a.distanceTo(b),tilt:astra.simulation.tilt,altitude:astra.simulation.altitude};});assert(joint.gap<1e-5);pass('Attached stage geometry remains connected during gravity-turn ascent',joint);
  await advanceTo(page,event('separation').t+.5);assert.equal(await page.evaluate(()=>astra.simulation.upper.thrust),0);
  await advanceTo(page,event('upper-ignition').t+2);await shot('powered-separation','separation');
  await advanceTo(page,event('upper-ignition').t+10);await shot('upper-powered','upper');const upper=await stats('upperPlume');assert(upper.active>5000);assert(upper.fractionAhead<.005);
  const ship=await page.evaluate(()=>({thrust:astra.simulation.upper.thrust,fuelUsed:astra.simulation.ledger.upperMain,q:astra.simulation.upper.attitude,meshQ:astra.scene.payloadGroup.quaternion.toArray(),active:astra.simulation.upperEngines.filter(e=>e.thrust>1).length,gpu:astra.gpuEvidence()}));assert.equal(ship.active,6);assert(ship.thrust>1e7);assert.deepEqual(ship.q,ship.meshQ);pass('Six upper engines ignite after separation; the visible ship uses integrated quaternion',{upper,thrust:ship.thrust,fuelUsed:ship.fuelUsed,active:ship.active});
  const frozen=await page.evaluate(async()=>({state:JSON.stringify(astra.simulation.snapshot()),gpu:await astra.gpuEvidence()}));await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(async()=>({state:JSON.stringify(astra.simulation.snapshot()),gpu:await astra.gpuEvidence()})),frozen);pass('Pause freezes both rigid bodies and all seven compute storage sets');
  await advanceTo(page,event('entry-ignition').t+2);await shot('reentry','entry');await thermal('entry');const reentry=await page.evaluate(()=>astra.gpuEvidence());assert(reentry.fields.reentry.active>100);pass('Heat-driven reentry field evolves on the GPU',{active:reentry.fields.reentry.active});
  await advanceTo(page,nominal.touchdown.t-2);await shot('catch-approach','landing');await advanceTo(page,nominal.touchdown.t+.7);await shot('landed','landing');
  const landed=await page.evaluate(async()=>({phase:astra.simulation.phase,td:astra.simulation.touchdown,gpu:await astra.gpuEvidence()}));assert.equal(landed.phase,'LANDED');assert(Math.abs(landed.td.vy-nominal.touchdown.vy)<1e-7);assert.equal(landed.gpu.fields.explosion.generationTotal,0);assert.equal(landed.gpu.fields.upperExplosion.generationTotal,0);pass('The full browser-integrated mission reaches a successful tower capture without explosion',{phase:landed.phase,t:landed.td.t,vy:landed.td.vy,stroke:landed.td.strokeRequired});
  // Separate flight: upper-engine UI controls are independent of the booster.
  await page.evaluate(()=>astra.reset());await advanceTo(page,175);await page.locator('#engine-panel-toggle').click();await page.locator('[data-select-group="ship"]').click();await page.locator('#engine-cut').click();await advanceTo(page,177);
  const off=await page.evaluate(async()=>({ship:astra.simulation.upper.thrust,booster:astra.simulation.engines.map(e=>e.enabled),gpu:await astra.gpuEvidence(),commands:astra.simulation.engineCommands}));assert.equal(off.ship,0);assert(off.booster.every(Boolean));assert.equal(off.gpu.fields.upperPlume.active,0);assert.equal(off.commands[0].ids.length,6);pass('The six-ship-engine group can be shut down through the UI without inhibiting the booster',{commands:off.commands,upperPlumeActive:off.gpu.fields.upperPlume.active});await page.locator('#engine-close').click();
  await advanceTo(page,628);const impact=await page.evaluate(async()=>({td:astra.simulation.upper.touchdown,fuel:astra.simulation.fuel.upper,gpu:await astra.gpuEvidence()}));assert(impact.td);assert.equal(impact.fuel,0);assert(impact.gpu.fields.upperExplosion.active>1000);assert.equal(impact.gpu.fields.explosion.generationTotal,0);pass('Independent ship collision triggers its own energy-scaled GPU explosion and empties its own tank',{time:impact.td.t,energy:impact.td.explosionEnergy,radius:impact.td.blastRadius,active:impact.gpu.fields.upperExplosion.active});
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0);pass('No JavaScript, WGSL, WebGPU errors or external network requests');
  fs.writeFileSync(path.join(root,'data',(process.env.BROWSER_TEST_ID||'browser')+'-starship-validation.json'),JSON.stringify({status:'PASS',build:await page.evaluate(()=>astra.diagnostics().build),browser:await browser.version(),origin:'file://',customBrowserFlags:[],checks,errors,external},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
