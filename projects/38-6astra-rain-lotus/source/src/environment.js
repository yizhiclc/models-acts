import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom,shoreDistance,shoreRadius,terrainHeight } from './config.js';
const random=seededRandom(8263),TAU=Math.PI*2;
const fract=x=>x-Math.floor(x),hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function noise(x,y){const a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;}
function fbm(x,y){let v=0,a=.5;for(let i=0;i<5;i++){v+=noise(x,y)*a;x=x*2.03+17.3;y=y*2.03-2.1;a*=.5;}return v;}
export async function createSky(renderer,scene){
 const w=768,h=384,data=new Float32Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const theta=x/w*TAU,alt=Math.sin((y/h-.5)*Math.PI),cloud=fbm(Math.cos(theta)*4/(Math.abs(alt)+.35),Math.sin(theta)*4/(Math.abs(alt)+.35)+alt*3);
  const opening=Math.exp(-(Math.pow(Math.sin(theta+1.05),2)*2.3+Math.pow(alt-.45,2)*8)),c=alt>=0?.23+cloud*.67+opening*.95:.1+cloud*.11,haze=Math.exp(-Math.abs(alt)*8)*.19,i=(y*w+x)*4;
  data[i]=c*.91+haze;data[i+1]=c*.98+haze;data[i+2]=c*1.04+haze;data[i+3]=1;
 }
 const sky=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);sky.mapping=THREE.EquirectangularReflectionMapping;sky.needsUpdate=true;sky.colorSpace=THREE.LinearSRGBColorSpace;
 scene.background=sky;scene.backgroundIntensity=.86;scene.backgroundBlurriness=.018;
 const pmrem=new THREE.PMREMGenerator(renderer),env=await pmrem.fromEquirectangularAsync(sky);scene.environment=env.texture;scene.environmentIntensity=.7;return {sky,env,pmrem};
}
function groundTexture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d'),image=ctx.createImageData(512,512);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  let r,g,b;
  if(kind==='wood'){const grain=fbm(x*.12,y*.003),groove=Math.pow(.5+.5*Math.sin(x*.58+noise(x*.06,y*.014)*9),12),v=.36+grain*.52-groove*.12+hash(x,y)*.08;r=151*v;g=142*v;b=113*v;}
  else{const n=fbm(x*.026,y*.026),grain=hash(x,y),pebble=Math.max(0,noise(x*.32,y*.32)-.65)*.7,moss=Math.max(0,n-.48)*1.4,v=.45+n*.4+grain*.15+pebble;r=126*v-moss*37;g=120*v+moss*15;b=91*v-moss*19;}
  image.data.set([r,g,b,255],(y*512+x)*4);
 }
 ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
function terrainGeometry(){
 const g=new THREE.PlaneGeometry(34,34,272,272);g.rotateX(-Math.PI/2);
 const p=g.attributes.position,uv=g.attributes.uv,colors=new Float32Array(p.count*3),wet=new THREE.Color(0x6a6a51),moss=new THREE.Color(0x91a066),under=new THREE.Color(0x686d54),c=new THREE.Color();
 for(let i=0;i<p.count;i++){
  const xx=p.getX(i),zz=p.getZ(i),x=Math.sign(xx)*(Math.abs(xx)/17)**1.55*36,z=Math.sign(zz)*(Math.abs(zz)/17)**1.55*36,d=shoreDistance(x,z);p.setXYZ(i,x,terrainHeight(x,z),z);uv.setXY(i,x/1.7,z/1.7);
  const lush=THREE.MathUtils.smoothstep(d,.04,1.3)*(.4+.6*noise(x*1.4,z*1.4));c.copy(d<0?under:wet).lerp(moss,lush);c.multiplyScalar(.88+noise(x*5,z*5)*.24);colors.set([c.r,c.g,c.b],i*3);
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function bladeGeometry(clumps){
 const p=[],c=[],uv=[],indices=[],base=new THREE.Color(),tip=new THREE.Color(),v=new THREE.Color();
 for(const clump of clumps)for(let i=0;i<clump.count;i++){
  const a=random()*TAU,h=clump.height*(.48+random()*.65),bend=h*(.16+random()*.55),width=(clump.width||.015)*(random()*.5+.7),x=clump.x+(random()-.5)*clump.spread,z=clump.z+(random()-.5)*clump.spread,y=terrainHeight(x,z)+.004,start=p.length/3;
  base.setHex(clump.submerged?0x183d29:0x263c1f);tip.setHex(clump.submerged?0x497352:0x738351);tip.multiplyScalar(.66+random()*.55);
  for(let s=0;s<=6;s++){
   const t=s/6,w=width*(1-t**1.6),lean=bend*t*t;
   for(const edge of [-1,0,1]){p.push(x+Math.cos(a)*lean+Math.sin(a)*w*edge,y+h*t-(edge===0?0:.006*Math.sin(t*Math.PI)),z+Math.sin(a)*lean-Math.cos(a)*w*edge);uv.push(edge*.5+.5,t);v.copy(base).lerp(tip,t);v.multiplyScalar(edge===0?1.12:1);c.push(v.r,v.g,v.b);}
   if(s<6)for(let q=0;q<2;q++){const k=start+s*3+q;indices.push(k,k+1,k+3,k+1,k+4,k+3);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function twig(a,b,r){const delta=b.clone().sub(a),g=new THREE.CylinderGeometry(r*.5,r,delta.length(),5,1),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());g.applyQuaternion(q);g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());return g;}
function smallLeafGeometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.42,.09,.4,-.35,.1,.72,0,.015,1,.35,.1,.72,.42,.09,.4,0,.13,.48],3));g.setIndex([0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0,6]);g.computeVertexNormals();return g;}
function woodland(scene){
 const branches=[],clusters=[],dummy=new THREE.Object3D();
 for(let i=0;i<25;i++){
  const a=i/25*TAU+.13*random(),radius=8.5+random()*10,x=Math.cos(a)*radius,z=Math.sin(a)*radius,h=2.9+random()*3.5,base=new THREE.Vector3(x,terrainHeight(x,z),z),top=base.clone().add(new THREE.Vector3((random()-.5)*.5,h,0));branches.push(twig(base,top,.075+random()*.045));
  for(let j=0;j<10;j++){
   const angle=j*2.4+i,at=base.clone().lerp(top,.35+j*.056),reach=.55+random()*1.25,end=at.clone().add(new THREE.Vector3(Math.cos(angle)*reach,.2+random()*.7,Math.sin(angle)*reach));branches.push(twig(at,end,.027));
   for(let k=0;k<3;k++){const q=end.clone().add(new THREE.Vector3((random()-.5)*1.1,random()*.55,(random()-.5)*1.1));branches.push(twig(end,q,.01));clusters.push(q);}
  }
 }
 const branchMesh=new THREE.Mesh(mergeGeometries(branches),new THREE.MeshStandardNodeMaterial({color:0x343d2b,roughness:.94}));scene.add(branchMesh);branches.forEach(g=>g.dispose());
 const leaves=new THREE.InstancedMesh(smallLeafGeometry(),new THREE.MeshStandardNodeMaterial({color:0xffffff,roughness:.85,side:THREE.DoubleSide}),clusters.length*32);let i=0;const c=new THREE.Color();
 for(const p of clusters)for(let k=0;k<32;k++){
  const a=random()*TAU,r=Math.sqrt(random())*.55;dummy.position.copy(p).add(new THREE.Vector3(Math.cos(a)*r,(random()-.5)*.65,Math.sin(a)*r));dummy.rotation.set((random()-.5)*2,random()*TAU,(random()-.5)*1.7);dummy.scale.setScalar(.14+random()*.17);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);c.setHSL(.235+random()*.07,.19+random()*.28,.13+random()*.1);leaves.setColorAt(i++,c);
 }
 scene.add(leaves);
}
export function createEnvironment(scene){
 const soil=groundTexture('soil'),mud=new THREE.MeshStandardNodeMaterial({map:soil,vertexColors:true,roughness:.88,bumpMap:soil,bumpScale:.009});
 const bed=new THREE.Mesh(terrainGeometry(),mud);bed.receiveShadow=true;scene.add(bed);const clumps=[];
 for(let i=0;i<210;i++){
  const a=random()*TAU,r=shoreRadius(a)+.08+Math.pow(random(),2)*1.45,x=Math.cos(a)*r,z=Math.sin(a)*r*.93;if(x<-2.7&&z>1.2&&z<2.8)continue;
  const dense=Math.sin(a*3+.7)>0;clumps.push({x,z,count:dense?13:6,height:dense?.48+random()*.65:.12+random()*.25,spread:.22,width:dense?.013:.009});
 }
 for(let i=0;i<400;i++){const x=(random()-.5)*21,z=(random()-.5)*21;if(shoreDistance(x,z)<.6)continue;clumps.push({x,z,count:4,height:.1+random()*.25,spread:.2,width:.009});}
 const grass=new THREE.Mesh(bladeGeometry(clumps),new THREE.MeshStandardNodeMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.83}));grass.receiveShadow=true;grass.castShadow=true;scene.add(grass);
 const submerged=[];for(let i=0;i<65;i++){const a=random()*TAU,r=shoreRadius(a)-.15-random()*.55;submerged.push({x:Math.cos(a)*r,z:Math.sin(a)*r*.93,count:7,height:.18+random()*.24,spread:.18,submerged:true,width:.012});}
 const watergrass=new THREE.Mesh(bladeGeometry(submerged),new THREE.MeshStandardNodeMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.8}));scene.add(watergrass);
 const stoneMat=new THREE.MeshStandardNodeMaterial({map:soil,color:0xb0b1a0,roughness:.7,bumpMap:soil,bumpScale:.025}),stoneGeo=new THREE.IcosahedronGeometry(1,2),sp=stoneGeo.attributes.position;
 for(let i=0;i<sp.count;i++){const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i),s=.91+noise(x*4+z*2,y*5)*.17;sp.setXYZ(i,x*s,y*s,z*s);}stoneGeo.computeVertexNormals();
 const stones=new THREE.InstancedMesh(stoneGeo,stoneMat,135),dummy=new THREE.Object3D(),c=new THREE.Color();
 for(let i=0;i<135;i++){
  const cluster=[-.15,1.0,2.9,4.35,5.1][i%5],a=cluster+(random()-.5)*.48,r=shoreRadius(a)-.09+random()*.52,x=Math.cos(a)*r,z=Math.sin(a)*r*.93,scale=.05+Math.pow(random(),2)*.31;
  dummy.position.set(x,terrainHeight(x,z)+scale*.18,z);dummy.scale.set(scale*(1+random()*.7),scale*(.48+random()*.5),scale*(.75+random()*.6));dummy.rotation.set(random(),random()*TAU,random()*.5);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);c.setHSL(.14+random()*.1,.08+random()*.1,.3+random()*.16);stones.setColorAt(i,c);
 }
 stones.castShadow=stones.receiveShadow=true;scene.add(stones);
 const litter=new THREE.InstancedMesh(smallLeafGeometry(),new THREE.MeshStandardNodeMaterial({color:0xffffff,side:THREE.DoubleSide,roughness:.91}),520);
 for(let i=0;i<520;i++){
  const a=random()*TAU,r=shoreRadius(a)+.015+random()*.8,x=Math.cos(a)*r,z=Math.sin(a)*r*.93;dummy.position.set(x,terrainHeight(x,z)+.006,z);dummy.rotation.set((random()-.5)*.2,random()*TAU,0);dummy.scale.setScalar(.025+random()*.055);dummy.updateMatrix();litter.setMatrixAt(i,dummy.matrix);c.setHSL(.13+random()*.15,.21+random()*.2,.14+random()*.12);litter.setColorAt(i,c);
 }
 scene.add(litter);
 const woodMap=groundTexture('wood'),wood=new THREE.MeshPhysicalNodeMaterial({map:woodMap,color:0xc0bba3,roughness:.61,clearcoat:.14,clearcoatRoughness:.38,bumpMap:woodMap,bumpScale:.007}),nailGeometries=[];
 for(let i=0;i<9;i++){
  const plank=new THREE.Mesh(new THREE.BoxGeometry(.238,.085,1.02),wood);plank.position.set(-4.42+i*.246,.27,1.95);plank.rotation.z=(random()-.5)*.009;plank.castShadow=plank.receiveShadow=true;scene.add(plank);
  for(const z of [1.58,2.32]){const g=new THREE.CylinderGeometry(.005,.005,.003,7);g.translate(plank.position.x,.314,z);nailGeometries.push(g);}
 }
 scene.add(new THREE.Mesh(mergeGeometries(nailGeometries),new THREE.MeshStandardNodeMaterial({color:0x394235,metalness:.55,roughness:.6})));nailGeometries.forEach(g=>g.dispose());
 for(const x of [-4.35,-2.5])for(const z of [1.61,2.28]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.047,.055,.7,9),wood);post.position.set(x,-.04,z);post.castShadow=true;scene.add(post);}
 woodland(scene);
 const ambient=new THREE.HemisphereLight(0xc1cec7,0x39482d,1.25);scene.add(ambient);
 const light=new THREE.DirectionalLight(0xf0edde,1.4);light.position.set(-3.5,7,-5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.5,far:20});light.shadow.bias=-.0003;light.shadow.normalBias=.007;light.shadow.radius=5;scene.add(light);
 const fill=new THREE.DirectionalLight(0xaac4c2,.55);fill.position.set(4,3,5);scene.add(fill);scene.fog=new THREE.FogExp2(0x82978d,.045);
 return {light,ambient,fill,bed,watergrass,grass,stones};
}
