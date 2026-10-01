import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = path.join(root, 'production');
const assets = path.join(root, 'src/main/resources/altarfilm');
fs.mkdirSync(production, {recursive: true});
fs.mkdirSync(assets, {recursive: true});
const palette = [], paletteIds = new Map(), occupied = new Map(), stages = [];
let current, bucket, sequence = 0;
const key = (x, y, z) => `${x},${y},${z}`;
const B = {
  stone: 'deepslate_bricks', dark: 'polished_blackstone_bricks', edge: 'polished_blackstone',
  tile: 'deepslate_tiles', carved: 'chiseled_polished_blackstone', gold: 'gold_block',
  white: 'quartz_bricks', quartz: 'chiseled_quartz_block', obsidian: 'obsidian',
  light: 'sea_lantern', glass: 'yellow_stained_glass', wall: 'polished_blackstone_brick_wall',
  slab: 'polished_blackstone_brick_slab[type=bottom]', chain: 'chain[axis=y]',
};
function stage(name, start, end, mode = 'radial') {
  current = {name, start, end, mode, groups: []};
  stages.push(current);
}
function group(label, mode = current.mode, offset = null) {
  bucket = {label, mode, offset, blocks: []};
  current.groups.push(bucket);
}
function put(x, y, z, state, overwrite = false) {
  x = Math.round(x); y = Math.round(y); z = Math.round(z);
  if (Math.abs(x) > 64 || Math.abs(z) > 64 || y < 63 || y > 170) throw Error('Bounds');
  const k = key(x, y, z);
  if (occupied.has(k) && !overwrite) return;
  if (occupied.get(k) === state) return;
  occupied.set(k, state);
  if (!paletteIds.has(state)) { paletteIds.set(state, palette.length); palette.push(`minecraft:${state}`); }
  bucket.blocks.push([x, y, z, paletteIds.get(state), sequence++]);
}
function box(x0, y0, z0, x1, y1, z1, material) {
  [x0,x1]=[Math.min(x0,x1),Math.max(x0,x1)];
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let k = 0; k <= x1 - x0; k++) {
        const x = ((z + y) & 1) ? x1 - k : x0 + k;
        put(x, y, z, typeof material === 'function' ? material(x, y, z) : material);
      }
}
function line(x0, y0, z0, x1, y1, z1, material, width = 0) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    for (let dx = -width; dx <= width; dx++)
      put(x0 + (x1-x0)*t + dx, y0+(y1-y0)*t, z0+(z1-z0)*t, material);
  }
}
const rotate = (x, z, side) => [[x,z],[-z,x],[-x,-z],[z,-x]][side];
function sideBlock(u, y, r, side, state, overwrite = false) {
  const [x,z] = rotate(u,-r,side);
  put(x,y,z,state,overwrite);
}
function sideGroups(label, radius, min, max, fn, order = [0,1,2,3], step = 16) {
  for (const side of order)
    for (let u = min; u <= max; u += step) {
      group(`${label} / side ${side+1} / ${u}`);
      fn(side,u,Math.min(max,u+step-1),radius);
    }
}
function floorPattern(x,z,r) {
  const d = Math.max(Math.abs(x),Math.abs(z));
  if (d === r || d === r-3) return B.edge;
  if (d === r-1 && ((x+z)%8 === 0)) return B.gold;
  if (Math.abs(x) <= 2 || Math.abs(z) <= 2) return (Math.abs(x)===2 || Math.abs(z)===2) ? B.quartz : B.tile;
  return ((Math.floor(x/8)+Math.floor(z/8))&1) ? B.stone : B.tile;
}
function stairOpening(u) { return Math.abs(u) <= 7; }
function terrace(index, r, bottom, top, next) {
  // Each facade bay is built upwards before the adjacent bay and deck are laid.
  sideGroups(`Terrace ${index}: load-bearing bays`,r,-r,r,(side,a,b) => {
    for (let u=a; u<=b; u++) {
      if (stairOpening(u)) continue;
      for (let y=bottom; y<=top; y++) {
        let material = y===bottom || y===top ? B.edge : B.stone;
        if (u%8===0) material=B.carved;
        if (u%8===0 && y===top-2) material=B.gold;
        if (u%8===4 && y>=bottom+2 && y<=top-2) material=B.tile;
        sideBlock(u,y,r,side,material);
        if (u%8===0) sideBlock(u,y,r-1,side,B.dark);
      }
    }
  });
  // Only exposed walkways need a deck; upper terraces are carried by a structural grid.
  sideGroups(`Terrace ${index}: deck and cornice`,r,-r,r,(side,a,b) => {
    for (let u=a; u<=b; u++) {
      const inner = next ? Math.max(next,Math.abs(u)) : 0;
      for (let d=r; d>=inner; d--) {
        if (stairOpening(u) && d>=r-1) continue;
        const [x,z]=rotate(u,-d,side);
        put(x,top,z,floorPattern(x,z,r));
      }
      if (!stairOpening(u)) sideBlock(u,top,r+1,side,B.slab);
    }
  });
  if (!next) {
    group('Summit: continuous central deck', 'front');
    for (let z=-r+1; z<r; z++)
      for (let k=-r+1; k<r; k++) {
        const x=(z&1)?k:-k;
        put(x,top,z,floorPattern(x,z,r));
      }
  }
}

stage('01 / Site axis',0,15);
group('Entrance procession axis','front');
for (let z=-64;z<=-49;z++) for(let x=-6;x<=6;x++)
  put(x,63,z,Math.abs(x)===6?B.gold:(Math.abs(x)===5?B.quartz:B.tile));

stage('02 / Plaza and structural footing',15,65);
sideGroups('Plaza paved border',64,-64,64,(side,a,b) => {
  for(let u=a;u<=b;u++) for(let r=64;r>=50;r--) {
    if(Math.abs(u)>r) continue;
    sideBlock(u,63,r,side,
      r===64||r===50?B.edge:r===62?B.gold:r===60?B.white:((u+r)%13===0?B.carved:B.dark),true);
  }
});
// Foundations radiate from the corners into the terraced structure.
sideGroups('Foundation buttress grid',48,-48,48,(side,a,b) => {
  for(let u=a;u<=b;u++) {
    if(u%8!==0) continue;
    for(let r=48;r>=0;r--)
      for(let y=64;y<=68;y++) {
        if(r%8!==0 && y!==68) continue;
        if(stairOpening(u)&&r>46) continue;
        sideBlock(u,y,r,side,y===64?B.obsidian:B.dark);
      }
  }
},[0,1,2,3],24);

stage('03 / Lower monumental terraces',65,140);
terrace(1,48,64,69,40);
terrace(2,40,70,77,32);

stage('04 / Upper terraces and sanctuary deck',140,200);
terrace(3,32,78,85,24);
terrace(4,24,86,93,0);

stage('05 / Processional stairways and balustrades',200,245);
for(const side of [0,1,2,3]) {
  group(`Stairway ${side+1}: ascending stonework`);
  for(let step=0;step<30;step++) {
    const r=53-step, y=64+step;
    const facing=['south','west','north','east'][side];
    for(let u=-6;u<=6;u++) {
      sideBlock(u,y-1,r,side,B.dark);
      sideBlock(u,y,r,side,`polished_blackstone_brick_stairs[facing=${facing},half=bottom,shape=straight]`,true);
    }
    for(const u of [-7,7]) {
      sideBlock(u,y-1,r,side,B.edge);
      sideBlock(u,y,r,side,step%4===0?B.gold:B.quartz,true);
      if(step%3===0) sideBlock(u,y+1,r,side,B.wall);
    }
  }
  group(`Stairway ${side+1}: terrace railing runs`);
  for(const [r,y] of [[48,70],[40,78],[32,86],[24,94]])
    for(let u=-r+2;u<=r-2;u++) {
      if(stairOpening(u)) continue;
      sideBlock(u,y,r,side,u%3===0?B.wall:B.slab);
    }
}

stage('06 / Obelisks and crown foundations',245,315);
for(const [n,cx,cz] of [[1,-43,-43],[2,43,-43],[3,43,43],[4,-43,43]]) {
  group(`Obelisk ${n}: stepped base and taper`);
  for(let y=70;y<=116;y++) {
    const dy=y-70;
    const r=dy<4?5:dy<8?4:dy<33?2:dy<39?1:0;
    for(let z=cz-r;z<=cz+r;z++) for(let x=cx-r;x<=cx+r;x++) {
      if(r===2 && Math.abs(x-cx)<2 && Math.abs(z-cz)<2) continue;
      const corner=Math.abs(x-cx)===r&&Math.abs(z-cz)===r;
      let mat=corner?B.edge:B.stone;
      if(dy===0||dy===4||dy===7||dy===32||dy===38||dy===43) mat=B.gold;
      if(r===2 && (x===cx||z===cz)) mat=(dy%5===0)?B.quartz:B.tile;
      if(dy>=44) mat=dy===44?B.light:B.gold;
      put(x,y,z,mat);
    }
  }
}
for(const sign of [-1,1]) {
  group(`Crown ${sign<0?'west':'east'} pier`, 'front');
  for(let y=78;y<=132;y++) {
    const r=y<93?4:y<99?5:y<126?3:4;
    for(let z=9-r;z<=9+r;z++) for(let x=sign*33-r;x<=sign*33+r;x++) {
      const edge=Math.abs(x-sign*33)===r||Math.abs(z-9)===r;
      if(y>99&&!edge) continue;
      put(x,y,z,y===98||y===125||y===129?B.gold:edge?B.edge:B.dark);
    }
  }
  group(`Crown ${sign<0?'west':'east'} flying buttress`, 'front');
  for(let y=86;y<=128;y++) {
    const x=sign*(45-Math.floor((y-86)*0.26));
    box(x-1,y,15,x+1,y,19,y%10===0?B.gold:B.stone);
  }
}
group('Crown: buried structural keel','front');
box(-5,86,9,5,94,15,B.obsidian);

stage('07 / Crown arch voussoirs and keystone',315,380,'front');
// Build from the supported lower arc up each flank, finishing at the keystone.
for(const [side,a0,a1] of [['lower-left',-90,-180],['upper-left',-180,-270],['lower-right',-90,0],['upper-right',0,90]]) {
  group(`Crown / ${side}`,'crown');
  const pts=[];
  for(let y=87;y<=165;y++) for(let x=-39;x<=39;x++) {
    const dy=y-126, r=Math.hypot(x,dy);
    if(r<35.8||r>39.2) continue;
    let angle=Math.atan2(dy,x)*180/Math.PI;
    if(a1<-180 && angle>0) angle-=360;
    if(a0===-180 && angle===180) angle=-180;
    if(angle<Math.min(a0,a1)||angle>Math.max(a0,a1)) continue;
    pts.push({x,y,r,angle});
  }
  pts.sort((a,b)=> (a1>a0?1:-1)*(a.angle-b.angle)||a.r-b.r);
  for(const {x,y,r,angle} of pts) {
    for(let z=14;z>=10;z--) {
      let mat=B.obsidian;
      if(z===10||z===14) mat=r<36.9||r>38.2?B.gold:B.carved;
      if(z===11||z===13) mat=B.edge;
      put(x,y,z,mat);
    }
    if(Math.abs(Math.round(angle/15)*15-angle)<1.1) put(x,y,9,B.quartz);
  }
}
group('Crown: central keystone and crest','crown');
for(let y=164;y<=170;y++) {
  const r=y<167?3:1;
  box(-r,y,9,r,y,15,y===164||y===167?B.gold:y===170?B.light:B.quartz);
}

stage('08 / Gilded relief and sanctuary motifs',380,425);
sideGroups('Facade hanging relief',48,-46,46,(side,a,b)=>{
  for(let u=a;u<=b;u++) {
    if(u%8!==0||stairOpening(u)) continue;
    for(const [r,top] of [[48,69],[40,77],[32,85]]) {
      if(Math.abs(u)>=r) continue;
      sideBlock(u,top-3,r+1,side,B.gold);
      sideBlock(u,top-2,r+1,side,B.quartz);
      sideBlock(u,top-1,r+1,side,B.gold);
      sideBlock(u,top-4,r+1,side,B.slab);
    }
  }
},[0,1,2,3],24);
group('Eight-direction sanctuary floor','front');
for(let ring=21;ring>=7;ring--) {
  for(let a=0;a<360;a+=1.4) {
    const rad=a*Math.PI/180,x=Math.round(Math.cos(rad)*ring),z=Math.round(Math.sin(rad)*ring);
    const spoke=Math.min(a%45,45-a%45)<2.3;
    if(ring===21||ring===18||ring===8||spoke)
      put(x,93,z,ring===18||spoke?B.gold:B.white,true);
  }
}
for(let side=0;side<4;side++) {
  group(`Ceremonial lights ${side+1}`);
  for(const u of [-18,-10,10,18]) {
    sideBlock(u,94,21,side,B.carved);
    sideBlock(u,95,21,side,B.light);
    sideBlock(u,96,21,side,B.gold);
  }
}

stage('09 / Central altar and ceremonial core',425,455,'front');
group('Central pedestal: stepped obsidian foundation','front');
for(let y=94;y<=101;y++) {
  const r=y<96?7:y<99?5:4;
  for(let z=-r;z<=r;z++) for(let x=-r;x<=r;x++) {
    const edge=Math.max(Math.abs(x),Math.abs(z))===r;
    put(x,y,z,y===94||y===98||y===101?(edge?B.gold:B.obsidian):(edge?B.carved:B.obsidian));
  }
}
group('Altar core and guardian fins','front');
for(const sign of [-1,1]) for(let y=102;y<=111;y++) {
  const x=sign*(7+Math.floor((y-102)*0.4));
  box(x,y,-1,x+sign,y,1,B.edge);
  put(x,y,-2,y%3===0?B.gold:B.quartz);
}
for(let z=-3;z<=3;z++) for(let x=-3;x<=3;x++) {
  if(Math.abs(x)===Math.abs(z)||x===0||z===0) put(x,101,z,B.light,true);
}
group('Processional threshold finishing','front');
for(let z=-23;z<=-8;z++) for(let x=-3;x<=3;x++)
  put(x,93,z,Math.abs(x)===3?B.gold:Math.abs(x)===2?B.quartz:B.tile,true);
stage('10 / Accretion disk reveal',455,480,'reveal');

const events=[],segments=[];
for(const st of stages) {
  st.groups=st.groups.filter(g=>g.blocks.length);
  const count=st.groups.reduce((n,g)=>n+g.blocks.length,0);
  const weights=st.groups.map(g=>Math.sqrt(g.blocks.length));
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  let cursor=st.start;
  for(let i=0;i<st.groups.length;i++) {
    const g=st.groups[i];
    // Blend minimum readable section duration with workload-proportional timing.
    const duration=(st.end-st.start)*(0.18*weights[i]/totalWeight+0.82*g.blocks.length/count);
    const begin=cursor, end=cursor+duration;
    for(let k=0;k<g.blocks.length;k++) {
      const b=g.blocks[k];
      const t=begin+(k+0.5)/g.blocks.length*duration;
      events.push([+t.toFixed(4),...b.slice(0,4)]);
    }
    segments.push({stage:st.name,label:g.label,start:+begin.toFixed(4),end:+end.toFixed(4),count:g.blocks.length,mode:g.mode});
    cursor=end;
  }
  st.count=count;
}
events.sort((a,b)=>a[0]-b[0]);
const lerp=(a,b,t)=>a+(b-a)*t;
const mix=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
const smooth=t=>t*t*(3-2*t);
function meanWork(t,radius=1.1) {
  let lo=0,hi=events.length;
  while(lo<hi) {const m=(lo+hi)>>1;if(events[m][0]<t-radius)lo=m+1;else hi=m;}
  let p=[0,0,0],w=0;
  for(let i=lo;i<events.length&&events[i][0]<t+radius;i++) {
    const e=events[i],a=Math.exp(-Math.pow((e[0]-t)/(radius*.55),2));
    for(let k=0;k<3;k++)p[k]+=e[k+1]*a;
    w+=a;
  }
  if(w<1e-5) return t>450?[0,111,0]:[0,64,-54];
  return p.map(v=>v/w);
}
function pose(t) {
  let target=meanWork(Math.min(t,454.5));
  const segment=segments.find(s=>t>=s.start&&t<s.end);
  const mode=segment?.mode??'front';
  let pos;
  if(mode==='front'||mode==='crown') {
    pos=[target[0]-9,target[1]+(mode==='crown'?8:23),target[2]-36];
  } else {
    const r=Math.hypot(target[0],target[2]);
    const nx=r>3?target[0]/r:-.6,nz=r>3?target[2]/r:-.8;
    pos=[target[0]+nx*30,target[1]+22,target[2]+nz*30];
  }
  if(t<14) {
    const a=smooth(Math.min(1,t/14));
    pos=mix([-105,140,-143],pos,a);
    target=mix([0,68,0],target,a);
  }
  if(t>=451) {
    const a=smooth(Math.min(1,(t-451)/8));
    target=mix(target,[0,126,9],a);
    pos=mix(pos,[-31,132,-66],a);
  }
  if(t>=460) {
    const a=smooth(Math.min(1,(t-460)/20));
    target=mix([0,126,9],[0,106,5],a);
    pos=mix([-31,132,-66],[-116,156,-155],a);
  }
  return [...pos,...target];
}
// Offline symmetric low-pass smoothing eliminates tick-wise following jitter.
// Runtime uses C1 Hermite interpolation at the actual rendering frequency.
const camera=[];
for(let i=0;i<=1920;i++) {
  const t=i/4;
  let values=[0,0,0,0,0,0],weight=0;
  for(let j=-12;j<=12;j++) {
    const w=Math.exp(-j*j/32),p=pose(Math.max(0,Math.min(480,t+j/8)));
    values=values.map((v,k)=>v+p[k]*w);weight+=w;
  }
  camera.push([t,...values.map(v=>+(v/weight).toFixed(5))]);
}
const film={format:1,duration:480,seed:20260912,groundY:63,bounds:[-64,63,-64,64,170,64],
  blackHoleCommand:'blackhole disk at 0 126 0 1.5 0.94',palette,events,camera,
  stages:stages.map(({name,start,end,count})=>({name,start,end,count})),segments};
const json=JSON.stringify(film);
fs.writeFileSync(path.join(assets,'blueprint.json.gz'),zlib.gzipSync(json,{level:9}));
fs.writeFileSync(path.join(production,'timeline.json'),JSON.stringify({...film,events:undefined,camera:undefined},null,2));
fs.writeFileSync(path.join(production,'camera.csv'),'time,x,y,z,targetX,targetY,targetZ\n'+camera.map(r=>r.join(',')).join('\n'));
fs.writeFileSync(path.join(production,'blocks.csv'),'time,x,y,z,palette\n'+events.map(r=>r.join(',')).join('\n'));
const final=[...occupied].map(([k,state])=>[...k.split(',').map(Number),state]);
fs.writeFileSync(path.join(production,'final-blueprint.json.gz'),zlib.gzipSync(JSON.stringify(final)));
let peak=0;
for(let i=0,j=0;i<events.length;i++) {
  while(events[j][0]<events[i][0]-.05)j++;
  peak=Math.max(peak,i-j+1);
}
const summary={duration:480,placements:events.length,uniqueBlocks:occupied.size,peakBlocksPerTick:peak,
  stages:film.stages,palette:palette.length,cameraKeys:camera.length};
fs.writeFileSync(path.join(production,'blueprint-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
