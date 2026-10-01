/* Verify the full route at both new speed limits, including body envelope and turns. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('../vendor/three.min.js');
const root=path.resolve(__dirname,'..'),ctx={THREE,window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/world.js'),'utf8'),ctx);const P=ctx.window.Pelagic;
const bounds=[[-4,-.2,1],[4,-.2,1],[0,0,-6.4],[0,0,4.65],[0,-1.57,3.8],[0,1.57,3.8],[0,-.95,-1]],v=new THREE.Vector3(),N=16000,results=[];
for(const speed of [P.speedLimits.min,P.speed,P.speedLimits.max]){
 const state=P.makeFlightState(),previous=P.makeFlightState(),ds=P.length/N,dt=ds/speed;let water=Infinity,terrain=Infinity,maxPose=0,minSpeed=Infinity,maxSpeed=0;
 for(let i=0;i<=N;i++){
   P.flight(i*ds,i*dt,state,speed);assert.ok(new THREE.Vector3(0,0,-1).applyQuaternion(state.quaternion).dot(state.forward)>.999999);
   for(const p of bounds){v.set(...p).applyQuaternion(state.quaternion).add(state.position);water=Math.min(water,v.y-P.maximumWaveHeight);for(const island of P.islands)terrain=Math.min(terrain,v.y-P.islandHeight(island,v.x,v.z));}
   if(i){maxPose=Math.max(maxPose,previous.quaternion.angleTo(state.quaternion));const s=state.position.distanceTo(previous.position)/dt;minSpeed=Math.min(minSpeed,s);maxSpeed=Math.max(maxSpeed,s);}
   previous.position.copy(state.position);previous.quaternion.copy(state.quaternion);
 }
 console.log(JSON.stringify({speed,maxPoseDegrees:maxPose*180/Math.PI,water,terrain}));
 assert.ok(water>7,'Full airframe must clear the worst wave envelope');assert.ok(terrain>20,'Full airframe must clear the islands');assert.ok(maxPose<.04,'No sharp sampled orientation discontinuities');assert.ok(minSpeed>speed-1&&maxSpeed<speed+1,'World speed must match the command');
 const a=P.makeFlightState(),b=P.makeFlightState();P.flight(P.length-.01,1,a,speed);P.flight(.01,1,b,speed);assert.ok(a.position.distanceTo(b.position)<.03);assert.ok(a.quaternion.angleTo(b.quaternion)<.01);
 results.push({commandedSpeed:speed,samples:N+1,lapSeconds:P.length/speed,minimumWaveEnvelopeClearance:water,minimumTerrainClearance:terrain,maximumSampledPoseStepDegrees:maxPose*180/Math.PI,measuredSpeedRange:[minSpeed,maxSpeed],closedSeam:true});
}
const report={testedAt:new Date().toISOString(),routeLengthMeters:P.length,speedLimits:P.speedLimits,cases:results};fs.writeFileSync(path.join(root,'tests/speed-range-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
