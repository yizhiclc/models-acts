/* Temporal regression of the actual FFT implementation, including buffer swaps,
 * high-speed world sampling, skipped frames, pause, and restart. No dependencies. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),THREE=require('../vendor/three.min.js');
const ctx={THREE,window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'src/world.js'),'utf8'),ctx);ctx.Pelagic=ctx.window.Pelagic;
vm.runInContext(fs.readFileSync(path.join(root,'src/spectrum.js'),'utf8'),ctx);
const P=ctx.Pelagic,sea=new P.OceanSpectrum();
P.setWindSampler((x,z)=>sea.heightAt(x,z));
const frameBytes=frame=>Buffer.from(frame.data);
const originalA=frameBytes(sea.a),originalB=frameBytes(sea.b);
const points=Array.from({length:24},(_,i)=>[i*73.31-563.7,i*37.17-429.1]);
let maxBoundaryJump=0,maxFixedPointStep=0,maxFastPathStep=0,sumStep=0,sampleCount=0;
const dt=1/120,duration=8,fastSpeed=P.speedLimits.max;
let previousFixed=null,previousFast=null;
for(let step=0;step<=duration/dt;step++){
  const t=step*dt;sea.update(t,0);
  const fixed=points.map(([x,z])=>P.waveHeight(x,z,t));
  const fast=points.map(([x,z])=>P.waveHeight(x,z-fastSpeed*t,t));
  for(let i=0;i<points.length;i++){
    assert.ok(Number.isFinite(fixed[i]));
    if(previousFixed){const d=Math.abs(fixed[i]-previousFixed[i]);maxFixedPointStep=Math.max(maxFixedPointStep,d);sumStep+=d*d;sampleCount++;maxFastPathStep=Math.max(maxFastPathStep,Math.abs(fast[i]-previousFast[i]));}
  }
  previousFixed=fixed;previousFast=fast;
}
// Check both sides of each swap to detect phase resets or texture discontinuities.
for(let i=1;i<=120;i++){
  const t=10+i*sea.interval,eps=1e-7;sea.update(t-eps,0);
  const before=points.map(([x,z])=>sea.heightAt(x,z));sea.update(t+eps,0);
  points.forEach(([x,z],j)=>{maxBoundaryJump=Math.max(maxBoundaryJump,Math.abs(sea.heightAt(x,z)-before[j]));});
}
assert.ok(maxBoundaryJump<.00001,'FFT frame boundaries must preserve wave phase');
assert.ok(maxFixedPointStep<.08,'A stationary sample must evolve continuously at 120 Hz');
assert.ok(maxFastPathStep<1,'High-speed sampling must not generate unbounded wave spikes');
// A pause cannot advance the buffers, blend factor, or persistent foam.
sea.update(15.271,1);const pausedA=frameBytes(sea.a),pausedB=frameBytes(sea.b),pausedBlend=sea.blend;
for(let i=0;i<60;i++)sea.update(15.271,1);
assert.deepEqual(frameBytes(sea.a),pausedA);assert.deepEqual(frameBytes(sea.b),pausedB);assert.equal(sea.blend,pausedBlend);
// A long frame should return to the analytic phase, without advancing by repeated dt.
sea.update(53.218,0);const skipped=points.map(([x,z])=>sea.heightAt(x,z));const reference=new P.OceanSpectrum();reference.update(53.218,0);
points.forEach(([x,z],i)=>assert.ok(Math.abs(skipped[i]-reference.heightAt(x,z))<1e-7));
sea.update(0,0);assert.deepEqual(frameBytes(sea.a),originalA);assert.deepEqual(frameBytes(sea.b),originalB);
assert.equal(sea.a.texture.generateMipmaps,true);assert.equal(sea.a.texture.minFilter,THREE.LinearMipmapLinearFilter);
const result={testedAt:new Date().toISOString(),simulationSeconds:duration,samplingHz:120,worldPoints:points.length,highestPathSpeed:fastSpeed,maximumFixedPointHeightStepMeters:maxFixedPointStep,rmsFixedPointHeightStepMeters:Math.sqrt(sumStep/sampleCount),maximumFastPathHeightStepMeters:maxFastPathStep,fftBoundariesChecked:120,maximumHeightJumpAcrossTwoTenthsMicrosecond:maxBoundaryJump,pauseBuffersUnchanged:true,skippedFrameMatchesAnalyticPhase:true,restartReproducesInitialTextures:true,mipmappedMinification:true};
sea.dispose();reference.dispose();fs.writeFileSync(path.join(root,'tests/ocean-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
