import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'production');
const resources = path.join(root, 'src/main/resources/altarfilm');
fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(resources, {recursive: true});
const cells = new Map();
let section='plaza', piece='plaza';
const key = (x,y,z) => `${x},${y},${z}`;
const B = {
  stone:'deepslate_bricks', tile:'deepslate_tiles', dark:'polished_blackstone_bricks',
  edge:'polished_blackstone', carved:'chiseled_polished_blackstone',
  gold:'gold_block', white:'quartz_bricks', quartz:'chiseled_quartz_block',
  light:'sea_lantern', obsidian:'obsidian', slab:'polished_blackstone_brick_slab[type=bottom]',
};
function put(x,y,z,state,category=section) {
  if (![x,y,z].every(Number.isInteger) || Math.max(Math.abs(x),Math.abs(z))>80 || y<63 || y>174) throw Error('Invalid position');
  cells.set(key(x,y,z), {x,y,z,state,section:category,piece});
}
function box(x0,y0,z0,x1,y1,z1,state) {
  for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++)
    put(x,y,z,typeof state==='function'?state(x,y,z):state);
}
function rotate(u,r,side) { return [[u,-r],[r,u],[-u,r],[-r,-u]][side]; }
function sidePut(u,y,r,side,state) { const [x,z]=rotate(u,r,side);put(x,y,z,state); }
function grid(v,spacing) { return Math.min(Math.abs(v)%spacing,spacing-Math.abs(v)%spacing)<=1; }
function floor(x,z,r) {
  const d=Math.max(Math.abs(x),Math.abs(z));
  if(d===r || d===r-3) return B.edge;
  if(d===r-1) return B.gold;
  if(Math.abs(x)===7||Math.abs(z)===7) return B.white;
  if(Math.abs(x)<=6||Math.abs(z)<=6) return B.tile;
  return (Math.floor(Math.abs(x)/6)+Math.floor(Math.abs(z)/6))%2?B.stone:B.dark;
}

// Continuous plaza and four stacked, closed structural boxes.
box(-80,63,-80,80,63,80,(x,y,z)=>{
  const d=Math.max(Math.abs(x),Math.abs(z));
  return d===80||d===74?B.edge:d===78?B.gold:d===76?B.white:floor(x,z,80);
});
const tiers = [{r:60,bottom:64,top:72},{r:48,bottom:73,top:82},{r:36,bottom:83,top:92},{r:24,bottom:93,top:102}];
for(const {r,bottom,top} of tiers) {
  section='terraces';piece=`tier-${top}`;
  for(let y=bottom;y<=top;y++) for(let z=-r;z<=r;z++) for(let x=-r;x<=r;x++) {
    const d=Math.max(Math.abs(x),Math.abs(z));
    if(y<top-1 && d<r-1 && !(grid(x,12)&&grid(z,12))) continue;
    let material=B.dark;
    if(d>=r-1) {
      material=(y===bottom||y===top-1)?B.edge:B.stone;
      const u=Math.min(Math.abs(x),Math.abs(z));
      if(u%12===0) material=B.carved;
      if(u%12===0&&y===top-3) material=B.gold;
    }
    if(y===top) material=floor(x,z,r);
    put(x,y,z,material,y<top&&d<r-1?'infill':section);
  }
  // A grounded cornice, never a detached decorative strip.
  for(let side=0;side<4;side++) for(let u=-r;u<=r;u++) {
    if(Math.abs(u)<=8) continue;
    sidePut(u,top+1,r,side,Math.abs(u)%8===0?B.carved:B.edge);
    if(Math.abs(u)%8===0) sidePut(u,top+2,r,side,B.slab);
  }
  for(let side=0;side<4;side++) for(let u=-r+6;u<=r-6;u+=12) {
    if(Math.abs(u)<12) continue;
    sidePut(u,top-2,r+1,side,B.quartz);
    sidePut(u,top-3,r+1,side,B.gold);
    sidePut(u,top-4,r+1,side,B.edge);
  }
}

// The four circulation routes use the SAME profile, including real landings.
const stairProfile=[];
for(let r=73;r>=65;r--) stairProfile.push({r,y:137-r,step:true});
for(let r=64;r>=59;r--) stairProfile.push({r,y:72,step:false});
for(let r=58;r>=49;r--) stairProfile.push({r,y:131-r,step:true});
for(let r=48;r>=47;r--) stairProfile.push({r,y:82,step:false});
for(let r=46;r>=37;r--) stairProfile.push({r,y:129-r,step:true});
for(let r=36;r>=35;r--) stairProfile.push({r,y:92,step:false});
for(let r=34;r>=25;r--) stairProfile.push({r,y:127-r,step:true});
for(let r=24;r>=21;r--) stairProfile.push({r,y:102,step:false});
for(let side=0;side<4;side++) for(const {r,y,step} of stairProfile) {
  section='stairs';piece=`stair-${side}`;
  for(let u=-7;u<=7;u++) {
    const [x,z]=rotate(u,r,side);
    for(let clear=y+1;clear<=106;clear++) cells.delete(key(x,clear,z));
    for(let below=64;below<y;below++) put(x,below,z,B.dark,'infill');
    const facing=['south','west','north','east'][side];
    put(x,y,z,step?`polished_blackstone_brick_stairs[facing=${facing},half=bottom,shape=straight]`:B.tile);
  }
  for(const u of [-8,8]) {
    section='infill';
    for(let below=64;below<=y;below++) sidePut(u,below,r,side,B.edge);
    section='stairs';
    sidePut(u,y+1,r,side,B.quartz);
    // A connected handrail following every tread, not isolated diagonal dots.
    sidePut(u,y+2,r,side,r%6===0?B.gold:B.slab);
  }
}

// Four matched outer obelisks. Their foundations reach the ground.
section='obelisks';
for(const sx of [-1,1]) for(const sz of [-1,1]) {
  const cx=sx*51,cz=sz*51;
  piece=`obelisk-${sx}-${sz}`;
  for(let y=64;y<=122;y++) {
    const r=y<=75?5:y<=79?4:y<=109?2:y<=116?1:0;
    for(let x=cx-r;x<=cx+r;x++) for(let z=cz-r;z<=cz+r;z++) {
      let mat=B.stone;
      if(Math.abs(x-cx)===r&&Math.abs(z-cz)===r) mat=B.edge;
      if([73,76,79,109,116,122].includes(y)) mat=B.gold;
      if(y>=80&&y<=108&&(x===cx||z===cz)) mat=y%6===0?B.quartz:B.tile;
      if(y===121) mat=B.light;
      put(x,y,z,mat);
    }
  }
}

// Four piers and continuous raked buttresses; every foot starts at Y64.
section='supports';
for(const sx of [-1,1]) for(const sz of [-1,1]) {
  const cx=sx*33,cz=sz*18;
  piece=`pier-${sx}-${sz}`;
  for(let y=64;y<=133;y++) {
    const radius=y<=73?5:y<=83?4:y<=124?3:4;
    for(let x=cx-radius;x<=cx+radius;x++) for(let z=cz-radius;z<=cz+radius;z++) {
      const edge=Math.abs(x-cx)===radius||Math.abs(z-cz)===radius;
      let mat=edge?B.edge:B.dark;
      if([73,83,104,125,129,133].includes(y)) mat=B.gold;
      if(edge&&y>84&&y<124&&Math.abs(z-cz)===radius&&x===cx) mat=B.carved;
      put(x,y,z,mat);
    }
    const outer=52-Math.floor((y-64)*.29);
    for(let u=33;u<=outer;u++) for(let z=cz-2;z<=cz+2;z++)
      put(sx*u,y,z,u===outer?(y%10===0?B.gold:B.edge):B.stone);
  }
}

// Paired crown rings, mirrored front/back, with a solid three-block core.
section='rings';
for(const cz of [-18,18]) {
  piece=`ring-${cz}`;
  for(let y=95;y<=166;y++) for(let x=-36;x<=36;x++) {
    const radius=Math.hypot(x,y-130);
    if(radius<31||radius>35.5) continue;
    for(let z=cz-2;z<=cz+2;z++) {
      const face=Math.abs(z-cz)===2;
      const material=face?(radius<32.1||radius>34.35?B.gold:B.carved):B.obsidian;
      put(x,y,z,material);
    }
  }
  // Attached rosettes, positioned on the annulus instead of scattered by angle rounding.
  for(const sx of [-1,1]) for(const sy of [-1,1]) {
    const cx=sx*24,cy=130+sy*24;
    for(let x=cx-1;x<=cx+1;x++) for(let y=cy-1;y<=cy+1;y++) {
      if(Math.hypot(x,y-130)<31||Math.hypot(x,y-130)>35.5) continue;
      for(const face of [-1,1]) put(x,y,cz+face*3,(x===cx&&y===cy)?B.light:B.quartz);
    }
  }
  box(-3,164,cz-3,3,167,cz+3,(x,y,z)=>y===164||y===167?B.gold:B.quartz);
  box(-1,168,cz-1,1,170,cz+1,B.edge);
  put(0,171,cz,B.light);
  put(0,172,cz,B.gold);
}
// The two crowns intentionally remain separate above their independent piers.

// Sanctuary paving is a symmetric, embedded pattern rather than floating decals.
section='sanctuary';piece='floor';
for(let x=-23;x<=23;x++) for(let z=-23;z<=23;z++) {
  const r=Math.hypot(x,z);
  if(r>=20.5&&r<21.5||r>=14.5&&r<15.5||Math.abs(x)===Math.abs(z)) put(x,102,z,B.gold);
  else if((x===0||z===0)&&r>10) put(x,102,z,B.white);
}
// Solid central stepped pedestal, with four low, fully rooted guardian pylons.
section='altar';piece='pedestal';
for(let y=103;y<=113;y++) {
  const r=y<=104?9:y<=108?7:5;
  box(-r,y,-r,r,y,r,(x,yy,z)=>{
    const edge=Math.max(Math.abs(x),Math.abs(z))===r;
    return [104,108,113].includes(yy)?(edge?B.gold:B.obsidian):edge?B.carved:B.obsidian;
  });
}
for(let x=-4;x<=4;x++) for(let z=-4;z<=4;z++)
  if(x===0||z===0||Math.abs(x)===Math.abs(z)) put(x,113,z,B.light);
for(const sx of [-1,1]) for(const sz of [-1,1]) {
  piece=`guardian-${sx}-${sz}`;
  for(let y=103;y<=117;y++) {
    const r=y<106?2:y<114?1:0;
    box(sx*11-r,y,sz*11-r,sx*11+r,y,sz*11+r,[105,113,117].includes(y)?B.gold:y===116?B.light:B.edge);
  }
}
for(const side of [0,1,2,3]) for(const u of [-18,-12,12,18]) {
  piece='lights';
  sidePut(u,103,22,side,B.carved);
  sidePut(u,104,22,side,B.light);
  sidePut(u,105,22,side,B.gold);
}

// Recessed blind arcades articulate each terrace without opening its inner shell.
section='arcades';
for(const {r,bottom,top} of tiers) for(let side=0;side<4;side++) {
  piece=`arcade-${top}-${side}`;
  for(let center=18;center<=r-5;center+=12) for(const sign of [-1,1]) {
    const u0=sign*center;
    for(let du=-3;du<=3;du++) for(let dy=0;dy<=5;dy++) {
      const archTop=3+Math.floor(Math.sqrt(Math.max(0,9-du*du))*.8);
      if(dy>archTop) continue;
      const u=u0+du,y=bottom+1+dy;
      const [x,z]=rotate(u,r,side);
      if(Math.abs(du)===3||dy===0||dy===archTop) sidePut(u,y,r,side,dy===archTop?B.quartz:B.edge);
      else {
        cells.delete(key(x,y,z));
        sidePut(u,y,r-1,side,du===0&&dy===3?B.light:B.obsidian);
      }
    }
    sidePut(u0,top-1,r+1,side,B.gold);
    for(const du of [-5,5]) for(let y=bottom;y<top;y++)
      sidePut(u0+du,y,r+1,side,y===bottom||y===top-1?B.carved:B.edge);
  }
}

// Each procession begins at a complete, rooted gateway, not a floating arch.
section='gates';
for(let side=0;side<4;side++) {
  piece=`gate-${side}`;
  for(const sign of [-1,1]) for(let y=64;y<=76;y++) {
    const radius=y<67?2:1;
    for(let u=sign*11-radius;u<=sign*11+radius;u++) for(let r=73;r<=77;r++)
      sidePut(u,y,r,side,[66,75,76].includes(y)?B.gold:B.edge);
  }
  for(let u=-13;u<=13;u++) for(let y=73;y<=86;y++) {
    const d=Math.hypot(u,y-73);
    if(d<10||d>12.5) continue;
    for(let r=73;r<=77;r++) sidePut(u,y,r,side,r===73||r===77?(d>11.5?B.gold:B.quartz):B.dark);
  }
  for(let u=-2;u<=2;u++) for(let y=85;y<=88;y++) for(let r=74;r<=76;r++)
    sidePut(u,y,r,side,y===85||y===88?B.gold:B.carved);
  sidePut(0,89,75,side,B.light);
  sidePut(0,90,75,side,B.gold);
}

// Four corner beacons and their inset plaza medallions.
section='beacons';
for(const sx of [-1,1]) for(const sz of [-1,1]) {
  const cx=sx*70,cz=sz*70;
  piece=`beacon-${sx}-${sz}`;
  for(let x=cx-5;x<=cx+5;x++) for(let z=cz-5;z<=cz+5;z++) {
    const d=Math.max(Math.abs(x-cx),Math.abs(z-cz));
    put(x,63,z,d===5?B.gold:d===4?B.white:B.tile);
  }
  for(let y=64;y<=78;y++) {
    const r=y<=65?3:y<=68?2:y<=75?1:0;
    box(cx-r,y,cz-r,cx+r,y,cz+r,(x,yy,z)=>[65,68,75,78].includes(yy)?B.gold:yy===77?B.light:B.carved);
  }
}

// Applied pier tracery is seated on the existing continuous columns.
section='tracery';
for(const sx of [-1,1]) for(const sz of [-1,1]) {
  const cx=sx*33,cz=sz*18;
  piece=`tracery-${sx}-${sz}`;
  for(const face of [-1,1]) {
    const z=cz+face*4;
    for(let y=107;y<=122;y++) for(let dx=-2;dx<=2;dx++) {
      const border=Math.abs(dx)===2||y===107||y===122;
      if(border) put(cx+dx,y,z,(y===107||y===122)?B.gold:B.carved);
      else if(dx===0) put(cx,y,z,y%5===0?B.quartz:B.dark);
    }
    put(cx,115,cz+face*5,B.light);
  }
}

// A visual structural audit, not a real-world stress or material-strength solver.
function mirrorState(state,axis) {
  const pair=axis==='x'?['east','west']:['north','south'];
  return state.replace(/facing=(north|south|east|west)/,(_,v)=>`facing=${v===pair[0]?pair[1]:v===pair[1]?pair[0]:v}`);
}
const mirroredErrors=[];
for(const c of cells.values()) for(const axis of ['x','z']) {
  const other=cells.get(key(axis==='x'?-c.x:c.x,c.y,axis==='z'?-c.z:c.z));
  if(!other||other.state!==mirrorState(c.state,axis)) {
    if(mirroredErrors.length<12) mirroredErrors.push({axis,at:[c.x,c.y,c.z],state:c.state,other:other?.state});
  }
}
const remaining=new Set(cells.keys());
const components=[];
const moves=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
while(remaining.size) {
  const first=remaining.values().next().value;
  const queue=[cells.get(first)];remaining.delete(first);
  for(let i=0;i<queue.length;i++) {
    const c=queue[i];
    for(const [dx,dy,dz] of moves) {
      const k=key(c.x+dx,c.y+dy,c.z+dz);
      if(remaining.delete(k)) queue.push(cells.get(k));
    }
  }
  components.push({count:queue.length,first:[queue[0].x,queue[0].y,queue[0].z],grounded:queue.some(c=>c.y===63)});
}
const headroomErrors=[];
for(let side=0;side<4;side++) for(const {r,y} of stairProfile) for(let u=-6;u<=6;u++) {
  const [x,z]=rotate(u,r,side);
  for(let dy=1;dy<=3;dy++) if(cells.has(key(x,y+dy,z))) headroomErrors.push([x,y+dy,z]);
}
const pierErrors=[];
for(const sx of [-1,1]) for(const sz of [-1,1]) for(let y=63;y<=133;y++)
  if(!cells.has(key(sx*33,y,sz*18))) pierErrors.push([sx*33,y,sz*18]);
const coreErrors=[];
for(const c of cells.values()) if(Math.hypot(c.x,c.y-130,c.z)<12) coreErrors.push([c.x,c.y,c.z]);
const audit={reviewOnly:true,recordingStarted:false,bounds:[-80,63,-80,80,172,80],blocks:cells.size,
  mirrorXandZ:mirroredErrors.length===0,mirrorErrors:mirroredErrors,
  connectedComponents:components,stairHeadroomClear:headroomErrors.length===0,headroomErrors:headroomErrors.slice(0,20),
  fourPiersContinuousToGround:pierErrors.length===0,pierErrors,
  blackHoleClearRadius12:coreErrors.length===0,coreErrors:coreErrors.slice(0,20),
  note:'Connectivity uses face-adjacent voxel cells. Symmetry includes stair directions. This does not certify engineering loads.'};
fs.writeFileSync(path.join(out,'structural-audit.json'),JSON.stringify(audit,null,2));
if(mirroredErrors.length||headroomErrors.length||pierErrors.length||coreErrors.length||components.length!==1)
  throw Error(`Structural audit failed: ${JSON.stringify(audit)}`);
const palette=[],lookup=new Map();
const blocks=[...cells.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x).map(c=>{
  if(!lookup.has(c.state)){lookup.set(c.state,palette.length);palette.push(`minecraft:${c.state}`);}
  return [c.x,c.y,c.z,lookup.get(c.state)];
});
const approvedPath=path.join(root,'../altar-review-v2/production/final-blueprint.json.gz');
const approved=JSON.parse(zlib.gunzipSync(fs.readFileSync(approvedPath)));
if(approved.blocks.length!==cells.size) throw Error('Approved block count changed');
for(const [x,y,z,p] of approved.blocks) {
  if(`minecraft:${cells.get(key(x,y,z))?.state}`!==approved.palette[p]) throw Error(`Approved block changed at ${key(x,y,z)}`);
}
const catalog={blocks:[...cells.values()],approvedBlocks:cells.size,revision:approved.revision,
  blackHoleCommand:approved.blackHoleCommand};
fs.writeFileSync(path.join(out,'catalog.json.gz'),zlib.gzipSync(JSON.stringify(catalog)));
fs.copyFileSync(approvedPath,path.join(out,'approved-blueprint.json.gz'));
const counts={};
for(const c of cells.values()) counts[c.section]=(counts[c.section]||0)+1;
console.log(JSON.stringify({approvedMatch:true,blocks:cells.size,sections:counts},null,2));
