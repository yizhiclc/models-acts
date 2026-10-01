import * as THREE from 'three/webgpu';
import {positionWorld,positionGeometry,vec3,mix,mx_noise_float,smoothstep,sin,cos,uniform,texture} from 'three/tsl';
import {CONSTANTS} from './physics.js';
import {rng} from './surfaces.js';
export const coastAt=z=>3400+380*Math.sin(z*.00055)+180*Math.sin(z*.0017);
export function buildCoastalGround(w){
 const width=400000,geometry=new THREE.PlaneGeometry(width,width,440,440);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const remap=n=>Math.sign(n)*(Math.abs(n)/(width/2))**2*(width/2),x=remap(pos.getX(i)),z=remap(pos.getZ(i)),shore=coastAt(z),inland=Math.max(0,Math.min(1,(shore-x)/450));const dune=Math.max(0,Math.sin(x*.0045+Math.sin(z*.002))*Math.cos(z*.0027))*3;const near=Math.max(0,Math.min(1,(Math.hypot(x,z)-2100)/1800));pos.setX(i,x);pos.setZ(i,z);pos.setY(i,-1.2+Math.sqrt(CONSTANTS.earthRadius**2-x*x-z*z)-CONSTANTS.earthRadius+(inland*(dune*near+2.2*near)-((1-inland)*7)));}geometry.computeVertexNormals();
 w.surfaceDetail=uniform(1);const material=new THREE.MeshStandardNodeMaterial({roughness:1,transparent:true,alphaTest:.001});material.opacityNode=w.surfaceDetail;
 const p=positionWorld,shore=p.z.mul(.00055).sin().mul(380).add(p.z.mul(.0017).sin().mul(180)).add(3400),distance=shore.sub(p.x);
 const coarse=mx_noise_float(p.xz.mul(.00075)).mul(.5).add(.5),fine=mx_noise_float(p.xz.mul(.026)).mul(.09).add(.95);
 const grass=mix(vec3(.11,.19,.11),vec3(.29,.36,.17),coarse),sand=vec3(.65,.61,.43);
 const wetland=smoothstep(.13,.45,mx_noise_float(p.xz.mul(.0004))).mul(smoothstep(1900,2600,p.xz.length()));
 material.colorNode=mix(mix(sand,grass,smoothstep(80,700,distance)),vec3(.08,.18,.17),wetland.mul(.42)).mul(fine);
 const ground=new THREE.Mesh(geometry,material);ground.receiveShadow=true;ground.name='Coastal plain / beaches / salt marsh';w.scene.add(ground);
 const oceanGeo=new THREE.PlaneGeometry(width,width,320,320);oceanGeo.rotateX(-Math.PI/2);const op=oceanGeo.attributes.position;
 for(let i=0;i<op.count;i++){const remap=n=>Math.sign(n)*(Math.abs(n)/(width/2))**2*(width/2),x=remap(op.getX(i)),z=remap(op.getZ(i));op.setX(i,x);op.setZ(i,z);op.setY(i,-2.9+Math.sqrt(CONSTANTS.earthRadius**2-x*x-z*z)-CONSTANTS.earthRadius);}oceanGeo.computeVertexNormals();
 w.earthTime=uniform(0);const water=new THREE.MeshPhysicalNodeMaterial({metalness:.14,roughness:.27,clearcoat:.9,clearcoatRoughness:.2,transparent:true,alphaTest:.001});
 const depth=smoothstep(-150,2800,p.x.sub(shore)),wave=sin(p.x.mul(.022).add(p.z.mul(.011)).sub(w.earthTime.mul(.65))).mul(cos(p.z.mul(.015).sub(w.earthTime.mul(.18))));
 water.opacityNode=w.surfaceDetail;water.colorNode=mix(vec3(.035,.32,.34),vec3(.017,.077,.15),depth).add(vec3(.013,.026,.032).mul(wave));
 water.positionNode=positionGeometry.add(vec3(0,sin(positionGeometry.x.mul(.02).add(w.earthTime.mul(.7))).mul(.32),0));
 const ocean=new THREE.Mesh(oceanGeo,water);ocean.receiveShadow=true;ocean.name='Curved Gulf water surface';w.scene.add(ocean);
 // Narrow surf bands follow the same coastline as the mesh and ocean bathymetry.
 const random=rng(570);const bushes=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#465d35',roughness:1}),1500);const dummy=new THREE.Object3D();
 for(let i=0;i<1500;i++){let x=(random()-.5)*8000,z=(random()-.5)*9000;if(Math.hypot(x,z)<1300||Math.hypot(x-CONSTANTS.landingX,z)<250)x-=2400;if(x>coastAt(z)-300)x=coastAt(z)-400-random()*1000;dummy.position.set(x,.1-(x*x+z*z)/(2*CONSTANTS.earthRadius),z);dummy.scale.set(1+random()*2,.5+random(),1+random()*2);dummy.rotation.y=random()*6.28;dummy.updateMatrix();bushes.setMatrixAt(i,dummy.matrix);}w.scene.add(bushes);
 w.box(w.scene,195,.3,200,-15,-.35,-5,'concrete');w.box(w.scene,13,.2,1700,90,-.65,-600,'road');w.box(w.scene,320,.2,12,-32,-.4,78,'road');
}

function earthMap(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const c=canvas.getContext('2d');c.fillStyle='#103e68';c.fillRect(0,0,2048,1024);
 // Coarse authored geographic silhouettes; no imagery or map service is loaded.
 const continents=[
 [[-168,71],[-135,70],[-122,60],[-130,51],[-124,42],[-117,32],[-112,29],[-109,23],[-105,20],[-98,16],[-94,16],[-90,14],[-86,12],[-83,9],[-80,8],[-82,11],[-85,15],[-87,17],[-87,21],[-90,21],[-92,19],[-95,19],[-97,22],[-97,26],[-96,28],[-94,29],[-90,29],[-88,30],[-85,30],[-83,29],[-82,25],[-80,25],[-81,29],[-76,36],[-65,47],[-60,52],[-77,61],[-94,72],[-120,75]],
 [[-82,12],[-71,12],[-61,8],[-50,0],[-35,-6],[-40,-20],[-53,-34],[-67,-55],[-76,-46],[-72,-17],[-80,0]],
 [[-73,60],[-47,59],[-21,70],[-36,83],[-61,82]],
 [[-10,36],[1,44],[-5,50],[-9,58],[7,58],[19,71],[37,69],[44,51],[34,39]],
 [[-17,36],[9,37],[32,31],[44,12],[51,9],[42,-13],[32,-29],[18,-35],[10,-18],[0,2],[-16,15]],
 [[30,70],[75,76],[111,74],[175,66],[168,54],[141,45],[131,32],[119,25],[110,18],[109,5],[99,7],[91,22],[79,9],[69,25],[52,28],[40,39],[44,53]],
 [[112,-11],[130,-12],[140,-10],[154,-26],[151,-38],[133,-35],[116,-34]],
 [[47,-13],[51,-17],[48,-26],[44,-22]],[[130,32],[140,42],[145,44],[139,35]],[[95,5],[106,-6],[117,-8],[129,-5],[123,3],[110,7]],
 [[-180,-70],[-120,-72],[-65,-65],[0,-71],[80,-68],[150,-72],[180,-70],[180,-90],[-180,-90]]
 ];
 for(const polygon of continents){c.beginPath();polygon.forEach(([lon,lat],i)=>{const x=(.5-lon/360)*2048,y=(.5-lat/180)*1024;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle='#46714a';c.fill();c.strokeStyle='#668572';c.lineWidth=1.5;c.stroke();}
 c.globalCompositeOperation='source-atop';const random=rng(66);for(let i=0;i<22000;i++){c.fillStyle=`rgba(139,149,88,${random()*.055})`;c.fillRect(random()*2048,random()*1024,2+random()*10,1+random()*4);}c.globalCompositeOperation='source-over';
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}
export function buildEarth(w){
 const R=CONSTANTS.earthRadius,material=new THREE.MeshStandardNodeMaterial({roughness:.86,fog:false,map:earthMap()});
 const p=positionWorld.add(vec3(0,R,0)).normalize();const localBlend=smoothstep(.99965,.99993,p.y);
 const shore=positionWorld.z.mul(.00055).sin().mul(380).add(positionWorld.z.mul(.0017).sin().mul(180)).add(3400),land=smoothstep(-250,150,shore.sub(positionWorld.x));
 const closeColor=mix(vec3(.025,.13,.20),vec3(.20,.28,.15),land);
 material.colorNode=mix(texture(material.map).rgb,closeColor,localBlend);
 const globe=new THREE.Mesh(new THREE.SphereGeometry(R-6,768,512),material);globe.position.y=-R;
 const lat=26*Math.PI/180,lon=-97.15*Math.PI/180,E=new THREE.Vector3(-Math.sin(lon),0,Math.cos(lon)),N=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)),Z=new THREE.Vector3(-Math.sin(lat)*Math.cos(lon),Math.cos(lat),-Math.sin(lat)*Math.sin(lon));
 globe.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(E.x,E.y,E.z,0,N.x,N.y,N.z,0,Z.x,Z.y,Z.z,0,0,0,0,1));globe.name='Earth / approximate geographic continents';w.scene.add(globe);w.planet=globe;
 const clouds=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,fog:false});clouds.colorNode=vec3(.90,.96,1);clouds.opacityNode=smoothstep(.20,.60,mx_noise_float(p.mul(55)).add(mx_noise_float(p.mul(120)).mul(.25))).mul(.40);
 const cloudShell=new THREE.Mesh(new THREE.SphereGeometry(R+4200,144,96),clouds);cloudShell.position.y=-R;cloudShell.name='Planetary cloud decks';w.scene.add(cloudShell);w.earthClouds=cloudShell;
 const rim=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,fog:false,blending:THREE.AdditiveBlending});rim.colorNode=vec3(.07,.28,.72);rim.opacity=.16;
 const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(R+10000,144,96),rim);atmosphere.position.y=-R;w.scene.add(atmosphere);w.atmosphereRim=atmosphere;
}

