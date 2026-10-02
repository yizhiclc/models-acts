/* Deterministic route/pose safety checks. Run with Node, no npm install. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),THREE=require('../vendor/three.min.js');
const context={THREE,window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'src/world.js'),'utf8'),context);
const P=context.window.Pelagic,s=P.makeFlightState(),prev=P.makeFlightState(),start=P.makeFlightState();
let minimumWater=Infinity,minimumTerrain=Infinity,conservativeWater=Infinity,shoreMargin=Infinity,maxBank=0,maxPoseDelta=0,minSpeed=Infinity,maxSpeed=0;
const bounds=[[-4.0,-.2,1.0],[4.0,-.2,1.0],[0,0,-6.4],[0,0,4.65],[0,-1.57,3.8],[0,1.57,3.8],[0,-.95,-1],[0,-.55,-3],[0,-.55,2]];
const v=new THREE.Vector3();const N=12000,ds=P.length/N,dt=ds/P.speed;
P.flight(0,0,start);
for(let i=0;i<=N;i++){
  P.flight(i*ds,i*dt,s);assert.ok(s.position.toArray().every(Number.isFinite));
  const modelForward=new THREE.Vector3(0,0,-1).applyQuaternion(s.quaternion);
  assert.ok(modelForward.dot(s.forward)>.999999,'Body axis must agree with velocity');
  for(const b of bounds){v.set(...b).applyQuaternion(s.quaternion).add(s.position);minimumWater=Math.min(minimumWater,v.y-P.waveHeight(v.x,v.z,i*dt));conservativeWater=Math.min(conservativeWater,v.y-P.maximumWaveHeight);for(const island of P.islands){minimumTerrain=Math.min(minimumTerrain,v.y-P.islandHeight(island,v.x,v.z));const c=Math.cos(island.angle),ss=Math.sin(island.angle),dx=v.x-island.x,dz=v.z-island.z,nx=(dx*c+dz*ss)/island.rx,nz=(-dx*ss+dz*c)/island.rz,a=Math.atan2(nz,nx),edge=.87+.07*Math.sin(a*3+island.seed)+.045*Math.sin(a*7+2)+.018*Math.sin(a*13);shoreMargin=Math.min(shoreMargin,(Math.hypot(nx,nz)-edge)*Math.min(island.rx,island.rz)/2.05);}}
  maxBank=Math.max(maxBank,Math.abs(s.bank));
  if(i){maxPoseDelta=Math.max(maxPoseDelta,prev.quaternion.angleTo(s.quaternion));const velocity=s.position.distanceTo(prev.position)/dt;minSpeed=Math.min(minSpeed,velocity);maxSpeed=Math.max(maxSpeed,velocity);}
  prev.position.copy(s.position);prev.quaternion.copy(s.quaternion);
}
assert.ok(conservativeWater>7,'Airframe must clear the maximum combined spectral and swell envelope');
assert.ok(minimumTerrain>10,'No island intersection');
assert.ok(maxPoseDelta<.04,'No sharp orientation jumps');
assert.ok(minSpeed>P.speed-1&&maxSpeed<P.speed+1,'Arc-length speed must remain steady');
assert.ok(shoreMargin>35,'Coast margin must cover scattered rocks beyond the heightfield');
const end=P.makeFlightState();P.flight(P.length,P.length/P.speed,end);
assert.ok(start.position.clone().setY(0).distanceTo(end.position.clone().setY(0))<1e-8,'Route closes spatially');
assert.ok(start.quaternion.angleTo(end.quaternion)<1e-7,'Route closes in attitude');
const nearEnd=P.makeFlightState(),nearStart=P.makeFlightState();P.flight(P.length-.01,1,nearEnd);P.flight(.01,1,nearStart);
assert.ok(nearEnd.position.distanceTo(nearStart.position)<.03,'Seam cannot teleport');
const output={samples:N+1,routeLengthMeters:P.length,lapSeconds:P.length/P.speed,minimumSwellOnlyClearance:minimumWater,minimumGuaranteedWaveEnvelopeClearance:conservativeWater,shoreMarginLowerBound:shoreMargin,minimumAirframeTerrainClearance:minimumTerrain,maximumBankDegrees:maxBank*180/Math.PI,maximumPoseStepDegrees:maxPoseDelta*180/Math.PI,speedRange:[minSpeed,maxSpeed],closedRoute:true};
console.log(JSON.stringify(output,null,2));
fs.writeFileSync(path.join(root,'tests/route-results.json'),JSON.stringify(output,null,2));
