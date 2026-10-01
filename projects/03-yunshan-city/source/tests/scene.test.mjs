import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {buildWorld} from '../src/world.js';
import {createPlan,createHeightField,PILGRIMAGE,STOPS,DISTRICTS} from '../src/plan.js';
import {samplePolyline,pointAt,VOXEL} from '../src/math.js';
import {timeState} from '../src/sky.js';

const plan=createPlan(),field=createHeightField(plan),route=samplePolyline(PILGRIMAGE,.7);

test('24-hour lighting is continuous, cyclic and covers daylight, twilight and night',()=>{
 assert.equal(timeState(12).day,1);assert.equal(timeState(0).day,0);
 assert.ok(timeState(6).day>0&&timeState(6).day<1);
 for(let hour=0;hour<=24;hour+=.025){const a=timeState(hour),b=timeState(hour+.025);for(const value of Object.values(a))assert.ok(Number.isFinite(value));assert.ok(Math.abs(a.day-b.day)<.04);assert.ok(a.day>=0&&a.day<=1);assert.ok(Math.abs(a.day-timeState(hour+24).day)<1e-12);}
});

test('a single continuous route climbs from the quay to the summit, and all stops lie on it',()=>{
 assert.equal(VOXEL,.2);assert.ok(route.at(-1).d>1300);
 assert.ok(route.at(-1).y-route[0].y>340);
 for(const stop of STOPS){assert.ok(PILGRIMAGE[stop.node]);const n=PILGRIMAGE[stop.node];assert.ok(route.some(p=>Math.hypot(p.x-n[0],p.y-n[1],p.z-n[2])<.8));}
 for(let i=1;i<route.length;i++){assert.ok(route[i].d>=route[i-1].d);assert.ok(Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y,route[i].z-route[i-1].z)<1);}
 assert.deepEqual(pointAt(route,route.at(-1).d),{x:148,y:376,z:-454});
});

test('all districts have physical buildings, terrace roads and a broad geographic spread',()=>{
 for(const district of DISTRICTS){assert.ok(plan.lots.filter(l=>l.district.id===district.id).length>=15,district.id);assert.ok(plan.roads.some(r=>r.district===district.id));}
 assert.ok(Math.max(...plan.lots.map(l=>l.x))-Math.min(...plan.lots.map(l=>l.x))>900);
 assert.ok(Math.max(...plan.lots.map(l=>l.y))-Math.min(...plan.lots.map(l=>l.y))>270);
});

test('the actual six-metre terrain cells never obstruct the walking route',()=>{
 for(const p of route){const cx=Math.floor((p.x+690)/6)*6-687,cz=Math.floor((p.z+620)/6)*6-617;assert.ok(field.sample(cx,cz)<p.y+.8,`blocked terrain at ${p.d.toFixed(1)} m`);}
});

test('the entire route has head and body clearance through the generated architecture',async()=>{
 const scene=new THREE.Scene(),world=await buildWorld(scene),bins=new Map(),size=16;
 // Index the actual transformed boxes, including stairs, gate lintels, palace courts,
 // street furniture and trees. This catches obstructions that plan footprints miss.
 for(const mesh of world.batch.meshes){if(mesh.name==='voxels:light'||mesh.name==='voxels:water')continue;const matrices=mesh.instanceMatrix.array;
  for(let i=0;i<mesh.count;i++){
   const m=matrices.slice(i*16,i*16+16),rx=(Math.abs(m[0])+Math.abs(m[8]))/2+.25,rz=(Math.abs(m[2])+Math.abs(m[10]))/2+.25;
   const box={m,name:mesh.name,index:i};
   for(let gx=Math.floor((m[12]-rx)/size);gx<=Math.floor((m[12]+rx)/size);gx++)for(let gz=Math.floor((m[14]-rz)/size);gz<=Math.floor((m[14]+rz)/size);gz++){const key=gx+','+gz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(box);}
  }
 }
 const blocked=[];
 for(const p of route){const candidates=bins.get(Math.floor(p.x/size)+','+Math.floor(p.z/size))||[];
  for(const b of candidates){const m=b.m,dx=p.x-m[12],dz=p.z-m[14],lx=(dx*m[0]+dz*m[2])/(m[0]**2+m[2]**2),lz=(dx*m[8]+dz*m[10])/(m[8]**2+m[10]**2);
   if(Math.abs(lx)>.495||Math.abs(lz)>.495)continue;
   if([1,2.1].some(y=>Math.abs((p.y+y-m[13])/m[5])<.49))blocked.push({distance:+p.d.toFixed(1),kind:b.name,index:b.index,center:[m[12],m[13],m[14]],size:[Math.hypot(m[0],m[2]),m[5],Math.hypot(m[8],m[10])]});
  }
 }
 assert.equal(blocked.length,0,JSON.stringify([...new Map(blocked.map(b=>[b.kind+','+b.index,b])).values()].slice(0,30),null,2));
 assert.ok(world.stats.voxels<190000,'geometry budget');
});
