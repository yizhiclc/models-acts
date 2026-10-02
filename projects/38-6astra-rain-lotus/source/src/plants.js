import * as THREE from 'three/webgpu';
import { color, normalWorld, vec3, max, float } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { leafHeight, seededRandom,shoreDistance } from './config.js';

const rand=seededRandom(2164);
const greens=[0x719844,0x5a853b,0x739744,0x819f48,0x628940];
function leafMaps(){
  const n=512,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(n,n);
  const bump=document.createElement('canvas');bump.width=bump.height=n;const bc=bump.getContext('2d'),bi=bc.createImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(x/n-.5)*2,dz=(y/n-.5)*2,r=Math.hypot(dx,dz),a=Math.atan2(dz,dx);
    const primary=Math.exp(-Math.pow(Math.sin(a*11)/(0.014+0.006/Math.max(.04,r)),2));
    const branch=Math.exp(-Math.pow(Math.sin(a*44+r*48)/(0.075),2))*.3;
    const noise=(Math.sin(x*12.989+y*78.233)*43758.5453)%1;
    const shade=.83+.15*r+primary*.17+branch*.06+noise*.023;
    const i=(y*n+x)*4;
    image.data.set([152*shade,178*shade,123*shade,255],i);
    const v=128+primary*72+branch*22+noise*9;bi.data.set([v,v,v,255],i);
  }
  ctx.putImageData(image,0,0);bc.putImageData(bi,0,0);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const bumpMap=new THREE.CanvasTexture(bump);bumpMap.anisotropy=8;return {map,bumpMap};
}
function leafGeometry(radius,phase){
  const rings=17,segments=96,positions=[],uvs=[],indices=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2,r=j/rings*radius*(.985+.015*Math.sin(a*5+phase));
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    positions.push(x,leafHeight(x,z,radius,phase),z);uvs.push(x/radius*.5+.5,z/radius*.5+.5);
    if(j<rings&&i<segments){const q=j*(segments+1)+i;indices.push(q,q+segments+1,q+1,q+1,q+segments+1,q+segments+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function stemGeometry(height,bend=.045){
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(bend,height*.4,bend*.4),new THREE.Vector3(bend*.5,height*.72,0),new THREE.Vector3(0,height,0)]),18,.0065,7,false);
}
function petalGeometry(length,width,opening,phase){
  const p=[],uv=[],cs=[],idx=[],rows=16,cols=10;
  const base=new THREE.Color(0xffe7d2),tip=new THREE.Color(0xd66491),c=new THREE.Color();
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const t=j/rows,u=i/cols*2-1;
    const w=Math.sin(Math.PI*t)**.65*width*(.72+.28*t);
    const radial=length*(t*opening+.12*Math.sin(Math.PI*t));
    const height=length*(t*(1.12-opening*.54)+.12*Math.sin(Math.PI*t))-length*.12*t*t*opening;
    p.push(u*w,height+length*.07*u*u*Math.sin(Math.PI*t)+.0007*Math.sin(t*13+phase)*u,radial);
    uv.push(i/cols,t);
    c.copy(base).lerp(tip,Math.min(.9,.12+t**1.8*.64+Math.abs(u)**6*.18));
    c.multiplyScalar(1-.022*Math.sin(i*2.1+t*30));cs.push(c.r,c.g,c.b);
    if(i<cols&&j<rows){const a=j*(cols+1)+i;idx.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(p.length),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function blossom(bud=false){
  const group=new THREE.Group(),petals=[];
  if(bud){
    const g=new THREE.LatheGeometry([new THREE.Vector2(.004,0),new THREE.Vector2(.015,.013),new THREE.Vector2(.03,.044),new THREE.Vector2(.034,.075),new THREE.Vector2(.026,.11),new THREE.Vector2(.013,.141),new THREE.Vector2(.002,.166),new THREE.Vector2(0,.17)],36);
    const p=g.attributes.position,cs=new Float32Array(p.count*3),green=new THREE.Color(0x617643),pink=new THREE.Color(0xd67d98),c=new THREE.Color();
    for(let i=0;i<p.count;i++){const t=p.getY(i)/.17,a=Math.atan2(p.getZ(i),p.getX(i));c.copy(green).lerp(pink,THREE.MathUtils.smoothstep(t,.1,.6));c.multiplyScalar(.86+.14*Math.cos(a*6+t*2)**2);cs.set([c.r,c.g,c.b],i*3);}
    g.setAttribute('color',new THREE.BufferAttribute(cs,3));const budMesh=new THREE.Mesh(g,new THREE.MeshPhysicalNodeMaterial({vertexColors:true,roughness:.48,sheen:1,sheenColor:0xf6a6bc}));budMesh.castShadow=true;group.add(budMesh);return group;
  }
  // Thin petals scatter incident light. SSS also keeps this opaque pass safe
  // inside the differently sized planar-reflection render target.
  const mat=new THREE.MeshSSSNodeMaterial({vertexColors:true,roughness:.38,metalness:0,side:THREE.DoubleSide,sheen:1,sheenColor:0xffd3df,sheenRoughness:.65});
  mat.thicknessColorNode=color(0xff91b4);
  mat.thicknessAttenuationNode=float(.12);
  mat.thicknessScaleNode=float(3.5);
  mat.thicknessPowerNode=float(2.5);
  const layers=bud?3:4;
  for(let layer=0;layer<layers;layer++){
    const count=bud?6:9-layer;
    for(let k=0;k<count;k++){
      const angle=k/count*Math.PI*2+layer*.45;
      const g=petalGeometry(bud?.11:.185-layer*.023,bud?.017:.052-layer*.007,bud?.17:.94-layer*.21,k+layer);
      g.rotateY(angle);g.translate(Math.sin(angle)*.008,layer*.006,Math.cos(angle)*.008);petals.push(g);
    }
  }
  const mesh=new THREE.Mesh(mergeGeometries(petals),mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);petals.forEach(g=>g.dispose());
  if(!bud){
    const heart=new THREE.Mesh(new THREE.CylinderGeometry(.024,.013,.027,18),new THREE.MeshStandardNodeMaterial({color:0xc5ac4d,roughness:.61}));heart.position.y=.04;group.add(heart);
    const stamens=[];
    for(let k=0;k<48;k++){
      const a=k/48*Math.PI*2,r=.026+rand()*.008,h=.028+rand()*.012;
      const g=new THREE.CapsuleGeometry(.0015,h,2,5);g.translate(Math.sin(a)*r,.035+h*.4,Math.cos(a)*r);stamens.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(stamens),new THREE.MeshStandardNodeMaterial({color:0xe2c779,roughness:.45})));stamens.forEach(g=>g.dispose());
  }else{
    const sepal=new THREE.Mesh(new THREE.SphereGeometry(.026,12,12,0,Math.PI*2,Math.PI*.5,Math.PI*.5),new THREE.MeshPhysicalNodeMaterial({color:0x54723a,roughness:.35}));sepal.scale.y=1.6;sepal.position.y=.014;group.add(sepal);
  }
  return group;
}
function seedPod(){
  const group=new THREE.Group(),body=new THREE.Mesh(new THREE.CylinderGeometry(.057,.025,.045,24),new THREE.MeshStandardNodeMaterial({color:0x718043,roughness:.56}));group.add(body);
  const holes=[];
  for(let i=0;i<14;i++){
    const angle=i*2.399963,r=.011*Math.sqrt(i),g=new THREE.SphereGeometry(.0055,8,6);g.scale(1,.33,1);g.translate(Math.cos(angle)*r,.022,Math.sin(angle)*r);holes.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(holes),new THREE.MeshStandardNodeMaterial({color:0x334025,roughness:.75})));holes.forEach(g=>g.dispose());return group;
}
export function createPlants(scene){
  const leaves=[],stems=[],flowers=[],maps=leafMaps();
  const stemMat=new THREE.MeshPhysicalNodeMaterial({color:0x47622f,roughness:.38,clearcoat:.35});
  const anchors=[[-.7,1.85,.285,.19],[.12,2.6,.26,.055],[-1.53,1.55,.24,.075],[-2.15,2.2,.28,.37],[1.7,1.8,.29,.25],[2.45,2.4,.25,.09],[1.35,2.65,.22,.07],[-.05,.5,.25,.37],[-1.3,.1,.27,.25],[.9,.25,.26,.12],[1.8,.1,.25,.53],[-2.65,.05,.28,.21],[2.68,-.8,.24,.25],[.3,-1.0,.29,.4],[-.4,-1.65,.24,.11],[1.1,-1.65,.28,.25],[-1.5,-1.2,.26,.51],[-2.5,-1.55,.21,.075],[-2.25,-2.4,.28,.3],[-1.45,-2.75,.24,.17],[.15,-2.7,.24,.27],[1.48,-2.7,.29,.36],[2.4,-2.4,.27,.07],[2.82,-1.65,.24,.43],[-3.15,1.1,.21,.11],[3.15,.75,.24,.065],[-2.6,3.0,.25,.21],[.4,3.35,.23,.065],[2.9,3.2,.27,.3],[-.65,-.6,.21,.07],[.55,1.38,.215,.07],[-2.1,-.65,.24,.085],[2,-1.0,.21,.09],[.6,-3.35,.21,.085],[3.2,-3,.22,.19],[-3.25,-2.8,.25,.35]];
  anchors.push([-1.12,1.86,.22,.41],[-.9,2.3,.255,.07],[-1.46,2.16,.23,.2],[-1.71,1.86,.21,.51],[-1.94,1.34,.25,.15],[-1.21,1.02,.24,.06],[-.62,1.14,.21,.29],[-.13,1.95,.21,.075],[-1.86,-1.7,.23,.08],[-1.9,-2.1,.21,.42],[-1.0,-2.15,.27,.27],[-1.35,-1.72,.235,.075],[-.74,-1.1,.2,.37],[-.86,-2.59,.21,.34],[.33,-2.18,.235,.15],[.65,-2.54,.26,.085],[1.5,-1.85,.22,.54],[2.02,-1.44,.26,.29],[2.39,-.44,.24,.065],[2.52,.22,.215,.35],[1.93,.65,.23,.12],[2.2,1.29,.26,.41],[1.82,2.11,.24,.055],[1.15,1.96,.22,.35],[.65,2.63,.22,.19],[-.6,.16,.24,.075],[.24,-.15,.23,.6],[.42,.72,.19,.15]);
  const filtered=anchors.filter(([x,z,r])=>shoreDistance(x,z)<-r*.75);
  for(let i=0;i<filtered.length;i++){
    const [x,z,radius,y]=filtered[i],phase=rand()*6.28,group=new THREE.Group();group.position.set(x,y,z);
    const mat=new THREE.MeshPhysicalNodeMaterial({color:greens[i%greens.length],...maps,bumpScale:.0008,roughness:.53,clearcoat:.22,clearcoatRoughness:.38,side:THREE.DoubleSide});
    mat.emissiveNode=color(0x416719).mul(max(normalWorld.dot(vec3(-.35,.8,-.45)).negate(),float(0))).mul(.65);
    const mesh=new THREE.Mesh(leafGeometry(radius,phase),mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);scene.add(group);
    const stem=new THREE.Mesh(stemGeometry(y+.55-.032),stemMat);stem.position.set(x,-.55,z);stem.castShadow=true;scene.add(stem);
    const tiltX=(rand()-.5)*.17,tiltZ=(rand()-.5)*.17;
    const l={x,z,radius,phase,group,stem,mesh,baseY:y,baseTiltX:tiltX,baseTiltZ:tiltZ,slopeX:tiltX,slopeZ:tiltZ,displacement:0,velocity:0,impact:0,reservoir:0,beads:[],pool:null};
    leaves.push(l);
  }
  const placements=[[-.2,1.08,.62,false],[-1.9,.65,.7,false],[1.25,-.62,.91,false],[-1.35,-2.1,.72,false],[2.45,-1.55,.76,true],[.75,2.1,.58,true],[-2.6,1.5,.83,true],[.15,-2.4,.8,true]];
  for(const [x,z,y,bud]of placements){
    const g=blossom(bud);g.position.set(x,y,z);g.rotation.z=(rand()-.5)*.12;g.rotation.y=rand()*Math.PI*2;scene.add(g);flowers.push({group:g,baseY:y,phase:rand()*6});
    const stem=new THREE.Mesh(stemGeometry(y+.56,.032),stemMat);stem.position.set(x,-.55,z);stem.castShadow=true;scene.add(stem);stems.push({x,z,radius:.007});
  }
  for(const [x,z,y]of [[1.75,1.15,.67],[-2.4,-1.0,.61],[1.85,-2.1,.79]]){
    const g=seedPod();g.position.set(x,y,z);g.rotation.set(.15,0,-.16);scene.add(g);flowers.push({group:g,baseY:y,phase:rand()*6});
    const stem=new THREE.Mesh(stemGeometry(y+.54,.025),stemMat);stem.position.set(x,-.55,z);scene.add(stem);stems.push({x,z,radius:.007});
  }
  return {leaves,stems,flowers};
}

export function updatePlants(plants,time,dt,wind){
  for(const l of plants.leaves){
    const total=l.reservoir+l.beads.reduce((v,b)=>v+b.volume,0);
    const load=Math.min(.022,total*17000);
    l.velocity+=(-48*l.displacement-5.4*l.velocity-l.impact)*dt;l.impact=0;
    l.displacement+=l.velocity*dt;
    const wave=Math.sin(time*1.15+l.phase)*wind;
    l.slopeX=l.baseTiltX+wave*.016+l.displacement*.8;
    l.slopeZ=l.baseTiltZ+Math.sin(time*.8+l.phase+1)*wind*.017;
    l.group.position.y=l.baseY+l.displacement-load;
    l.group.rotation.set(-l.slopeZ,0,l.slopeX);
    l.stem.scale.y=(l.group.position.y+.55-.032)/(l.baseY+.55-.032);
  }
  for(const f of plants.flowers){f.group.rotation.z=Math.sin(time*.95+f.phase)*wind*.017;}
}
