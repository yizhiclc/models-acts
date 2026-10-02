import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'production');
const catalog=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'catalog.json.gz'))));
const palette=[],ids=new Map(),events=[],stages=[],segments=[];
const duration=440,revealTime=375;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const ease=t=>{t=clamp(t);return t*t*t*(10+t*(-15+6*t));};
const frame=(p,a)=>[...p,...a];
const used=new Set();
function workAt(t) {
  let lo=0,hi=events.length-1;
  while(lo<hi) {const m=(lo+hi)>>1;if(events[m][0]<t)lo=m+1;else hi=m;}
  return events[lo]?.slice(1,4)||[0,64,0];
}

function facade(c) {
  if(-c.z>=Math.abs(c.x)) return {side:0,u:c.x,r:-c.z};
  if(c.x>=Math.abs(c.z)) return {side:1,u:c.z,r:c.x};
  if(c.z>=Math.abs(c.x)) return {side:2,u:-c.x,r:c.z};
  return {side:3,u:-c.z,r:-c.x};
}
const ascending=(a,b)=>a.y-b.y||a.z-b.z||a.x-b.x;
function sweep(radius,reverse=false) {
  return (a,b)=>{
    const aa=facade(a),bb=facade(b);
    const ia=Math.floor(((reverse?-aa.u:aa.u)+radius)/6);
    const ib=Math.floor(((reverse?-bb.u:bb.u)+radius)/6);
    return ia-ib||a.y-b.y||bb.r-aa.r||aa.u-bb.u||aa.side-bb.side;
  };
}
function add(name,start,end,predicate,sort,pose) {
  const blocks=catalog.blocks.filter(predicate).sort(sort);
  for(let i=0;i<blocks.length;i++) {
    const c=blocks[i],key=`${c.x},${c.y},${c.z}`;
    if(used.has(key)) throw Error(`Repeated block ${key}`);
    used.add(key);
    if(!ids.has(c.state)) {ids.set(c.state,palette.length);palette.push(`minecraft:${c.state}`);}
    const t=start+.12+(end-start-.24)*(i+.5)/blocks.length;
    events.push([+t.toFixed(6),c.x,c.y,c.z,ids.get(c.state)]);
  }
  stages.push({name,start,end,count:blocks.length});
  segments.push({start,end,pose});
}
function hold(name,start,end,pose) {stages.push({name,start,end,count:0});segments.push({start,end,pose});}

add('01 Plaza paving',0,15,c=>c.section==='plaza',ascending,t=>{
  const u=ease(t/15);
  return frame(mix([-126,151,-163],[-113,138,-143],u),[0,68,0]);
});
add('02 Foundations and continuous supports',15,41,c=>['infill','supports'].includes(c.section),ascending,t=>{
  const u=ease((t-15)/26);
  return frame(mix([-113,138,-143],[-105,142,-128],u),mix([0,72,0],[0,106,0],u));
});
for(const [i,top,r,start,end] of [[0,72,60,41,63],[1,82,48,63,81],[2,92,36,81,95],[3,102,24,95,105]]) {
  add(`03.${i+1} Terrace ${i+1}`,start,end,c=>c.section==='terraces'&&c.piece===`tier-${top}`,sweep(r,i%2===1),t=>{
    const u=clamp((t-start)/(end-start));
    const x=(i%2?1-2*u:2*u-1)*(r-5);
    return frame([x-15,top+25,-r-54],[x,top-3,-r+2]);
  });
}
add('04 Four entrance gateways',105,128,c=>c.section==='gates',ascending,t=>{
  const u=clamp((t-105)/23),y=clamp(workAt(clamp(t,105.2,127.8))[1],67,88);
  return frame([-27+u*8,y+22,-117],[0,y,-75]);
});
add('05 Corner beacons',128,137,c=>c.section==='beacons',ascending,t=>{
  const u=clamp((t-128)/9);
  return frame([-98,95+u*7,-113],[-70,66+u*10,-70]);
});
add('06 Four ascending stairs and landings',137,173,c=>c.section==='stairs',ascending,t=>{
  const p=workAt(clamp(t,137.2,172.8)),y=p[1],r=Math.max(Math.abs(p[0]),Math.abs(p[2]));
  return frame([-27,y+23,-r-44],[0,y,-r]);
});
add('07 Matched tapering obelisks',173,208,c=>c.section==='obelisks',ascending,t=>{
  const y=workAt(clamp(t,173.2,207.8))[1];
  return frame([-91,y+22,-97],[-51,y,-51]);
});
for(const [i,top,r,start,end] of [[0,72,60,208,219],[1,82,48,219,228],[2,92,36,228,235],[3,102,24,235,241]]) {
  add(`08.${i+1} Facade arcades ${i+1}`,start,end,c=>c.section==='arcades'&&c.piece.startsWith(`arcade-${top}-`),sweep(r,i%2===1),t=>{
    const u=clamp((t-start)/(end-start)),x=(i%2?1-2*u:2*u-1)*(r-12);
    return frame([x-10,top+17,-r-40],[x,top-5,-r]);
  });
}
add('09 Applied pier tracery',241,249,c=>c.section==='tracery',ascending,t=>{
  const u=clamp((t-241)/8);
  return frame([-62,128,-68],[-33,110+u*12,-22]);
});
add('10 Twin crown rings and crests',249,339,c=>c.section==='rings',ascending,t=>{
  const u=clamp((t-249)/90),y=workAt(clamp(t,249.2,338.8))[1];
  const x=-Math.sqrt(Math.max(0,33.5**2-(Math.min(y,163.5)-130)**2));
  const near=frame([x-47,y+15,-77],[x,y,-18]);
  const whole=frame([-105,181,-116],[0,146,0]);
  return mix(near,whole,ease((u-.83)/.17));
});
add('11 Sanctuary floor inlay',339,347,c=>c.section==='sanctuary',ascending,t=>{
  const u=clamp((t-339)/8);
  return frame([-27,138,-48],[0,102,0]);
});
add('12 Pedestal, guardians and ceremonial lights',347,365,c=>c.section==='altar',ascending,t=>{
  const u=clamp((t-347)/18);
  return frame([-31+u*5,134+u*5,-49],[0,105+u*8,0]);
});
hold('13 Completed architecture',365,375,t=>{
  const u=ease((t-365)/10);
  return mix(frame([-26,139,-49],[0,113,0]),frame([-131,152,-158],[0,112,0]),u);
});
hold('14 Black hole reveal and front orbit',375,393,t=>{
  const u=clamp((t-375)/18),a=(-130+40*u)*Math.PI/180,r=205;
  return frame([r*Math.cos(a),152,-0+r*Math.sin(a)],[0,114,0]);
});
hold('15 Front-to-side completed orbit',393,414,t=>{
  const u=clamp((t-393)/21),a=(-90+80*u)*Math.PI/180,r=205-10*Math.sin(u*Math.PI);
  return frame([r*Math.cos(a),152+12*u,r*Math.sin(a)],[0,115+3*u,0]);
});
hold('16 Side and rear high-angle finale',414,440,t=>{
  const u=ease((t-414)/26),a=(-10+88*u)*Math.PI/180,r=205+17*u;
  return frame([r*Math.cos(a),164+8*u,r*Math.sin(a)],[0,118-3*u,0]);
});
if(used.size!==catalog.blocks.length) throw Error(`Missing ${catalog.blocks.length-used.size} blocks`);
events.sort((a,b)=>a[0]-b[0]);

// Blend each hand-planned shot into its neighbour; position and aim remain C1 at runtime.
function rawPose(t) {
  let i=segments.findIndex(s=>t>=s.start&&t<s.end);
  if(i<0) i=t<=0?0:segments.length-1;
  const s=segments[i];
  let pose=s.pose(clamp(t,s.start,s.end));
  if(i>0&&t<s.start+3) {
    const prev=segments[i-1];
    pose=mix(prev.pose(prev.end),pose,ease((t-s.start)/3));
  }
  return pose;
}
const camera=[];
for(let i=0;i<=duration*4;i++) {
  const t=i/4,values=Array(6).fill(0);let sum=0;
  for(let j=-12;j<=12;j++) {
    const w=Math.exp(-j*j/18),p=rawPose(clamp(t+j*.125,0,duration));
    for(let k=0;k<6;k++) values[k]+=p[k]*w;
    sum+=w;
  }
  camera.push([t,...values.map(v=>+(v/sum).toFixed(6))]);
}
const cells=new Set(catalog.blocks.map(c=>`${c.x},${c.y},${c.z}`));
for(const [t,x,y,z] of camera) {
  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(let dz=-1;dz<=1;dz++)
    if(cells.has(`${Math.floor(x)+dx},${Math.floor(y)+dy},${Math.floor(z)+dz}`)) throw Error(`Camera collision at ${t}`);
}
let peak=0;
for(let i=0,j=0;i<events.length;i++) {while(events[j][0]<events[i][0]-.05)j++;peak=Math.max(peak,i-j+1);}
const film={format:2,duration,revealTime,seed:20260925,groundY:63,bounds:[-80,63,-80,80,172,80],
  blackHoleCommand:catalog.blackHoleCommand,palette,events,camera,stages};
fs.writeFileSync(path.join(root,'src/main/resources/altarfilm/blueprint.json.gz'),zlib.gzipSync(JSON.stringify(film),{level:9}));
fs.writeFileSync(path.join(out,'timeline.json'),JSON.stringify({...film,events:undefined,camera:undefined},null,2));
fs.writeFileSync(path.join(out,'camera.csv'),'time,x,y,z,targetX,targetY,targetZ\n'+camera.map(r=>r.join(',')).join('\n'));
fs.writeFileSync(path.join(out,'schedule-check.json'),JSON.stringify({duration,buildEnds:365,revealTime,
  placements:events.length,approvedBlueprintMatch:true,cameraClear:true,peakBlocksPerTick:peak,editing:false},null,2));
console.log(JSON.stringify({duration,placements:events.length,peakBlocksPerTick:peak,stages},null,2));
