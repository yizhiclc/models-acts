import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Metres. +X is rearward, +Y is up, ±Z are the two sides.
// The same watertight upper shell and cut-out arches are used from every view.
export const DIMENSIONS = Object.freeze({ length: 4.87, width: 1.99, height: 1.35, wheelbase: 2.78, tireRadius: 0.356, track: 1.664 });
const AXLES = [-1.39, 1.39];
const ARCH = 0.398;
const CY = DIMENSIONS.tireRadius;
const V = (p) => new THREE.Vector3(...p);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function sample(stations, x, column) {
  let i = 0;
  while (i < stations.length - 2 && x > stations[i + 1][0]) i++;
  const a = stations[i], b = stations[i + 1];
  const t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  const prev = stations[Math.max(0, i - 1)], next = stations[Math.min(stations.length - 1, i + 2)];
  const m0 = (b[column] - prev[column]) / (b[0] - prev[0]) * (b[0] - a[0]);
  const m1 = (next[column] - a[column]) / (next[0] - a[0]) * (b[0] - a[0]);
  return (2*t*t*t-3*t*t+1)*a[column] + (t*t*t-2*t*t+t)*m0 + (-2*t*t*t+3*t*t)*b[column] + (t*t*t-t*t)*m1;
}

// x, half width, centre-line height, outer shoulder height.
const STATIONS = [
  [-2.435, .855, .562, .545], [-2.32, .902, .633, .619],
  [-2.08, .958, .689, .733], [-1.76, .987, .726, .805],
  [-1.39, .995, .751, .827], [-1.00, .956, .786, .774],
  [-.63, .917, .789, .744], [-.06, .894, .772, .727],
  [.49, .933, .798, .766], [.98, .983, .844, .817],
  [1.39, .995, .868, .862], [1.78, .982, .857, .825],
  [2.12, .947, .817, .757], [2.435, .879, .769, .685],
];
export function widthAt(x) { return sample(STATIONS, x, 1); }
function shoulderAt(x) { return sample(STATIONS, x, 3); }
function baseAt(x) {
  return .151 + .222 * (1 - smooth(-2.435, -2.02, x)) + .249 * smooth(2.02, 2.435, x);
}
export function archBottom(x) {
  for (const axle of AXLES) {
    const dx = x - axle;
    if (Math.abs(dx) < ARCH) return CY + Math.sqrt(ARCH * ARCH - dx * dx);
  }
  return baseAt(x);
}
export function topY(x, z) {
  const t = clamp(Math.abs(z) / widthAt(x), 0, 1);
  const c = sample(STATIONS, x, 2), e = shoulderAt(x);
  const cross = [[0,c],[.32,c+.006],[.61,lerp(c,e,.53)+.013],[.82,e+.022],[.94,e+.011],[1,e]];
  const hoodRidge = .013 * Math.exp(-Math.pow((x + 1.36) / .71, 4)) * Math.exp(-Math.pow((t - .47) / .13, 2));
  return sample(cross, t, 1) + hoodRidge;
}
function endWarp(x, t) {
  return x + .131 * Math.pow(Math.abs(t), 2.5) * Math.exp(-Math.pow((x + 2.435) / .25, 2))
    - .068 * Math.pow(Math.abs(t), 3) * Math.exp(-Math.pow((x - 2.435) / .25, 2));
}
function bumperX(x,z,y){
  const t=z/widthAt(x),hi=topY(x,z),lo=baseAt(x)+.017*(1-t*t);
  const v=clamp((hi-y)/(hi-lo),0,1);
  return endWarp(x,t)+Math.sign(x)*.069*Math.sin(v*Math.PI)*(1-t*t);
}
export function sideZ(x, y) {
  const lo = archBottom(x), hi = shoulderAt(x);
  const v = clamp((hi - y) / Math.max(.02, hi - lo), 0, 1);
  const waist = .053 * Math.exp(-Math.pow((x + .04) / .87, 4));
  return widthAt(x) * (1 - .026 * v + .016 * Math.sin(Math.PI * v)) - waist * Math.pow(Math.sin(Math.PI * v), 1.4);
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeCarbon() {
  const texture = canvasTexture(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#161b1e'; ctx.fillRect(0,0,w,h);
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
      const even=(x+y)%4<2;
      ctx.fillStyle=even?'#30383c':'#1b2226'; ctx.fillRect(x*8,y*8,8,8);
      ctx.strokeStyle=even?'#41494b':'#293135'; ctx.lineWidth=.55;
      for(let k=1;k<8;k+=2){ctx.beginPath();if(even){ctx.moveTo(x*8+k,y*8);ctx.lineTo(x*8+k,y*8+8);}else{ctx.moveTo(x*8,y*8+k);ctx.lineTo(x*8+8,y*8+k);}ctx.stroke();}
    }
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(9,9);
  return texture;
}

function geometryGrid(nu, nv, fn) {
  const positions=[], uvs=[], indices=[];
  for(let u=0;u<=nu;u++) for(let v=0;v<=nv;v++) {
    positions.push(...fn(u/nu,v/nv)); uvs.push(u/nu,v/nv);
  }
  for(let u=0;u<nu;u++) for(let v=0;v<nv;v++) {
    const a=u*(nv+1)+v,b=a+nv+1;
    indices.push(a,a+1,b,b,a+1,b+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  return g;
}

function shapeMesh(points, map, material, normal) {
  const pts=points.map(p=>new THREE.Vector2(...p));
  const triangles=THREE.ShapeUtils.triangulateShape(pts,[]);
  // Subdivide in parameter space before projecting. A flat triangulated lens would
  // disappear into a convex fender between its boundary vertices.
  const positions=[], texcoords=[], ids=[];
  const subdivisions=6;
  for(const tri of triangles){
    const a=pts[tri[0]], b=pts[tri[1]], c=pts[tri[2]], rows=[];
    for(let i=0;i<=subdivisions;i++){
      rows[i]=[];
      for(let j=0;j<=subdivisions-i;j++){
        const u=i/subdivisions,v=j/subdivisions;
        const p=[a.x*(1-u-v)+b.x*u+c.x*v,a.y*(1-u-v)+b.y*u+c.y*v];
        rows[i][j]=positions.length/3;positions.push(...map(p));texcoords.push(...p);
      }
    }
    for(let i=0;i<subdivisions;i++)for(let j=0;j<subdivisions-i;j++){
      ids.push(rows[i][j],rows[i+1][j],rows[i][j+1]);
      if(j<subdivisions-i-1)ids.push(rows[i+1][j],rows[i+1][j+1],rows[i][j+1]);
    }
  }
  if(normal && ids.length){
    const a=new THREE.Vector3().fromArray(positions,ids[0]*3), b=new THREE.Vector3().fromArray(positions,ids[1]*3),c=new THREE.Vector3().fromArray(positions,ids[2]*3);
    if(b.sub(a).cross(c.sub(a)).dot(V(normal))<0) for(let i=0;i<ids.length;i+=3)[ids[i+1],ids[i+2]]=[ids[i+2],ids[i+1]];
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));g.setIndex(ids);
  const welded=mergeVertices(g,1e-5);g.dispose();welded.computeVertexNormals();
  return new THREE.Mesh(welded,material);
}

function curvedOutline(points, segments=60) {
  return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],0)),true,'centripetal').getPoints(segments).slice(0,-1).map(p=>[p.x,p.y]);
}

function batchStaticMeshes(root){
  root.updateMatrixWorld(true);
  const batches=new Map(),sources=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.material.transparent)return;
    const key=mesh.material.uuid;
    if(!batches.has(key))batches.set(key,{material:mesh.material,meshes:[]});
    batches.get(key).meshes.push(mesh);
  });
  for(const {material,meshes} of batches.values()){
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);return geometry;
    });
    const combined=mergeGeometries(geometries);
    geometries.forEach(g=>g.dispose());
    if(!combined)throw new Error('Static geometry batching failed');
    const mesh=new THREE.Mesh(combined,material);mesh.name='Static material batch';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    meshes.forEach(source=>{sources.add(source.geometry);source.removeFromParent();});
  }
  // The originals no longer belong to the rendered scene; shared wheel buffers
  // are disposed once. Material instances remain shared for paint/light controls.
  sources.forEach(geometry=>geometry.dispose());
}

export function createCar() {
  const car=new THREE.Group();car.name='DENZA Z 2026 · Racing';
  const body=new THREE.Group();body.name='Continuous body shell';car.add(body);
  const carbonMap=makeCarbon();
  const paint=new THREE.MeshPhysicalMaterial({color:0x0835d7,metalness:.66,roughness:.26,clearcoat:.9,clearcoatRoughness:.17,envMapIntensity:.92});
  const carbon=new THREE.MeshPhysicalMaterial({color:0x293139,map:carbonMap,metalness:.32,roughness:.37,clearcoat:.42,clearcoatRoughness:.27,envMapIntensity:.7,side:THREE.DoubleSide});
  const black=new THREE.MeshStandardMaterial({color:0x080c11,roughness:.52,metalness:.2,side:THREE.DoubleSide});
  const seam=new THREE.MeshStandardMaterial({color:0x07131c,roughness:.48,metalness:.3});
  const rubber=new THREE.MeshStandardMaterial({color:0x171b1f,roughness:.86,metalness:0});
  const silver=new THREE.MeshStandardMaterial({color:0xbec8ce,metalness:1,roughness:.24});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x343b41,metalness:.95,roughness:.34});
  const yellow=new THREE.MeshStandardMaterial({color:0xffd41f,metalness:.36,roughness:.32});
  const glass=new THREE.MeshPhysicalMaterial({color:0x081923,metalness:.34,roughness:.17,clearcoat:.62,transmission:0,ior:1.5,side:THREE.DoubleSide,envMapIntensity:.62});
  const lampHousing=new THREE.MeshPhysicalMaterial({color:0x081017,metalness:.58,roughness:.19,clearcoat:1,side:THREE.DoubleSide});
  const led=new THREE.MeshStandardMaterial({color:0xe7f7ff,emissive:0xa4d6ff,emissiveIntensity:2.7,roughness:.16,metalness:.1});
  const tail=new THREE.MeshPhysicalMaterial({color:0x9d091b,emissive:0xff152f,emissiveIntensity:1.4,metalness:.35,roughness:.23,clearcoat:1,side:THREE.DoubleSide});
  const tailLens=new THREE.MeshPhysicalMaterial({color:0x510713,metalness:.46,roughness:.18,clearcoat:1,side:THREE.DoubleSide});
  const materials={paint,carbon,black,seam,rubber,silver,darkMetal,yellow,glass,led,tail};
  function add(mesh,group=car){group.add(mesh);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
  function box(size,position,mat=black,radius=.02,group=car){const m=new THREE.Mesh(new RoundedBoxGeometry(...size,3,radius),mat);m.position.set(...position);return add(m,group);}
  function tube(points,radius,mat=seam,closed=false,group=car,segments=60){
    const path=new THREE.CatmullRomCurve3(points.map(V),closed,'centripetal');
    const m=new THREE.Mesh(new THREE.TubeGeometry(path,segments,radius,6,closed),mat);return add(m,group);
  }
  function lineOnTop(points,radius=.0026,mat=seam){return tube(points.map(([x,z])=>[endWarp(x,z/widthAt(x)),topY(x,z)+.006,z]),radius,mat);}
  function xyExtrude(points,depth,z,mat,holes=[]){
    const sh=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
    holes.forEach(poly=>sh.holes.push(new THREE.Path(poly.map(p=>new THREE.Vector2(...p)))));
    const geo=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2,steps:1});
    const m=new THREE.Mesh(geo,mat);m.position.z=z;return add(m);
  }
  function labelTexture(text,{color='#dde5e8',background=null,size=512}={}) {
    return canvasTexture(size,size/4,(ctx,w,h)=>{
      if(background){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}ctx.fillStyle=color;ctx.font=`600 ${h*.49}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h*.52);
    });
  }
  function textPlane(text,width,height,position,rotation,opts={}){
    const mat=new THREE.MeshBasicMaterial({map:labelTexture(text,opts),transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);m.position.set(...position);m.rotation.set(...rotation);return add(m);
  }

  // Continuous longitudinal shell; each outer side terminates at the actual wheel opening.
  const xValues=[];for(let i=0;i<=220;i++)xValues.push(lerp(-2.435,2.435,i/220));
  AXLES.forEach(a=>[-ARCH-.00015,-ARCH+.00015,ARCH-.00015,ARCH+.00015].forEach(d=>xValues.push(a+d)));
  xValues.sort((a,b)=>a-b);
  const positions=[],uvs=[],ids=[];
  const NS=18,NT=64,NC=NS*2+NT;
  for(const x of xValues)for(let k=0;k<=NC;k++){
    let z,y;
    if(k<NS){const v=1-k/NS;y=lerp(shoulderAt(x),archBottom(x),v);z=-sideZ(x,y);}
    else if(k<=NS+NT){const t=-1+2*(k-NS)/NT;z=t*widthAt(x);y=topY(x,z);}
    else{const v=(k-NS-NT)/NS;y=lerp(shoulderAt(x),archBottom(x),v);z=sideZ(x,y);}
    positions.push(endWarp(x,z/widthAt(x)),y,z);uvs.push((x+2.435)/4.87,k/NC);
  }
  for(let i=0;i<xValues.length-1;i++)for(let j=0;j<NC;j++){
    const a=i*(NC+1)+j,b=a+NC+1;ids.push(a,a+1,b,b,a+1,b+1);
  }
  const skin=new THREE.BufferGeometry();skin.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));skin.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));skin.setIndex(ids);skin.computeVertexNormals();
  const bodyMesh=add(new THREE.Mesh(skin,paint),body);bodyMesh.name='Sculpted blue body / four open wheel arches';

  // Dense rounded bumper patches avoid faceted, planar end caps.
  for(const x of [-2.435,2.435]){
    const sign=Math.sign(x);
    const cap=geometryGrid(64,22,(u,v)=>{
      const t=2*u-1,z=widthAt(x)*t;
      const y=lerp(topY(x,z),baseAt(x)+.017*(1-t*t),v);
      return[bumperX(x,z,y),y,z];
    });
    if(sign>0){const ix=cap.index.array;for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];cap.computeVertexNormals();}
    add(new THREE.Mesh(cap,paint),body);
  }
  box([2.68,.12,1.48],[0,.22,0],black,.03);

  // Panel gaps follow the compound curved surface, not a flat overlay.
  for(const s of [-1,1]){
    lineOnTop([[-2.235,s*.525],[-1.95,s*.56],[-1.55,s*.565],[-1.17,s*.60],[-.94,s*.61]]);
    lineOnTop([[1.70,s*.68],[2.02,s*.64],[2.42,s*.58]],.0025);
    const door=[[-.98,.774],[-1.005,.61],[-.96,.44],[-.91,.20],[-.53,.177],[.29,.177],[.54,.23],[.69,.44],[.72,.67],[.60,.791]];
    tube(door.map(([x,y])=>[x,y,s*(sideZ(x,y)+.003)]),.0027);
    // Flush door handle.
    const hx=.375,hy=.608;
    const handle=box([.22,.031,.016],[hx,hy,s*(sideZ(hx,hy)+.008)],paint,.013);
    tube([[hx-.089,hy-.013,s*(sideZ(hx,hy)+.019)],[hx+.082,hy-.013,s*(sideZ(hx,hy)+.019)]],.0022);
    const charge=[];for(let i=0;i<=64;i++){const a=2*Math.PI*i/64;const x=1.095+.115*Math.cos(a),y=.726+.082*Math.sin(a);charge.push([x,y,s*(sideZ(x,y)+.004)]);}tube(charge,.0022);
    // Front fender gill and diagonal rear intake.
    const vents=[
      [[-.994,.567],[-.52,.584],[-.60,.554],[-1.006,.539]],
      [[-.965,.525],[-.895,.513],[-.742,.294],[-.865,.369]],
      [[.50,.309],[1.06,.620],[1.025,.655],[.865,.570]],
    ];
    vents.forEach(poly=>add(shapeMesh(curvedOutline(poly,36),([x,y])=>[x,y,s*(sideZ(x,y)+.006)],carbon,[0,0,s])));
    tube([[-.91,.555,s*(sideZ(-.91,.555)+.009)],[-.58,.569,s*(sideZ(-.58,.569)+.009)]],.004,darkMetal);
    // The carbon sill deliberately follows the concave lower body.
    const sill=geometryGrid(42,8,(u,v)=>{
      const x=lerp(-.998,.998,u),z=s*(.943-.026*Math.sin(u*Math.PI)+.029*Math.sin(v*Math.PI));
      return [x,.114+.060*v+.013*Math.sin(u*Math.PI),z];
    });add(new THREE.Mesh(sill,carbon));
    tube(Array.from({length:25},(_,i)=>{const u=i/24;return[lerp(-1.005,1.005,u),.132+.013*Math.sin(u*Math.PI),s*(.963-.026*Math.sin(u*Math.PI))];}),.0055,yellow);
  }

  // Hood extractor channels.
  for(const s of [-1,1])for(let i=0;i<3;i++){
    const x=-1.063-i*.072;
    lineOnTop([[x,s*.505],[x+.026,s*.60],[x+.033,s*.68]],.0095,carbon);
  }

  // Swept, teardrop-like front lamps, conforming to the fenders.
  const lampOutline=curvedOutline([[-1.835,.855],[-2.036,.943],[-2.279,.836],[-2.315,.697],[-2.264,.633],[-2.071,.738]],64);
  for(const s of [-1,1]){
    const map=([x,z])=>[endWarp(x,z/widthAt(x)),topY(x,z)+.010,s*z];
    add(shapeMesh(lampOutline,map,lampHousing,[0,1,0]));
    tube(lampOutline.map(map),.008,seam,true);
    const drl=[[-1.872,.858],[-2.060,.906],[-2.258,.806],[-2.274,.707],[-2.248,.679],[-2.173,.711]];
    tube(drl.map(([x,z])=>[endWarp(x,z/widthAt(x)),topY(x,z)+.021,s*z]),.0065,led);
    for(let i=0;i<3;i++){
      const x=-2.005-i*.072,z=.821-i*.046;
      const p=map([x,z]);p[1]+=.009;
      const bezel=box([.052,.018,.041],p,silver,.014);bezel.rotation.y=-s*.6;
      const emitter=box([.030,.020,.023],[p[0],p[1]+.005,p[2]],led,.008);emitter.rotation.y=-s*.6;
    }
  }

  // Open lower front with a real recessed grille and shaped carbon divider vanes.
  const grilleTexture=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#080c0e';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#444e55';ctx.lineWidth=1.5;
    for(let row=-1;row<17;row++)for(let col=-1;col<17;col++){
      const x=col*18+(row%2)*9,y=row*15.5;ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const px=x+9*Math.cos(a),py=y+9*Math.sin(a);i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();
    }
  });grilleTexture.wrapS=grilleTexture.wrapT=THREE.RepeatWrapping;grilleTexture.repeat.set(6,1.2);
  const grilleMat=new THREE.MeshStandardMaterial({map:grilleTexture,color:0x7f8d96,metalness:.55,roughness:.53,side:THREE.DoubleSide});
  const frontGrille=[[-.873,.177],[-.86,.333],[-.65,.369],[-.35,.352],[0,.34],[.35,.352],[.65,.369],[.86,.333],[.873,.177],[0,.142]];
  add(shapeMesh(frontGrille,([z,y])=>[-2.348+.115*Math.pow(z/.9,2),y,z],grilleMat,[-1,0,0]));
  const splitter=geometryGrid(54,8,(u,v)=>{
    const z=lerp(-.973,.973,u);const x=-2.47+.205*Math.pow(Math.abs(z)/.973,2.6)+v*.27;
    return[x,.115+.014*Math.sin(Math.PI*v)+.027*Math.pow(Math.abs(z)/.973,5),z];
  });add(new THREE.Mesh(splitter,carbon));
  tube(Array.from({length:49},(_,i)=>{const z=lerp(-.98,.98,i/48);return[-2.472+.206*Math.pow(Math.abs(z)/.98,2.6),.125+.026*Math.pow(Math.abs(z)/.98,5),z];}),.0055,yellow);
  for(const s of [-1,1]){
    const fin=box([.255,.225,.028],[-2.291,.256,s*.477],carbon,.009);fin.rotation.x=s*.25;fin.rotation.z=.24;
    // Return panels close the outer intake tunnel behind the splitter corners.
    add(shapeMesh([[.79,.145],[.968,.144],[.952,.323],[.851,.358]],([z,y])=>[-2.355+.14*Math.pow(z/.97,2),y,s*z],carbon,[-1,0,0]));
    tube([[-2.30,.162,s*.872],[-2.285,.174,s*.596],[-2.27,.30,s*.539],[-2.22,.354,s*.556]],.015,carbon);
    xyExtrude([[-2.30,.143],[-2.18,.177],[-2.08,.234],[-2.13,.144]],.018,s*.965,carbon);
  }
  box([.025,.094,.34],[-2.452,.277,0],black,.004);
  textPlane('Z  /  RACING',.295,.074,[-2.468,.278,0],[0,-Math.PI/2,0],{color:'#cbd4d7'});

  // Black hardtop, curved windshield and continuous side glazing.
  const windshield=(u,v)=>{
    const t=2*v-1;return[lerp(-1.075,-.25,u)+.014*(1-t*t)*Math.sin(Math.PI*u),lerp(.800,1.285,u)+.050*(1-t*t)*u+.012*Math.sin(Math.PI*u),t*lerp(.739,.590,u)];
  };
  add(new THREE.Mesh(geometryGrid(30,40,windshield),glass));
  for(const u of [0,1])tube(Array.from({length:25},(_,i)=>windshield(u,i/24)),u===0?.019:.021,carbon);
  for(const v of [0,1])tube(Array.from({length:20},(_,i)=>windshield(i/19,v)),.025,carbon);
  const roof=(u,v)=>{const t=2*v-1;return[lerp(-.25,.615,u),1.285+.015*Math.sin(Math.PI*u)+.05*(1-t*t),t*(.59+.013*Math.sin(Math.PI*u))];};
  add(new THREE.Mesh(geometryGrid(28,32,roof),carbon));
  const rearGlass=(u,v)=>{const t=2*v-1;return[lerp(.615,1.63,u),lerp(1.285,.866,u)+.028*Math.sin(Math.PI*u)+.05*(1-t*t)*(1-u),t*lerp(.59,.721,u)];};
  add(new THREE.Mesh(geometryGrid(28,32,rearGlass),glass));
  for(const v of [0,1])tube(Array.from({length:24},(_,i)=>rearGlass(i/23,v)),.036,carbon);
  for(let j=0;j<4;j++){
    const u=.68+j*.080;
    tube(Array.from({length:22},(_,i)=>{const p=rearGlass(u,i/21);p[1]+=.014;return p;}),.017,carbon);
  }
  function sideWindowZ(x,y){
    const w=sample([[-1.075,.739],[-.25,.790],[.50,.794],[1.0,.769],[1.63,.721]],x,1);
    return w-.39*Math.max(0,y-(.800+.06*smooth(.4,1.63,x)));
  }
  const windowOutline=curvedOutline([[-1.017,.822],[-.665,1.059],[-.215,1.273],[.235,1.286],[.605,1.263],[1.14,1.014],[1.49,.885],[.963,.842],[.44,.810],[-.33,.795]],80);
  for(const s of [-1,1]){
    const map=([x,y])=>[x,y,s*sideWindowZ(x,y)];
    add(shapeMesh(windowOutline,map,glass,[0,0,s]));tube(windowOutline.map(map),.016,carbon,true);
    tube([[.406,.812,s*sideWindowZ(.406,.812)],[.402,1.277,s*sideWindowZ(.402,1.277)]],.017,black);
    tube([[-.995,.812,s*.753],[-.4,.798,s*.805],[.4,.812,s*.806],[1.03,.853,s*.78],[1.47,.882,s*.73]],.014,paint);
    // Carbon stalks and aerodynamically tapered mirrors.
    tube([[-.864,.781,s*.805],[-.837,.828,s*.962],[-.844,.87,s*1.038]],.021,carbon);
    const mirror=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),carbon);mirror.scale.set(.145,.066,.091);mirror.position.set(-.854,.903,s*1.065);add(mirror);
    const reflecting=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial({color:0x94a8b1,metalness:1,roughness:.08}));
    reflecting.scale.set(.012,.043,.067);reflecting.position.set(-.729,.905,s*1.069);add(reflecting);
  }
  // Visible cockpit volumes below the glass.
  box([1.34,.075,1.36],[.18,.49,0],black,.04);
  box([.28,.19,1.32],[-.71,.747,0],black,.055);
  for(const s of [-1,1]){
    const back=box([.17,.44,.305],[.23,.867,s*.347],carbon,.065);back.rotation.z=-.17;
    const cushion=box([.33,.085,.285],[.034,.614,s*.347],black,.038);
    box([.105,.129,.176],[.268,1.119,s*.347],black,.035);
    box([.09,.28,.061],[.115,.873,s*.347-.117],paint,.028);
    box([.09,.28,.061],[.115,.873,s*.347+.117],paint,.028);
  }
  const steering=new THREE.Mesh(new THREE.TorusGeometry(.114,.015,8,40),black);steering.rotation.y=Math.PI/2;steering.rotation.z=-.35;steering.position.set(-.515,.862,.35);add(steering);
  tube([[.70,.64,-.56],[1.11,1.02,.54]],.016,darkMetal);tube([[.70,.64,.56],[1.11,1.02,-.54]],.016,darkMetal);

  // Wheel arches have a real clear air gap, a return lip and an inner black liner.
  for(const axle of AXLES)for(const s of [-1,1]){
    const lip=[],outer=[];
    for(let i=0;i<=64;i++){
      const a=Math.PI*i/64,x=axle+ARCH*Math.cos(a),y=CY+ARCH*Math.sin(a);
      lip.push([x,y,s*(widthAt(x)*.974+.003)]);outer.push([x,y+.011,s*(widthAt(x)*.978+.003)]);
    }
    tube(lip,.008,black);tube(outer,.007,paint);
    const liner=geometryGrid(64,4,(u,v)=>{const a=u*Math.PI;return[axle+.394*Math.cos(a),CY+.394*Math.sin(a),s*lerp(.671,widthAt(axle)*.971,v)];});add(new THREE.Mesh(liner,black));
  }

  const rotorTexture=canvasTexture(512,512,(ctx,w,h)=>{
    ctx.fillStyle='#969b9b';ctx.fillRect(0,0,w,h);
    for(let r=30;r<255;r+=2){ctx.strokeStyle=`rgba(40,46,49,${r%3===0?.30:.12})`;ctx.lineWidth=.7;ctx.beginPath();ctx.arc(w/2,h/2,r,0,Math.PI*2);ctx.stroke();}
    for(let row=0;row<3;row++)for(let i=0;i<30;i++){
      const a=(i+(row%2)*.45)/30*Math.PI*2,r=175+row*28,x=w/2+Math.cos(a)*r,y=h/2+Math.sin(a)*r;
      ctx.fillStyle='#282f32';ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c0c4c3';ctx.lineWidth=.75;ctx.stroke();
    }
  });
  const rotorMat=new THREE.MeshStandardMaterial({map:rotorTexture,color:0x535b61,metalness:.77,roughness:.59,side:THREE.DoubleSide});
  const sidewallTexture=canvasTexture(1024,1024,(ctx,w,h)=>{
    ctx.translate(w/2,h/2);ctx.fillStyle='#5a6063';ctx.font='600 26px Arial';ctx.textAlign='center';
    const arcText=(text,angle,radius)=>{const da=.064;for(let i=0;i<text.length;i++){ctx.save();ctx.rotate(angle+(i-(text.length-1)/2)*da);ctx.fillText(text[i],0,-radius);ctx.restore();}};
    arcText('P ZERO',0,435);arcText('325/30 ZR21',Math.PI,435);
    ctx.strokeStyle='#454b4f';ctx.lineWidth=1.5;for(const r of [403,461]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
  });
  const sidewallMat=new THREE.MeshStandardMaterial({map:sidewallTexture,transparent:true,depthWrite:false,roughness:.9,polygonOffset:true,polygonOffsetFactor:-1});
  const wheelGeometries=[];
  const tireProfile=[[.266,-.127],[.282,-.147],[.315,-.154],[.341,-.13],[.354,-.089],[.356,0],[.354,.089],[.341,.13],[.315,.154],[.282,.147],[.266,.127],[.266,-.127]];
  const tireGeo=new THREE.LatheGeometry(tireProfile.map(([r,z])=>new THREE.Vector2(r,z)),80);tireGeo.rotateX(Math.PI/2);
  const barrelGeo=new THREE.CylinderGeometry(.266,.266,.243,64,1,true);barrelGeo.rotateX(Math.PI/2);
  // Shared beveled split-spoke alloy geometry, merged into a single draw call per wheel.
  function blade(angle,branch=0){
    const pts=branch===0?[[.045,-.012],[.155,-.011],[.25,.025],[.251,.038],[.14,.014],[.048,.012]]:[[.128,.002],[.143,.009],[.242,-.058],[.249,-.043],[.167,.022]];
    const shape=new THREE.Shape(pts.map(([r,t])=>new THREE.Vector2(r*Math.cos(angle)-t*Math.sin(angle),r*Math.sin(angle)+t*Math.cos(angle))));
    return new THREE.ExtrudeGeometry(shape,{depth:.019,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,steps:1});
  }
  for(let k=0;k<10;k++){wheelGeometries.push(blade(k*Math.PI/5));wheelGeometries.push(blade(k*Math.PI/5,1));}
  const spokeGeo=mergeGeometries(wheelGeometries);wheelGeometries.forEach(g=>g.dispose());
  const wheelGroups=[];
  for(const axle of AXLES)for(const s of [-1,1]){
    const wheel=new THREE.Group();wheel.name=`${axle<0?'Front':'Rear'} ${s<0?'right':'left'} wheel`;wheel.position.set(axle,CY,s*.832);car.add(wheel);wheelGroups.push(wheel);
    const wm=(geometry,material,position=[0,0,0])=>{const m=new THREE.Mesh(geometry,material);m.position.set(...position);return add(m,wheel);};
    wm(tireGeo,rubber);wm(barrelGeo,darkMetal);
    const rotor=wm(new THREE.CircleGeometry(.226,80),rotorMat,[0,0,s*.102]);if(s<0)rotor.rotation.y=Math.PI;
    wm(new THREE.TorusGeometry(.224,.005,6,72),darkMetal,[0,0,s*.101]);
    const rotorHub=wm(new THREE.CylinderGeometry(.088,.088,.028,32),darkMetal,[0,0,s*.098]);rotorHub.rotation.x=Math.PI/2;
    const caliper=new THREE.Mesh(new RoundedBoxGeometry(.075,.211,.060,3,.022),yellow);caliper.position.set(.169,.006,s*.114);add(caliper,wheel);
    const caliperLetters=new THREE.Mesh(new THREE.PlaneGeometry(.032,.12),new THREE.MeshBasicMaterial({map:labelTexture('DENZA',{color:'#1c2022'}),transparent:true,side:THREE.DoubleSide}));caliperLetters.position.set(.170,.007,s*.148);caliperLetters.rotation.z=Math.PI/2;if(s<0)caliperLetters.rotation.y=Math.PI;add(caliperLetters,wheel);
    wm(new THREE.TorusGeometry(.262,.0075,8,80),silver,[0,0,s*.151]);
    wm(new THREE.TorusGeometry(.245,.0035,6,72),darkMetal,[0,0,s*.158]);
    const spokes=wm(spokeGeo,silver,[0,0,s*.142]);if(s<0)spokes.rotation.y=Math.PI;
    const hub=wm(new THREE.CylinderGeometry(.066,.066,.034,40),darkMetal,[0,0,s*.157]);hub.rotation.x=Math.PI/2;
    const cap=wm(new THREE.CylinderGeometry(.035,.035,.007,40),silver,[0,0,s*.178]);cap.rotation.x=Math.PI/2;
    const capDark=wm(new THREE.CircleGeometry(.027,32),black,[0,0,s*.183]);if(s<0)capDark.rotation.y=Math.PI;
    const badge=wm(new THREE.RingGeometry(.014,.020,32,1,Math.PI*.12,Math.PI*1.7),silver,[0,0,s*.184]);if(s<0)badge.rotation.y=Math.PI;
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const bolt=wm(new THREE.CylinderGeometry(.005,.005,.007,6),silver,[.046*Math.cos(a),.046*Math.sin(a),s*.178]);bolt.rotation.x=Math.PI/2;}
    const sidewall=wm(new THREE.PlaneGeometry(.710,.710),sidewallMat,[0,0,s*.1555]);if(s<0)sidewall.rotation.y=Math.PI;
    // Circumferential channels and alternating shoulder cuts.
    for(const z of [-.077,-.026,.026,.077])wm(new THREE.TorusGeometry(.356-((Math.abs(z)>.04)?.0013:0),.0018,4,80),black,[0,0,z]);
    const tread=[];
    for(let k=0;k<72;k++)for(const side of [-1,1]){
      const a=k*Math.PI*2/72, b=a+.044;
      tread.push(.353*Math.cos(a),.353*Math.sin(a),side*.088,.339*Math.cos(b),.339*Math.sin(b),side*.133);
    }
    const treadGeo=new THREE.BufferGeometry();treadGeo.setAttribute('position',new THREE.Float32BufferAttribute(tread,3));const treadLines=new THREE.LineSegments(treadGeo,new THREE.LineBasicMaterial({color:0x080b0c}));wheel.add(treadLines);
  }

  // Rear almond lamp pairs, wraparound outer tips and central emblem.
  for(const s of [-1,1])for(const [min,max,cy,height]of [[.255,.537,.693,.034],[.548,.921,.704,.050]]){
    const pts=curvedOutline([[min,cy],[(min+max)/2,cy+height],[max,cy+.009],[(min+max)/2,cy-height]],40);
    const map=([z,y])=>[bumperX(2.435,Math.min(z,.876),y)+.009-.19*smooth(.865,.93,z),y,s*z];
    add(shapeMesh(pts,map,lampHousing,[1,0,0]));
    const centre=(min+max)/2;
    const lens=pts.map(([z,y])=>[lerp(centre,z,.91),lerp(cy,y,.83)]);
    add(shapeMesh(lens,([z,y])=>{const p=map([z,y]);p[0]+=.003;return p;},tailLens,[1,0,0]));
    const streak=[[min+.027,cy],[centre,cy+.017],[max-.029,cy+.008],[centre,cy-.011]];
    tube(streak.map(([z,y])=>[map([z,y])[0]+.009,y,s*z]),.0035,tail,false,car,32);
  }
  // Carbon rear intake, raised diffuser channel and vertical aero strakes.
  const rearGrille=[[-.886,.168],[-.883,.345],[-.772,.419],[.772,.419],[.883,.345],[.886,.168],[.70,.146],[-.70,.146]];
  add(shapeMesh(rearGrille,([z,y])=>[2.397-.047*Math.pow(Math.abs(z)/.9,3),y,z],grilleMat,[1,0,0]));
  const diffuser=geometryGrid(22,28,(u,v)=>{const z=lerp(-.86,.86,v);return[lerp(1.82,2.46,u),.111+.072*u*u+.008*Math.cos(z*4),z];});add(new THREE.Mesh(diffuser,carbon));
  for(const z of [-.81,-.58,-.31,0,.31,.58,.81])xyExtrude([[1.90,.115],[2.44,.113],[2.462,.219],[2.20,.253],[1.93,.181]],.015,z-.0075,carbon);
  for(const s of [-1,1]){
    const frame=[[2.425,.144,s*.843],[2.43,.237,s*.788],[2.445,.370,s*.684],[2.445,.390,s*.41]];
    tube(frame,.024,carbon);
    tube([[2.435,.149,s*.906],[2.46,.157,s*.812],[2.463,.168,s*.692],[2.47,.227,s*.633],[2.47,.231,s*.333]],.005,yellow);
    box([.014,.023,.187],[2.451,.344,s*.566],tailLens,.005);
  }
  box([.022,.117,.365],[2.451,.316,0],black,.005);
  textPlane('DENZA  Z',.332,.084,[2.465,.316,0],[0,Math.PI/2,0],{color:'#e1e7e9'});

  // Cut-through swan-neck supports and a true airfoil section across the entire wing.
  for(const s of [-1,1]){
    xyExtrude([[1.61,.875],[1.785,.879],[2.23,1.189],[2.257,1.254],[2.12,1.248],[1.69,.972]],.034,s*.531-.017,carbon,
      [[[1.781,.960],[1.848,.962],[2.137,1.155],[2.073,1.153]]]);
    box([.19,.020,.101],[1.717,.883,s*.531],carbon,.008);
  }
  const wing=geometryGrid(60,38,(u,v)=>{
    const z=lerp(-1.043,1.043,u),angle=v*Math.PI*2;
    const t=(1-Math.cos(angle))/2;
    const x=1.935+.412*t+.020*Math.pow(z/1.043,2);
    const y=1.232+.041*t+.022*Math.sin(angle)+.015*(1-Math.pow(z/1.043,2));
    return[x,y,z];
  });add(new THREE.Mesh(wing,carbon));
  for(const s of [-1,1]){
    const plate=curvedOutline([[1.883,1.183],[1.960,1.352],[2.363,1.401],[2.407,1.350],[2.324,1.143],[2.068,1.109]],48);
    xyExtrude(plate,.014,s*1.044-.007,carbon);
    tube(plate.map(([x,y])=>[x,y,s*1.055]),.004,yellow,true);
    textPlane('RACING',.20,.048,[2.172,1.238,s*1.061],[0,s<0?Math.PI:0,0],{color:'#aebac1'});
  }

  // Simple geometric Denza emblems; no logos or photos projected onto the car body.
  function emblem(position,rotation,scale=1){
    const g=new THREE.Group();g.position.set(...position);g.rotation.set(...rotation);g.scale.setScalar(scale);car.add(g);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.028,.037,40,1,Math.PI*.14,Math.PI*1.72),silver);g.add(ring);
    const shape=new THREE.Shape([new THREE.Vector2(-.009,-.017),new THREE.Vector2(.013,-.017),new THREE.Vector2(.015,.002),new THREE.Vector2(0,.032),new THREE.Vector2(-.015,.002)]);
    const centre=new THREE.Mesh(new THREE.ShapeGeometry(shape),silver);centre.position.z=.001;g.add(centre);return g;
  }
  const hoodBadge=emblem([-2.321,topY(-2.321,0)+.013,0],[0,0,0],.92);
  const hoodSlope=(topY(-2.311,0)-topY(-2.331,0))/.02;
  hoodBadge.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(-hoodSlope,1,0).normalize());
  emblem([bumperX(2.435,0,.688)+.013,.688,0],[0,Math.PI/2,0],1);
  batchStaticMeshes(car);
  return {car,materials,wheelGroups,bodyMesh,dimensions:DIMENSIONS,
    setLights(enabled){led.emissiveIntensity=enabled?2.7:0;led.color.set(enabled?0xe7f7ff:0x637b89);tail.emissiveIntensity=enabled?1.4:0;},
    setPaint(color){paint.color.set(color);},
  };
}
