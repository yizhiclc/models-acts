import * as THREE from 'three/webgpu';
import { color, positionWorld, sin, mix, mx_noise_float, bumpMap } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Every shape and surface in the garden is generated here, in metres.
export function createGarden(scene) {
  let seed=173;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const stone=new THREE.MeshStandardNodeMaterial({color:0xbdb49a,roughness:.88});
  const grain=mx_noise_float(positionWorld.mul(15)).mul(.065).add(mx_noise_float(positionWorld.mul(2.5)).mul(.06));
  stone.colorNode=color(0xbfb69f).mul(grain.add(1));
  stone.normalNode=bumpMap(mx_noise_float(positionWorld.mul(32)),.008);
  const lightStone=new THREE.MeshStandardNodeMaterial({color:0xd3c8ae,roughness:.85});
  lightStone.colorNode=color(0xd3c8ae).mul(grain.add(1));
  lightStone.normalNode=bumpMap(mx_noise_float(positionWorld.mul(34)),.005);
  const wetStone=new THREE.MeshStandardNodeMaterial({color:0x857f64,roughness:.52});
  const bronze=new THREE.MeshStandardMaterial({color:0x535642,metalness:.78,roughness:.4});
  const dark=new THREE.MeshStandardMaterial({color:0x262d24,roughness:.7});
  const grass=new THREE.MeshStandardNodeMaterial({color:0x627b36,roughness:1});
  grass.colorNode=mix(color(0x425b2e),color(0x789547),mx_noise_float(positionWorld.mul(3)).mul(.5).add(.5));
  const gravel=new THREE.MeshStandardNodeMaterial({roughness:1});
  gravel.colorNode=mix(color(0x8c8c71),color(0xa8a589),mx_noise_float(positionWorld.mul(85)).mul(.5).add(.5));
  const wood=new THREE.MeshStandardMaterial({color:0x78634a,roughness:.73});
  const foliage=[0x234b28,0x335b2b,0x466b31,0x567536,0x638042].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.93}));
  const terracotta=new THREE.MeshStandardMaterial({color:0x9a6245,roughness:.95});
  const root=new THREE.Group();scene.add(root);
  function mesh(g,m,x=0,y=0,z=0,parent=root){const a=new THREE.Mesh(g,m);a.position.set(x,y,z);a.castShadow=true;a.receiveShadow=true;parent.add(a);return a;}
  function box(w,h,d,m,x,y,z,parent=root){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
  function lathe(profile,mat=stone,x=0,z=0,parent=root,segments=96){return mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments),mat,x,0,z,parent);}
  function ring(r,t,y,mat=lightStone,x=0,z=0,parent=root){const a=mesh(new THREE.TorusGeometry(r,t,8,96),mat,x,y,z,parent);a.rotation.x=-Math.PI/2;return a;}
  function sphere(x,y,z,sx,sy,sz,mat,parent=root,detail=1){const a=mesh(new THREE.IcosahedronGeometry(1,detail),mat,x,y,z,parent);a.scale.set(sx,sy,sz);return a;}
  function curve(points,r,mat,parent=root){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),22,r,7,false),mat,0,0,0,parent);}
  function batch(geometry,mat,items){const inst=new THREE.InstancedMesh(geometry,mat,items.length);const d=new THREE.Object3D();items.forEach((p,i)=>{d.position.set(...p.p);d.scale.set(...(p.s||[1,1,1]));d.rotation.set(...(p.r||[0,0,0]));d.updateMatrix();inst.setMatrixAt(i,d.matrix);if(p.c)inst.setColorAt(i,new THREE.Color(p.c));});inst.castShadow=true;inst.receiveShadow=true;root.add(inst);return inst;}

  // The courtyard's cross-axis, circular walk, and four clipped parterres.
  const landscape=mesh(new THREE.PlaneGeometry(600,600),grass,0,-.08,0);landscape.rotation.x=-Math.PI/2;
  box(21.5,.075,21.5,gravel,0,-.03,0);
  const slabs=[];
  for(let ix=-15;ix<=15;ix++)for(let iz=-15;iz<=15;iz++){
    const x=ix*.68,z=iz*.68,r=Math.hypot(x,z);
    if(r>3.63&&(r<4.85||Math.abs(x)<1.4||Math.abs(z)<1.4||Math.max(Math.abs(x),Math.abs(z))>9.35))slabs.push({p:[x,.014+(rand()-.5)*.007,z],s:[.657,.07,.657],c:new THREE.Color().setHSL(.11,.13,.50+rand()*.10)});
  }
  batch(new THREE.BoxGeometry(1,1,1),lightStone,slabs);
  ring(4.9,.045,.018,stone);ring(3.73,.05,.015,stone);
  const hedgePieces=[],leafTufts=[],flowerHeads=[],flowerCenters=[],stems=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*6.5,z=sz*6.5;
    box(5.1,.07,5.1,grass,x,.03,z);
    for(const t of [-1,1]){
      hedgePieces.push({p:[x+t*2.35,.37,z],s:[.47,.65,5.15]});
      hedgePieces.push({p:[x,.37,z+t*2.35],s:[4.7,.65,.47]});
    }
    for(let i=0;i<145;i++){
      const side=i%4,t=(rand()-.5)*4.9,edge=2.38;
      const dx=side<2?(side===0?-edge:edge):t,dz=side<2?t:(side===2?-edge:edge);
      leafTufts.push({p:[x+dx+(rand()-.5)*.28,.66+rand()*.1,z+dz+(rand()-.5)*.28],s:[.20,.16,.18],r:[rand(),rand(),rand()],c:foliage[i%3].color});
    }
    // Two inset lines of lavender, cream roses and small terracotta-coloured flowers.
    for(let i=0;i<108;i++){
      const a=rand()*Math.PI*2,r=1.1+rand()*.64;
      const fx=x+Math.cos(a)*r,fz=z+Math.sin(a)*r,fy=.19+rand()*.28;
      stems.push({p:[fx,fy*.5,fz],s:[.016,fy,.016]});
      const c=i%3===0?0xaea4cf:i%3===1?0xe0ddba:0xb590a7;
      flowerHeads.push({p:[fx,fy,fz],s:[.07,.06+rand()*.08,.07],r:[rand(),rand(),rand()],c});
      flowerCenters.push({p:[fx,fy+.05,fz],s:[.023,.018,.023]});
    }
    sphere(x,.55,z,.66,.58,.66,foliage[1],root,2);
  }
  batch(new THREE.BoxGeometry(1,1,1),foliage[1],hedgePieces);
  batch(new THREE.IcosahedronGeometry(1,1),foliage[2],leafTufts);
  batch(new THREE.CylinderGeometry(1,1,1,4),foliage[0],stems);
  batch(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85}),flowerHeads);
  batch(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xc8ae61,roughness:.9}),flowerCenters);

  // Trees: trunks with branching structure and clustered, irregular crowns.
  const bark=new THREE.MeshStandardNodeMaterial({color:0x666047,roughness:.94});
  bark.colorNode=color(0x686048).mul(sin(positionWorld.x.mul(50).add(positionWorld.z.mul(43))).mul(.12).add(.88));
  function tree(x,z,scale=1){
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);root.add(g);
    const trunk=mesh(new THREE.CylinderGeometry(.12,.22,3.4,9),bark,0,1.7,0,g);
    trunk.rotation.z=.04;
    for(let i=0;i<7;i++){
      const a=i*2.399,dx=Math.cos(a),dz=Math.sin(a),y=2.3+i*.2;
      curve([[0,y-.7,0],[dx*.3,y,dz*.3],[dx*.9,y+.8,dz*.9]],.065,bark,g);
      for(let j=0;j<12;j++)sphere(dx*(.8+rand()*.65)+(rand()-.5)*.9,y+.8+rand()*.8,dz*(.8+rand()*.65)+(rand()-.5)*.9,.33+rand()*.35,.38+rand()*.37,.33+rand()*.35,foliage[(i+j)%5],g,2);
    }
  }
  tree(-8.3,-7.5,1.35);tree(8.3,-7.5,1.3);tree(-9.6,.5,1.15);tree(9.6,.5,1.15);
  for(const x of [-8,-5,5,8])for(const z of [-11.5,11.5]){
    mesh(new THREE.CylinderGeometry(.1,.17,2.7,8),bark,x,1.3,z);
    for(let k=0;k<6;k++)sphere(x,2.1+k*.43,z,.68-k*.075,.88,.68-k*.075,foliage[k%3],root,1);
  }
  // Low walls, classical balustrades, gate and finials.
  const balusterProfile=[[.065,.45],[.10,.48],[.10,.53],[.06,.57],[.105,.67],[.11,.76],[.07,.88],[.045,.97],[.07,1.03]];
  const balusterGeo=new THREE.LatheGeometry(balusterProfile.map(p=>new THREE.Vector2(...p)),12);
  const rails=[];
  for(const side of [-1,1])for(const axis of [0,1]){
    for(const offset of [-5.95,5.95]){
      const x=axis===0?offset:side*10.6,z=axis===0?side*10.6:offset;
      box(axis===0?9.4:.45,.42,axis===0?.45:9.4,stone,x,.21,z);
      box(axis===0?9.4:.56,.13,axis===0?.56:9.4,lightStone,x,1.08,z);
    }
    for(let i=-20;i<=20;i++)if(Math.abs(i)>2){
      rails.push({p:[axis===0?i*.51:side*10.6,0,axis===0?side*10.6:i*.51]});
    }
    for(const o of [-10.5,-1.4,1.4,10.5]){
      const x=axis===0?o:side*10.6,z=axis===0?side*10.6:o;
      box(.62,1.25,.62,stone,x,.625,z);box(.74,.12,.74,lightStone,x,1.28,z);sphere(x,1.52,z,.19,.23,.19,lightStone);
    }
  }
  batch(balusterGeo,lightStone,rails);
  // An open iron garden gate at the far end anchors the axial composition.
  for(const x of [-1.5,1.5]){box(.56,2.8,.64,stone,x,1.4,-10.55);box(.74,.14,.8,lightStone,x,2.81,-10.55);sphere(x,3.05,-10.55,.21,.28,.21,lightStone);}
  const arch=[];for(let i=0;i<=24;i++){const a=i/24*Math.PI;arch.push([Math.cos(a)*1.5,2.76+Math.sin(a)*1.05,-10.55]);}curve(arch,.028,bronze);
  for(let i=0;i<9;i++)box(.018,1.95,.018,bronze,-1.2+i*.30,1.02,-10.55);
  box(2.7,.028,.025,bronze,0,.45,-10.55);box(2.7,.028,.025,bronze,0,1.7,-10.55);

  function bench(x,z,rot){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;root.add(g);
    for(let k=0;k<5;k++)box(1.9,.052,.088,wood,0,.48,-.20+k*.10,g);
    for(let k=0;k<4;k++)box(1.9,.088,.043,wood,0,.69+k*.12,.28,g);
    for(const s of [-1,1]){box(.08,.46,.08,bronze,s*.75,.23,-.18,g);box(.08,.99,.08,bronze,s*.75,.49,.23,g);curve([[s*.89,.49,-.22],[s*.89,.7,-.17],[s*.89,.73,.2]],.027,bronze,g);}
  }
  bench(-5.7,0,Math.PI/2);bench(5.7,0,-Math.PI/2);bench(0,-6.1,Math.PI);
  for(const x of [-2.35,2.35])for(const z of [-9.3,9.3]){
    lathe([[.24,.05],[.28,.11],[.23,.2],[.32,.27],[.4,.56],[.41,.68],[.46,.71],[.46,.78],[.35,.78],[.34,.68]],terracotta,x,z);
    for(let j=0;j<13;j++){const a=rand()*Math.PI*2,r=rand()*.32;sphere(x+Math.cos(a)*r,.79+rand()*.22,z+Math.sin(a)*r,.16,.14,.16,foliage[j%4]);sphere(x+Math.cos(a)*r,.98+rand()*.1,z+Math.sin(a)*r,.075,.065,.075,new THREE.MeshStandardMaterial({color:j%2?0xd9c9b9:0xb78996,roughness:.8}));}
  }

  const fountain=new THREE.Group();fountain.name='Carved limestone fountain';root.add(fountain);
  // Closed lathed profile of the pool wall. The interior is hollow and has a real floor.
  lathe([[3.14,.08],[3.55,.08],[3.62,.14],[3.62,.23],[3.53,.27],[3.48,.39],[3.50,.59],[3.61,.61],[3.64,.67],[3.62,.74],[3.49,.79],[3.25,.79],[3.17,.71],[3.17,.26],[3.14,.21],[3.14,.08]],stone,0,0,fountain,128);
  ring(3.55,.055,.25,lightStone,0,0,fountain);ring(3.57,.055,.67,lightStone,0,0,fountain);
  const bottom=new THREE.MeshStandardNodeMaterial({color:0x5b827c,roughness:.53});
  const tile=sin(positionWorld.x.mul(28)).abs().mul(sin(positionWorld.z.mul(28)).abs());
  bottom.colorNode=mix(color(0x768a7c),color(0x426c64),tile.smoothstep(.04,.16));
  mesh(new THREE.CylinderGeometry(3.15,3.15,.08,128),bottom,0,.22,0,fountain);
  // Radial masonry joints, shallow panels and fleurons around the pool.
  for(let i=0;i<40;i++){
    const a=i/40*Math.PI*2;
    const joint=box(.006,.16,.38,wetStone,Math.sin(a)*3.43,.716,Math.cos(a)*3.43,fountain);joint.rotation.y=a;
    if(i%5===0){const g=new THREE.Group();g.position.set(Math.sin(a)*3.507,.47,Math.cos(a)*3.507);g.rotation.y=a;fountain.add(g);sphere(0,0,0,.09,.10,.022,lightStone,g,2);for(let k=0;k<6;k++){const t=k/6*Math.PI*2;sphere(Math.cos(t)*.105,Math.sin(t)*.085,.005,.055,.04,.018,lightStone,g,1);}}
  }
  lathe([[.62,.27],[.68,.32],[.68,.40],[.57,.46],[.55,.52],[.47,.56],[.45,.67],[.39,.79],[.33,1.05],[.30,1.28],[.36,1.40],[.50,1.49],[.55,1.57],[.52,1.65],[.28,1.70]],stone,0,0,fountain);
  // Lower basin: continuous moulded profile with a raised rolled lip.
  lathe([[.27,1.43],[.45,1.42],[.7,1.46],[1.04,1.54],[1.34,1.68],[1.54,1.81],[1.63,1.82],[1.69,1.88],[1.68,1.95],[1.60,1.99],[1.53,1.94],[1.50,1.87],[1.28,1.71],[.98,1.60],[.6,1.55],[.28,1.58],[.27,1.43]],stone,0,0,fountain);
  ring(1.64,.045,1.92,lightStone,0,0,fountain);ring(.54,.045,1.51,lightStone,0,0,fountain);
  lathe([[.29,1.55],[.34,1.65],[.34,1.82],[.28,1.91],[.23,2.03],[.19,2.29],[.23,2.48],[.30,2.63],[.34,2.73],[.32,2.82],[.41,2.91],[.43,2.98],[.29,3.05]],stone,0,0,fountain);
  lathe([[.16,2.96],[.36,2.91],[.53,2.95],[.68,3.03],[.82,3.15],[.88,3.16],[.92,3.21],[.90,3.28],[.82,3.3],[.79,3.23],[.70,3.12],[.5,3.04],[.17,3.03],[.16,2.96]],stone,0,0,fountain);
  ring(.872,.035,3.24,lightStone,0,0,fountain);
  lathe([[.17,3.05],[.21,3.14],[.19,3.25],[.13,3.33],[.12,3.40],[.07,3.46]],lightStone,0,0,fountain);
  mesh(new THREE.CylinderGeometry(.065,.075,.065,24),bronze,0,3.44,0,fountain);
  for(const [n,r,y,sz] of [[40,1.24,1.69,.19],[28,.67,3.09,.12]])for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;
    const leaf=sphere(Math.sin(a)*r,y,Math.cos(a)*r,.045,sz,.06,lightStone,fountain,2);leaf.rotation.set(Math.sin(a)*.45,a,Math.cos(a)*.45);
  }
  // Stone volutes at the pedestal and eight carved lion-mask spouts.
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2,g=new THREE.Group();g.rotation.y=a;fountain.add(g);
    const points=[];for(let j=0;j<=24;j++){const t=j/24*Math.PI*2.1,r=.10*(1-j/30);points.push([Math.cos(t)*r,1.15+Math.sin(t)*r,.32+j*.001]);}curve(points,.033,lightStone,g);
    const lion=new THREE.Group();lion.position.set(0,2.67,.29);g.add(lion);
    sphere(0,0,.02,.18,.225,.12,stone,lion,2);
    for(let k=0;k<10;k++){const t=k/10*Math.PI*2;const mane=sphere(Math.cos(t)*.15,Math.sin(t)*.19,.045,.06,.08,.055,lightStone,lion,1);mane.rotation.z=t;}
    sphere(0,.015,.11,.12,.13,.08,lightStone,lion,2);sphere(0,-.055,.177,.095,.065,.06,lightStone,lion,2);
    sphere(-.052,.06,.179,.025,.019,.015,dark,lion,1);sphere(.052,.06,.179,.025,.019,.015,dark,lion,1);
    sphere(0,-.005,.19,.046,.027,.026,stone,lion,1);
    const mouth=mesh(new THREE.TorusGeometry(.033,.016,7,20),bronze,0,-.064,.22,lion);mouth.scale.y=.75;
    sphere(0,-.064,.22,.025,.023,.018,dark,lion,1);
  }
  // Underwater fittings and real lights; only switched on as daylight fades.
  const underwater=[];
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2,x=Math.sin(a)*2.25,z=Math.cos(a)*2.25;
    const fitting=mesh(new THREE.CylinderGeometry(.11,.13,.04,18),bronze,x,.285,z,fountain);
    const lampmat=new THREE.MeshStandardMaterial({color:0xf5df97,emissive:0xffd791,emissiveIntensity:0});
    mesh(new THREE.CircleGeometry(.085,20),lampmat,x,.308,z,fountain).rotation.x=-Math.PI/2;
    const light=new THREE.PointLight(0xa6e9de,0,7,1.4);light.position.set(x,.47,z);scene.add(light);underwater.push({light,mat:lampmat});
  }
  const uplight=new THREE.PointLight(0xa4e6df,0,8,1.7);uplight.position.set(.2,2.12,.7);scene.add(uplight);underwater.push({light:uplight});
  const upperLight=new THREE.PointLight(0xffdfb0,0,7,1.5);upperLight.position.set(0,3.45,0);scene.add(upperLight);underwater.push({light:upperLight});
  // Batch the static architecture by material to keep shadows / reflections cheap.
  root.updateMatrixWorld(true);
  const batches=new Map(),originals=[];
  root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh){if(!batches.has(o.material))batches.set(o.material,[]);const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();batches.get(o.material).push(geometry.applyMatrix4(o.matrixWorld));originals.push(o);}});
  for(const [mat,geometries] of batches){const merged=mergeGeometries(geometries,false);if(merged)mesh(merged,mat);for(const g of geometries)g.dispose();}
  for(const o of originals){o.removeFromParent();o.geometry.dispose();}
  return {root,fountain,underwater};
}
