// Optional test dependency: npm install --no-save playwright@1.62.1
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'work','rendering-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const url=pathToFileURL(process.env.STANDALONE_HTML||path.join(root,'dist','index.html')).href,checks=[],errors=[];let testedBuild;
 const pass=(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS',name);};
 for(const [width,height,dpr] of [[2559,1232,1],[1536,960,1.25],[1280,800,2]]){
  const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
  p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await p.goto(url);await p.waitForFunction(()=>window.astra?.ready,{},{timeout:45000});
  const health=await p.evaluate(()=>astra.diagnostics());testedBuild=health.build;assert(health.renderHealth.validated);assert(health.renderHealth.luminanceRange>=12);
  await p.locator('#immersive').click();await p.keyboard.press('Escape');await p.evaluate(()=>astra.advance(9));
  const gpu=await p.evaluate(()=>astra.gpuEvidence());assert(gpu.fields.plume.active>100);assert(gpu.fields.steam.active>100);
  await p.screenshot({path:path.join(output,`ignition-dpr-${dpr}.png`)});
  pass(`Visible first frame, ignition and resize at ${width} x ${height}, DPR ${dpr}`,{health});await p.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 // Simulate the original silent-blank failure: accepted GPU API, no submitted draws.
 const blank=await browser.newPage();await blank.addInitScript(()=>{GPUQueue.prototype.submit=function(){};});
 await blank.goto(url);await blank.waitForSelector('#render-diagnostics',{timeout:45000});
 assert.equal(await blank.evaluate(()=>astraDiagnostics().ready),false);assert(await blank.locator('#toggle').isDisabled());
 assert((await blank.locator('#gpu-status').innerText()).includes('RENDER FAILED'));
 const download=blank.waitForEvent('download');await blank.locator('#render-diagnostics').click();const d=await download;await d.saveAs(path.join(output,'blank-diagnostics.json'));
 const diagnostic=JSON.parse(fs.readFileSync(path.join(output,'blank-diagnostics.json'),'utf8'));assert(diagnostic.error.includes('首帧没有绘出场景'));
 pass('A silent blank canvas cannot be advertised as ONLINE; controls are disabled and diagnosis can be downloaded');await blank.close();
 // Real WebGPU validation event after startup must stop physics and show a persistent error.
 const fault=await browser.newPage();await fault.goto(url);await fault.waitForFunction(()=>window.astra?.ready,{},{timeout:45000});
 await fault.evaluate(()=>{astra.start();astra.scene.renderer.backend.device.createBuffer({size:4,usage:0});});
 await fault.waitForSelector('#render-diagnostics');assert.equal(await fault.evaluate(()=>astra.ready),false);
 const before=await fault.evaluate(()=>astra.simulation.snapshot());await fault.waitForTimeout(180);assert.deepEqual(await fault.evaluate(()=>astra.simulation.snapshot()),before);
 pass('A runtime GPU validation failure freezes the simulation and leaves a persistent visible error');await fault.close();
 fs.writeFileSync(path.join(root,'data',(process.env.BROWSER_TEST_ID||'browser')+'-rendering-validation.json'),JSON.stringify({status:'PASS',build:testedBuild,browser:await browser.version(),customBrowserFlags:[],url,checks,normalRunErrors:errors,faultInjection:'The last two tests intentionally suppress queue submission / create an invalid GPU buffer.'},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
