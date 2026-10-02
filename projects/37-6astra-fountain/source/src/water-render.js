import * as THREE from 'three/webgpu';
import { wgslFn, uniform, instanceIndex, positionGeometry, cameraPosition, positionWorld, uv, uint, vec2, vec3, color, mix, dot, max, pow, reflect, screenUV, reflector, texture, varying } from 'three/tsl';
import { CORE_COUNT, PARTICLE_COUNT, GRID } from './simulation.js';

const coreVertex=wgslFn(`
fn coreVertex(corner:vec3f,id:u32,eye:vec3f,ps:ptr<storage,array<vec4f>,read>,vs:ptr<storage,array<vec4f>,read>,ms:ptr<storage,array<vec4f>,read>)->vec3f {
  let p=(*ps)[id];let v=(*vs)[id];let m=(*ms)[id];
  let stream=id/512u;let previous=stream*512u+(id%512u+511u)%512u;
  let b=(*ps)[previous];let bv=(*vs)[previous];let bm=(*ms)[previous];
  let d=b.xyz-p.xyz;let len=length(d);
  // Only consecutive, still coherent water states can create a surface.
  // This prevents connecting different emission cycles or collision rebounds.
  if(v.w!=1.0||bv.w!=1.0||abs(m.w-bm.w)>.018||len>.22||len<.00001){return vec3f(0.0,-12.0,0.0);}
  let view=normalize(eye-(p.xyz+b.xyz)*.5);
  var side=normalize(cross(d,view)+vec3f(.00001));
  if(stream>=32u){side=normalize(vec3f(p.z,0.0,-p.x));}
  let thinning=select(1.0-smoothstep(.30,1.35,p.w)*.70,1.0-smoothstep(.08,.6,p.w)*.72,stream>=32u);
  let width=m.x*thinning;
  return mix(p.xyz,b.xyz,corner.y+.5)+side*corner.x*width*2.0;
}`);
const dropVertex=wgslFn(`
fn dropVertex(corner:vec3f,id:u32,eye:vec3f,ps:ptr<storage,array<vec4f>,read>,vs:ptr<storage,array<vec4f>,read>,ms:ptr<storage,array<vec4f>,read>)->vec3f {
  let p=(*ps)[id];let v=(*vs)[id];let m=(*ms)[id];
  if(v.w<.5||(v.w==1.0&&p.w<.62)){return vec3f(0.0,-12.0,0.0);}
  let vel=normalize(v.xyz+vec3f(.0001));let view=normalize(eye-p.xyz);
  let side=normalize(cross(vel,view)+vec3f(.0001));
  let radius=min(m.x,.014)*select(1.0,.62,v.w==1.0);
  let stretch=clamp(length(v.xyz)*.012,.014,.12);
  return p.xyz+side*corner.x*radius*2.0+vel*corner.y*stretch;
}`);
const shadeWater=wgslFn(`
fn shadeWater(q:vec2f,world:vec3f,eye:vec3f,sun:vec3f,day:f32,night:f32,clock:f32)->vec4f {
  let x=(q.x-.5)*2.0;let edge=pow(max(0.0,1.0-x*x),.65);
  let view=normalize(eye-world);let right=normalize(cross(vec3f(0.0,1.0,.001),view));
  let micro=sin(world.y*173.0+world.x*61.0-clock*8.0)*.075;
  let n=normalize(view*sqrt(max(.01,1.0-x*x))+right*x+vec3f(0.0,micro,0.0));
  let spec=pow(max(dot(reflect(-sun,n),view),0.0),65.0);
  let rim=pow(abs(x),3.0);
  let back=pow(max(dot(-sun,view),0.0),3.0);
  let tint=mix(vec3f(.20,.39,.35),vec3f(.68,.82,.75),edge)*(.28+day*.8);
  let shimmer=vec3f(1.0,.88,.63)*(spec*4.5+back*.36+rim*.36)*day;
  let underwater=vec3f(.20,.80,.70)*night*(.3+.7*exp(-abs(world.y-2.7)*.23));
  return vec4f(tint+shimmer+underwater,edge*(.25+spec*.35+back*.13+night*.10));
}`);
const readWave=wgslFn(`
fn readWave(q:vec2f,layer:u32,field:ptr<storage,array<vec4f>,read>)->vec4f{
  let p=clamp(q,vec2f(.0),vec2f(.99999))*127.0;
  let cell=vec2u(floor(p));let f=fract(p);let base=layer*16384u+cell.y*128u+cell.x;
  let a=(*field)[base];let b=(*field)[min(base+1u,layer*16384u+16383u)];
  let c=(*field)[min(base+128u,layer*16384u+16383u)];let d=(*field)[min(base+129u,layer*16384u+16383u)];
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}`);
const waveNormal=wgslFn(`
fn waveNormal(q:vec2f,layer:u32,r:f32,field:ptr<storage,array<vec4f>,read>)->vec3f{
  let dx=1.0/127.0;
  let a=readWave(q-vec2f(dx,0.0),layer,field).x;let b=readWave(q+vec2f(dx,0.0),layer,field).x;
  let c=readWave(q-vec2f(0.0,dx),layer,field).x;let d=readWave(q+vec2f(0.0,dx),layer,field).x;
  return normalize(vec3f((a-b)*1.7,4.0*r/127.0,(c-d)*1.7));
}`,[readWave]);
const eventVertex=wgslFn(`
fn eventVertex(local:vec3f,id:u32,clock:f32,kind:f32,ev:ptr<storage,array<vec4f>,read>)->vec3f{
  let e=(*ev)[id];let age=clock-e.w;
  if(age<0.0||age>select(1.1,.34,kind>.5)){return vec3f(0.0,-12.0,0.0);}
  if(kind<.5){let r=.015+age*.34;return e.xyz+vec3f(local.x*r,.007,local.z*r);}
  let angle=atan2(local.z,local.x);let r=.035+age*.27;
  let crown=sin(age/.34*3.14159)*.10*(.7+sin(angle*7.0+f32(id))*.3);
  return e.xyz+vec3f(local.x*r,local.y*crown+.006,local.z*r);
}`);

function discGrid(radius,inner,y){
  const p=[],norm=[],uvs=[],indices=[];
  for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){p.push((x/(GRID-1)*2-1)*radius,y,(z/(GRID-1)*2-1)*radius);norm.push(0,1,0);uvs.push(x/(GRID-1),z/(GRID-1));}
  for(let z=0;z<GRID-1;z++)for(let x=0;x<GRID-1;x++){
    const r=Math.hypot((x+.5)/(GRID-1)*2-1,(z+.5)/(GRID-1)*2-1)*radius;
    if(r>radius*.992||r<inner)continue;
    const a=z*GRID+x,b=a+1,c=a+GRID,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);return geo;
}
export function createWater(scene,simulation){
  const refractionTarget=new THREE.RenderTarget(Math.round(innerWidth*.8),Math.round(innerHeight*.8),{type:THREE.HalfFloatType,depthBuffer:true});
  refractionTarget.texture.name='Opaque courtyard refraction';
  const clock=uniform(0),day=uniform(1),night=uniform(0),sun=uniform(new THREE.Vector3(-.5,.45,-.65).normalize());
  const ps=simulation.positions.node,vs=simulation.velocities.node,ms=simulation.metadata.node,ev=simulation.events.node,field=simulation.field.node;
  const waterObjects=[];
  function mesh(g,m,count){const o=new THREE.Mesh(g,m);if(count)o.count=count;o.frustumCulled=false;o.renderOrder=3;scene.add(o);waterObjects.push(o);return o;}
  function material(){return new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide});}
  const coreMat=material();
  coreMat.positionNode=coreVertex(positionGeometry,instanceIndex,cameraPosition,ps,vs,ms);
  const coreShade=shadeWater(uv(),positionWorld,cameraPosition,sun,day,night,clock);
  coreMat.colorNode=coreShade.rgb;coreMat.opacityNode=coreShade.a;
  const streams=mesh(new THREE.PlaneGeometry(1,1),coreMat,CORE_COUNT);streams.name='Connected GPU water states';
  const dropMat=material();dropMat.positionNode=dropVertex(positionGeometry,instanceIndex,cameraPosition,ps,vs,ms);
  const dropShade=shadeWater(uv(),positionWorld,cameraPosition,sun,day,night,clock);
  const oval=uv().sub(.5).mul(vec2(2,2)).length().oneMinus().max(0).pow(.55);
  dropMat.colorNode=dropShade.rgb.mul(1.3);dropMat.opacityNode=dropShade.a.mul(oval).mul(1.7);
  const drops=mesh(new THREE.PlaneGeometry(1,1),dropMat,PARTICLE_COUNT);drops.name='Velocity-stretched droplets';
  const reflection=reflector({resolutionScale:.5,bounces:false,generateMipmaps:false});
  reflection.target.rotation.x=-Math.PI/2;reflection.target.position.y=.565;scene.add(reflection.target);
  const surfaces=[];
  const radii=[3.16,1.565,.844],inners=[.46,.30,.15],heights=[.565,1.925,3.215];
  for(let layer=0;layer<3;layer++){
    const g=discGrid(radii[layer],inners[layer],heights[layer]);
    const mat=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const wave=readWave(uv(),uint(layer),field);
    mat.positionNode=positionGeometry.add(vec3(0,readWave(uv(),uint(layer),field).x,0));
    const normal=waveNormal(uv(),uint(layer),radii[layer],field);
    const view=cameraPosition.sub(positionWorld).normalize();
    const fresnel=dot(normal,view).abs().oneMinus().pow(5).mul(.88).add(.065);
    const refracted=texture(refractionTarget.texture,screenUV.add(normal.xz.mul(.016))).rgb.mul(color(0xb8d8c2));
    let reflected;
    if(layer===0){reflection.uvNode=screenUV.flipX().add(normal.xz.mul(.018));reflected=reflection.rgb;}
    else{reflected=mix(color(0x152b34),color(0xc5d8df),day).add(night.mul(vec3(.015,.06,.05)));}
    const highlight=pow(max(dot(reflect(sun.negate(),normal),view),0),110).mul(day).mul(vec3(3.8,3.0,1.9));
    const body=mix(refracted,reflected,fresnel).add(highlight).add(night.mul(vec3(.008,.10,.08)));
    const foam=wave.z.mul(.82).clamp(0,.8);
    mat.colorNode=mix(body,color(0xd9e7d9).mul(day.mul(.72).add(.28)),foam);
    mat.opacity=1;
    const o=mesh(g,mat);o.renderOrder=1+layer*.1;o.name=['Pool wave field','Lower bowl wave field','Upper bowl wave field'][layer];surfaces.push(o);
  }
  const eventId=instanceIndex.mul(uint(8));
  const age=clock.sub(varying(ev.element(eventId).w));
  const ringGeo=new THREE.RingGeometry(.84,1,24);ringGeo.rotateX(-Math.PI/2);
  const ringMat=material();ringMat.positionNode=eventVertex(positionGeometry,eventId,clock,0,ev);
  ringMat.colorNode=mix(color(0x619b93),color(0xeeeece),day);ringMat.opacityNode=age.div(1.1).oneMinus().clamp(0,1).pow(2).mul(.23);
  const rings=mesh(ringGeo,ringMat,PARTICLE_COUNT/8);rings.name='Collision ring accents';
  const crownGeo=new THREE.CylinderGeometry(1.15,.78,1,14,1,true);crownGeo.translate(0,.5,0);
  const crownMat=material();crownMat.positionNode=eventVertex(positionGeometry,eventId,clock,1,ev);
  crownMat.colorNode=mix(color(0x4eb7ac),color(0xe5e8d0),day);crownMat.opacityNode=age.div(.34).oneMinus().clamp(0,1).mul(.3);
  const crowns=mesh(crownGeo,crownMat,PARTICLE_COUNT/8);crowns.name='Collision splash crowns';
  return {objects:waterObjects,surfaces,clock,day,night,sun,reflection,refractionTarget};
}
