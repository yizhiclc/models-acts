import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Body, Vec3, Quaternion, ConvexPolyhedron } from 'cannon-es';
import { Simulation, DEFAULTS, PRESETS, WALL } from '../src/physics.js';
import { partition3D } from '../src/geometry.js';

const started=performance.now(),results=[],experiments={};
function mechanicalEnergy(s) {
  let sum=0;
  for(const b of s.world.bodies)if(b.mass) {
    const w=b.quaternion.conjugate().vmult(b.angularVelocity);
    sum+=b.mass*(b.velocity.lengthSquared()/2+9.81*b.position.y)+(b.inertia.x*w.x*w.x+b.inertia.y*w.y*w.y+b.inertia.z*w.z*w.z)/2;
  }
  return sum;
}
function simulate(name,params,duration=2) {
  const s=new Simulation(params);s.launch();let initialEnergy=mechanicalEnergy(s),peakEnergy=initialEnergy,minY=Infinity,minProjectileY=Infinity,peakCollisionVy=-Infinity;
  let maxDrift=0,maxSubsteps=0;
  for(let i=0;i<Math.round(duration*120);i++) {
    s.advance();assert.equal(s.fault,null,`${name}: ${s.fault}`);maxSubsteps=Math.max(maxSubsteps,s.substeps);
    minProjectileY=Math.min(minProjectileY,s.projectile.position.y);
    assert(s.projectile.position.y>s.params.radius-.12,`${name}: projectile penetrated floor`);
    peakEnergy=Math.max(peakEnergy,mechanicalEnergy(s));
    if(s.firstContact&&s.time<s.firstContact.time+.18)peakCollisionVy=Math.max(peakCollisionVy,s.projectile.velocity.y);
    for(const p of s.pieces){minY=Math.min(minY,p.body.position.y);maxDrift=Math.max(maxDrift,Math.hypot(p.body.position.x-p.cx,p.body.position.y-p.cy,p.body.position.z-p.cz));}
  }
  const breaks=s.events.filter(e=>e.type==='break');
  experiments[name]={params:s.params,duration:s.time,broken:s.brokenCount,detached:s.detachedCount,bonds:s.bonds.length,firstContact:s.firstContact,
    firstBreak:breaks[0]||null,wallImpulse:s.wallImpulse,projectilePosition:s.projectile.position.toArray(),projectileVelocity:s.projectile.velocity.toArray(),
    maxEnergyRatio:peakEnergy/initialEnergy,minCentreY:minY,minProjectileY,maxDrift,maxSubsteps,peakCollisionVy:Number.isFinite(peakCollisionVy)?peakCollisionVy:null};
  console.log(`  ${name}: broken=${s.brokenCount}, detached=${s.detachedCount}, contact=${s.firstContact?.time?.toFixed(3)||'none'}`);
  return s;
}
async function test(name,fn) {
  const t=performance.now();
  try{await fn();results.push({name,passed:true,ms:Math.round(performance.now()-t)});console.log(`PASS ${name}`);}
  catch(error){results.push({name,passed:false,error:error.message,ms:Math.round(performance.now()-t)});console.error(`FAIL ${name}: ${error.message}`);}
}

await test('3D cells tile the wall; aggregate centroid and exact inertia match a solid box',()=>{
  const layout=partition3D(42,WALL,.3),volume=layout.cells.reduce((s,c)=>s+c.volume,0);
  assert(Math.abs(volume-WALL.width*WALL.height*.3)<1e-9);
  const centre=[0,WALL.base+WALL.height/2,0];const first=[0,0,0],inertia=[0,0,0];
  for(const c of layout.cells){assert(c.volume>0);assert(c.moments.every(m=>m>0));
    const pos=[c.cx,c.cy,c.cz];
    for(let i=0;i<3;i++){
      first[i]+=c.volume*pos[i];
      inertia[i]+=c.volume*(c.basis[i].reduce((s,v,k)=>s+v*v*c.moments[k],0)+pos.reduce((s,v,j)=>s+(i===j?0:(v-centre[j])**2),0));
    }
  }
  const expected=[WALL.height**2+.3**2,WALL.width**2+.3**2,WALL.width**2+WALL.height**2].map(v=>volume*v/12);
  for(let i=0;i<3;i++){assert(Math.abs(first[i]/volume-centre[i])<1e-9);assert(Math.abs(inertia[i]-expected[i])<1e-8);}
});

await test('Cached SAT agrees with the original SAT on separated, touching and rotated convex pairs',()=>{
  const s=new Simulation();
  for(let i=0;i<36;i++){
    const a=s.pieces[i*3%136].body.shapes[0],b=s.pieces[(i*7+1)%136].body.shapes[0];
    const pa=new Vec3(0,0,0),pb=new Vec3((i%5)*.12,.04*(i%3),.02*(i%4));
    const qa=new Quaternion(),qb=new Quaternion();qa.setFromEuler(i*.13,i*.23,i*.07);qb.setFromEuler(i*.11,i*.04,i*.2);
    const original=ConvexPolyhedron.prototype.findSeparatingAxis.call(a,b,pa,qa,pb,qb,new Vec3());
    assert.equal(a.findSeparatingAxis(b,pa,qa,pb,qb,new Vec3()),original);
  }
});

await test('Horizontal miss: no wall contact and no broken bonds, including weakest thin wall',()=>{
  for(const [name,p]of [['miss',PRESETS.miss],['miss_weak',{...DEFAULTS,hitX:4.8,strength:.18,thickness:.16,seed:42}],['miss_seed7',{...DEFAULTS,hitX:4.8,strength:.18,thickness:.7,seed:7}]]){
    const s=simulate(name,p,3);assert.equal(s.firstContact,null);assert.equal(s.brokenCount,0);assert.equal(s.wallImpulse,0);assert(experiments[name].maxDrift<.025);
  }
});

await test('Vertical miss above the wall does not fracture it',()=>{
  const s=simulate('high_miss',{...DEFAULTS,hitY:5.2},2);assert.equal(s.firstContact,null);assert.equal(s.brokenCount,0);
});

await test('Low impact hits the wall but leaves it intact',()=>{
  const s=simulate('gentle',PRESETS.gentle,3);assert(s.firstContact);assert(s.wallImpulse>0);assert.equal(s.brokenCount,0);assert.equal(s.detachedCount,0);
});

let local;
await test('Default case produces local damage only after actual contact',()=>{
  local=simulate('local',PRESETS.local,2);assert(local.firstContact);assert(local.brokenCount>0&&local.brokenCount<local.bonds.length*.65);
  assert(local.detachedCount>0&&local.detachedCount<local.pieces.length*.4);
  assert(local.events.filter(e=>e.type==='break').every(e=>e.time>=local.firstContact.time-1e-9));
});

await test('Changing impact position moves the physical contact and early fracture region',()=>{
  const sims=[simulate('left',{...DEFAULTS,hitX:-1.6},1),simulate('right',{...DEFAULTS,hitX:1.6},1)];
  for(const [i,s]of sims.entries()){
    const x=i?1.6:-1.6;assert(s.firstContact);assert(Math.abs(s.firstContact.point[0]-x)<.05);
    const early=s.events.filter(e=>e.type==='break'&&e.time<s.firstContact.time+.018);
    assert(early.length>0);const centroid=early.reduce((a,e)=>a+e.point[0],0)/early.length;
    experiments[i?'right':'left'].earlyBreakCentroidX=centroid;
    assert(i?centroid>.3:centroid<-.3);
  }
});

await test('Speed, mass, strength, thickness and radius change physical outcomes',()=>{
  const inputs={slow:{speed:5},fast:{speed:24},light:{mass:70},heavy:{mass:700},weak:{strength:.6},strong:{strength:4},thin:{thickness:.16},thick:{thickness:.7},small:{radius:.2},large:{radius:.75}};
  const sims={};for(const [name,p]of Object.entries(inputs))sims[name]=simulate(name,{...DEFAULTS,...p},1.5);
  assert(sims.fast.brokenCount>sims.slow.brokenCount);assert(sims.heavy.brokenCount>sims.light.brokenCount);
  assert(sims.weak.brokenCount>sims.strong.brokenCount);assert(sims.thin.detachedCount>sims.thick.detachedCount);
  assert.equal(sims.small.projectile.mass,sims.large.projectile.mass);
  assert.equal(sims.small.projectile.shapes[0].radius,.2);assert.equal(sims.large.projectile.shapes[0].radius,.75);
  // For a rigid sphere of equal mass striking an intact flat face head-on, point contact
  // can legitimately give the same impulse. A grazing test verifies the true geometric size effect.
  const small=simulate('size_graze_small',{...DEFAULTS,radius:.2,hitX:3.55},1.5);
  const large=simulate('size_graze_large',{...DEFAULTS,radius:.75,hitX:3.55},1.5);
  assert.equal(small.firstContact,null);assert.equal(small.brokenCount,0);
  assert(large.firstContact);assert(large.wallImpulse>0);assert(large.brokenCount>0);
});

await test('High energy penetrates; low impact and high energy do not share a scripted outcome',()=>{
  const through=simulate('through',PRESETS.through,2),collapse=simulate('collapse',PRESETS.collapse,2);
  assert(through.firstContact);assert(through.projectile.position.z<-2);assert(through.brokenCount>0);
  assert(collapse.detachedCount>collapse.pieces.length*.6);
  assert(experiments.through.maxEnergyRatio<1.05);assert(experiments.collapse.maxEnergyRatio<1.05);
});

await test('Maximum speed with smallest sphere and thinnest wall registers a contact, without tunneling through intact geometry',()=>{
  const s=simulate('fast_small',{...DEFAULTS,radius:.16,speed:42,mass:2400,thickness:.16,strength:4},1);
  assert(s.firstContact);assert(s.wallImpulse>1);assert(s.events.filter(e=>e.type==='break').every(e=>e.time>=s.firstContact.time-1e-9));
  assert(experiments.fast_small.maxEnergyRatio<1.05);
});

await test('Flat fixed wall control: head-on horizontal collision creates no spurious vertical kick',()=>{
  const s=new Simulation({radius:.85,mass:2400,speed:42});
  for(const p of s.pieces){p.body.type=Body.STATIC;p.body.mass=0;p.body.updateMassProperties();}
  s.world.gravity.set(0,0,0);s.launch();let maxVertical=0,maxNormalY=0;
  for(let i=0;i<60;i++){s.advance();maxVertical=Math.max(maxVertical,Math.abs(s.projectile.velocity.y));for(const c of s.world.contacts)if(c.bi===s.projectile||c.bj===s.projectile)maxNormalY=Math.max(maxNormalY,Math.abs(c.ni.y));}
  assert(s.firstContact);assert(maxVertical<1e-6);assert(maxNormalY<1e-6);
  experiments.flatControl={maxVerticalSpeed:maxVertical,maxNormalY,firstContact:s.firstContact};
});

await test('Same parameters, same fixed steps reproduce bond failures and final poses',()=>{
  const repeat=simulate('repeat',PRESETS.local,2);assert.equal(repeat.brokenCount,local.brokenCount);
  assert.deepEqual(repeat.bonds.map(b=>b.broken),local.bonds.map(b=>b.broken));
  let maxError=0;for(let i=0;i<local.pieces.length;i++)maxError=Math.max(maxError,repeat.pieces[i].body.position.distanceTo(local.pieces[i].body.position));
  assert(maxError<1e-8);experiments.repeat.maxPoseDifference=maxError;
});

await test('Detached rubble collides with the floor and loses kinetic energy over time',()=>{
  const s=simulate('settling',PRESETS.local,10);
  assert(s.pieces.filter(p=>!p.supported).every(p=>p.body.position.y>-.1));
  const moving=s.pieces.filter(p=>!p.supported&&!p.fixed);
  const maxSpeed=Math.max(...moving.map(p=>p.body.velocity.length()));
  experiments.settling.maxDetachedLinearSpeed=maxSpeed;
  assert(maxSpeed<.5);
});

const report={generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,elapsedMs:Math.round(performance.now()-started),passed:results.filter(r=>r.passed).length,total:results.length,results,experiments};
await fs.writeFile(new URL('./results.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`\n${report.passed}/${report.total} tests passed (${(report.elapsedMs/1000).toFixed(1)} s). Results: test/results.json`);
if(report.passed!==report.total)process.exitCode=1;
