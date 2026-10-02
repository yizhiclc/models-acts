import * as THREE from 'three/webgpu';
import { color,normalWorld,positionWorld,cameraPosition,cameraViewMatrix,cameraProjectionMatrix,normalize,dot,max,pow,attribute,vec2,vec3,vec4,screenUV,viewportTexture,texture,equirectUV,reflect,mix,clamp } from 'three/tsl';
import { leafHeight,leafGradient,diameterToVolume,volumeToRadius,seededRandom } from './config.js';

const random=seededRandom(942),MAX_BEADS=4096;
const point=new THREE.Vector3(),dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
export function mergeNearby(beads){
  for(let i=beads.length-1;i>=0;i--)for(let j=i-1;j>=0;j--){
    const a=beads[i],b=beads[j];
    if(Math.hypot(a.x-b.x,a.z-b.z)<(volumeToRadius(a.volume)+volumeToRadius(b.volume))*1.28){
      const v=a.volume+b.volume;
      b.x=(a.x*a.volume+b.x*b.volume)/v;b.z=(a.z*a.volume+b.z*b.volume)/v;
      b.vx=(a.vx*a.volume+b.vx*b.volume)/v;b.vz=(a.vz*a.volume+b.vz*b.volume)/v;b.volume=v;b.drain=b.drain||a.drain;
      beads.splice(i,1);break;
    }
  }
}
export class LeafWater {
  constructor(scene,leaves,onDrip,skyTexture){
    this.leaves=leaves;this.onDrip=onDrip;this.falling=[];this.stats={depositedVolume:0,drippedVolume:0,merges:0,drops:0};
    const geometry=new THREE.SphereGeometry(1,20,14);
    this.optics=new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEADS*4),4);this.optics.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('beadOptics',this.optics);
    const material=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:true});
    const eye=normalize(cameraPosition.sub(positionWorld));
    const optics=attribute('beadOptics','vec4'),projected=cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(optics.xyz,1));
    const centerUV=vec2(projected.x.div(projected.w).mul(.5).add(.5),projected.y.div(projected.w).mul(-.5).add(.5));
    // A finite, inverted thin-lens image of the already rendered surroundings.
    const lensUV=clamp(centerUV.sub(screenUV.sub(centerUV).mul(7)),.001,.999);
    const lens=viewportTexture(lensUV).rgb;
    const rim=pow(max(dot(normalWorld,eye),0).oneMinus(),3);
    const f=rim.mul(.88).add(.035);
    const environment=texture(skyTexture,equirectUV(reflect(eye.negate(),normalWorld))).rgb;
    const highlight=pow(max(dot(normalWorld,normalize(eye.add(vec3(-.38,.79,-.48)))),0),85).mul(1.3);
    material.colorNode=mix(lens.mul(rim.mul(-.23).add(.97)),environment,f).add(vec3(highlight)).add(color(0xd7eee9).mul(rim).mul(.055));
    this.mesh=new THREE.InstancedMesh(geometry,material,MAX_BEADS);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.renderOrder=4;scene.add(this.mesh);
    for(const l of leaves){
      l.reservoir=(.15+random()*.22)*1e-6;l.drainClock=0;
      for(let i=0;i<16;i++){const a=random()*Math.PI*2,r=l.radius*(.18+random()*.68);l.beads.push({x:Math.cos(a)*r,z:Math.sin(a)*r,vx:0,vz:0,volume:diameterToVolume(.0023+random()*.0022),drain:false});}
    }
    this.renderInstances();
  }
  addHit(index,x,z,diameter){
    const l=this.leaves[index];if(!l)return;
    const volume=diameterToVolume(diameter);this.stats.depositedVolume+=volume;
    l.impact+=Math.min(2.5,(diameter/.002)**3*.13);
    if(Math.hypot(x,z)<.022){l.reservoir+=volume;return;}
    if(l.beads.length>=48){
      // Bound allocation while preserving every deposited cubic metre.
      let nearest=l.beads[0],dist=Infinity;
      for(const b of l.beads){const d=(b.x-x)**2+(b.z-z)**2;if(d<dist){dist=d;nearest=b;}}
      nearest.volume+=volume;return;
    }
    l.beads.push({x,z,vx:0,vz:0,volume,drain:false});
  }
  update(dt,wind){
    for(const l of this.leaves){
      l.group.updateMatrixWorld();
      l.basinX=THREE.MathUtils.clamp(-l.slopeX*l.radius*l.radius/.064,-l.radius*.43,l.radius*.43);
      l.basinZ=THREE.MathUtils.clamp(-l.slopeZ*l.radius*l.radius/.064,-l.radius*.43,l.radius*.43);
      for(let i=l.beads.length-1;i>=0;i--){
        const b=l.beads[i],r=volumeToRadius(b.volume),g=leafGradient(b.x,b.z,l.radius,l.phase);
        const slopeX=g[0]+l.slopeX,slopeZ=g[1]+l.slopeZ;
        const pinned=.022*Math.min(1,.0014/r),slope=Math.hypot(slopeX,slopeZ);
        if(b.drain){
          const angle=Math.atan2(-l.slopeZ,-l.slopeX);
          b.vx+=Math.cos(angle)*.65*dt;b.vz+=Math.sin(angle)*.65*dt;
        }else if(slope>pinned){
          const rolling=.19*(1+.25*r/.002);
          b.vx-=9.81*slopeX*rolling*dt;b.vz-=9.81*slopeZ*rolling*dt;
        }
        b.vx*=Math.exp(-3.5*dt);b.vz*=Math.exp(-3.5*dt);
        b.x+=b.vx*dt;b.z+=b.vz*dt;
        const distance=Math.hypot(b.x,b.z);
        if(Math.hypot(b.x-l.basinX,b.z-l.basinZ)<.021&&!b.drain){l.reservoir+=b.volume;l.beads.splice(i,1);continue;}
        if(distance>l.radius*.98){
          point.set(b.x,leafHeight(b.x,b.z,l.radius,l.phase)+r*.65,b.z).applyMatrix4(l.group.matrixWorld);
          this.falling.push({position:point.clone(),vx:b.vx+wind*.03,vz:b.vz,vy:0,volume:b.volume});l.beads.splice(i,1);
        }
      }
      const before=l.beads.length;mergeNearby(l.beads);this.stats.merges+=before-l.beads.length;
      // A tilted, flexible bowl has a reduced retention threshold. A draining
      // bead travels across the leaf and falls under gravity; it is not a timer hit.
      const capacity=(.62+(.3-l.radius)*2)/(1+Math.hypot(l.slopeX,l.slopeZ)*5)*1e-6;
      l.drainClock+=dt;
      if(l.reservoir>capacity&&l.drainClock>.16&&l.beads.length<48){
        const volume=Math.min(l.reservoir-capacity*.88,35e-9);l.reservoir-=volume;l.drainClock=0;
        const a=Math.atan2(-l.slopeZ,-l.slopeX);
        l.beads.push({x:l.basinX+Math.cos(a)*.02,z:l.basinZ+Math.sin(a)*.02,vx:Math.cos(a)*.045,vz:Math.sin(a)*.045,volume,drain:true});
      }
    }
    for(let i=this.falling.length-1;i>=0;i--){
      const b=this.falling[i],previousY=b.position.y;b.vy-=9.81*dt;b.position.x+=b.vx*dt;b.position.y+=b.vy*dt;b.position.z+=b.vz*dt;
      let intercepted=-1,highest=-1;
      for(let j=0;j<this.leaves.length;j++){
        const l=this.leaves[j],x=b.position.x-l.x,z=b.position.z-l.z;
        if(Math.hypot(x,z)>l.radius*.95)continue;
        const h=l.group.position.y+leafHeight(x,z,l.radius,l.phase)+l.slopeX*x+l.slopeZ*z;
        if(previousY>=h&&b.position.y<=h&&h>highest){intercepted=j;highest=h;}
      }
      if(intercepted>=0){const l=this.leaves[intercepted];this.addHit(intercepted,b.position.x-l.x,b.position.z-l.z,volumeToRadius(b.volume)*2);this.falling.splice(i,1);continue;}
      if(b.position.y<=0){this.onDrip(b.position.x,b.position.z,volumeToRadius(b.volume)*2,Math.abs(b.vy));this.stats.drippedVolume+=b.volume;this.stats.drops++;this.falling.splice(i,1);}
    }
    this.renderInstances();
  }
  renderInstances(){
    let index=0;
    const add=(l,x,z,r,flatten)=>{
      if(index>=MAX_BEADS)return;
      dummy.position.set(x,leafHeight(x,z,l.radius,l.phase)+r*flatten*.72,z);dummy.scale.set(r,r*flatten,r);dummy.rotation.set(0,0,0);dummy.updateMatrix();matrix.multiplyMatrices(l.group.matrixWorld,dummy.matrix);this.optics.setXYZW(index,matrix.elements[12],matrix.elements[13],matrix.elements[14],r);this.mesh.setMatrixAt(index++,matrix);
    };
    for(const l of this.leaves){
      l.group.updateMatrixWorld();
      for(const b of l.beads)add(l,b.x,b.z,volumeToRadius(b.volume/.84),.84);
      if(l.reservoir>0)add(l,l.basinX||0,l.basinZ||0,volumeToRadius(l.reservoir/.25),.25);
    }
    for(const b of this.falling){if(index>=MAX_BEADS)break;const r=volumeToRadius(b.volume);dummy.position.copy(b.position);dummy.scale.set(r,r*1.08,r);dummy.rotation.set(0,0,0);dummy.updateMatrix();this.optics.setXYZW(index,b.position.x,b.position.y,b.position.z,r);this.mesh.setMatrixAt(index++,dummy.matrix);}
    this.mesh.count=index;this.mesh.instanceMatrix.needsUpdate=true;this.optics.needsUpdate=true;this.count=index;
  }
}
