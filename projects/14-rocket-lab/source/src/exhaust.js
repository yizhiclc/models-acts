import * as THREE from 'three/webgpu';
import {uniform,uv,float,vec3,sin,mix,smoothstep,positionLocal,mx_noise_float,normalWorld,positionWorld,cameraPosition,dot} from 'three/tsl';
import {clamp} from './physics.js';
import {plumeLength} from './plume-model.js';

// Near-nozzle radiance supplements persistent GPU-computed downstream particles.
// Length, cone angle and shock-cell contrast come from the live engine state.
export class ExhaustVisual{
 constructor(parent,{vacuum=false,power=uniform(0),time=uniform(0),single=false,ship=false}={}){
  this.power=power;this.time=time;this.vacuum=vacuum;this.angle=uniform(.04);this.length=uniform(1);this.spacing=uniform(3);this.contrast=uniform(0);
  this.group=new THREE.Group();parent.add(this.group);this.meshes=[];this.cells=[];
  const nozzleRadius=vacuum?1.12:.56,nozzleY=vacuum||ship?-1.65:(single?-1.90:-.90);
  const seed=(Number.parseInt(parent.name.slice(1),10)||0)*.719;
  this.nozzleY=nozzleY;
  for(let i=0;i<(vacuum||single?1:3);i++){
   const a=i*Math.PI*2/3,x=vacuum||single?0:Math.cos(a)*.85,z=vacuum||single?0:Math.sin(a)*.85;
   for(let layer=0;layer<2;layer++){
    const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const d=float(1).sub(uv().y),distance=d.mul(this.length);
    const noise=mx_noise_float(vec3(uv().x.mul(9).add(seed),distance.mul(.15).sub(time.mul(22)),time.mul(1.7).add(seed)));
    const shock=sin(distance.div(this.spacing).mul(Math.PI*2)).mul(.5).add(.5).pow(8).mul(this.contrast).mul(float(1).sub(smoothstep(this.spacing.mul(4),this.spacing.mul(10),distance)));
    const envelope=float(1).sub(smoothstep(.28,1,d)).pow(1.1),edge=smoothstep(0,.012,d);
    const inner=vacuum?vec3(.65,.95,1.7):vec3(1.85,1.65,2.3),outer=vacuum?vec3(.10,.18,.40):vec3(1.3,.38,.23);
    m.colorNode=mix(inner,outer,smoothstep(.05,.80,d)).add(vec3(4.5,3.8,2.3).mul(shock)).mul(layer?.42:1);
    const facing=dot(normalWorld,cameraPosition.sub(positionWorld).normalize()).abs().pow(.7);
    m.opacityNode=envelope.mul(edge).mul(power).mul(layer?.016:(vacuum?.14:.065)).mul(noise.mul(.85).add(.65).max(.08)).mul(facing);
    const p=positionLocal,growth=distance.mul(this.angle.tan()).mul(layer?.35:.20).div(nozzleRadius).add(1);
    const ripple=noise.mul(d.mul(.42).add(.02)).add(1),pinch=shock.mul(-.20).add(1);
    m.positionNode=vec3(p.x.mul(growth).mul(ripple).mul(pinch),p.y,p.z.mul(growth).mul(ripple).mul(pinch));
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(nozzleRadius*(layer?1.09:1),nozzleRadius*(layer?1.09:1),1,32,48,true),m);mesh.position.set(x,nozzleY,z);mesh.renderOrder=5;mesh.name=vacuum?'Vacuum expanding exhaust':'Pressure-adaptive booster exhaust';this.group.add(mesh);this.meshes.push(mesh);
   }
   // Compressed luminous shock-cell boundaries. They weaken in near vacuum,
   // where a broad underexpanded plume replaces a tight sea-level shock train.
   for(let n=0;n<8;n++){
    const material=new THREE.MeshBasicMaterial({color:vacuum?'#b4bfff':'#fff1ca',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const cell=new THREE.Mesh(new THREE.TorusGeometry(1,.10,6,32),material);cell.rotation.x=Math.PI/2;cell.position.set(x,nozzleY,z);cell.userData={n,nozzleRadius};cell.name='Mach shock-cell ring';this.group.add(cell);this.cells.push(cell);
   }
  }
 }
 update(exhaust,intensity){
  this.power.value=clamp(intensity,0,1.3);this.angle.value=exhaust.halfAngle;this.spacing.value=clamp(exhaust.machSpacing,2,45);this.contrast.value=exhaust.machContrast;
  this.length.value=plumeLength(this.power.value,this.vacuum);
  this.group.visible=this.power.value>.001;
  this.meshes.forEach((mesh,i)=>{const l=this.length.value*(i%2?1.10:1);mesh.scale.y=l;mesh.position.y=this.nozzleY-l*.5;});
  for(const cell of this.cells){const {n,nozzleRadius}=cell.userData,d=(n+.75)*this.spacing.value,r=nozzleRadius*.85+d*Math.tan(this.angle.value)*.24;
   cell.position.y=this.nozzleY-d;cell.scale.set(r,r,.65+this.spacing.value*.12);cell.material.opacity=this.contrast.value*this.power.value*Math.exp(-n*.26)*.64;cell.visible=d<this.length.value*.70&&cell.material.opacity>.004;
  }
 }
}
