import * as THREE from '../vendor/three.module.js';
import { snap, random, clamp } from './math.js';

export class VoxelBatch {
 constructor() { this.groups=new Map();this.count=0;this.meshes=[];this.materials={
  masonry:new THREE.MeshLambertMaterial(), timber:new THREE.MeshLambertMaterial(), roof:new THREE.MeshLambertMaterial(),
  foliage:new THREE.MeshLambertMaterial(), detail:new THREE.MeshLambertMaterial(),
  light:new THREE.MeshBasicMaterial({color:0x70431e,toneMapped:false}),
  water:new THREE.MeshLambertMaterial({transparent:true,opacity:.87,depthWrite:true})
 }; }
 box(kind,x,y,z,w,h,d,color=0xffffff,angle=0) {
  if(w<=0||h<=0||d<=0)return;
  if(!this.groups.has(kind))this.groups.set(kind,[]);
  this.groups.get(kind).push([snap(x),snap(y),snap(z),Math.max(.2,snap(w)),Math.max(.2,snap(h)),Math.max(.2,snap(d)),color,angle]);this.count++;
 }
 flush(scene) {
  const geom=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),c=new THREE.Color();
  for(const [kind,items] of this.groups){const mesh=new THREE.InstancedMesh(geom,this.materials[kind],items.length);mesh.name='voxels:'+kind;
   items.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.scale.set(a[3],a[4],a[5]);dummy.rotation.set(0,a[7],0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,c.set(a[6]));});
   mesh.castShadow=kind!=='light'&&kind!=='water';mesh.receiveShadow=kind!=='light';mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scene.add(mesh);this.meshes.push(mesh);
  }this.groups.clear();
 }
}

const C={plaster:0xe2d4b5,cream:0xd7c6a1,wood:0x623f2b,red:0x944b36,dark:0x283830,stone:0x8e9992,lightstone:0xb6bbaa,slate:0x3f6664,jade:0x326b65,gold:0xba9858,paper:0xffce7e};
const roofs=[0x3c6464,0x456b68,0x486d67,0x345a60,0x56796e];

function localBuilder(batch,x,y,z,angle=0){const c=Math.cos(angle),s=Math.sin(angle);return (kind,lx,ly,lz,w,h,d,color)=>batch.box(kind,x+lx*c+lz*s,y+ly,z-lx*s+lz*c,w,h,d,color,angle);}

export function roof(b,x,y,z,w,d,scale=1,color=C.slate,royal=false){
 const step=.4*scale,layers=Math.max(5,Math.round(d/(1.45*scale)));
 for(let k=0;k<layers;k++){
  const t=k/(layers-1),depth=Math.max(.8*scale,d*(1-t)+.8*scale),width=w-1.4*scale*t;
  const yy=y+k*step;
  b('roof',x,yy,z,width,step,depth,k%3===0?new THREE.Color(color).multiplyScalar(1.07):color);
  // Tile ends break the eaves into a clear, small voxel rhythm.
  if(k===0)for(let tx=-w/2+.5;tx<w/2;tx+=1.2*scale)for(const side of [-1,1])b('roof',x+tx,yy-.16*scale,z+side*(d/2-.1*scale),.6*scale,.4*scale,.4*scale,0x678b7f);
 }
 b('detail',x,y+layers*step,z,w-1.1*scale,.4*scale,.6*scale,royal?C.gold:0x749183);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  for(let k=0;k<3;k++)b('roof',x+sx*(w/2-.9*scale+k*.28*scale),y+(.35+k*.3)*scale,z+sz*(d/2-.7*scale+k*.22*scale),(1.8-k*.35)*scale,.4*scale,(1.6-k*.3)*scale,color);
  if(royal)b('detail',x+sx*(w/2-.2*scale),y+1.35*scale,z+sz*(d/2-.2*scale),.4*scale,.8*scale,.4*scale,C.gold);
 }
 if(royal)for(const side of [-1,1]){b('detail',x+side*(w/2-1*scale),y+layers*step+.5*scale,z,.6*scale,1*scale,.6*scale,C.gold);b('detail',x+side*(w/2-1.3*scale),y+layers*step+1*scale,z,.8*scale,.4*scale,.6*scale,C.gold);}
 return layers*step;
}

function lantern(b,x,y,z,scale=1){b('timber',x,y+.9*scale,z,.2*scale,.8*scale,.2*scale,C.wood);b('detail',x,y+.4*scale,z,.8*scale,.2*scale,.8*scale,C.red);b('light',x,y,z,.6*scale,.6*scale,.6*scale,0xffce73);b('detail',x,y-.4*scale,z,.8*scale,.2*scale,.8*scale,C.red);b('detail',x,y-.8*scale,z,.2*scale,.6*scale,.2*scale,C.gold);}

function railing(b,x,y,z,w,d,opening=0){
 for(const side of [-1,1]){
  if(side===1&&opening>0){const length=(w-opening)/2;for(const sx of [-1,1])b('masonry',x+sx*(opening+length)/2,y+1.1,z+d/2,length,.2,.4,C.lightstone);}
  else b('masonry',x,y+1.1,z+side*d/2,w,.2,.4,C.lightstone);
  for(let a=-w/2;a<=w/2+.01;a+=2.4){if(side===1&&Math.abs(a)<opening/2)continue;b('masonry',x+a,y+.6,z+side*d/2,.4,1.2,.4,C.lightstone);}
 }
}

export function house(batch,lot,index){
 const {x,y,z,w,d,angle,stories,type}=lot,b=localBuilder(batch,x,y,z,angle),rng=random(index*301+171),color=roofs[index%roofs.length];
 const upscale=['palace','temple','academy'].includes(type),stilt=type==='harbor';
 const plaster=type==='fort'?0xb5b7a3:type==='palace'?0xe0c99e:type==='temple'?0xceae78:[C.plaster,C.cream,0xc8c4a8][index%3];
 const wood=type==='palace'||type==='temple'?C.red:C.wood;
 const court=upscale&&index%3!==0;
 b('masonry',0,-.6,0,w+1.8,1.2,d+1.8,C.stone);
 for(let j=0;j<3;j++)b('masonry',0,-.2+j*.2,d/2+.8-j*.2,3.2,.4,1.2,C.lightstone);
 if(stilt){for(const xx of [-w/2+.8,w/2-.8])for(const zz of [-d/2+.7,d/2-.7])b('timber',xx,-1.8,zz,.6,3.6,.6,wood);}
 let h=stories*3.8;
 if(court){
  // A genuine open courtyard with three inhabited wings and a street gate.
  const wing=Math.max(2.6,w*.22),backDepth=Math.max(3.2,d*.4);
  b('masonry',0,.1,0,w,.2,d,0xbdb9a0);
  b('masonry',0,1.9,-d/2+backDepth/2,w,3.8,backDepth,plaster);
  for(const sx of [-1,1]){b('masonry',sx*(w-wing)/2,1.7,0,wing,3.4,d,plaster);roof(b,sx*(w-wing)/2,3.6,0,wing+1.2,d+1,.7,color,upscale);}
  roof(b,0,4.2,-d/2+backDepth/2,w+1.8,backDepth+1.6,.85,color,upscale);
  b('masonry',-w*.3,1.2,d/2,w*.39,2.4,.4,plaster);b('masonry',w*.3,1.2,d/2,w*.39,2.4,.4,plaster);
  for(const sx of [-1,1])b('timber',sx*1.7,1.7,d/2,.4,3.4,.4,wood);
  roof(b,0,3.4,d/2,4.6,2.4,.6,color);
  b('detail',0,.4,-.4,1.4,.8,1.4,0x677e61);b('foliage',.2,1.2,-.4,1.4,.8,1.4,0x8b9c68);
  lantern(b,-2.2,2.2,d/2+.4,.8);lantern(b,2.2,2.2,d/2+.4,.8);
  return;
 }
 const arcade=(type==='market'||type==='urban')&&index%3!==0;
 b('masonry',0,h/2,arcade?-.6:0,w,h,arcade?d-1.2:d,plaster);
 for(let floor=0;floor<stories;floor++){
  const fy=floor*3.8;
  b('timber',0,fy+.3,0,w+.4,.4,d+.4,wood);
  b('timber',0,fy+3.5,0,w+.5,.4,d+.4,wood);
  const pillars=Math.max(3,Math.round(w/3));
  for(let p=0;p<pillars;p++){
   const px=-w/2+.4+p*(w-.8)/(pillars-1);
   for(const side of [-1,1])b('timber',px,fy+1.9,side*(d/2+.12),.4,3.6,.4,wood);
  }
  for(let p=0;p<pillars-1;p++){
   const px=-w/2+(p+.5)*w/(pillars-1),ww=Math.min(2.2,w/(pillars-1)-.7);
   for(const side of [-1,1]){
    b('timber',px,fy+2,side*(d/2+.21),ww+.4,1.8,.2,wood);
    b('light',px,fy+2,side*(d/2+.33),ww,1.4,.2,0xffd695);
    b('timber',px,fy+2,side*(d/2+.45),.2,1.6,.2,wood);
    b('timber',px,fy+2,side*(d/2+.45),ww,.2,.2,wood);
   }
  }
  if(floor>0&&(type==='urban'||type==='palace'||index%4===0)){
   b('timber',0,fy-.1,d/2+1,w+.8,.4,2.2,wood);b('timber',0,fy+1.1,d/2+1.9,w+.8,.2,.2,wood);
   for(let a=-w/2;a<w/2;a+=1.2)b('timber',a,fy+.5,d/2+1.9,.2,1.2,.2,wood);
   roof(b,0,fy-.2,0,w+2.4,d+2,.72,color,upscale);
  }
 }
 // Recessed door and lintel terminate the lane at a visible entrance.
 b('timber',0,1.4,d/2+.46,1.8,2.8,.2,0x34382f);
 b('timber',0,2.9,d/2+.5,2.6,.4,.4,wood);
 b('detail',.3,1.35,d/2+.6,.2,.2,.2,C.gold);
 roof(b,0,h+.2,0,w+2.4,d+2.5,.8,color,upscale);
 if(arcade){
  roof(b,0,3.1,d/2+1,w+1.8,3.6,.55,color);
  for(const sx of [-1,1])b('timber',sx*(w/2-.2),1.6,d/2+1.8,.4,3.2,.4,wood);
  b('timber',-w*.25,.8,d/2+1.5,w*.3,1.6,1.2,wood);
  const goods=[0xbc7548,0xc6a45c,0x8e9d67];
  for(let j=0;j<3;j++)b('detail',-w*.3+j*.7,1.8,d/2+1.4,.6,.4,.8,goods[j]);
  b('detail',w*.4,3.3,d/2+2.2,.2,2,.8,index%2?0xa4553f:0xbb9755);
 }
 lantern(b,-w/2+1.2,2.7,d/2+1.1,.8);
 if(index%2===0)lantern(b,w/2-1.2,2.7,d/2+1.1,.8);
 if(index%5===0){b('detail',w*.36,.5,d/2+1.6,.8,1,.8,0x857e60);b('foliage',w*.36,1.3,d/2+1.6,1.4,.8,1.2,0x6d8959);}
}

export function pavilion(batch,x,y,z,size=10,royal=false,angle=0){
 const b=localBuilder(batch,x,y,z,angle),r=size/2;
 b('masonry',0,-.6,0,size+2,1.2,size+2,C.stone);b('masonry',0,.1,0,size+1,.2,size+1,C.lightstone);
 for(const sx of [-1,1])for(const sz of [-1,1]){b('masonry',sx*(r-.7),.3,sz*(r-.7),1.2,.6,1.2,C.lightstone);b('timber',sx*(r-.7),3.6,sz*(r-.7),.6,6.8,.6,royal?C.red:C.wood);b('detail',sx*(r-.7),6.1,sz*(r-.7),1.2,.6,1.2,C.gold);}
 b('timber',0,6.4,0,size,.6,size,C.red);
 roof(b,0,6.7,0,size+3,size+3,1,C.jade,royal);
 for(const sz of [-1,1])lantern(b,0,5.2,sz*(r-.5),1.2);
 b('timber',0,1.1,-r+1,size-2,.4,1.2,C.wood);
}

export function pagoda(batch,x,y,z,width=13,floors=5){
 const b=localBuilder(batch,x,y,z),step=5.6;
 b('masonry',0,-1,0,width+4,2,width+4,C.stone);
 for(let f=0;f<floors;f++){
  const w=width-f*1.3,yy=f*step;
  b('masonry',0,yy+2,0,w,4,w,C.cream);
  for(const side of [-1,1])for(let v=-1;v<=1;v++){
   b('timber',v*w*.27,yy+2.1,side*(w/2+.1),.4,4.2,.4,C.red);
   b('light',v*w*.26,yy+2.1,side*(w/2+.3),1.2,1.6,.2,C.paper);
   b('timber',side*(w/2+.1),yy+2.1,v*w*.27,.4,4.2,.4,C.red);
  }
  roof(b,0,yy+4.2,0,w+4,w+4,.72,C.jade,true);
 }
 const yy=floors*step+2;b('detail',0,yy,0,.6,5,.6,C.gold);b('detail',0,yy+.3,0,1.6,.4,1.6,C.gold);
}

function hall(b,x,y,z,w,d,floors=1){
 for(let f=0;f<floors;f++){
  const yy=y+f*9,ww=w-f*8,dd=d-f*5;
  b('masonry',x,yy+3.4,z,ww-2,6.8,dd-2,C.cream);
  for(let px=-ww/2+1;px<ww/2;px+=4.8)for(const side of [-1,1]){
   b('timber',x+px,yy+3.8,z+side*(dd/2-.5),.8,7.6,.8,C.red);
   b('detail',x+px,yy+6.4,z+side*dd/2,1.6,.6,1.6,C.gold);
   b('detail',x+px,yy+6.9,z+side*dd/2,2.4,.4,2,C.red);
   b('light',x+px+1.6,yy+3.5,z+side*(dd/2-.3),2.2,3.2,.4,0xffd694);
  }
  b('timber',x,yy+7.2,z,ww+.8,.6,dd+.8,C.red);
  roof(b,x,yy+7.6,z,ww+6,dd+6,1.2,C.jade,true);
  for(const sx of [-1,1])lantern(b,x+sx*(ww/2-2),yy+5.8,z+dd/2+1,1.5);
 }
 b('timber',x,y+2.2,z+d/2,4.8,4.4,.4,0x394239);
}

export function gate(batch,x,y,z,w=16,angle=0){
 const b=localBuilder(batch,x,y,z,angle);
 for(const sx of [-1,1]){b('masonry',sx*(w*.37),3.2,0,w*.27,6.4,7.2,C.stone);b('timber',sx*(w*.32),4,3.4,.6,8,.6,C.red);}
 b('masonry',0,7.2,0,w,1.6,7.2,C.lightstone);
 hall(b,0,8,0,w-2,6,1);
 b('detail',0,7.1,3.8,4.4,1.4,.4,0x354c43);
 for(const sx of [-1,1])lantern(b,sx*3.2,5.7,4.2,1.2);
}

export function palace(batch){
 const b=localBuilder(batch,0,0,0);
 const levels=[{y:128,z:-145,w:104,d:38},{y:145,z:-180,w:87,d:36},{y:163,z:-222,w:72,d:47}];
 for(const [li,l] of levels.entries()){
  const front=l.z+l.d/2,back=l.z-l.d/2,stairEnd=li===1?-171:li===2?-203:front;
  if(li===0){b('masonry',0,l.y-4,l.z,l.w,8,l.d,C.stone);b('masonry',0,l.y-.3,l.z,l.w+1,.6,l.d+1,C.lightstone);}
  else{
   for(const side of [-1,1]){const wing=(l.w-12)/2;b('masonry',side*(6+wing/2),l.y-4,l.z,wing,8,l.d,C.stone);b('masonry',side*(6+wing/2),l.y-.3,l.z,wing,.6,l.d,C.lightstone);}
   b('masonry',0,l.y-4,(back+stairEnd)/2,12,8,stairEnd-back,C.stone);b('masonry',0,l.y-.3,(back+stairEnd)/2,12,.6,stairEnd-back,C.lightstone);
  }
  // Inlaid court paving, parapets, and broad ceremonial stairs.
  for(let x=-l.w/2+4;x<l.w/2;x+=6){const length=li>0&&Math.abs(x)<6?stairEnd-back:l.d-.8,zz=li>0&&Math.abs(x)<6?(back+stairEnd)/2:l.z;b('masonry',x,l.y+.02,zz,.2,.2,length,0xa1aa99);}
  for(const sx of [-1,1]){
   b('masonry',sx*l.w/2,l.y+.8,l.z,.4,1.6,l.d,C.lightstone);
   for(let zz=l.z-l.d/2;zz<l.z+l.d/2;zz+=3){b('masonry',sx*l.w/2,l.y+1,zz,.8,2,.8,C.lightstone);b('detail',sx*l.w/2,l.y+2.1,zz,1,.2,1,C.lightstone);}
  }
 }
 // The lower gate, side halls, tower and upper sanctum form one usable compound.
 gate(batch,0,128,-145,24);
 hall(b,-29,128,-144,21,15,1);hall(b,29,128,-144,21,15,1);
 hall(b,-25,145,-181,20,23,1);hall(b,25,145,-181,20,23,1);
 hall(b,0,163,-230,48,27,3);
 // A second rising roof stack gives the landmark its long-distance profile.
 pagoda(batch,47,145,-188,15,6);
 pavilion(batch,-49,145,-192,13,true);
 for(let level=0;level<2;level++){
  const y0=levels[level].y,y1=levels[level+1].y,z0=level===0?-151:-184,z1=level===0?-171:-203,steps=Math.round((y1-y0)/.2);
  for(let i=0;i<steps;i++){const t=i/steps;b('masonry',0,y0+i*.2-.1,z0+(z1-z0)*(t+.5/steps),10,.6,Math.abs(z1-z0)/steps+.03, i%5===0?0xbec1aa:C.lightstone);}
 }
 // Cliff-side viewing gallery and the terrace looking directly into the falls.
 b('masonry',-63,126,-159,28,4,23,C.stone);b('masonry',-63,128,-159,28,.4,23,C.lightstone);
 for(let z=-198;z<-135;z+=6){
  b('timber',-50,135,z,.6,14,.6,C.red);b('timber',-43,135,z,.6,14,.6,C.red);
  roof(b,-46.5,142,z,11,7,.7,C.jade);
 }
 railing(b,-63,128,-159,28,23);
 for(const x of [-13,13]){b('detail',x,146,-176,2.4,2.2,2.4,0x727f69);b('detail',x,148,-176,1.4,2,1.4,C.gold);}
 for(const [x,z] of [[-40,-133],[40,-133],[-34,-170],[34,-170],[-27,-207],[27,-207]]){
  b('masonry',x,levels[z<-200?2:z<-150?1:0].y+.7,z,1.8,1.4,1.8,C.lightstone);
  const y=levels[z<-200?2:z<-150?1:0].y;b('timber',x,y+3.7,z,.4,6,.4,C.red);lantern(b,x,y+5.6,z,1.5);
 }
 // Summit dais and an open, accessible pavilion.
 b('masonry',148,374.8,-454,22,2.4,23,C.stone);
 pavilion(batch,148,376,-456,12,true);
 railing(localBuilder(batch,148,376,-454),0,0,0,22,23,5);
}

export function pine(batch,x,y,z,h,seed=0){
 const r=random(seed),lean=(r()-.5)*2;
 batch.box('timber',x,y+h*.35,z,Math.max(.4,h*.07),h*.7,Math.max(.4,h*.07),0x675d43);
 const colors=[0x4d7460,0x456a59,0x577960,0x658063];
 for(let i=0;i<4;i++){
  const yy=y+h*(.36+i*.16),radius=h*(.32-i*.058),xx=x+lean*i;
  batch.box('foliage',xx,yy,z,radius*2,h*.13,radius*1.7,colors[(seed+i)%4]);
  batch.box('foliage',xx+radius*.1,yy+h*.1,z-radius*.12,radius*1.4,h*.12,radius*1.2,colors[(seed+i+1)%4]);
 }
}

export function broadleaf(batch,x,y,z,h,seed=0,blossom=false){
 const r=random(seed);batch.box('timber',x,y+h*.35,z,.6,h*.7,.6,0x6d6045);
 const palette=blossom?[0xdbb8a8,0xd0a8a3,0xe4c6ae]:[0x829269,0x748866,0x94a274,0x698269];
 for(let i=0;i<4;i++)batch.box('foliage',x+(r()-.5)*h*.4,y+h*(.62+r()*.2),z+(r()-.5)*h*.4,h*(.38+r()*.2),h*(.25+r()*.12),h*(.36+r()*.18),palette[(seed+i)%palette.length]);
}

export function streetLantern(batch,x,y,z){const b=localBuilder(batch,x,y,z);b('masonry',0,.3,0,1,.6,1,C.stone);b('timber',0,2.3,0,.4,4,.4,C.wood);b('timber',.6,4.3,0,1.6,.2,.4,C.wood);lantern(b,1.1,3.6,0,1);}

export function districtMonuments(batch,sites){
 for(const site of sites){
  const {x,y,z,w,d,type}=site,b=localBuilder(batch,x,y,z);
  b('masonry',0,-1.1,0,w,2.2,d,C.stone);b('masonry',0,.1,0,w+.8,.2,d+.8,C.lightstone);
  if(type==='gate'){gate(batch,x,y,z,21,.7);continue;}
  if(type==='pagoda'){pagoda(batch,x,y,z,15,6);continue;}
  // Boundary walls, tiled caps and a gate make these civic compounds readable.
  for(const side of [-1,1]){b('masonry',side*(w/2-.5),1.5,0,1,3,d,C.plaster);roof(b,side*(w/2-.5),3.1,0,2,d+1,.45,C.slate);}
  b('masonry',0,1.5,-d/2,w,3,1,C.plaster);
  for(const side of [-1,1])b('masonry',side*(w/4+2),1.5,d/2,w/2-4,3,1,C.plaster);
  for(const sx of [-1,1])b('timber',sx*2.7,2.6,d/2,.6,5.2,.6,C.red);
  roof(b,0,5.3,d/2,9,5,.8,C.jade,true);
  if(type==='garden'){
   b('masonry',0,.2,0,19,.4,14,0x738b7d);b('water',0,.5,0,18,.2,13,0x77aba0);
   b('masonry',0,.7,0,2.8,.4,16,C.lightstone);
   pavilion(batch,x-10,y,z-8,9,true);pavilion(batch,x+11,y,z-7,8,false);
   for(const sx of [-1,1])broadleaf(batch,x+sx*14,y,z+8,8,Math.abs(Math.floor(x))+sx,true);
  }else{
   const library=type==='academy';hall(b,0,0,-d/2+10,w-10,14,library?1:2);
   for(const sx of [-1,1]){
    hall(b,sx*(w/2-7),0,3,8,17,1);
    lantern(b,sx*(w/2-6),5.5,12,1.1);
   }
   if(library){
    b('masonry',0,.3,7,12,.6,8,0x8c9c84);b('water',0,.7,7,10,.2,6,0x5c9290);
    for(const sx of [-1,1]){b('masonry',sx*8,1.1,10,4.2,.8,1.2,C.lightstone);for(let i=0;i<6;i++){b('timber',sx*(w/2-3)+((i%2)*.6),2.3,10+i*.5,.2,4.6,.2,0x687b45);b('foliage',sx*(w/2-3),4.2,10+i*.5,1.6,1.2,.8,0x7c9561);}}
   }else{
    b('detail',0,1.2,9,3.4,2.4,3.4,0x697e72);b('detail',0,2.8,9,4,.8,4,0x819080);
    pagoda(batch,x+w/2-1,y,z-d/2+1,9,4);
   }
  }
 }
 // A west-ridge defensive wall with stepped parapets and watch stations.
 const nodes=[[-471,154,-225],[-453,179,-251],[-423,213,-244],[-400,225,-289],[-368,231,-307],[-326,233,-315]];
 for(let i=0;i<nodes.length-1;i++){
  const a=nodes[i],c=nodes[i+1],len=Math.hypot(c[0]-a[0],c[2]-a[2]),count=Math.ceil(len/2.4),angle=Math.atan2(c[0]-a[0],c[2]-a[2]);
  for(let j=0;j<count;j++){const t=(j+.5)/count,xx=a[0]+(c[0]-a[0])*t,yy=a[1]+(c[1]-a[1])*t,zz=a[2]+(c[2]-a[2])*t;if(Math.hypot(xx+423,zz+244)<12)continue;batch.box('masonry',xx,yy+2,zz,3.4,4,len/count+.2,0x8a9488,angle);batch.box('masonry',xx,yy+4.4,zz,3.8,.8,1.3,0xacb29b,angle);}
 }
}
