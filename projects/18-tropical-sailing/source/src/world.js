import * as THREE from 'three/webgpu';
import { positionWorld, cameraPosition, wgslFn, mix, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bedHeight, ISLANDS, random } from './bathymetry.js';
import { skyFn } from './ocean.js';

export function buildWorld(scene,ocean,sun) {
  const skyMat=new THREE.MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false});
  skyMat.colorNode=skyFn({ray:positionWorld.sub(cameraPosition).normalize(),sun});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(8500,32,16),skyMat);sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
  const terrain=new THREE.PlaneGeometry(1400,1400,330,330);terrain.rotateX(-Math.PI/2);terrain.translate(30,0,-120);
  const p=terrain.attributes.position,colors=[],sandy=new THREE.Color('#d8c599'),green=new THREE.Color('#537451'),dark=new THREE.Color('#284937');
  const rand=random(95),c=new THREE.Color();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),h=bedHeight(x,z);p.setY(i,h);
    const land=THREE.MathUtils.smoothstep(h,2.0,7.7);
    c.copy(sandy).lerp(green,land);c.lerp(dark,THREE.MathUtils.smoothstep(h,9,22)*(.3+.2*Math.sin(x*.2)*Math.cos(z*.17)));
    c.multiplyScalar(.94+rand()*.12);colors.push(c.r,c.g,c.b);
  }
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();
  const groundMat=new THREE.MeshStandardNodeMaterial({vertexColors:true,roughness:1});
  groundMat.colorNode=wgslFn(`fn sandWear(p:vec3<f32>, wet:f32)->vec3<f32>{
    let beach=1.0-smoothstep(1.0,3.2,p.y);
    let noise=.97+.03*sin(p.x*4.1)*sin(p.z*3.7);
    return vec3<f32>(noise*(1.0-wet*beach*.23));
  }`)({p:positionWorld,wet:ocean.wetNode()});
  const ground=new THREE.Mesh(terrain,groundMat);ground.receiveShadow=true;scene.add(ground);
  addVegetation(scene);
  addRocks(scene);
  return {sky,ground};
}

function addVegetation(scene) {
  const rand=random(78),trunks=[],leaves=[],leafColors=[],scrub=[];
  const barkMat=new THREE.MeshStandardNodeMaterial({color:0x78624b,roughness:1});
  const palmMat=new THREE.MeshStandardNodeMaterial({color:0x427147,roughness:.9,side:THREE.DoubleSide,vertexColors:true});
  const bushMat=new THREE.MeshStandardNodeMaterial({color:0x38583a,roughness:1});
  const dummy=new THREE.Object3D();
  for(const [index,island] of ISLANDS.entries()) {
    const trees=index===0?58:44;
    for(let t=0;t<trees;t++) {
      let x,z,y;
      for(let k=0;k<80;k++){x=island.x+(rand()-.5)*island.rx*1.42;z=island.z+(rand()-.5)*island.rz*1.42;y=bedHeight(x,z);if(y>2.1&&y<18)break;}
      if(y<2)continue;
      const h=7+rand()*10,lean=(rand()-.5)*3,angle=rand()*Math.PI*2;
      const dx=Math.sin(angle)*lean,dz=Math.cos(angle)*lean;
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,z),new THREE.Vector3(x+dx*.3,y+h*.5,z+dz*.3),new THREE.Vector3(x+dx,y+h,z+dz)]);
      trunks.push(new THREE.TubeGeometry(curve,7,.24,6,false));
      const crown=new THREE.Vector3(x+dx,y+h,z+dz);
      for(let j=0;j<9;j++) {
        const direction=j/9*Math.PI*2+rand()*.32,length=5+rand()*3;
        const positions=[],cols=[],indices=[],segments=13;
        for(let s=0;s<=segments;s++) {
          const u=s/segments,rx=Math.cos(direction),rz=Math.sin(direction);
          const lengthAt=length*u,yy=Math.sin(u*Math.PI)*1.5-u*u*2.0;
          const width=Math.sin(u*Math.PI)*(.66+rand()*.16)*(s%2===0?1:.68);
          for(const sign of [-1,1]) {
            positions.push(crown.x+rx*lengthAt-rz*width*sign,crown.y+yy-.12*Math.abs(width),crown.z+rz*lengthAt+rx*width*sign);
            const green=new THREE.Color().setHSL(.25+rand()*.03,.36,.24+rand()*.11);cols.push(green.r,green.g,green.b);
          }
          if(s<segments){const i=s*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.setIndex(indices);g.computeVertexNormals();leaves.push(g);
      }
    }
    for(let i=0;i<120;i++) {
      const x=island.x+(rand()-.5)*island.rx*1.4,z=island.z+(rand()-.5)*island.rz*1.4,y=bedHeight(x,z);
      if(y<4)continue;const r=2+rand()*5;dummy.position.set(x,y+r*.3,z);dummy.scale.set(r,r*.7,r);dummy.rotation.set(rand(),rand(),rand());dummy.updateMatrix();scrub.push(dummy.matrix.clone());
    }
  }
  for(const [geo,mat] of [[mergeGeometries(trunks),barkMat],[mergeGeometries(leaves),palmMat]]) {const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;scene.add(m);}
  trunks.forEach(g=>g.dispose());leaves.forEach(g=>g.dispose());
  const bushes=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),bushMat,scrub.length);scrub.forEach((m,i)=>bushes.setMatrixAt(i,m));bushes.castShadow=true;bushes.receiveShadow=true;scene.add(bushes);
}

function addRocks(scene) {
  const rand=random(124),dummy=new THREE.Object3D(),count=62;
  const mat=new THREE.MeshStandardNodeMaterial({color:0x858c79,roughness:.95});
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,1),mat,count);
  for(let i=0;i<count;i++) {
    let x,z,y,r;
    if(i<19){x=-84+rand()*40;z=-38+rand()*17;y=bedHeight(x,z);r=1.5+rand()*2.4;}
    else {const a=rand()*Math.PI*2;x=49+Math.cos(a)*(52+rand()*14);z=-111+Math.sin(a)*(40+rand()*11);y=bedHeight(x,z);r=1.0+rand()*3.2;}
    dummy.position.set(x,y+r*.3,z);dummy.scale.set(r,r*(.45+rand()*.6),r*.85);dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    rocks.setColorAt(i,new THREE.Color().setHSL(.10+rand()*.04,.09+rand()*.08,.39+rand()*.19));
  }
  rocks.castShadow=true;rocks.receiveShadow=true;scene.add(rocks);
}
