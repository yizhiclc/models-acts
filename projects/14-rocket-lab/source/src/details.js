import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './surfaces.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

export function enrichFacility(w){
 const s=w.scene,m=w.materials;
 m.hazard=new THREE.MeshStandardMaterial({map:w.maps.hazard,roughness:.87});
 m.grate=new THREE.MeshStandardMaterial({map:w.maps.grating,alphaTest:.4,metalness:.68,roughness:.48,side:THREE.DoubleSide});
 m.copper=new THREE.MeshStandardMaterial({color:'#a77846',metalness:.83,roughness:.3});
 m.glass=new THREE.MeshPhysicalMaterial({color:'#5d7c8b',metalness:.2,roughness:.12,clearcoat:1,transparent:true,opacity:.85});
 m.rubber=new THREE.MeshStandardMaterial({color:'#1d2224',roughness:.95,map:w.maps.asphalt});
 m.lamp=new THREE.MeshStandardMaterial({color:'#fff1c7',emissive:'#ffd396',emissiveIntensity:2,roughness:.4});
 const panel=(parent,text,width,height,x,y,z,color='#d8ded8',bg='#2d3c40')=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(width,height),w.label(text,768,128,color,bg));p.position.set(x,y,z);parent.add(p);return p;};
 const boltGeo=new THREE.CylinderGeometry(.052,.052,.05,6);
 const bolts=[],bolt=(parent,x,y,z,axis='z')=>{const o=new THREE.Mesh(boltGeo,m.metal);o.position.set(x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;parent.add(o);return o;};
 // Tower I-beam flanges, riveted gusset plates, grated walkways and cable risers.
 for(let y=4;y<=53;y+=7){
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(8.6,8.6),m.grate);floor.rotation.x=-Math.PI/2;floor.position.set(0,y+.26,0);w.tower.add(floor);
   for(const x of [-4,4])for(const z of [-4.46,4.46]){w.box(w.tower,1.28,1.55,.12,x,y+.45,z,'dark');for(const dx of [-.42,.42])for(const dy of [-.50,.5])bolt(w.tower,x+dx,y+.45+dy,z+.07);}
   for(const x of [-4.5,4.5]){
     w.rod(w.tower,v(x,y+1.35,-4.5),v(x,y+1.35,4.5),.055,'orange');w.rod(w.tower,v(x,y+.7,-4.5),v(x,y+.7,4.5),.04,'steel');
     for(let z=-4.5;z<=4.5;z+=1.5)w.rod(w.tower,v(x,y,z),v(x,y+1.35,z),.05,'orange');
   }
   for(const z of [-4.5,4.5])for(let x=-4.5;x<=4.5;x+=1.5)w.rod(w.tower,v(x,y,z),v(x,y+1.35,z),.05,'orange');
   panel(w.tower,`LEVEL ${String(Math.round(y/7)+1).padStart(2,'0')}  /  ACCESS`,3.4,.46,-.2,y+.65,4.55,'#dfe4d6','#354349');
 }
 for(const x of [-4,4])for(const z of [-4,4])for(const dx of [-.48,.48])w.box(w.tower,.18,54,1.15,x+dx,28,z,'steel');
 for(const x of [-2.4,-1.2])w.rod(w.tower,v(x,2,4.95),v(x,56,4.95),.06,'metal');
 for(let y=2;y<56;y+=.42)w.rod(w.tower,v(-2.4,y,4.95),v(-1.2,y,4.95),.045,'metal');
 for(let y=4;y<55;y+=2){const cage=new THREE.Mesh(new THREE.TorusGeometry(.8,.035,5,20,Math.PI*1.25),m.orange);cage.rotation.x=Math.PI/2;cage.rotation.z=-Math.PI*.12;cage.position.set(-1.8,y,5.0);w.tower.add(cage);}
 for(let k=0;k<6;k++){const x=-3.5+k*.24;w.rod(w.tower,v(x,1,-4.6),v(x,52,-4.6),.06,k%2?'metal':'dark');}
 for(let y=2;y<53;y+=2)w.box(w.tower,2.2,.16,.25,-2.9,y,-4.68,'metal');
 for(const arm of w.arms){
   for(let x=1;x<10;x+=.7){const gr=new THREE.Mesh(new THREE.PlaneGeometry(.64,1.8),m.grate);gr.rotation.x=-Math.PI/2;gr.position.set(x,.38,0);arm.add(gr);}
   for(let z=-.5;z<=.5;z+=.33)w.rod(arm,v(.1,-.65,z),v(10.3,-.65,z),.09,z===-.5?'orange':'metal');
   w.box(arm,.8,1.6,1.7,10.5,.35,0,'hazard');w.cylinder(arm,.28,.28,1.7,.4,0,0,'metal',16);
 }
 // Fire-resistant trench lining, joints, water spray heads and flanged manifolds.
 for(const sign of [-1,1])for(let z=6;z<25;z+=1.25){for(const x of [-3.08,3.08]){w.box(s,.12,1.3,1.13,x,1,sign*z,'nozzle');for(const dy of [-.35,.35])bolt(s,x,1+dy,sign*(z-.35));}w.box(s,5.7,.13,.045,0,.58,sign*z,'metal');}
 for(const x of [-8,8])for(let z=-20;z<=20;z+=5){
   const flange=w.cylinder(s,.36,.36,.10,x,.82,z,'metal',20);flange.rotation.x=Math.PI/2;
   for(let a=0;a<Math.PI*2;a+=Math.PI/4)bolt(s,x+Math.cos(a)*.27,.82+Math.sin(a)*.27,z+.08);
   const nozzle=w.cylinder(s,.08,.17,.42,x*.8,1.48,z,'copper',16);nozzle.rotation.z=x>0?.85:-.85;
 }
 const wet=new THREE.MeshPhysicalMaterial({color:'#455052',metalness:.13,roughness:.12,clearcoat:1,clearcoatRoughness:.1,transparent:true,opacity:.44});
 for(const z of [-18,18]){const p=new THREE.Mesh(new THREE.CircleGeometry(1,56),wet);p.rotation.x=-Math.PI/2;p.scale.set(7,13,1);p.position.set(0,.59,z);s.add(p);}
 const scorch=new THREE.Mesh(new THREE.PlaneGeometry(32,47),new THREE.MeshBasicMaterial({map:w.maps.scorch,transparent:true,depthWrite:false}));scorch.rotation.x=-Math.PI/2;scorch.position.set(0,.62,0);s.add(scorch);
 for(let a=0;a<Math.PI*2;a+=Math.PI/12){const x=Math.cos(a)*31,z=Math.sin(a)*31;const stripe=w.box(s,2.4,.06,1.0,x,.42,z,'hazard');stripe.rotation.y=-a;}
 for(let z=-75;z<70;z+=15){const drain=new THREE.Mesh(new THREE.PlaneGeometry(1,8),m.grate);drain.rotation.x=-Math.PI/2;drain.position.set(39,-.13,z);s.add(drain);w.box(s,.08,.03,8,38.4,-.1,z,'metal');w.box(s,.08,.03,8,39.6,-.1,z,'metal');}
 // Cryogenic storage hardware, insulation bands, vertical ladders, gauges, warning labels.
 for(let i=0;i<3;i++){
   const x=-67+i*15;
   panel(s,i===1?'LOX / 02':'LN₂ / 0'+(i+1),6,1.2,x,10,-41.45,'#344850','#d9ddd6');
   panel(s,'CRYOGENIC  ·  KEEP CLEAR',6,.5,x,8.4,-41.4,'#a45827','#d9ddd6');
   for(let y=2;y<15;y+=2.2)w.ring(s,5.51,.035,x,y,-47,'metal');
   for(const dx of [-.5,.5])w.rod(s,v(x+dx,1,-41.1),v(x+dx,17,-41.1),.06,'metal');
   for(let y=1;y<17;y+=.4)w.rod(s,v(x-.5,y,-41.1),v(x+.5,y,-41.1),.042,'metal');
   w.cylinder(s,.85,.85,1.2,x,18,-47,'metal',24);w.rod(s,v(x,18.2,-47),v(x,21,-47),.11,'metal');
   for(let z=-38;z<-20;z+=4){const f=w.cylinder(s,.50,.50,.12,x,2,z,'metal',20);f.rotation.x=Math.PI/2;for(let a=0;a<Math.PI*2;a+=Math.PI/3)bolt(s,x+Math.cos(a)*.37,2+Math.sin(a)*.37,z+.08);}
   const wheel=w.ring(s,.48,.055,x,2.65,-29,'orange');wheel.rotation.x=0;w.rod(s,v(x,2,-29),v(x,2.65,-29),.12,'metal');
   w.box(s,1.3,1.6,.8,x+2.4,1.0,-31,'shell');panel(s,'P  12.6 MPa',1,.25,x+2.4,1.4,-30.58,'#c5e9c9','#122e2a');
 }
 for(let k=0;k<4;k++){const y=.9+k*.33;w.rod(s,v(-58,y,-19),v(-14,y,-19),.12,k%2?'metal':'orange');w.rod(s,v(-14,y,-19),v(-14,y,-7),.12,k%2?'metal':'orange');}
 for(let x=-57;x<-15;x+=5)w.box(s,.25,2,2.2,x,.5,-19,'dark');
 // Ground electrical cabinets, battery skid and cable reels.
 for(let i=0;i<5;i++){const x=18+i*3.4;w.box(s,2.4,2.7,1.2,x,1.2,-32,'shell');w.box(s,2.15,2.35,.05,x,1.22,-31.38,'metal');panel(s,'PDU — '+(i+1),1.7,.28,x,1.94,-31.33);for(let y=.5;y<1.5;y+=.13)w.box(s,1.6,.04,.09,x,y,-31.30,'dark');w.box(s,.07,.42,.08,x+.73,1.3,-31.27,'black');}
 for(let k=0;k<2;k++){const reel=w.cylinder(s,1.1,1.1,.85,24+k*3.2,.9,-26,'dark',24);reel.rotation.x=Math.PI/2;for(const z of [-26.5,-25.5]){const disc=w.cylinder(s,1.3,1.3,.10,24+k*3.2,.9,z,'orange',24);disc.rotation.x=Math.PI/2;}}
 // Control block HVAC, equipment pads, precision windows, roof rail and antennas.
 for(let x=-70;x<-49;x+=5){w.box(s,3.7,.08,.20,x,2.35,50.2,'metal');w.box(s,.08,1.55,.20,x,3.2,50.2,'metal');w.box(s,3.4,1.35,.08,x,3.2,50.24,'glass');}
 for(let i=0;i<3;i++){w.box(s,3,1.1,3,-69+i*7,5.8,42,'metal');for(let z=40.7;z<43.4;z+=.3)w.box(s,2.8,.06,.09,-69+i*7,6.39,z,'dark');}
 w.rod(s,v(-49,5.5,43),v(-49,14,43),.08,'metal');for(let y=10;y<14;y+=.8)w.rod(s,v(-50,y,43),v(-48,y,43),.05,'metal');
 panel(s,'ASTRA   /   GROUND SYSTEMS',19,1.1,-60,5,50.59,'#e2e3cd','#253740');
 // Perimeter mesh uses real strands; distant repeated objects are instanced.
 for(let z=-94;z<82;z+=3)for(let y=.5;y<3;y+=.5)w.rod(s,v(-110,y,z),v(-110,y+.5,z+3),.016,'metal');
 for(let i=0;i<12;i++){const x=-2+i*5;const b=w.box(s,3.7,.9,.65,x,.25,62,'concrete');w.box(s,3.5,.25,.03,x,.57,62.35,'hazard');}
 buildTruck(w,54,52,-.15);buildTruck(w,-47,60,Math.PI/2);
 for(let i=0;i<18;i++){const x=42+(i%6)*3,z=-2+Math.floor(i/6)*4;w.cylinder(s,.05,.28,.68,x,.19,z,'orange',10);w.ring(s,.18,.045,x,.35,z,'shell');w.box(s,.55,.08,.55,x,-.12,z,'rubber');}
 // Gravel, low desert brush and rocks provide texture at human scale.
 const random=rng(718),rockGeometry=new THREE.DodecahedronGeometry(1,0),rocks=new THREE.InstancedMesh(rockGeometry,new THREE.MeshStandardMaterial({color:'#8b846e',roughness:1}),1400),dummy=new THREE.Object3D();
 for(let i=0;i<1400;i++){const a=random()*Math.PI*2,rad=130+random()*900;dummy.position.set(Math.cos(a)*rad,-.7,Math.sin(a)*rad);dummy.rotation.set(random(),random()*6,random());const scale=.25+random()*1.1;dummy.scale.set(scale,scale*.4,scale*.7);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.receiveShadow=true;rocks.castShadow=true;s.add(rocks);
}

function buildTruck(w,x,z,angle){
 const g=new THREE.Group();g.position.set(x,.0,z);g.rotation.y=angle;w.scene.add(g);
 w.box(g,2.5,.6,6.4,0,.65,0,'dark');w.box(g,2.4,1.8,2.2,0,1.8,2,'shell');w.box(g,2.3,1.8,3.4,0,1.8,-1.2,'metal');
 w.box(g,2.0,.8,.06,0,2.2,3.14,'glass');w.box(g,2.6,.35,.30,0,.8,3.24,'metal');w.box(g,2.0,.15,.03,0,1.4,3.15,'orange');
 for(const dx of [-1.3,1.3])for(const zz of [-2,1.9]){const tire=w.cylinder(g,.62,.62,.4,dx,.64,zz,'rubber',24);tire.rotation.z=Math.PI/2;const hub=w.cylinder(g,.30,.3,.43,dx,.64,zz,'metal',16);hub.rotation.z=Math.PI/2;}
 for(const dx of [-.8,.8])w.box(g,.36,.24,.09,dx,1.2,3.18,'lamp');w.box(g,1.4,.14,.38,0,2.8,2,'orange');
 for(let zz=-2.6;zz<.3;zz+=.3)w.box(g,2.0,.07,.10,0,2.75,zz,'dark');
}

export function enrichRocket(w){
 const r=w.rocket,m=w.materials;
 // Structural flanges, bolt rings, avionics access covers, conduits and anti-vortex strakes.
 for(const y of [-15,-11,-4,3.5,10.3,16.8])for(let i=0;i<48;i++){
   const a=i*Math.PI*2/48,bolt=new THREE.Mesh(new THREE.CylinderGeometry(.033,.033,.027,6),m.metal);bolt.position.set(Math.cos(a)*1.815,y,Math.sin(a)*1.815);bolt.quaternion.setFromUnitVectors(v(0,1,0),v(Math.cos(a),0,Math.sin(a)));r.add(bolt);
 }
 for(const a of [Math.PI*.95,Math.PI*1.92]){
   const root=new THREE.Group();root.rotation.y=-a;root.position.set(Math.cos(a)*1.78,0,Math.sin(a)*1.78);r.add(root);
   w.box(root,.15,27,.24,.05,-.7,0,'shell');for(let y=-13;y<13;y+=1.5)w.box(root,.24,.065,.30,.10,y,0,'metal');
   for(const y of [-9.5,-2,9]){w.box(root,.14,.75,.72,.1,y,0,'dark');w.box(root,.17,.66,.63,.13,y,0,'shell');}
 }
 for(let i=0;i<8;i++){
   const a=i*Math.PI/4;w.rod(r,v(Math.cos(a)*1.74,-16.4,Math.sin(a)*1.74),v(Math.cos(a)*1.1,-17.8,Math.sin(a)*1.1),.06,'copper');
 }
 // Plumbing, injector plates, pump housings and regenerative cooling grooves on every engine.
 for(let i=0;i<3;i++){
   const a=i*Math.PI*2/3,x=Math.cos(a)*.85,z=Math.sin(a)*.85;
   const pod=new THREE.Group();pod.position.set(-x,-1,-z);w.enginePods[i].add(pod);
   w.cylinder(pod,.38,.26,1.1,x,1.30,z,'copper',24);w.cylinder(pod,.52,.52,.10,x,1.84,z,'metal',28);
   for(let k=0;k<32;k++){
     const angle=k*Math.PI*2/32;
     w.rod(pod,v(x+Math.cos(angle)*.26,.83,z+Math.sin(angle)*.26),v(x+Math.cos(angle)*.64,-.86,z+Math.sin(angle)*.64),.011,'copper');
   }
   const bell=new THREE.LatheGeometry(Array.from({length:21},(_,j)=>{const t=j/20;return new THREE.Vector2(.23+.43*Math.pow(t,1.55),.85-1.76*t);}),48);
   const nozzle=new THREE.Mesh(bell,m.nozzle);nozzle.position.set(x,0,z);pod.add(nozzle);
   w.rod(pod,v(x+.38,2,z),v(x+.60,.60,z),.078,'metal');
   w.cylinder(pod,.17,.17,.47,x+.38,1.78,z,'copper',16);
 }
 for(const fin of w.fins){w.cylinder(fin,.18,.18,.75,.13,0,0,'copper',16);for(let x=.25;x<2.9;x+=.5)for(const z of [-.8,.8])w.box(fin,.08,.24,.08,x,0,z,'metal');}
 // Avionics connectors and dedicated RCS quad housings; their geometry follows the rigid body.
 w.rcsGlows=[];
 for(let i=0;i<4;i++){const a=i*Math.PI/2+.3,g=new THREE.Group();g.position.set(Math.cos(a)*1.86,11.5,Math.sin(a)*1.86);g.rotation.y=-a;r.add(g);w.box(g,.38,.65,.58,.0,0,0,'metal');for(const sy of [-.18,.18])for(const zz of [-.2,.2]){const nozzle=w.cylinder(g,.07,.10,.23,.19,sy,zz,'black',12);nozzle.rotation.z=-Math.PI/2;}}
}

// Batch code-generated static details by material, retaining only articulated assemblies as separate draws.
export function batchStatic(root,skip=new Set()){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),groups=new Map(),nodes=[];
 function visit(object){if(skip.has(object)||object.isInstancedMesh)return;if(object.isMesh&&!Array.isArray(object.material)){
   const key=object.material.uuid+'/'+Object.keys(object.geometry.attributes).sort().join(',')+'/'+object.castShadow+'/'+object.receiveShadow;
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);nodes.push(object);
 }for(const child of object.children)visit(child);}
 for(const child of root.children)visit(child);
 let saved=0;
 for(const list of groups.values()){
   if(list.length<2)continue;
   const geometries=list.map(mesh=>mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)));
   const combined=mergeGeometries(geometries,false);if(!combined){geometries.forEach(g=>g.dispose());continue;}
   const mesh=new THREE.Mesh(combined,list[0].material);mesh.castShadow=list[0].castShadow;mesh.receiveShadow=list[0].receiveShadow;mesh.name='Batched procedural detail';root.add(mesh);
   list.forEach(o=>o.removeFromParent());geometries.forEach(g=>g.dispose());saved+=list.length-1;
 }
 return saved;
}
