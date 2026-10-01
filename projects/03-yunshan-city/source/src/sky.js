import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, smoothstep, random } from './math.js';

export function timeState(hours){
 const angle=(hours-6)/24*Math.PI*2,altitude=Math.sin(angle),day=smoothstep(-.17,.23,altitude),twilight=(1-smoothstep(.0,.42,Math.abs(altitude)))*smoothstep(-.26,.02,altitude);
 return {angle,altitude,day,twilight,night:1-day};
}

export class Atmosphere {
 constructor(scene){
  this.scene=scene;this.skyColor=new THREE.Color();this.sunDirection=new THREE.Vector3();
  this.hemi=new THREE.HemisphereLight(0xd7e4cf,0x607462,2.0);scene.add(this.hemi);
  this.sun=new THREE.DirectionalLight(0xffedce,2.5);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-510;this.sun.shadow.camera.right=510;this.sun.shadow.camera.top=490;this.sun.shadow.camera.bottom=-490;this.sun.shadow.camera.near=100;this.sun.shadow.camera.far=2200;this.sun.shadow.normalBias=1.0;this.sun.shadow.bias=-.00008;this.sun.target.position.set(0,100,-110);scene.add(this.sun,this.sun.target);
  this.moon=new THREE.DirectionalLight(0x8ab9e7,.75);scene.add(this.moon);this.moon.target=this.sun.target;
  this.fill=new THREE.AmbientLight(0x93b6c3,.12);scene.add(this.fill);
  const uniforms={uTop:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uSunDir:{value:new THREE.Vector3()},uWarm:{value:0},uDay:{value:1}};
  this.uniforms=uniforms;
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(4800,32,20),new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform vec3 uTop;uniform vec3 uHorizon;uniform vec3 uSunDir;uniform float uWarm;uniform float uDay;void main(){vec3 dir=normalize(vDir);float h=pow(max(0.,dir.y),.52);vec3 col=mix(uHorizon,uTop,h);float glow=pow(max(0.,dot(dir,uSunDir)),12.);col+=vec3(.30,.13,.035)*glow*(.3+uWarm);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`}));
  this.sky.renderOrder=-20;this.sky.frustumCulled=false;scene.add(this.sky);
  this.sunDisc=new THREE.Group();const sunMat=new THREE.MeshBasicMaterial({color:0xffe4a1,toneMapped:false,fog:false});
  // Stepped silhouettes keep both celestial bodies within the scene's voxel language.
  for(const [w,h] of [[38,64],[56,48],[64,32]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),sunMat);this.sunDisc.add(m);}
  scene.add(this.sunDisc);
  this.moonDisc=new THREE.Group();const moonMat=new THREE.MeshBasicMaterial({color:0xc6e0e5,toneMapped:false,fog:false});
  for(const [w,h] of [[26,46],[40,34],[46,22]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),moonMat);this.moonDisc.add(m);}
  const craterMat=new THREE.MeshBasicMaterial({color:0x97b8c4,fog:false});for(const [x,y,w,h] of [[-7,6,9,8],[6,-10,6,9],[9,8,4,4]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),craterMat);m.position.set(x,y,.1);this.moonDisc.add(m);}scene.add(this.moonDisc);
  const rng=random(922),positions=[];for(let i=0;i<1200;i++){const theta=rng()*Math.PI*2,v=.10+rng()*.90,r=Math.sqrt(1-v*v);positions.push(Math.cos(theta)*r*4400,v*4400,Math.sin(theta)*r*4400);}
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.stars=new THREE.Points(geom,new THREE.PointsMaterial({color:0xd5e4ef,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false}));this.stars.renderOrder=-9;scene.add(this.stars);
  scene.fog=new THREE.FogExp2(0xccd5c0,.00077);
 }
 update(hours,camera){
  const s=timeState(hours),top=new THREE.Color(0x0c1b34).lerp(new THREE.Color(0x8db6c3),s.day),horizon=new THREE.Color(0x35485b).lerp(new THREE.Color(0xdadfcb),s.day);
  top.lerp(new THREE.Color(0x718799),s.twilight*.44);horizon.lerp(new THREE.Color(0xeab68b),s.twilight*.72);
  this.skyColor.copy(horizon);this.uniforms.uTop.value.copy(top);this.uniforms.uHorizon.value.copy(horizon);this.uniforms.uWarm.value=s.twilight;this.uniforms.uDay.value=s.day;
  this.sunDirection.set(Math.cos(s.angle)*.78,s.altitude,Math.cos(s.angle)*-.48+.16).normalize();this.uniforms.uSunDir.value.copy(this.sunDirection);
  this.sun.position.copy(this.sunDirection).multiplyScalar(950).add(this.sun.target.position);this.sun.intensity=smoothstep(-.08,.18,s.altitude)*1.95;
  this.sun.color.set(0xffefd0).lerp(new THREE.Color(0xffac69),s.twilight*.67);
  this.hemi.intensity=lerp(.69,1.35,s.day);this.hemi.color.set(0x869ec6).lerp(new THREE.Color(0xd4e4dc),s.day);this.hemi.groundColor.set(0x3d5263).lerp(new THREE.Color(0x76876a),s.day);
  this.moon.position.copy(this.sunDirection).multiplyScalar(-800).add(this.sun.target.position);this.moon.intensity=(1-s.day)*.85;
  this.sky.position.copy(camera.position);this.stars.position.copy(camera.position);this.stars.material.opacity=(1-smoothstep(-.20,.02,s.altitude))*.83;
  this.sunDisc.position.copy(camera.position).addScaledVector(this.sunDirection,3800);this.sunDisc.quaternion.copy(camera.quaternion);this.sunDisc.visible=s.altitude>-.04;
  this.moonDisc.position.copy(camera.position).addScaledVector(this.sunDirection,-3800);this.moonDisc.quaternion.copy(camera.quaternion);this.moonDisc.visible=s.altitude<.04;
  this.scene.fog.color.copy(horizon);this.scene.fog.density=lerp(.00036,.00039,s.day);
  return s;
 }
}
