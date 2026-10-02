/* Actual GPU displacement continuity while the sampling mesh follows the camera.
 * An independent fixed overhead camera reads world-space heights, so ordinary
 * parallax and moving highlights cannot hide a popping mesh. Optional Playwright. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:256,height:256},offline:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const code=['vendor/three.min.js','src/world.js','src/spectrum.js','src/vegetation.js','src/environment.js'].map(f=>'<script>'+fs.readFileSync(path.join(root,f),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>').join('');
    await page.setContent('<!doctype html><html><body>'+code+'</body></html>');
    const result=await page.evaluate(()=>{
      const T=THREE,P=Pelagic,renderer=new T.WebGLRenderer();renderer.setSize(128,128);renderer.toneMapping=T.NoToneMapping;
      const scene=new T.Scene();scene.fog=new T.FogExp2();const env=P.createEnvironment(scene,renderer);
      scene.children.forEach(o=>o.visible=o===env.ocean);
      const old=env.ocean.material;
      env.ocean.material=new T.ShaderMaterial({uniforms:old.uniforms,vertexShader:old.vertexShader,fragmentShader:'varying float vHeight;void main(){gl_FragColor=vec4(vHeight,0.,0.,1.);}'});
      const target=new T.WebGLRenderTarget(128,128,{type:T.FloatType,format:T.RGBAFormat,depthBuffer:false});
      const probe=new T.OrthographicCamera(-24,24,24,-24,1,500),moving={position:new T.Vector3(0,18,0)},flight=P.makeFlightState();P.flight(0,4,flight);
      const reports=[];
      for(const radius of [90,260,520]){
        probe.position.set(radius,200,0);probe.up.set(0,0,-1);probe.lookAt(radius,0,0);probe.updateMatrixWorld();
        const measure=snapped=>{
          let previous=null,maxStep=0,total=0,samples=0;
          for(let frame=0;frame<=120;frame++){
            const x=frame*.02;moving.position.x=x;env.update(4,16.5,0,moving,flight,0);
            if(snapped)env.ocean.material.uniforms.uOrigin.value.x=Math.floor(x/2)*2;
            renderer.setRenderTarget(target);renderer.render(scene,probe);
            const pixels=new Float32Array(128*128*4);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);
            for(let i=0;i<pixels.length;i+=4){if(!Number.isFinite(pixels[i]))throw new Error('Invalid displacement');if(previous){const d=Math.abs(pixels[i]-previous[i]);maxStep=Math.max(maxStep,d);total+=d*d;samples++;}}
            previous=pixels;
          }
          return {maximumHeightStepMeters:maxStep,rmsHeightStepMeters:Math.sqrt(total/samples)};
        };
        const continuous=measure(false),snappedControl=measure(true);reports.push({radius,continuous,snappedControl,maximumJumpReduction:snappedControl.maximumHeightStepMeters/Math.max(1e-8,continuous.maximumHeightStepMeters)});
      }
      target.dispose();env.dispose();renderer.dispose();return {meshMotionStepMeters:.02,framesPerCase:121,worldSamplesPerFrame:16384,frozenWaveTime:4,renderedActualOceanVertexShader:true,cases:reports};
    });
    assert.deepEqual(errors,[]);
    for(const c of result.cases){assert.ok(c.continuous.maximumHeightStepMeters<.012,'Continuous mesh must not introduce a height pop');assert.ok(c.continuous.maximumHeightStepMeters<c.snappedControl.maximumHeightStepMeters*.25,'Continuous origin must eliminate most of the snapped-grid jump');}
    result.errors=errors;result.testedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'tests/ocean-render-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
