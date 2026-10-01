import { clamp, lerp, fbm, nearestSegment, random, samplePolyline, pointAt, snap } from './math.js';

export const PEAKS = [
  [-396,-235,255,185,220],[-190,-475,334,195,190],[151,-408,366,167,212],
  [415,-235,285,185,226],[-337,93,121,190,180],[333,111,138,180,200],
  [91,337,64,232,185],[-516,-451,238,142,193], [567,-447,234,161,147],
  [-548,-87,111,143,218], [514,239,80,180,180], [26,-222,179,145,154], [-133,-296,223,108,151]
];
export const RIVER = [[-142,211,-340],[-137,211,-272],[-138,211,-216],[-138,24,-151],[-122,24,-113],[-101,24,-43],[-52,24,33],[-22,24,102],[-46,24,170],[-98,24,234],[-111,24,317],[-63,24,417],[-57,24,585]];
export const DISTRICTS = [
 {id:'harbor',name:'漱玉埠',sub:'水巷 · 商埠',type:'harbor',color:'#dab684',lanes:2,spacing:23,nodes:[[-185,25,258],[-164,30,192],[-180,43,126],[-211,53,64],[-226,62,2]]},
 {id:'market',name:'千灯坊',sub:'长街 · 烟火',type:'market',color:'#d9b37a',lanes:3,spacing:23,nodes:[[123,34,233],[112,32,174],[90,38,113],[97,50,47],[95,66,-12],[77,94,-77]]},
 {id:'academy',name:'青麓书院',sub:'竹院 · 琴台',type:'academy',color:'#bfc7a1',lanes:3,spacing:27,nodes:[[-443,68,137],[-385,85,109],[-352,109,55],[-313,121,9],[-299,136,-56],[-326,161,-115]]},
 {id:'westgate',name:'长风关',sub:'雄关 · 西岭',type:'fort',color:'#afb6a0',lanes:2,spacing:26,nodes:[[-477,148,-203],[-445,184,-255],[-393,225,-277],[-333,225,-285],[-278,247,-330]]},
 {id:'east',name:'望川城',sub:'山街 · 重楼',type:'urban',color:'#d6b18a',lanes:3,spacing:25,nodes:[[279,65,252],[321,80,204],[329,106,145],[347,124,91],[373,136,36],[397,157,-29]]},
 {id:'sunset',name:'栖霞坊',sub:'层台 · 花苑',type:'garden',color:'#d7ac94',lanes:3,spacing:25,nodes:[[444,179,-81],[446,203,-138],[410,243,-190],[370,255,-237],[354,235,-290]]},
 {id:'upper',name:'云阙上城',sub:'天街 · 云廊',type:'palace',color:'#d5c09b',lanes:2,spacing:27,nodes:[[31,211,-304],[87,249,-287],[139,280,-310],[187,291,-353],[200,309,-415]]},
 {id:'monastery',name:'松风禅院',sub:'古刹 · 松涛',type:'temple',color:'#c9b68c',lanes:2,spacing:28,nodes:[[-323,265,-426],[-278,284,-456],[-219,313,-464],[-167,317,-483],[-130,285,-528]]}
];
export const SITES=[
 {id:'academy-court',x:-413,y:94,z:26,w:49,d:41,type:'academy'},
 {id:'monastery-court',x:-239,y:297,z:-414,w:47,d:38,type:'temple'},
 {id:'garden-court',x:455,y:233,z:-222,w:41,d:35,type:'garden'},
 {id:'east-tower',x:385,y:138,z:75,w:23,d:23,type:'pagoda'},
 {id:'west-gate',x:-423,y:213,z:-244,w:24,d:15,type:'gate'}
];

// A continuous public way, from the quay to the temple courts and the summit.
export const PILGRIMAGE = [
 [-181,25,254],[-175,26,230],[-164,30,192],[-160,29,168],[-124,29,154],[-84,33,144],[-43,38,132],[-4,36,124],[40,35,120],[90,38,113],
 [94,43,82],[97,50,47],[95,66,-12],[77,94,-77],[57,108,-101],[27,120,-120],
 [0,128,-124],[0,128,-151],[0,145,-171],[0,145,-184],[0,163,-203],[0,163,-212],
 [28,163,-212],[55,169,-228],[67,184,-254],[39,198,-276],[31,211,-304],
 [44,211,-304],[87,249,-287],[112,262,-297],[139,280,-310],[159,284,-329],
 [187,291,-353],[211,304,-376],[247,318,-398],[242,328,-425],[213,340,-422],
 [187,350,-404],[166,360,-419],[148,376,-434],[148,376,-454]
];
export const STOPS = [
 {id:'quay',name:'漱玉水埠',tag:'01',text:'舟楫过水巷，千家入画中。',node:0},
 {id:'bridge',name:'卧虹长桥',tag:'02',text:'一桥越溪谷，两岸起重城。',node:6},
 {id:'street',name:'千灯长街',tag:'03',text:'沿山拾级，听见市井的回声。',node:11},
 {id:'palace',name:'听瀑天阙',tag:'04',text:'百丈飞泉落，重檐向云开。',node:18},
 {id:'cloud',name:'云上天街',tag:'05',text:'回望来时路，城在万山间。',node:30},
 {id:'summit',name:'揽月亭',tag:'06',text:'登临群峰之上，看日月照九城。',node:40}
];
export const LINKS = [
 {nodes:[[-226,62,2],[-257,94,-10],[-299,124,-6]],width:5},
 {nodes:[[-326,161,-115],[-356,181,-149],[-386,199,-175],[-414,209,-193],[-428,208,-235]],width:5},
 {nodes:[[-278,247,-330],[-286,256,-369],[-323,265,-426]],width:4},
 {nodes:[[-278,247,-330],[-231,218,-321],[-202,213,-303],[-137,216,-290],[-73,213,-304],[31,211,-304]],width:6,bridge:true},
 {nodes:[[200,309,-415],[244,283,-366],[290,244,-319],[354,235,-290]],width:5},
 {nodes:[[95,66,-12],[144,72,3],[197,90,22],[249,107,43],[297,119,60],[347,124,91]],width:6},
 {nodes:[[397,157,-29],[424,166,-49],[444,179,-81]],width:5},
 {nodes:[[123,34,233],[181,35,260],[226,48,267],[279,65,252]],width:5},
 {nodes:[[-185,25,258],[-221,44,226],[-262,60,219],[-311,65,188],[-370,64,169],[-443,68,137]],width:4}
];

export function rawHeight(x,z) {
 let h=4;
 for(const [px,pz,ph,rx,rz] of PEAKS){const dx=(x-px)/rx,dz=(z-pz)/rz;const g=Math.exp(-(dx*dx+dz*dz)*1.30); h=Math.max(h, ph*g);}
 const rugged=(fbm(x*.017+17,z*.018-13)-.44)*46;
 h+=rugged*clamp(h/95,.12,1.0)+5;
 // A rocky, flat-topped source cliff forms the waterfall's head.
 const ledge=clamp((66-Math.abs(x+138))/24,0,1)*clamp((z+382)/22,0,1)*clamp((-211-z)/8,0,1);
 h=lerp(h,207,ledge);
 // A real river valley cuts through the mountains, instead of sitting on top.
 for(let i=3;i<RIVER.length-1;i++){
  const near=nearestSegment(x,z,RIVER[i],RIVER[i+1]),w=i===3?39:i>8?34:27;
  const f=clamp((w+28-near.d)/28,0,1); if(f>0) h=lerp(h,18+fbm(x*.05,z*.05)*3,f*f*(3-2*f));
 }
 if(z>-212 && z<-133 && Math.abs(x+138)<43) { const edge=clamp((43-Math.abs(x+138))/10,0,1); h=lerp(h,19,edge); }
 return Math.max(2,snap(h,1.2));
}

export function createPlan() {
 const rng=random(771);const roads=[],lots=[],pads=[],walkingCorridor=samplePolyline(PILGRIMAGE,2);
 const road=(nodes,width=5,kind='street',bridge=false)=>{const r={nodes,width,kind,bridge};roads.push(r);return r;};
 for(const d of DISTRICTS){
  const center=samplePolyline(d.nodes,2);const length=center.at(-1).d;
  for(let lane=0;lane<d.lanes;lane++){
   const offset=(lane-(d.lanes-1)/2)*40;
   const nodes=d.nodes.map((n,i)=>{
    const before=d.nodes[Math.max(0,i-1)],after=d.nodes[Math.min(d.nodes.length-1,i+1)],dx=after[0]-before[0],dz=after[2]-before[2],len=Math.hypot(dx,dz);
    const x=n[0]-dz/len*offset,z=n[2]+dx/len*offset;
    const variation=clamp((rawHeight(x,z)-rawHeight(n[0],n[2]))*.65,-19,19);
    return [snap(x),snap(n[1]+variation),snap(z)];
   });
   const r=road(nodes,lane===Math.floor(d.lanes/2)?6.4:4,'street');r.district=d.id;
   const line=samplePolyline(nodes,1);const total=line.at(-1).d;
   for(let dist=13;dist<total-9;dist+=d.spacing+(rng()-.5)*5){
    const p=pointAt(line,dist),q=pointAt(line,Math.min(total,dist+1)),dx=q.x-p.x,dz=q.z-p.z,L=Math.hypot(dx,dz)||1;
    for(const side of [-1,1]){
     if(rng()<.11)continue;
     const depth=snap(8+rng()*4),width=snap(d.spacing-7+rng()*2),offset=depth/2+r.width/2+2.4;
     const nx=-dz/L*side,nz=dx/L*side,x=p.x+nx*offset,z=p.z+nz*offset,y=snap(p.y+.4);
     // Preserve the open waterfall gorge, and the palace's processional axis.
     if(x>-184&&x<-80&&z<-134&&z>-271)continue;
     if(x>-70&&x<70&&z>-248&&z<-120)continue;
     if(SITES.some(s=>Math.abs(x-s.x)<s.w/2+width/2+4&&Math.abs(z-s.z)<s.d/2+depth/2+4))continue;
     let angle=Math.atan2(-nx,-nz);
     const lot={x:snap(x),y,z:snap(z),w:width,d:depth,angle,district:d,type:d.type,seed:rng(),side,street:[p.x,p.y,p.z],stories: d.type==='urban'||d.type==='palace'?2+(rng()>.65?1:0):1+(rng()>.45?1:0)};
     const ca=Math.cos(angle),sa=Math.sin(angle);
     if(walkingCorridor.some(v=>{if(v.y<y-3||v.y>y+lot.stories*3.8+6)return false;const dx=v.x-lot.x,dz=v.z-lot.z;return Math.abs(dx*ca-dz*sa)<width/2+2.8&&Math.abs(dx*sa+dz*ca)<depth/2+2.8;}))continue;
     lots.push(lot);pads.push({x:lot.x,z:lot.z,y:y-.6,w:width+2,d:depth+2,angle,margin:5});
    }
   }
   if(lane>0){const prior=roads.filter(x=>x.district===d.id).at(-2);for(let j=0;j<nodes.length;j+=2){road([prior.nodes[j],nodes[j]],3.2,'stair');}}
  }
  // District avenues are accessible from every terrace lane.
  road(d.nodes,5.6,'street');
 }
 LINKS.forEach(l=>road(l.nodes,l.width,'link',l.bridge));
 for(const s of SITES)pads.push({...s,angle:0,margin:10});
 road([[-385,85,109],[-421,94,66],[-413,94,48]],4,'link');
 road([[-278,284,-456],[-260,297,-434],[-239,297,-393]],4,'link');
 road([[410,243,-190],[447,233,-193],[455,233,-203]],4,'link');
 road([[373,136,36],[385,138,61]],4,'link');
 road(PILGRIMAGE,4.8,'pilgrimage');
 // The palace rises on three nested stone courts, each connected by a broad stair.
 pads.push({x:0,z:-145,y:127,w:102,d:38,angle:0,margin:9}, {x:0,z:-180,y:144,w:86,d:36,angle:0,margin:8}, {x:0,z:-222,y:162,w:71,d:47,angle:0,margin:8});
 pads.push({x:148,z:-454,y:375,w:22,d:23,angle:0,margin:8});
 return {roads,lots,pads};
}

export function createHeightField(plan) {
 // Spatial bins avoid evaluating every stamp for every terrain / vegetation sample.
 const bins=new Map(),cell=32;
 function add(item,minx,maxx,minz,maxz){for(let x=Math.floor(minx/cell);x<=Math.floor(maxx/cell);x++)for(let z=Math.floor(minz/cell);z<=Math.floor(maxz/cell);z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item);}}
 for(const r of plan.roads.filter(r=>r.district)){r.nodes.forEach((a,i)=>{if(i===r.nodes.length-1)return;const b=r.nodes[i+1];add({a,b,broad:true},Math.min(a[0],b[0])-65,Math.max(a[0],b[0])+65,Math.min(a[2],b[2])-65,Math.max(a[2],b[2])+65);});}
 for(const p of plan.pads){const r=Math.hypot(p.w,p.d)/2+p.margin;add({pad:p},p.x-r,p.x+r,p.z-r,p.z+r);}
 for(const r of plan.roads){if(r.bridge)continue;r.nodes.forEach((a,i)=>{if(i===r.nodes.length-1)return;const b=r.nodes[i+1],margin=r.width/2+5;add({a,b,width:r.width,walk:r.kind==='pilgrimage'},Math.min(a[0],b[0])-margin,Math.max(a[0],b[0])+margin,Math.min(a[2],b[2])-margin,Math.max(a[2],b[2])+margin);});}
 function sample(x,z){let h=rawHeight(x,z);const items=bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[];
  let gradeSum=0,gradeWeight=0,gradeBlend=0;
  for(const item of items){if(!item.broad)continue;const near=nearestSegment(x,z,item.a,item.b),weight=Math.max(0,1-near.d/65)**4;if(weight>0){gradeSum+=(near.y-.8)*weight;gradeWeight+=weight;gradeBlend=Math.max(gradeBlend,1-clamp((near.d-15)/48,0,1));}}
  if(gradeWeight>0)h=lerp(h,gradeSum/gradeWeight,gradeBlend*.94);
  for(const item of items){if(!item.pad)continue;const p=item.pad,dx=x-p.x,dz=z-p.z,c=Math.cos(p.angle),s=Math.sin(p.angle),lx=dx*c-dz*s,lz=dx*s+dz*c,dist=Math.max(Math.abs(lx)-p.w/2,Math.abs(lz)-p.d/2),f=1-clamp(dist/p.margin,0,1);h=lerp(h,p.y,f*f*(3-2*f));}
  let closest=1e9,roadY=0,weight=0;
  for(const item of items){if(item.pad||item.broad)continue;const v=nearestSegment(x,z,item.a,item.b);if(v.d<item.width/2+5&&v.d<closest){closest=v.d;roadY=v.y-.55;weight=1-clamp((v.d-item.width/2)/5,0,1);}}
  let overWater=false;
  if(z>-133)for(let i=3;i<RIVER.length-1;i++){if(nearestSegment(x,z,RIVER[i],RIVER[i+1]).d<24){overWater=true;break;}}
  if(weight>0&&!overWater)h=lerp(h,roadY,weight*weight*(3-2*weight));
  // Account for the full six-metre surface cell beneath the narrow walking path.
  // This conservative cut prevents a neighbouring high cell from blocking stairs.
  for(const item of items){if(!item.walk)continue;const v=nearestSegment(x,z,item.a,item.b);if(v.d<7.15){const grade=Math.abs(item.b[1]-item.a[1])/Math.max(1,Math.hypot(item.b[0]-item.a[0],item.b[2]-item.a[2]));h=Math.min(h,v.y-.65-grade*4.4);}}
  return Math.max(2,snap(h,.4));
 }
 function occupied(x,z,margin=0){const items=bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[];for(const item of items){if(item.broad)continue;if(item.pad){const p=item.pad,dx=x-p.x,dz=z-p.z,c=Math.cos(p.angle),s=Math.sin(p.angle);if(Math.abs(dx*c-dz*s)<p.w/2+margin&&Math.abs(dx*s+dz*c)<p.d/2+margin)return true;}else if(nearestSegment(x,z,item.a,item.b).d<item.width/2+margin)return true;}return false;}
 return {sample,occupied};
}
