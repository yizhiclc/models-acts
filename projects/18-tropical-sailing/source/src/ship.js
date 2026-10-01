import * as THREE from 'three/webgpu';
import { uniform, positionLocal, wgslFn, uv, texture } from 'three/tsl';
import { bedHeight, random } from './bathymetry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildShip(scene,windUniform,timeUniform) {
  const root=new THREE.Group(); root.name='Aster · 40 m brig'; scene.add(root);
  const woodMap=makeWood();
  const wood=new THREE.MeshStandardNodeMaterial({color:0x8b562d,map:woodMap,roughness:.82});
  const darkWood=new THREE.MeshStandardNodeMaterial({color:0x33291f,roughness:.86});
  const deckMat=new THREE.MeshStandardNodeMaterial({color:0xba8e57,map:woodMap,roughness:.91});
  const trim=new THREE.MeshStandardNodeMaterial({color:0xd5ad67,metalness:.2,roughness:.51});
  const ropeMat=new THREE.MeshStandardNodeMaterial({color:0x3c3225,roughness:1});
  const redMat=new THREE.MeshStandardNodeMaterial({color:0x634b38,roughness:.85});
  function mesh(g,m,parent=root) {const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function beam(a,b,r,mat=wood,r2=r) {const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b);const o=mesh(new THREE.CylinderGeometry(r2,r,aa.distanceTo(bb),8),mat);o.position.copy(aa).add(bb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bb.sub(aa).normalize());return o;}
  function rope(points,r=.038,mat=ropeMat) { const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,Math.max(3,points.length*4),r,4,false),mat); }
  const stations=[[-19,.65],[-17,3.5],[-13,4.65],[-6,5.0],[2,4.85],[10,3.7],[16,2.0],[20,.08]];
  const widthAt=z=>{for(let i=1;i<stations.length;i++)if(z<=stations[i][0]){const a=stations[i-1],b=stations[i];return THREE.MathUtils.lerp(a[1],b[1],(z-a[0])/(b[0]-a[0]));}return .08;};
  const sheer=z=>.55*Math.pow(Math.abs(z)/20,2)+(z<0?.2:0);
  const vertices=[],uvs=[],indices=[];
  for(let j=0;j<=78;j++) {
    const z=-19+j*.5, width=widthAt(z);
    for(let i=0;i<=28;i++) {
      const theta=-Math.PI/2+i/28*Math.PI;
      const y=-3.4+6.4*Math.pow(1-Math.cos(theta),.74)+sheer(z);
      vertices.push(width*Math.sin(theta),y,z);uvs.push(j/8,i/3);
      if(j<78&&i<28){const k=j*29+i;indices.push(k,k+1,k+29,k+1,k+30,k+29);}
    }
  }
  const hullG=new THREE.BufferGeometry();hullG.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hullG.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));hullG.setIndex(indices);hullG.computeVertexNormals();
  const hull=mesh(hullG,wood);hull.material.side=THREE.DoubleSide;
  const outline=new THREE.Shape();outline.moveTo(-.65,-19);
  for(let z=-19;z<=20;z+=.5)outline.lineTo(-widthAt(z),z);
  for(let z=20;z>=-19;z-=.5)outline.lineTo(widthAt(z),z);outline.closePath();
  const deckG=new THREE.ShapeGeometry(outline,40);deckG.rotateX(Math.PI/2);deckG.translate(0,3.02,0);
  // ShapeGeometry's second coordinate becomes +z after the rotation.
  mesh(deckG,deckMat).material.side=THREE.DoubleSide;
  for(const side of [-1,1]) {
    for(const h of [1.15,2.65,3.18,4.0]) {
      const p=[];for(let z=-18;z<=19.5;z+=1.5)p.push([side*widthAt(z)*(h<2?.955:1),h+sheer(z),z]);
      rope(p,h===4?.12:.10,h===4?darkWood:trim);
    }
    for(let z=-17;z<18;z+=2.1)beam([side*widthAt(z),3.0+sheer(z),z],[side*widthAt(z),4.0+sheer(z),z],.085,darkWood);
    for(let z=-12;z<=10;z+=4.5) {
      const port=mesh(new THREE.BoxGeometry(.14,.70,.95),darkWood);port.position.set(side*(widthAt(z)-.05),1.93+sheer(z),z);
      const rim=mesh(new THREE.BoxGeometry(.16,.16,1.15),trim);rim.position.copy(port.position).y+=.46;
    }
  }
  // Quarterdeck, captain's cabin, skylight, hatch, capstan, wheel and rudder.
  const cabin=mesh(new THREE.BoxGeometry(6.7,2.0,6.0),redMat);cabin.position.set(0,4,-12.5);
  const cabinRoof=mesh(new THREE.BoxGeometry(7.25,.24,6.4),deckMat);cabinRoof.position.set(0,5.14,-12.5);
  const windowMat=new THREE.MeshStandardNodeMaterial({color:0x446669,metalness:.45,roughness:.23});
  for(let x=-2.4;x<=2.5;x+=1.2) {const w=mesh(new THREE.BoxGeometry(.72,1.0,.10),windowMat);w.position.set(x,4.1,-15.55);for(const dx of [-.39,.39])beam([x+dx,3.55,-15.64],[x+dx,4.65,-15.64],.035,trim);}
  for(const z of [-5.0,7.1]){const hatch=mesh(new THREE.BoxGeometry(2.8,.5,3.0),darkWood);hatch.position.set(0,3.32,z);for(let dz=-1.25;dz<1.5;dz+=.3){const slat=mesh(new THREE.BoxGeometry(2.65,.08,.11),trim);slat.position.set(0,3.61,z+dz);}}
  const rudder=mesh(new THREE.BoxGeometry(.22,4.5,2.3),darkWood);rudder.position.set(0,-1,-19.3);
  beam([0,3,-8.4],[0,4.7,-8.4],.11,darkWood);
  const wheel=mesh(new THREE.TorusGeometry(.74,.055,6,24),trim);wheel.position.set(0,4.6,-8.4);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;beam([Math.sin(a)*.13,4.6+Math.cos(a)*.13,-8.4],[Math.sin(a)*.9,4.6+Math.cos(a)*.9,-8.4],.045,wood);}
  beam([0,3.4,16],[0,7.6,29],.2,wood,.11);
  rope([[0,1.2,19],[0,7.6,29]],.043);
  for(const side of [-1,1])rope([[side*3.2,3.1,12],[0,7.6,29]],.045);
  const sailTexture=makeCanvas();
  const sailMaterial=new THREE.MeshStandardNodeMaterial({color:0xffefc9,map:sailTexture,roughness:.96,side:THREE.DoubleSide});
  // Vertices have parametric UVs; pressure/billow reacts smoothly to the same wind.
  sailMaterial.positionNode=wgslFn(`fn sail(p:vec3<f32>, uv:vec2<f32>, wind:f32, t:f32)->vec3<f32>{
    let fill=0.16+smoothstep(0.0,12.0,wind)*1.9;
    let belly=sin(uv.x*3.14159)*sin(uv.y*3.14159);
    let flutter=sin(uv.x*16.0+uv.y*5.0-t*3.4)*0.045*(1.0-uv.y)*wind/10.0;
    return p+vec3<f32>(0.0,-(1.0-smoothstep(0.0,7.0,wind))*belly*.65,belly*fill+flutter);
  }`)({p:positionLocal,uv:uv(),wind:windUniform,t:timeUniform});
  function squareSail(z,top,bottom,width,bottomWidth) {
    const pos=[],uv=[],idx=[],nx=24,ny=16;
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
      const u=x/nx,v=y/ny,w=THREE.MathUtils.lerp(bottomWidth,width,v);
      pos.push((u-.5)*w,bottom+(top-bottom)*v+.3*Math.sin(u*Math.PI)*(1-v),z);uv.push(u,v);
      if(y<ny&&x<nx){const k=y*(nx+1)+x;idx.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    mesh(g,sailMaterial);beam([-width*.56,top+.08,z],[width*.56,top+.08,z],.13,darkWood);
    for(const side of [-1,1])rope([[side*width*.55,top,z],[side*4.4,4.0,z-1.5]],.032);
  }
  for(const mast of [{z:0,h:32,w:16,head:32.0},{z:11,h:27.2,w:13.8,head:29.4}]) {
    beam([0,3.05,mast.z],[0,mast.head,mast.z],.40,wood,.12);
    for(const y of [8,14,20]){const band=mesh(new THREE.TorusGeometry(.31-y*.004,.035,5,12),trim);band.rotation.x=Math.PI/2;band.position.set(0,y,mast.z);}
    const crow=mesh(new THREE.CylinderGeometry(1.2,.72,.6,12),darkWood);crow.position.set(0,mast.h*.67,mast.z);
    // Keep the entire foot / head in front of the mast, even where billow is
    // zero. Previously a 0.22 m offset intersected the 0.40 m mast radius.
    squareSail(mast.z+.68,mast.h*.62,7.3,mast.w,mast.w*.87);
    squareSail(mast.z+.64,mast.h*.84,mast.h*.64,mast.w*.77,mast.w*.83);
    squareSail(mast.z+.60,mast.h*.985,mast.h*.855,mast.w*.48,mast.w*.6);
    for(const [y,offset]of [[mast.h*.62,.68],[mast.h*.84,.64],[mast.h*.985,.60]])beam([0,y,mast.z],[0,y,mast.z+offset],.15,darkWood);
    for(const side of [-1,1]) {
      // All shrouds and ratlines stay on the aft side of their own sail stack.
      // The former forward chainplate at z+1.5 cut through the lower sail foot.
      for(let j=0;j<4;j++)rope([[side*4.65,3.7,mast.z-4.2+j*.85],[side*.4,mast.h*.66,mast.z-.28]],.043);
      for(let level=0;level<18;level++) {
        const t=level/22;const x=side*(4.65*(1-t)+.4*t);const yy=3.7+(mast.h*.66-3.7)*t;
        rope([[x,yy,mast.z-4.2*(1-t)-.28*t],[x,yy,mast.z-1.65*(1-t)-.28*t]],.023);
      }
      // Fore backstays land between the masts, not on the stern: a direct
      // foremast-to-stern stay otherwise pierces the main course near its head.
      const anchorZ=mast.z===11?4:-14,anchorY=mast.z===11?3.9:5.3;
      rope([[side*.17,mast.head-.25,mast.z-.14],[side*4.25,anchorY,anchorZ]],.047);
    }
  }
  // Separate taut stays avoid Catmull-Rom overshoot across the sail envelope.
  rope([[0,32.15,0],[0,29.4,11]],.046);
  rope([[0,29.4,11],[0,7.6,29]],.047);
  // The jib occupies a separate volume forward of z=16.1. The forward square
  // sails can reach at most z≈13.9 at maximum wind, leaving >2 m clearance.
  // Its pressure displacement is across the ship, not along the square sails.
  const jibMaterial=new THREE.MeshStandardNodeMaterial({color:0xffefc9,map:sailTexture,roughness:.96,side:THREE.DoubleSide});
  jibMaterial.positionNode=wgslFn(`fn jib(p:vec3<f32>, uv:vec2<f32>, wind:f32, t:f32)->vec3<f32>{
    let edge=max(0.0,1.0-uv.x-uv.y);
    let belly=27.0*uv.x*uv.y*edge;
    let pressure=.10+smoothstep(0.0,12.0,wind)*1.20;
    return p+vec3<f32>(belly*pressure,0.0,sin(t*3.0+uv.x*12.0)*belly*.025);
  }`)({p:positionLocal,uv:uv(),wind:windUniform,t:timeUniform});
  const jibA=new THREE.Vector3(.14,23.1,16.2018),jibB=new THREE.Vector3(.14,9.3,27.5963),jibC=new THREE.Vector3(.14,8.4,16.1);
  const jp=[],ju=[],ji=[],rows=[],divisions=20;
  for(let i=0;i<=divisions;i++) {
    rows.push(jp.length/3);
    for(let j=0;j<=divisions-i;j++) {
      const u=i/divisions,v=j/divisions;
      const q=jibA.clone().multiplyScalar(1-u-v).addScaledVector(jibB,u).addScaledVector(jibC,v);
      jp.push(q.x,q.y,q.z);ju.push(u,v);
    }
  }
  for(let i=0;i<divisions;i++)for(let j=0;j<divisions-i;j++) {
    const a=rows[i]+j,b=rows[i+1]+j;ji.push(a,b,a+1);
    if(j<divisions-i-1)ji.push(a+1,b,b+1);
  }
  const jibG=new THREE.BufferGeometry();jibG.setAttribute('position',new THREE.Float32BufferAttribute(jp,3));jibG.setAttribute('uv',new THREE.Float32BufferAttribute(ju,2));jibG.setIndex(ji);jibG.computeVertexNormals();mesh(jibG,jibMaterial);
  rope([[.14,8.4,16.1],[2.5,4.1,15.3]],.043);
  const pennant=new THREE.Shape();pennant.moveTo(0,0);pennant.lineTo(4,-.3);pennant.lineTo(0,-1);pennant.closePath();const flag=mesh(new THREE.ShapeGeometry(pennant),new THREE.MeshStandardNodeMaterial({color:0x9b4e30,side:THREE.DoubleSide,roughness:.8}));flag.position.set(.05,32.2,0);flag.rotation.y=.6;
  const nameplate=makeNameplate();const plate=mesh(new THREE.PlaneGeometry(3.0,.75),new THREE.MeshBasicNodeMaterial({map:nameplate,transparent:true,side:THREE.DoubleSide}));plate.position.set(0,3.6,-19.05);plate.rotation.y=Math.PI;
  // Bake the fixed fittings by material: hundreds of ropes become a few draws.
  const batches=new Map();
  for(const child of [...root.children]) {
    if(!child.isMesh || child===rudder || child===flag)continue;
    child.updateMatrix();const g=child.geometry.clone().applyMatrix4(child.matrix);
    // Every procedural primitive has normals/UVs, except the triangular jib.
    if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    const key=child.material.id;if(!batches.has(key))batches.set(key,{material:child.material,geometries:[]});
    batches.get(key).geometries.push(g.index?g.toNonIndexed():g);root.remove(child);child.geometry.dispose();
  }
  for(const batch of batches.values()){const merged=mergeGeometries(batch.geometries);mesh(merged,batch.material);batch.geometries.forEach(g=>g.dispose());}
  return {root,rudder,flag};
}

export class Vessel {
  constructor(model) {
    this.model=model; this.targetSpeed=3.1; this.targetHeading=-.42; this.helm=0;
    this.localPoints=[];for(const z of [-12,0,12])for(const x of [-2.65,0,2.65])this.localPoints.push(new THREE.Vector3(x,-1.65,z));
    this.points=this.localPoints.map(()=>new THREE.Vector3()); this.reset();
  }
  reset() {this.x=-15;this.z=27;this.heave=0;this.vy=0;this.heading=-.42;this.targetHeading=-.42;this.speed=2.0;this.roll=0;this.pitch=0;this.rollRate=0;this.pitchRate=0;this.yawRate=0;this.distance=0;this.samplesReady=false;this.sync();}
  sync() {const r=this.model.root;r.position.set(this.x,this.heave,this.z);r.rotation.set(this.pitch,this.heading,this.roll,'YXZ');r.updateMatrixWorld(true);this.localPoints.forEach((p,i)=>this.points[i].copy(p).applyMatrix4(r.matrixWorld));}
  update(dt,samples,wind) {
    const mass=165000, g=9.81, Ix=mass*135, Iz=mass*16;
    let fy=-mass*g, tx=0,tz=0,ty=0;
    this.sync();
    if(samples) {
      this.samplesReady=true;
      for(let i=0;i<9;i++) {
        const local=this.localPoints[i], point=this.points[i];
        const sub=samples[i*4]-point.y;
        const vy=this.vy+this.rollRate*local.x-this.pitchRate*local.z;
        const buoyancy=mass*g/9*THREE.MathUtils.clamp(sub/1.65,0,2.8);
        const damping=mass/9*1.6*vy;
        const force=buoyancy-damping;
        fy+=force; tx-=local.z*force; tz+=local.x*force;
        const fx=-samples[i*4+1]*buoyancy*.1,fz=-samples[i*4+2]*buoyancy*.1;
        ty+=(point.z-this.z)*fx-(point.x-this.x)*fz;
      }
      // Aerodynamic heeling moment, opposed by the hydrostatic restoring torque.
      tz-=mass*.022*wind*wind;
      this.vy+=(fy/mass)*dt;this.heave+=this.vy*dt;
      this.pitchRate+=(tx/Ix-this.pitchRate*.8)*dt;this.pitch+=this.pitchRate*dt;
      this.rollRate+=(tz/Iz-this.rollRate*1.15)*dt;this.roll+=this.rollRate*dt;
    }
    // Heading hold acts through a speed-dependent rudder. Water slope contributes
    // an independent yaw torque; none of the rotations use periodic animation.
    if(Math.abs(this.helm)>.01)this.targetHeading+=this.helm*dt*.18;
    const depthAhead=-bedHeight(this.x+Math.sin(this.heading)*38,this.z+Math.cos(this.heading)*38);
    const safeSpeed=depthAhead<3.8?Math.min(this.targetSpeed,.8):this.targetSpeed;
    if(depthAhead<5) this.targetHeading-=dt*.14;
    let err=Math.atan2(Math.sin(this.targetHeading-this.heading),Math.cos(this.targetHeading-this.heading));
    const rudder=THREE.MathUtils.clamp(err*1.7,-.52,.52);
    this.yawRate+=(rudder*Math.min(this.speed*.03,.18)+ty/(mass*160)-this.yawRate*.65)*dt;
    this.heading+=this.yawRate*dt;
    this.speed+=(safeSpeed-this.speed)*Math.min(1,dt*.20);
    this.x+=Math.sin(this.heading)*this.speed*dt;this.z+=Math.cos(this.heading)*this.speed*dt;
    this.distance+=this.speed*dt;this.model.rudder.rotation.y=rudder;
    this.sync();
  }
}

function makeWood() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');const rand=random(17);
  ctx.fillStyle='#c39460';ctx.fillRect(0,0,512,256);
  for(let row=0;row<16;row++) {ctx.fillStyle=`rgba(40,22,7,${.1+rand()*.18})`;ctx.fillRect(0,row*16,512,1.7);for(let j=0;j<55;j++){ctx.strokeStyle=`rgba(58,32,13,${rand()*.15})`;ctx.beginPath();const y=row*16+rand()*16;ctx.moveTo(0,y);ctx.bezierCurveTo(140,y+rand()*2,310,y-rand()*2,512,y);ctx.stroke();}for(let x=(row%3)*140;x<512;x+=220){ctx.fillStyle='#785436';ctx.fillRect(x,row*16,1,16);ctx.fillRect(x+4,row*16+4,1.5,1.5);}}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}
function makeCanvas() {
  const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d');const rand=random(23);
  ctx.fillStyle='#eadfc1';ctx.fillRect(0,0,512,512);
  for(let x=0;x<512;x+=43){ctx.fillStyle='rgba(104,79,46,.12)';ctx.fillRect(x,0,2,512);ctx.fillStyle='rgba(255,255,237,.3)';ctx.fillRect(x+3,0,1,512);}
  for(let i=0;i<22000;i++){const a=rand()*.085;ctx.fillStyle=`rgba(95,75,44,${a})`;ctx.fillRect(rand()*512,rand()*512,1+rand()*3,1);}
  const g=ctx.createLinearGradient(0,0,0,512);g.addColorStop(0,'rgba(88,66,33,.1)');g.addColorStop(.5,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(84,61,32,.17)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function makeNameplate(){const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#2c261f';x.fillRect(0,0,512,128);x.strokeStyle='#d4b174';x.lineWidth=4;x.strokeRect(7,7,498,114);x.fillStyle='#ead4a2';x.textAlign='center';x.font='52px Georgia';x.fillText('A S T E R',256,83);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
