import * as THREE from 'three/webgpu';
import {positionWorld,vec3,mix,mx_noise_float,smoothstep,uniform,sin,normalWorld} from 'three/tsl';
import {CONSTANTS} from './physics.js';

// A planet-scale backdrop prevents the launch terrain becoming a floating square.
// Continents, mineral strata and clouds are generated analytically, without image assets.
export function buildPlanet(w){
 const R=CONSTANTS.earthRadius;
 const material=new THREE.MeshStandardNodeMaterial({roughness:1,fog:false});
 const p=positionWorld.add(vec3(0,R,0)).normalize();
 const continental=mx_noise_float(p.mul(5.4)).add(mx_noise_float(p.mul(13)).mul(.22));
 const desert=mx_noise_float(p.mul(54)).mul(.10);
 const land=mix(vec3(.16,.22,.105),vec3(.57,.41,.23),smoothstep(.16,.90,p.y)).add(vec3(desert));
 const ocean=vec3(.022,.075,.12);
 const launchDesert=smoothstep(.996,.9997,p.y);
 const color=mix(ocean,land,smoothstep(-.03,.04,continental).max(launchDesert));
 const cloudNoise=mx_noise_float(p.mul(43)).add(mx_noise_float(p.mul(92)).mul(.3));
 const cloud=smoothstep(.24,.49,cloudNoise).mul(.6).mul(launchDesert.oneMinus().mul(.75).add(.25));
 material.colorNode=mix(color,vec3(.90,.92,.92),cloud);
 const globe=new THREE.Mesh(new THREE.SphereGeometry(R-140,192,128),material);globe.position.y=-R;globe.renderOrder=-1;globe.name='Procedural spherical Earth';w.scene.add(globe);w.planet=globe;
 // Thin horizon rim. Back faces have a larger radius and face the observer at the limb.
 const rim=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,fog:false,blending:THREE.AdditiveBlending});
 rim.colorNode=vec3(.06,.24,.55);rim.opacity=.11;
 const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(R+9000,144,96),rim);atmosphere.position.y=-R;atmosphere.renderOrder=0;w.scene.add(atmosphere);w.atmosphereRim=atmosphere;
}

export function buildRecoverySite(w){
 const site=new THREE.Group();site.position.x=CONSTANTS.landingX;site.name='LZ-01 recovery site / 950 m east of launch';w.scene.add(site);w.recoverySite=site;
 w.box(site,156,.4,156,0,-.30,0,'concrete');
 w.cylinder(site,34,35,.7,0,0,0,'dark',96);
 w.ring(site,27,.14,0,.38,0,'pale');w.ring(site,30.5,.13,0,.38,0,'orange');
 for(const z of [-10,10])w.box(site,12,.02,.4,0,.37,z,'pale');
 w.box(site,.65,.02,20,0,.37,0,'pale');
 const text=new THREE.Mesh(new THREE.PlaneGeometry(20,5),w.label('L Z — 0 1'));text.rotation.x=-Math.PI/2;text.position.set(0,.40,20);site.add(text);
 for(let n=0;n<24;n++){const a=n*Math.PI/12;const x=Math.cos(a)*37,z=Math.sin(a)*37;
  w.box(site,.45,.24,.45,x,.22,z,'metal');
  const lens=w.cylinder(site,.16,.16,.10,x,.39,z,'orange',12);lens.material=new THREE.MeshStandardMaterial({color:'#e3b858',emissive:'#edae39',emissiveIntensity:1.3});
 }
 for(const x of [-68,68])for(const z of [-68,68]){w.cylinder(site,.25,.42,12,x,6,z,'metal',12);w.box(site,2,.45,.7,x,12,z,'dark');w.cylinder(site,.7,1.4,.5,x,.2,z,'concrete',12);}
 for(let n=-70;n<=70;n+=14){w.box(site,.035,.015,148,n,-.085,0,'pale');w.box(site,148,.015,.035,0,-.085,n,'pale');}
 const roadLength=CONSTANTS.landingX-210;w.box(w.scene,roadLength,.15,12,210+roadLength/2,-.37,78,'road');
 for(let x=210;x<CONSTANTS.landingX+60;x+=22)w.box(w.scene,10,.025,.18,x,-.28,78,'pale');
 w.box(site,13,.15,90,56,-.28,38,'road');
 w.box(site,18,5,10,65,2.3,-52,'shell');w.box(site,19,.45,11,65,5,-52,'dark');
 for(const z of [-61,-42]){w.cylinder(site,.08,.10,5,53,2.5,z,'metal',8);w.box(site,.5,.35,.55,53,5,z,'black');}
 // Scorch bands and pavement cracking, generated from local coordinates.
 const scorchMat=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 const q=positionWorld.sub(vec3(CONSTANTS.landingX,0,0)),r=q.xz.length();
 scorchMat.colorNode=vec3(.07,.062,.052);scorchMat.opacityNode=smoothstep(3,17,r).oneMinus().mul(mx_noise_float(q.xz.mul(.45)).mul(.20).add(.23));
 const scorch=new THREE.Mesh(new THREE.CircleGeometry(28,96),scorchMat);scorch.rotation.x=-Math.PI/2;scorch.position.set(CONSTANTS.landingX,.39,0);w.scene.add(scorch);
}
