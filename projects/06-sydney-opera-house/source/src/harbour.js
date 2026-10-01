import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { V, box, beam, tube, slab, addMesh, consolidate, seededRandom } from './geometry.js';
import { buildBridge } from './bridge.js';

function normalTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  const random=seededRandom(951);
  const waves=Array.from({length:21},(_,i)=>({x:Math.round(3+random()*38)*(random()>.5?1:-1),y:Math.round(3+random()*38),phase:random()*Math.PI*2,amplitude:.044/(1+i*.08)}));
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    let dx=0,dz=0;
    for(const wave of waves){const k=Math.hypot(wave.x,wave.y),s=Math.cos(u*wave.x+v*wave.y+wave.phase)*wave.amplitude;dx+=s*wave.x/k;dz+=s*wave.y/k;}
    const n=V(-dx,-dz,1).normalize(),i=(y*size+x)*4;
    data[i]=Math.round((n.x*.5+.5)*255);data[i+1]=Math.round((n.y*.5+.5)*255);data[i+2]=Math.round((n.z*.5+.5)*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;return texture;
}

export function buildWater(renderer, smallScreen) {
  const water=new Water(new THREE.PlaneGeometry(12000,12000), {
    textureWidth: smallScreen ? 512 : 1024, textureHeight: smallScreen ? 512 : 1024,
    waterNormals:normalTexture(),sunDirection:V(-.65,.55,.35).normalize(),sunColor:0xffe2b3,
    waterColor:0x246e71,distortionScale:3.1,alpha:1,fog:true,
  });
  water.rotation.x=-Math.PI/2;water.position.y=.18;
  water.material.uniforms.size.value=1.6;
  water.material.fragmentShader=water.material.fragmentShader
    .replace('float rf0 = 0.3;', 'float rf0 = 0.025;')
    .replace('100.0, 2.0, 0.5','160.0, 0.8, 0.35')
    .replace('sunColor * diffuseLight * 0.3','sunColor * diffuseLight * 0.12')
    .replace('vec3( 0.1 ) + reflectionSample * 0.9','vec3( 0.015 ) + reflectionSample * 0.92');
  water.name='Sydney Harbour — animated, planar-reflected water';
  return water;
}

export function buildSky() {
  const material = new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{zenith:{value:new THREE.Color(0x84b2bf)},horizon:{value:new THREE.Color(0xeee2be)},sun:{value:V(-.65,.55,.35).normalize()},sunTint:{value:new THREE.Color(0xffe4ad)},cloudTint:{value:new THREE.Color(0xf5ead5)},night:{value:0}},
    vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 vPosition;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 sun;uniform vec3 sunTint;uniform vec3 cloudTint;uniform float night;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec3 d=normalize(vPosition);float h=max(d.y,0.0);vec3 c=mix(horizon,zenith,pow(h,.45));float s=max(dot(d,sun),0.0);c+=sunTint*pow(s,90.0)*.18*(1.0-night);c+=sunTint*smoothstep(.9995,.99985,s)*1.8*(1.0-night);vec2 p=d.xz/max(d.y,.07)*1.3;float n=noise(p)*.56+noise(p*2.17)*.28+noise(p*4.5)*.16;float clouds=smoothstep(.57,.8,n)*smoothstep(.04,.24,h)*smoothstep(.94,.5,h);c=mix(c,cloudTint,clouds*.27);gl_FragColor=vec4(c,1.0);#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
  });
  // Preprocessor directives must start on their own line in all WebGL drivers.
  material.fragmentShader=material.fragmentShader.replace(';#include',';\n#include');
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(5500,32,20),material);mesh.renderOrder=-20;mesh.name='Procedural harbour atmosphere';return mesh;
}

function tree(group,x,z,height,m,random,base=3.8) {
  beam(group,V(x,base,z),V(x,base+height*.65,z),height*.035,m.trunk,5);
  for(let k=0;k<3;k++){
    const g=new THREE.IcosahedronGeometry(height*(.25+random()*.08),1);
    g.scale(1,.78,1);g.translate(x+(random()-.5)*height*.4,base+height*(.62+random()*.13),z+(random()-.5)*height*.4);
    addMesh(group,g,k%2?m.tree:m.treeLight);
  }
}

export function buildHarbour(m) {
  const group=new THREE.Group();group.name='Bennelong Point, gardens, bridge and distant shores';
  const random=seededRandom(314);
  const mainland=[[-70,133],[83,133],[102,166],[141,178],[175,212],[241,249],[328,331],[440,376],[650,450],[900,780],[-1200,780],[-1050,325],[-680,306],[-453,245],[-206,248],[-123,213]];
  slab(group,mainland,-1,4.3,m.darkStone);
  slab(group,mainland,3.25,.35,m.lightStone);
  slab(group,[[105,186],[143,193],[175,224],[236,258],[320,343],[410,394],[650,500],[660,700],[80,700],[85,295]],3.6,.4,m.grass);
  // A clear esplanade connects the monument to the city, rather than isolating
  // it on a floating plinth. The eastern edge becomes the Botanic Garden.
  box(group,[146,.12,32],[0,3.7,151],m.pavement);
  box(group,[52,.15,410],[-48,3.7,390],m.pavement);
  box(group,[8,.16,170],[109,3.72,283],m.lightStone,.14);
  for(let i=0;i<125;i++) {
    const x=130+random()*405,z=230+random()*450;
    if(x<220 && z<265) continue;
    tree(group,x,z,8+random()*10,m,random);
  }
  for(let i=0;i<28;i++) tree(group,-124-random()*45,270+i*10,9+random()*8,m,random);

  const cityMats=[0x97a99f,0x98aba8,0xb9bbaa,0x779297,0xa3b3ab].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.85}));
  for(let i=0;i<65;i++){
    const x=-590+random()*540,z=390+random()*360,h=20+random()*90;
    box(group,[18+random()*18,h,19+random()*19],[x,3.6+h/2,z],cityMats[i%5]);
    if(i%3===0)box(group,[12,3,12],[x,h+5.1,z],cityMats[(i+1)%5]);
  }
  // Northern shore kept deliberately low and muted in the aerial perspective.
  const north=[[-1800,-1070],[-1300,-905],[-900,-870],[-600,-945],[-200,-850],[300,-810],[760,-940],[1400,-870],[2000,-1170],[2000,-2300],[-1800,-2300]];
  slab(group,north,-2,13,m.treeLight);
  for(let i=0;i<180;i++){
    const x=-1400+random()*3100,z=-935-random()*320,h=5+random()*24;
    box(group,[10+random()*20,h,13+random()*22],[x,11+h/2,z],cityMats[i%5]);
  }
  // Kirribilli and the western bridge approach ground the distant bridge.
  slab(group,[[-620,-670],[-485,-575],[-305,-559],[-195,-605],[-160,-750],[-550,-1000],[-900,-960]],-1,8,m.tree);
  for(let i=0;i<50;i++){
    const x=-575+random()*315,z=-625-random()*150,h=5+random()*17;
    box(group,[12+random()*8,h,12+random()*8],[x,7+h/2,z],cityMats[i%5]);
  }
  group.add(buildBridge(m));
  return consolidate(group);
}

function ferry(m) {
  const boat=new THREE.Group();
  const hull=new THREE.SphereGeometry(1,20,10);hull.scale(3,1.3,10);hull.translate(0,.65,0);addMesh(boat,hull,m.ferryGreen);
  box(boat,[5.5,.65,15.6],[0,1.6,0],m.ferryYellow);
  box(boat,[4.8,2.25,11],[0,3.05,.4],m.ferryYellow);
  box(boat,[4.9,1.02,10.7],[0,3.25,.4],m.glass);
  for(let z=-4.5;z<6;z+=1.2)for(const x of [-2.48,2.48])box(boat,[.09,1.18,.1],[x,3.25,z],m.ferryYellow);
  box(boat,[5.4,.3,12.2],[0,4.3,.5],m.boatWhite);
  box(boat,[3.3,1.7,3.6],[0,5.25,-1.8],m.ferryYellow);
  box(boat,[3.35,.8,3.5],[0,5.4,-1.8],m.glass);
  box(boat,[3.7,.25,4],[0,6.15,-1.8],m.boatWhite);
  beam(boat,V(0,6.2,-1.8),V(0,9,-1.8),.065,m.white,4);
  return consolidate(boat);
}

function sailboat(m) {
  const boat=new THREE.Group();
  const g=new THREE.SphereGeometry(1,12,8);g.scale(1.4,.55,5);g.translate(0,.5,0);addMesh(boat,g,m.boatWhite);
  beam(boat,V(0,.7,0),V(0,12.5,0),.055,m.bronze,5);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1.9,-3.6,0,12.3,0,.25,1.9,0,0,2,0,0,11.5,.1,.6,2,4.5],3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:0xf5f0d9,side:THREE.DoubleSide,roughness:.86});addMesh(boat,geometry,material);
  return consolidate(boat);
}

function wakeMesh(width,length) {
  const geometry=new THREE.PlaneGeometry(width,length,1,1);geometry.rotateX(-Math.PI/2);
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{time:{value:0},alpha:{value:.2}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;uniform float time;uniform float alpha;void main(){float u=abs(vUv.x-.5)*2.;float v=vUv.y;float edge=1.-smoothstep(.0,.1,abs(u-(1.-v)*.83));float waves=.65+.35*sin(v*115.-time*3.);float fade=smoothstep(0.,.25,v)*(1.-v);gl_FragColor=vec4(.81,.9,.84,edge*fade*waves*alpha);}',
  });
  return new THREE.Mesh(geometry,mat);
}

export function buildBoats(m) {
  const group=new THREE.Group();group.name='Harbour boats';
  const f=ferry(m);group.add(f);
  const wake=wakeMesh(21,64);wake.position.y=.25;group.add(wake);
  const s1=sailboat(m);group.add(s1);
  const s2=sailboat(m);s2.scale.setScalar(.8);group.add(s2);
  return {group,update(time){
    const t=time*.006;
    f.position.set(-128+Math.sin(t)*73,Math.sin(time*1.1)*.09,-124+Math.cos(t)*27);
    const dx=Math.cos(t)*73,dz=-Math.sin(t)*27;
    f.rotation.y=Math.atan2(-dx,-dz);
    wake.rotation.y=f.rotation.y;wake.position.copy(f.position).add(V(Math.sin(f.rotation.y)*36,.2,Math.cos(f.rotation.y)*36));
    wake.material.uniforms.time.value=time;
    s1.position.set(187+Math.sin(time*.01)*55,Math.sin(time)*.05,-210);s1.rotation.y=-.65;
    s2.position.set(-128,0,-380+Math.sin(time*.008)*90);s2.rotation.y=.4;
  }};
}
