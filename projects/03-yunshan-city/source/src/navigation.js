import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { PILGRIMAGE, STOPS } from './plan.js';
import { clamp, lerp, samplePolyline, pointAt } from './math.js';

const HOME_POSITION=new THREE.Vector3(660,553,854),HOME_TARGET=new THREE.Vector3(-25,136,-175);
export class Navigation {
 constructor(camera,canvas,field,onChange){
  this.camera=camera;this.canvas=canvas;this.field=field;this.onChange=onChange;this.mode='orbit';this.distance=0;this.speed=4;this.autowalk=false;this.keys=new Set();this.lookYaw=0;this.lookPitch=0;this.heading=0;this.freeYaw=0;this.freePitch=0;this.drag=null;this.transition=null;
  this.path=samplePolyline(PILGRIMAGE,.5);this.length=this.path.at(-1).d;
  this.stops=STOPS.map(s=>{const pos=PILGRIMAGE[s.node];let best=this.path[0],dist=Infinity;this.path.forEach(p=>{const dd=Math.hypot(p.x-pos[0],p.y-pos[1],p.z-pos[2]);if(dd<dist){best=p;dist=dd;}});return {...s,distance:best.d};});
  this.controls=new OrbitControls(camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=5;this.controls.maxDistance=2100;this.controls.maxPolarAngle=Math.PI*.489;this.controls.target.copy(HOME_TARGET);camera.position.copy(HOME_POSITION);this.controls.update();
  canvas.addEventListener('pointerdown',e=>{if(this.mode==='orbit')return;this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!this.drag||this.mode==='orbit')return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag={x:e.clientX,y:e.clientY};if(this.mode==='walk'){this.lookYaw-=dx*.004;this.lookPitch=clamp(this.lookPitch-dy*.003,-1.1,1.1);}else{this.freeYaw-=dx*.004;this.freePitch=clamp(this.freePitch-dy*.003,-1.5,1.5);}});
  const stop=()=>this.drag=null;canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'].includes(e.code)){this.keys.add(e.code);e.preventDefault();}});
  addEventListener('keyup',e=>this.keys.delete(e.code));addEventListener('blur',()=>{this.keys.clear();this.drag=null;});
 }
 setMode(mode){
  this.mode=mode;this.controls.enabled=mode==='orbit';this.transition=null;this.drag=null;this.keys.clear();
  if(mode==='walk'){this.lookYaw=0;this.lookPitch=0;const p=pointAt(this.path,this.distance),q=pointAt(this.path,this.distance+8);this.heading=Math.atan2(q.x-p.x,q.z-p.z);}
  if(mode==='orbit'){const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);this.controls.target.copy(this.camera.position).addScaledVector(dir,55);this.controls.update();}
  if(mode==='fly'){const e=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.freeYaw=e.y;this.freePitch=e.x;}
  this.onChange?.();
 }
 home(){this.mode='orbit';this.controls.enabled=false;this.autowalk=false;this.transition={from:this.camera.position.clone(),targetFrom:this.controls.target.clone(),to:HOME_POSITION.clone(),targetTo:HOME_TARGET.clone(),t:0,duration:1.7};this.onChange?.();}
 startWalk(){this.setMode('walk');this.autowalk=true;this.onChange?.();}
 jumpTo(index){this.distance=this.stops[index].distance;this.setMode('walk');this.autowalk=false;this.lookYaw=index===3?.15:index===5?Math.PI:0;this.lookPitch=index===3?.25:0;this.onChange?.();}
 seek(fraction){this.distance=clamp(fraction,0,1)*this.length;if(this.mode!=='walk')this.setMode('walk');this.onChange?.();}
 update(dt,time){
  if(this.transition){const t=this.transition;t.t+=dt;const k=clamp(t.t/t.duration,0,1),s=k*k*(3-2*k);this.camera.position.lerpVectors(t.from,t.to,s);this.controls.target.lerpVectors(t.targetFrom,t.targetTo,s);this.camera.lookAt(this.controls.target);if(k>=1){this.transition=null;this.controls.enabled=true;this.controls.update();}return;}
  if(this.mode==='orbit'){this.controls.update();return;}
  if(this.mode==='walk'){
   let drive=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0);
   if(drive===0&&this.autowalk)drive=1;
   const speed=2.4*this.speed*(this.keys.has('ShiftLeft')?2:1);this.distance=clamp(this.distance+drive*speed*dt,0,this.length);
   if(this.distance>=this.length&&this.autowalk){this.autowalk=false;this.onChange?.();}
   if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))this.lookYaw+=dt*.9;
   if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))this.lookYaw-=dt*.9;
   const p=pointAt(this.path,this.distance),next=pointAt(this.path,Math.min(this.length,this.distance+5)),previous=pointAt(this.path,Math.max(0,this.distance-3));
   const heading=Math.atan2(next.x-previous.x,next.z-previous.z),delta=Math.atan2(Math.sin(heading-this.heading),Math.cos(heading-this.heading));this.heading+=delta*(1-Math.exp(-dt*4));
   this.camera.position.set(p.x,p.y+2.2+(drive?Math.sin(time*5)*.025:0),p.z);
   const yaw=this.heading+this.lookYaw,grade=Math.atan2(next.y-previous.y,Math.max(1,Math.hypot(next.x-previous.x,next.z-previous.z)))*.72;
   this.camera.lookAt(p.x+Math.sin(yaw)*12,this.camera.position.y+Math.tan(clamp(this.lookPitch+grade,-1.2,1.2))*12,p.z+Math.cos(yaw)*12);
  }else{
   this.camera.rotation.set(this.freePitch,this.freeYaw,0,'YXZ');
   const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize(),move=new THREE.Vector3(),speed=(this.keys.has('ShiftLeft')?155:34)*dt;
   if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))move.add(dir);if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))move.sub(dir);if(this.keys.has('KeyD'))move.add(right);if(this.keys.has('KeyA'))move.sub(right);if(this.keys.has('KeyE'))move.y+=1;if(this.keys.has('KeyQ'))move.y-=1;
   if(move.lengthSq()>0)this.camera.position.addScaledVector(move.normalize(),speed);
   this.camera.position.x=clamp(this.camera.position.x,-1100,1100);this.camera.position.z=clamp(this.camera.position.z,-1050,950);this.camera.position.y=clamp(this.camera.position.y,this.field.sample(this.camera.position.x,this.camera.position.z)+2,1200);
  }
 }
 currentStop(){let i=0;this.stops.forEach((s,j)=>{if(this.distance>=s.distance-.1)i=j;});return i;}
}
