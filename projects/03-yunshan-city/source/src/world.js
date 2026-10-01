import * as THREE from '../vendor/three.module.js';
import { VoxelBatch, house, palace, pine, broadleaf, pavilion, pagoda, gate, streetLantern, roof, districtMonuments } from './architecture.js';
import { createPlan, createHeightField, DISTRICTS, SITES, RIVER, PILGRIMAGE, rawHeight } from './plan.js';
import { random, hash, fbm, clamp, lerp, snap, nearestSegment, samplePolyline, pointAt } from './math.js';

function terrainGeometry(sample,x0,x1,z0,z1,step,far=false,mask=null){
 const nx=Math.ceil((x1-x0)/step),nz=Math.ceil((z1-z0)/step),heights=new Float32Array(nx*nz),positions=[],colors=[],normals=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)heights[j*nx+i]=snap(sample(x0+(i+.5)*step,z0+(j+.5)*step),far?4:.4);
 const c=new THREE.Color(),topC=new THREE.Color();
 function quad(a,b,d,e,color,normal){for(const p of [a,b,d,a,d,e]){positions.push(...p);colors.push(color.r,color.g,color.b);normals.push(...normal);}}
 const get=(i,j)=>i<0||i>=nx||j<0||j>=nz?0:heights[j*nx+i];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const x=x0+i*step,z=z0+j*step,h=get(i,j),east=get(i+1,j),west=get(i-1,j),south=get(i,j+1),north=get(i,j-1);
  if(mask&&!mask(x+step/2,z+step/2))continue;
  const slope=Math.max(Math.abs(h-east),Math.abs(h-west),Math.abs(h-south),Math.abs(h-north));
  const n=fbm(x*.009+1,z*.009),small=hash(i,j)*.035;
  topC.setHSL(far?.38:.224+n*.067,far?.15:.20+n*.14,far?.36:.31+n*.15+small).convertSRGBToLinear();
  if(slope>10)topC.lerp(c.set(0x87938a),.25);
  if(h<26)topC.lerp(c.set(0xa3a38a),.6);
  quad([x,h,z],[x,h,z+step],[x+step,h,z+step],[x+step,h,z],topC,[0,1,0]);
  const faces=[{v:east,normal:[1,0,0],f:(lo,hi)=>[[x+step,lo,z+step],[x+step,lo,z],[x+step,hi,z],[x+step,hi,z+step]]},{v:west,normal:[-1,0,0],f:(lo,hi)=>[[x,lo,z],[x,lo,z+step],[x,hi,z+step],[x,hi,z]]},{v:south,normal:[0,0,1],f:(lo,hi)=>[[x,lo,z+step],[x+step,lo,z+step],[x+step,hi,z+step],[x,hi,z+step]]},{v:north,normal:[0,0,-1],f:(lo,hi)=>[[x+step,lo,z],[x,lo,z],[x,hi,z],[x+step,hi,z]]}];
  for(const side of faces){if(side.v>=h)continue;
   const bands=Math.min(5,Math.max(1,Math.ceil((h-side.v)/7)));
   for(let b=0;b<bands;b++){
    const low=lerp(side.v,h,b/bands),high=lerp(side.v,h,(b+1)/bands);
    c.setHSL(.20+n*.06,far?.09:.105,.37+n*.12+(b%2)*.018).convertSRGBToLinear();
    if(b===bands-1)c.lerp(topC,.30);
    quad(...side.f(low,high),c,side.normal);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingSphere();return geometry;
}

const waterVertex=`varying vec3 vWorld; varying vec3 vNormal; void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`;
const waterFragment=`uniform float uTime;uniform float uDay;uniform vec3 uSky;varying vec3 vWorld;varying vec3 vNormal;
void main(){vec2 p=floor(vWorld.xz*1.25)/1.25;float r=sin(p.x*.42+p.y*.73-uTime*1.8);float streak=step(.93,r)*.19;float grain=sin(p.x*2.3+p.y*.37+uTime*.6)*.025;float f=pow(1.-abs(dot(normalize(cameraPosition-vWorld),vNormal)),2.);vec3 deep=mix(vec3(.035,.105,.15),vec3(.16,.40,.41),uDay);vec3 col=mix(deep,uSky*.72,f*.57)+vec3(streak+grain)*(.24+.76*uDay);gl_FragColor=vec4(col,.93);#include <tonemapping_fragment> #include <colorspace_fragment>}`.replaceAll('#include','\n#include').replace('> #','>\n#');
const fallFragment=`uniform float uTime;uniform float uDay;varying vec3 vWorld;varying vec3 vNormal;
void main(){float col=floor(vWorld.x*1.5);float motion=floor((vWorld.y+uTime*34.)*1.4);float bands=sin(col*7.13)*.5+.5;float flow=sin(motion*.13+col*2.1)*.5+.5;vec3 water=mix(vec3(.15,.46,.50),vec3(.8,.94,.86),bands*.48+flow*.4);water*=.27+.73*uDay;gl_FragColor=vec4(water,.93);#include <tonemapping_fragment> #include <colorspace_fragment>}`.replaceAll('#include','\n#include').replace('> #','>\n#');

function waterRibbon(nodes,width,material){
 const curve=new THREE.CatmullRomCurve3(nodes.map(n=>new THREE.Vector3(n[0],n[1],n[2]))),points=curve.getPoints(240),pos=[],uv=[],indices=[];
 points.forEach((p,i)=>{const tangent=curve.getTangent(i/(points.length-1)),nx=-tangent.z,nz=tangent.x,w=width*(.95+Math.sin(i*.11)*.08);pos.push(p.x+nx*w,p.y+.15,p.z+nz*w,p.x-nx*w,p.y+.15,p.z-nz*w);uv.push(0,i/10,1,i/10);if(i<points.length-1){let k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,material);m.name='flowing-river';return m;
}

function publicGrade(x,z,y,width=3){
 let near=null;
 for(let i=0;i<PILGRIMAGE.length-1;i++){const p=nearestSegment(x,z,PILGRIMAGE[i],PILGRIMAGE[i+1]);if(Math.abs(p.y-y)<11&&(!near||p.d<near.d))near=p;}
 if(!near)return {y,junction:false};
 const core=width/2+2.8,blend=1-clamp((near.d-core)/6,0,1);
 return {y:lerp(y,near.y-.4,blend),junction:near.d<core+1};
}

function pathLantern(batch,x,y,z){
 for(let i=0;i<PILGRIMAGE.length-1;i++){const p=nearestSegment(x,z,PILGRIMAGE[i],PILGRIMAGE[i+1]);if(p.d<3.5&&Math.abs(y-p.y)<4)return;}
 streetLantern(batch,x,y,z);
}

function buildRoad(batch,road,field){
 const color=road.kind==='pilgrimage'?0xbbbda7:road.kind==='street'?0xa8ad98:0xb3b8a3;
 for(let seg=0;seg<road.nodes.length-1;seg++){
  const a=road.nodes[seg],b=road.nodes[seg+1],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),dy=b[1]-a[1],angle=Math.atan2(dx,dz),n=Math.max(1,Math.ceil(length/.9),Math.ceil(Math.abs(dy)/.2)),step=length/n;
  for(let k=0;k<n;k++){
   const t=(k+.5)/n,x=lerp(a[0],b[0],t),z=lerp(a[2],b[2],t);let y=lerp(a[1],b[1],t);
   if(road.kind!=='pilgrimage')y=publicGrade(x,z,y,road.width).y;y=snap(y);
   let thickness=.4;
   if(road.kind==='pilgrimage'){
    let wet=false;for(let ri=3;ri<RIVER.length-1;ri++){if(nearestSegment(x,z,RIVER[ri],RIVER[ri+1]).d<25){wet=true;break;}}
    if(!wet)thickness=Math.max(.4,y-field.sample(x,z)+.4);
   }
   if(road.kind!=='pilgrimage'&&publicGrade(x,z,y,road.width).junction){
    const strips=Math.ceil(road.width/.8),sw=road.width/strips;
    for(let strip=0;strip<strips;strip++){
     const offset=-road.width/2+(strip+.5)*sw,xx=x+Math.cos(angle)*offset,zz=z-Math.sin(angle)*offset;
     let shared=false;for(let pi=0;pi<PILGRIMAGE.length-1;pi++){const p=nearestSegment(xx,zz,PILGRIMAGE[pi],PILGRIMAGE[pi+1]);if(p.d<3&&Math.abs(p.y-y)<5){shared=true;break;}}
     if(!shared)batch.box('masonry',xx,y-.2,zz,sw+.03,.4,step+.12,color,angle);
    }
   }else batch.box('masonry',x,y-thickness/2,z,road.width,thickness,step+.12,k%9===0?0x969f91:color,angle);
  }
  const line=samplePolyline([a,b],7.5);
  if(road.kind!=='pilgrimage')for(const p of line)p.y=publicGrade(p.x,p.z,p.y,road.width).y;
  for(let j=0;j<line.length-1;j++){
   const p=line[j],ground=field.sample(p.x,p.z),exposed=p.y-ground>4||road.bridge;
   if(exposed&&(road.kind==='pilgrimage'||!publicGrade(p.x,p.z,p.y,road.width).junction)){
    for(const side of [-1,1]){const x=p.x+Math.cos(angle)*side*(road.width/2-.2),z=p.z-Math.sin(angle)*side*(road.width/2-.2);
     batch.box('masonry',x,p.y+.7,z,.6,1.4,.6,0xc2c4af,angle);
     if(j+1<line.length){const q=line[j+1],mx=(p.x+q.x)/2+Math.cos(angle)*side*(road.width/2-.2),mz=(p.z+q.z)/2-Math.sin(angle)*side*(road.width/2-.2);batch.box('masonry',mx,(p.y+q.y)/2+1.1,mz,.3,.3,Math.hypot(q.x-p.x,q.z-p.z)+.4,0xb4bba7,angle);}
    }
    if(j%3===1&&!(road.kind==='pilgrimage'&&Math.abs(dy/length)>.45)){const height=p.y-ground;batch.box('masonry',p.x,ground+height/2-.2,p.z,road.width*.8,Math.max(.4,height),2,0x929e95,angle);batch.box('masonry',p.x,p.y-1,p.z,road.width+1.2,1.6,3.2,0xa7b1a2,angle);}
   }
   if(road.kind==='link'&&j%5===0)pathLantern(batch,p.x+Math.cos(angle)*(road.width/2+1),p.y,p.z-Math.sin(angle)*(road.width/2+1));
  }
 }
}

function details(batch,field,plan){
 const rng=random(917);
 // Many trees are grouped into groves; peaks, roads and courtyards retain open air.
 for(let z=-587;z<514;z+=11)for(let x=-626;x<625;x+=11){
  const xx=x+(rng()-.5)*8,zz=z+(rng()-.5)*8,y=field.sample(xx,zz);
  if(y<27||y>352||field.occupied(xx,zz,5)||rng()>clamp(.22+fbm(xx*.015,zz*.015)*.50,0,.72))continue;
  let wet=false;for(let i=0;i<RIVER.length-1;i++){if(nearestSegment(xx,zz,RIVER[i],RIVER[i+1]).d<(i<3?22:31)){wet=true;break;}}
  if(wet||Math.abs(xx+138)<40&&zz>-240&&zz<-130)continue;
  const steep=Math.abs(field.sample(xx+4,zz)-field.sample(xx-4,zz))+Math.abs(field.sample(xx,zz+4)-field.sample(xx,zz-4));
  if(steep>21||rng()<.28)pine(batch,xx,y,zz,7+rng()*11,Math.floor(rng()*9999));
  else broadleaf(batch,xx,y,zz,7+rng()*7,Math.floor(rng()*9999),rng()<.025);
 }
 for(const r of plan.roads.filter(r=>r.kind==='street')){
  const points=samplePolyline(r.nodes,26);
  points.forEach((p,i)=>{if(i%2===0)pathLantern(batch,p.x+r.width/2+1,p.y,p.z);});
 }
 // Cargo, moorings and covered boats give the lowest district a human scale.
 for(const [x,z,angle] of [[-84,211,.4],[-120,281,-.15],[-45,83,-.4],[-79,352,.5]]){
  const y=24.8,c=Math.cos(angle),s=Math.sin(angle),b=(kind,lx,ly,lz,w,h,d,col)=>batch.box(kind,x+lx*c+lz*s,y+ly,z-lx*s+lz*c,w,h,d,col,angle);
  b('timber',0,0,0,3.8,.8,12,0x594b35);b('timber',0,.6,0,3.8,.6,10,0x9b8050);
  for(const side of [-1,1])b('timber',side*1.8,1,0,.4,.8,11,0x65543c);
  b('masonry',0,1.3,-1,3,2,5,0xc5b18b);roof(b,0,2.5,-1,4.6,6.6,.55,0x537b72);
  b('timber',0,4.1,2,.2,7,.2,0x685841);b('detail',1.3,4.4,2,2.4,4.2,.2,0xc9bb94);
 }
 for(let n=0;n<5;n++){
  const z=213+n*8,x=-149+n*.9,y=27;
  batch.box('timber',x,y,z,14,.4,3.6,0x8f7852);
  for(const xx of [x-6,x+6]){batch.box('timber',xx,23.8,z,.6,7,.6,0x6d6049);batch.box('detail',xx,27.8,z,.8,.8,.8,0x7d7655);}
  for(let k=0;k<2;k++)batch.box('detail',x+3+k*1.6,y+.8,z,1.2,1.2,1.2,k?0xa48653:0x7f7955);
 }
 // Landmark silhouettes are intentionally different across the city.
 pavilion(batch,-390,field.sample(-390,13),13,10,false);
 pavilion(batch,290,field.sample(290,-15),-15,12,false);
 districtMonuments(batch,SITES);
}

export async function buildWorld(scene,onProgress=()=>{}){
 const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
 onProgress(.06,'勘山定水');const plan=createPlan(),field=createHeightField(plan),batch=new VoxelBatch();
 await yieldFrame();
 const geometry=terrainGeometry(field.sample,-690,690,-620,594,6);
 const terrain=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));terrain.name='carved-voxel-mountains';terrain.receiveShadow=true;terrain.castShadow=true;scene.add(terrain);
 const farSample=(x,z)=>{let h=15;for(let i=0;i<12;i++){const px=-1100+i*205,pz=-820+Math.sin(i*2.3)*150,ph=260+hash(i,18)*250;h=Math.max(h,ph*Math.exp(-((x-px)**2/190**2+(z-pz)**2/180**2)*1.8));}return h+(fbm(x*.012,z*.012)-.3)*60;};
 const farMaterial=new THREE.MeshLambertMaterial({vertexColors:true,color:0xbacacb});
 farMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <fog_vertex>','#include <fog_vertex>\n#ifdef USE_FOG\nvFogDepth *= 1.7;\n#endif');};
 const far=new THREE.Mesh(terrainGeometry(farSample,-1350,1350,-1280,-620,16,true),farMaterial);far.name='distant-physical-ridges';scene.add(far);
 const surround=new THREE.Mesh(terrainGeometry((x,z)=>z<-620?farSample(x,z):rawHeight(x,z),-1800,1800,-1500,1550,20,true,(x,z)=>!(x>-690&&x<690&&z>-620&&z<594)&&!(x>-1350&&x<1350&&z>-1280&&z<-620)),farMaterial);surround.name='continuous-landscape-surround';scene.add(surround);
 onProgress(.25,'筑城叠阁');await yieldFrame();
 plan.lots.forEach((lot,i)=>house(batch,lot,i));palace(batch);
 onProgress(.46,'连桥铺阶');await yieldFrame();
 for(const road of plan.roads)buildRoad(batch,road,field);
 for(const lot of plan.lots){
  const front={x:lot.x+Math.sin(lot.angle)*(lot.d/2+1.2),z:lot.z+Math.cos(lot.angle)*(lot.d/2+1.2)};
  buildRoad(batch,{nodes:[lot.street,[front.x,lot.y,front.z]],width:2.4,kind:'door'},field);
 }
 // Short public access branches for waterside views, hill towers and the veranda.
 for(const nodes of [[[0,128,-132],[-30,128,-132],[-62,128,-150]]])buildRoad(batch,{nodes,width:3.2,kind:'link'},field);
 onProgress(.62,'植松引泉');await yieldFrame();details(batch,field,plan);
 batch.flush(scene);
 const waterUniforms={uTime:{value:0},uDay:{value:1},uSky:{value:new THREE.Color(0xbdd6cf)}};
 const waterMaterial=new THREE.ShaderMaterial({uniforms:waterUniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:THREE.DoubleSide,transparent:true});
 scene.add(waterRibbon(RIVER.slice(3),27,waterMaterial));scene.add(waterRibbon([[-140,211,-363],...RIVER.slice(0,3)],20,waterMaterial));
 const fallMaterial=new THREE.ShaderMaterial({uniforms:waterUniforms,vertexShader:waterVertex,fragmentShader:fallFragment,transparent:false});
 const falls=new THREE.Group();falls.name='hundred-fathom-falls';
 for(let i=0;i<12;i++){
  const height=185+(i%3)*.6,mesh=new THREE.Mesh(new THREE.BoxGeometry(2.8,height,2.4+(i%3)*.6),fallMaterial);
  mesh.position.set(-155+i*2.8,211-height/2,-211.5+(i%2)*.8);falls.add(mesh);
 }
 scene.add(falls);
 // Voxel spray is recycled in one draw call, with a moving cloud of foam at its foot.
 const sprayCount=150,spray=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xc5e5d9,transparent:true,opacity:.64}),sprayCount),sprayData=[];
 const rng=random(512);
 for(let i=0;i<sprayCount;i++)sprayData.push({x:-160+rng()*45,z:-208+rng()*29,phase:rng(),size:.4+rng()*1.4});
 spray.frustumCulled=false;scene.add(spray);
 const foam=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshBasicMaterial({color:0xbcd8c9,transparent:true,opacity:.64}),72),dummy=new THREE.Object3D();
 for(let i=0;i<72;i++){const angle=rng()*Math.PI*2,radius=3+rng()*24;dummy.position.set(-138+Math.cos(angle)*radius,24.4,-180+Math.sin(angle)*radius*.76);dummy.scale.set(1+rng()*3,1,1+rng()*2);dummy.updateMatrix();foam.setMatrixAt(i,dummy.matrix);}scene.add(foam);
 // Thin drifting strata leave the main roofscape visible.
 const clouds=[],cloudMaterial=new THREE.MeshBasicMaterial({color:0xd4ddd1,transparent:true,opacity:.042,depthWrite:false});
 for(let i=0;i<15;i++){
  const cloud=new THREE.Group();cloud.position.set(-590+(i%5)*275,74+Math.floor(i/5)*71,-370+Math.floor(i/5)*235);
  for(let j=0;j<7;j++){const m=new THREE.Mesh(new THREE.BoxGeometry(55+rng()*80,3+rng()*5,18+rng()*36),cloudMaterial);m.position.set((j-3)*22,(rng()-.5)*4,(rng()-.5)*32);cloud.add(m);}scene.add(cloud);clouds.push({group:cloud,baseX:cloud.position.x,speed:2+rng()*1.8});
 }
 onProgress(.91,'点亮万家');await yieldFrame();
 const stats={buildings:plan.lots.length+22,voxels:batch.count,roads:plan.roads.length,terrainTriangles:geometry.attributes.position.count/3};
 function update(elapsed,day,sky){
  waterUniforms.uTime.value=elapsed;waterUniforms.uDay.value=day;waterUniforms.uSky.value.copy(sky);
  clouds.forEach((c,i)=>{c.group.position.x=c.baseX+Math.sin(elapsed*.007+i)*62;});
  for(let i=0;i<sprayCount;i++){const s=sprayData[i],t=(s.phase+elapsed*.32)%1;dummy.position.set(s.x+Math.sin(t*8+i)*2,24.6+Math.sin(t*Math.PI)*(3+(i%7)),s.z+t*6);dummy.scale.set(s.size*(1-t*.65),s.size*(1-t*.65),s.size*(1-t*.65));dummy.updateMatrix();spray.setMatrixAt(i,dummy.matrix);}spray.instanceMatrix.needsUpdate=true;
  const light=batch.materials.light;light.color.setRGB(lerp(1.75,.36,day),lerp(.81,.28,day),lerp(.26,.18,day));
  spray.material.color.setRGB(.30+day*.53,.48+day*.42,.49+day*.36);foam.material.opacity=.24+day*.39;
  cloudMaterial.opacity=.026+day*.025;cloudMaterial.color.copy(sky);
 }
 return {plan,field,batch,stats,update,terrain,clouds,setClouds:v=>clouds.forEach(c=>c.group.visible=v)};
}
