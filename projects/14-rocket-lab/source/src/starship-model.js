import * as THREE from 'three/webgpu';
import {engineLayout,VEHICLE} from './vehicle.js';
import {CONSTANTS,clamp} from './physics.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

function tileTexture(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=2048;const c=canvas.getContext('2d');c.fillStyle='#15191c';c.fillRect(0,0,1024,2048);
 const r=13,h=Math.sqrt(3)*r;
 for(let i=-1;i<54;i++)for(let j=-1;j<94;j++){const x=i*r*1.5,y=(j+(i%2)*.5)*h;c.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;c.lineTo(x+Math.cos(a)*(r-.6),y+Math.sin(a)*(r-.6));}c.closePath();const tone=26+Math.floor((Math.sin(i*21.17+j*77.39)*.5+.5)*16);c.fillStyle=`rgb(${tone},${tone+2},${tone+3})`;c.fill();c.strokeStyle='#434a4c';c.lineWidth=.65;c.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=16;return texture;
}
function flap(w,parent,y,side,size,shield){
 const hinge=new THREE.Group();hinge.position.set(side*4.35,y,0);parent.add(hinge);
 const outline=new THREE.Shape();outline.moveTo(0,-size*.55);outline.lineTo(side*4.3,-size*.27);outline.lineTo(side*3.6,size*.25);outline.lineTo(0,size*.60);outline.closePath();
 const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.35,bevelEnabled:true,bevelSize:.12,bevelThickness:.08,bevelSegments:1,steps:1}),shield);mesh.castShadow=mesh.receiveShadow=true;hinge.add(mesh);
 w.rod(hinge,v(0,-size*.52,.45),v(side*3.75,-size*.24,.45),.065,'metal');w.rod(hinge,v(0,size*.54,.45),v(side*3.55,size*.25,.45),.065,'metal');
 w.cylinder(hinge,.26,.26,size*.96,0,0,0,'metal',24);return hinge;
}
function nozzle(w,pod,engine,upper){
 const vacuum=engine.kind==='vacuum',exit=upper?1.65:1.9,radius=vacuum?1.12:.58;
 const points=Array.from({length:25},(_,i)=>{const t=i/24;return new THREE.Vector2(.17+(radius-.17)*t**1.55,-exit*t);});
 const bell=new THREE.Mesh(new THREE.LatheGeometry(points,32),w.materials.nozzle);pod.add(bell);bell.castShadow=true;
 w.ring(pod,radius,.035,0,-exit,0,'metal');w.cylinder(pod,.21,.17,.9,0,.27,0,'metal',16);
 for(let n=0;n<8;n++){const a=n*Math.PI/4;w.rod(pod,v(Math.cos(a)*.18,.2,Math.sin(a)*.18),v(Math.cos(a)*radius,-exit+.04,Math.sin(a)*radius),.009,'copper');}
 w.cylinder(pod,.18,.18,.5,.32,.1,0,'copper',16);w.rod(pod,v(.32,.37,0),v(.20,-.25,0),.045,'metal');
 const plate=w.cylinder(pod,.37,.37,.09,0,.54,0,'dark',16);plate.name=engine.id+' injector plate';
}
export function buildStarship(w){
 w.materials.copper=new THREE.MeshStandardMaterial({color:'#956f57',metalness:.85,roughness:.35});
 w.materials.stainless=new THREE.MeshPhysicalMaterial({color:'#b5c2c8',metalness:.9,roughness:.3,map:w.maps.steel,normalMap:w.maps.steelNormal,normalScale:new THREE.Vector2(.07,.07),clearcoat:.18});
 const shield=new THREE.MeshStandardMaterial({map:tileTexture(),color:'#d7dce0',roughness:.92,metalness:.08});
 w.rocket=new THREE.Group();w.rocket.name='Super Heavy / 33 physical engines';w.rocket.position.y=CONSTANTS.contactHeight;w.scene.add(w.rocket);
 w.bodyMesh=w.cylinder(w.rocket,4.5,4.5,70,0,0,0,'stainless',96);w.bodyMesh.name='Super Heavy stainless tanks';
 for(let y=-34;y<35;y+=1.85)w.ring(w.rocket,4.504,.016,0,y,0,'metal');
 for(let i=0;i<12;i++){const a=i*Math.PI/6;w.rod(w.rocket,v(Math.cos(a)*4.505,-33,Math.sin(a)*4.505),v(Math.cos(a)*4.505,33,Math.sin(a)*4.505),.013,'metal');}
 for(const a of [-.65,.65,Math.PI]){const p=new THREE.Group();p.position.set(Math.sin(a)*4.52,0,Math.cos(a)*4.52);p.rotation.y=a;w.rocket.add(p);w.box(p,.5,62,.24,0,0,0,'metal');for(let y=-30;y<31;y+=2.8)w.box(p,.66,.08,.30,0,y,.02,'dark');}
 w.cylinder(w.rocket,4.51,4.51,4,0,-33,0,'dark',96);
 w.interstageShell=w.cylinder(w.rocket,4.48,4.48,3,0,36.5,0,'dark',96,true);
 for(const y of [35,35.25,37.8,38])w.ring(w.rocket,4.51,.09,0,y,0,'stainless');
 for(let n=0;n<72;n++){const a=n*Math.PI/36;w.rod(w.rocket,v(Math.sin(a)*4.53,35.15,Math.cos(a)*4.53),v(Math.sin(a)*4.53,37.9,Math.cos(a)*4.53),.036,'metal');}
 w.payloadGroup=new THREE.Group();w.payloadGroup.name='Starship / 3 sea-level + 3 vacuum engines';w.payloadGroup.position.y=38;w.rocket.add(w.payloadGroup);
 w.payloadShell=w.cylinder(w.payloadGroup,4.5,4.5,35.5,0,17.75,0,'stainless',96);
 const nosePoints=Array.from({length:49},(_,i)=>{const t=i/48;return new THREE.Vector2(4.5*Math.sqrt(Math.max(0,1-t*t)),35.5+14.5*t);});
 const nose=new THREE.Mesh(new THREE.LatheGeometry(nosePoints,96),w.materials.stainless);nose.castShadow=true;w.payloadGroup.add(nose);
 const tiles=new THREE.Mesh(new THREE.CylinderGeometry(4.514,4.514,35.5,64,1,true,-Math.PI/2,Math.PI),shield);tiles.position.y=17.75;w.payloadGroup.add(tiles);
 const noseTiles=new THREE.Mesh(new THREE.LatheGeometry(nosePoints.map(p=>new THREE.Vector2(p.x+.018,p.y)),64,-Math.PI/2,Math.PI),shield);w.payloadGroup.add(noseTiles);
 for(let y=0;y<35.5;y+=1.85)w.ring(w.payloadGroup,4.515,.016,0,y,0,'metal');
 w.shipFlaps=[flap(w,w.payloadGroup,8,-1,12,shield),flap(w,w.payloadGroup,8,1,12,shield),flap(w,w.payloadGroup,37,-1,7,shield),flap(w,w.payloadGroup,37,1,7,shield)];
 w.engines=new THREE.Group();w.rocket.add(w.engines);w.enginePods=[];
 for(const e of engineLayout()){const pod=new THREE.Group();pod.position.fromArray(e.position);pod.name=e.id;w.engines.add(pod);w.enginePods.push(pod);nozzle(w,pod,e,false);}
 w.upperEnginePods=[];for(const e of engineLayout(true)){const pod=new THREE.Group();pod.position.set(e.position[0],CONSTANTS.upperCOM+e.position[1],e.position[2]);pod.name=e.id;w.payloadGroup.add(pod);w.upperEnginePods.push(pod);nozzle(w,pod,e,true);}w.upperEngine=w.upperEnginePods[0];
 w.upperEngineLight=new THREE.PointLight('#a6b9ff',0,260,1.6);w.upperEngineLight.position.y=-1;w.payloadGroup.add(w.upperEngineLight);
 w.fins=[];
 for(let i=0;i<4;i++){
  const a=Math.PI/4+i*Math.PI/2,hinge=new THREE.Group();hinge.position.set(Math.cos(a)*4.4,29.2,Math.sin(a)*4.4);hinge.rotation.y=-a;w.rocket.add(hinge);const fin=new THREE.Group();hinge.add(fin);w.fins.push(fin);
  w.box(fin,4.7,.23,.23,2.25,0,-1.65,'dark');w.box(fin,4.7,.23,.23,2.25,0,1.65,'dark');
  for(let x=0;x<4.7;x+=.34)w.box(fin,.07,.6,3.3,x,0,0,'metal');for(let z=-1.65;z<=1.65;z+=.33)w.box(fin,4.7,.6,.07,2.25,0,z,'metal');
  w.cylinder(hinge,.32,.32,1.8,0,0,0,'metal',16);
  const lug=new THREE.Group();lug.position.set(Math.cos(a)*4.62,22,Math.sin(a)*4.62);lug.rotation.y=-a;w.rocket.add(lug);w.box(lug,.8,1.5,.8,0,0,0,'metal');
 }
 w.trailGeometry=new THREE.BufferGeometry();w.trailArray=new Float32Array(6000*3);w.trailGeometry.setAttribute('position',new THREE.BufferAttribute(w.trailArray,3));w.trailGeometry.setDrawRange(0,0);
 w.trail=new THREE.Line(w.trailGeometry,new THREE.LineBasicMaterial({color:'#6bd9ff',transparent:true,opacity:.38}));w.trail.frustumCulled=false;w.trail.visible=false;w.scene.add(w.trail);w.trailCount=0;
}

export class CatchTower {
 constructor(w){
  this.w=w;this.assemblies=[];this.progress=0;this.deployedAt=null;this.arms=[];this.root=new THREE.Group();this.root.position.set(CONSTANTS.landingX-21,0,-12);w.scene.add(this.root);
  for(const x of [-4,4])for(const z of [-4,4])w.box(this.root,1.25,115,1.25,x,57.5,z,'steel');
  for(let y=6;y<115;y+=8){w.box(this.root,10,.5,10,0,y,0,'metal');for(const z of [-4,4]){w.rod(this.root,v(-4,y,z),v(4,y+8,z),.24,'metal');w.rod(this.root,v(4,y,z),v(-4,y+8,z),.24,'metal');}}
  this.carriage=new THREE.Group();this.carriage.position.y=CONSTANTS.contactHeight+22;this.root.add(this.carriage);
  for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(4,0,side*6);this.carriage.add(arm);w.box(arm,28,1.3,1.6,14,0,0,'dark');w.box(arm,27,.28,2.3,14,.78,0,'metal');for(let x=2;x<28;x+=3){w.rod(arm,v(x,-.5,-.8),v(x+2.5,.5,.8),.12,'steel');}w.box(arm,12,.3,2.5,17,.85,0,'orange');this.arms.push(arm);}
  w.box(this.root,12,3,12,0,117,0,'dark');
 }
 batch(batchStatic){let n=0;for(const arm of this.arms)n+=batchStatic(arm);n+=batchStatic(this.root,new Set([this.carriage]));return n;}
 reset(){this.progress=0;this.deployedAt=null;}
 update(s){this.deployedAt=s.events.find(e=>e.type==='landing-ignition')?.t??null;const f=this.deployedAt===null?0:clamp((s.t-this.deployedAt)/2.8,0,1);this.progress=f*f*(3-2*f);this.arms.forEach((arm,i)=>{arm.position.z=(i?1:-1)*(13-8.2*this.progress)+12;});this.carriage.position.y=CONSTANTS.contactHeight+20.25-(s.touchdown?.success?s.touchdown.strokeRequired:0);}
}

