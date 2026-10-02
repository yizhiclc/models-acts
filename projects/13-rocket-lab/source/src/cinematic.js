import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { edgeAntialias } from './antialias.js';
import { pass, uniform, uv, vec2, vec3, vec4, float, sin, cos, mix, smoothstep, fract, texture, positionLocal, positionWorld, cameraPosition, normalize, max, mx_noise_float, renderOutput } from 'three/tsl';
import { clamp, exhaustState } from './physics.js';
import { ExhaustVisual } from './exhaust.js';

export class Cinematic {
 constructor(w){
  this.w=w;this.time=uniform(0);this.power=uniform(0);this.expansion=uniform(.65);this.soot=uniform(0);this.shimmer=uniform(0);this.shimmerCenter=uniform(new THREE.Vector2(.5,.3));
  this.sky=new SkyMesh();this.sky.scale.setScalar(90000);this.sky.material.fog=false;this.sky.material.depthWrite=false;this.sky.material.depthTest=false;this.sky.renderOrder=-2;this.spaceGain=uniform(1);this.cloudGain=uniform(1);this.sky.turbidity.value=2.8;this.sky.rayleigh.value=1.8;this.sky.mieCoefficient.value=.005;this.sky.mieDirectionalG.value=.78;this.sunVector=new THREE.Vector3(-120,92,155).normalize();this.sky.sunPosition.value.copy(this.sunVector).multiplyScalar(450000);w.scene.add(this.sky);
  // A procedural cirrus layer modulates the analytic atmosphere. It has no external texture.
  const ray=normalize(positionWorld.sub(cameraPosition)),cloudUV=ray.xz.div(max(ray.y,.07)).mul(vec2(.85,2.6)).add(vec2(this.time.mul(.0015),0));
  const cloudNoise=mx_noise_float(cloudUV).mul(.52).add(mx_noise_float(cloudUV.mul(2.13)).mul(.26)).add(mx_noise_float(cloudUV.mul(4.37)).mul(.14)).add(mx_noise_float(cloudUV.mul(8.7)).mul(.08));
  const cirrus=smoothstep(.11,.40,cloudNoise).mul(smoothstep(.08,.23,ray.y)).mul(.56).mul(this.cloudGain);
  this.sky.material.colorNode=mix(this.sky.material.colorNode.mul(vec4(.55,.76,1.0,1)),vec4(1.6,1.8,2.0,1),cirrus).mul(vec4(this.spaceGain,this.spaceGain,this.spaceGain,1));
  // The main skin contains microscopic painted metal grain and a heat-dose stain near the engine bay.
  const skin=new THREE.MeshPhysicalNodeMaterial({map:w.maps.steel,normalMap:w.maps.steelNormal,normalScale:new THREE.Vector2(.20,.20),roughnessMap:w.maps.bodyRough,roughness:.30,metalness:.88,clearcoat:.24,clearcoatRoughness:.34});
  const lower=float(1).sub(smoothstep(-31,-5,positionLocal.y));
  const mottling=sin(positionLocal.x.mul(13).add(positionLocal.y.mul(5))).mul(.12).add(.68);
  skin.colorNode=texture(w.maps.steel).rgb.mul(float(1).sub(lower.mul(mottling).mul(this.soot).mul(.72)));
  w.bodyMesh.material=skin;
  this.boosterExhausts=w.enginePods.map(pod=>new ExhaustVisual(pod,{single:true,time:this.time}));this.boosterExhaust=this.boosterExhausts[0];this.flames=this.boosterExhaust.group;this.flameMeshes=this.boosterExhausts.flatMap(e=>e.meshes);this.upperExhausts=w.upperEnginePods.map((pod,i)=>new ExhaustVisual(pod,{vacuum:i>=3,single:true,ship:true,time:this.time}));this.upperExhaust=this.upperExhausts[3];
  this.rcs=new THREE.Group();w.rocket.add(this.rcs);this.rcsJets=[];
  // Balanced cold-gas couples: ±X and ±Z transverse jets, plus tangential roll pairs.
  for(const axis of [0,1,2])for(const sign of [-1,1])for(const end of [-1,1]){
   const pos=axis===1?new THREE.Vector3(end*4.6,0,0):new THREE.Vector3(axis===2?end*4.6:0,end*29,axis===0?end*4.6:0);
   const dir=axis===1?new THREE.Vector3(0,0,-end*sign):axis===0?new THREE.Vector3(0,0,end*sign):new THREE.Vector3(-end*sign,0,0);
   const nozzle=w.cylinder(this.rcs,.09,.13,.25,0,0,0,'nozzle',12);nozzle.position.copy(pos);nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
   const jet=new THREE.Mesh(new THREE.ConeGeometry(.28,2.5,20,1,true),new THREE.MeshBasicMaterial({color:'#b7dbff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
   jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);jet.position.copy(pos).addScaledVector(dir,-1.25);jet.userData={axis,sign};this.rcs.add(jet);this.rcsJets.push(jet);
  }
  // A thin, energy-scaled pressure front is visualized separately from the persistent fire/debris field.
  this.shock=new THREE.Mesh(new THREE.TorusGeometry(1,.021,6,128),new THREE.MeshBasicMaterial({color:'#cfc5a7',transparent:true,opacity:0,depthWrite:false}));this.shock.rotation.x=Math.PI/2;this.shock.position.y=.8;w.scene.add(this.shock);
  // GTAO reconstructs normals from single-sample depth; r180 cannot do this with MSAA depth.
  this.post=new THREE.PostProcessing(w.renderer);this.scenePass=pass(w.scene,w.camera,{samples:0});
  const sceneColor=this.scenePass.getTextureNode('output'),depth=this.scenePass.getTextureNode('depth');
  this.ao=ao(depth,null,w.camera);this.ao.radius.value=1.5;this.ao.thickness.value=1.2;this.ao.scale.value=.8;this.ao.samples.value=16;this.ao.resolutionScale=.75;
  const mask=float(1).sub(smoothstep(.0,.16,uv().sub(this.shimmerCenter).mul(vec2(1.7,1)).length())).mul(smoothstep(-.005,.025,uv().y.sub(this.shimmerCenter.y)));
  const distortion=vec2(sin(uv().y.mul(215).add(this.time.mul(47))),cos(uv().x.mul(160).add(this.time.mul(39)))).mul(mask.pow(2)).mul(this.shimmer);
  const refracted=sceneColor.sample(uv().add(distortion));
  this.bloom=bloom(sceneColor,.16,.32,1.85);
  const vignette=float(1).sub(uv().sub(.5).length().pow(2).mul(.24));
  const grain=fract(sin(uv().dot(vec2(127.1,311.7)).add(this.time.mul(5))).mul(43758.5453)).sub(.5).mul(.0025);
  const graded=vec4(refracted.rgb.mul(mix(float(1),this.ao.getTextureNode().r,.46)).add(this.bloom.rgb).mul(vignette).add(grain),1);
  this.post.outputNode=edgeAntialias(renderOutput(graded,w.renderer.toneMapping,w.renderer.outputColorSpace));
  this.post.outputColorTransform=false;
 }
 async init(){
  const e=new THREE.Scene(),sky=this.sky.clone();e.add(sky);const generator=new THREE.PMREMGenerator(this.w.renderer);
  this.environment=await generator.fromSceneAsync(e,.015,.1,200000,{size:256});this.w.scene.environment=this.environment.texture;this.w.scene.environmentIntensity=.42;generator.dispose();
 }
 update(sim){
  const w=this.w;this.time.value=sim.t;this.power.value=clamp(sim.fields.plume.intensity,0,1.2);this.expansion.value=sim.nozzleExpansion||.65;
  this.soot.value=clamp((w.heatDose||0)/110000,.0,.88);
  for(const jet of this.rcsJets){const {axis,sign}=jet.userData,tau=sim.torqueRCSVector[axis];const enabled=Math.sign(tau)===sign&&sim.boosterPropellant>0;jet.material.opacity=enabled?clamp(Math.abs(tau)/(axis===1?500000:16000000),0,1)*.20:0;jet.visible=enabled;}
  this.boosterExhausts.forEach((visual,i)=>{const e=sim.engines[i];visual.update(e.exhaust||sim.exhaust,e.intensity);visual.group.visible&&=sim.phase!=='CRASHED';});
  this.upperExhausts.forEach((visual,i)=>{const e=sim.upperEngines[i];visual.update(e.exhaust||exhaustState(101325,0,true),e.intensity);visual.group.visible&&=!!sim.upper&&!sim.upper.touchdown;});
  const altitude=w.mode==='upper'?(sim.upper?.altitude||sim.altitude):sim.altitude;
  this.sky.position.copy(w.camera.position);this.sky.rayleigh.value=1.8*Math.exp(-altitude/18000);this.spaceGain.value=Math.max(.0015,Math.exp(-altitude/18000));this.cloudGain.value=Math.exp(-altitude/6500);
  const p=new THREE.Vector3(0,-35.9,0).applyQuaternion(w.rocket.quaternion).add(w.rocket.position).project(w.camera);
  this.shimmerCenter.value.set(p.x*.5+.5,.5-p.y*.5);this.shimmer.value=clamp(sim.thrust/1e6,0,1)*.00065;
  const age=sim.phase==='CRASHED'?sim.t-sim.terminalAt:999;
  this.shock.visible=age>=0&&age<3.4;this.shock.position.x=sim.touchdown?.x||0;this.shock.position.z=sim.touchdown?.z||0;
  if(this.shock.visible){const radius=2+(sim.touchdown.blastRadius*1.6)*(1-Math.exp(-age*.9));this.shock.scale.set(radius,radius,1+age*2);this.shock.material.opacity=Math.max(0,.36*(1-age/3.4));}
 }
 render(){this.post.render();}
}
