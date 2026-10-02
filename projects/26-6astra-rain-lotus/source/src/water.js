import * as THREE from 'three/webgpu';
import { texture,positionLocal,positionWorld,normalWorld,vec2,vec3,vec4,float,color,uniform,screenUV,cameraPosition,cameraWorldMatrix,cameraViewMatrix,cameraProjectionMatrix,instanceIndex,uv,reflector,normalize,mix,pow,max,clamp,dot,refract,exp,smoothstep } from 'three/tsl';
import { MAX_RAIN,SIZE,shoreDistance,terrainHeight } from './config.js';

function instances(geometry,material,count){
  const mesh=new THREE.InstancedMesh(geometry,material,count),identity=new THREE.Matrix4();for(let i=0;i<count;i++)mesh.setMatrixAt(i,identity);mesh.frustumCulled=false;return mesh;
}
export function createRain(scene,simulation){
  const data=simulation.rainNode,id=instanceIndex.mul(3),p=data.element(id),meta=data.element(id.add(1)),hit=data.element(id.add(2));
  const wind=uniform(new THREE.Vector2(.35,.11));
  const material=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,color:0xc3d6d0,side:THREE.DoubleSide});
  const trail=positionLocal.y.add(.5).mul(.018);
  material.positionNode=p.xyz.add(vec3(wind.x.negate(),meta.x,wind.y.negate()).mul(trail)).add(cameraWorldMatrix.element(0).xyz.mul(positionLocal.x).mul(max(p.w.mul(.55),.0007)));
  material.opacityNode=uv().y.oneMinus().pow(.55).mul(.44).mul(meta.z);
  const rain=instances(new THREE.PlaneGeometry(1,1),material,MAX_RAIN);rain.renderOrder=5;scene.add(rain);
  const cpositions=[],cuv=[],indices=[],segments=36;
  for(let row=0;row<2;row++)for(let k=0;k<=segments;k++){
    const a=k/segments*Math.PI*2,r=row===0?.67:1;cpositions.push(Math.cos(a)*r,row===0?0:.5+.5*Math.cos(a*12)**2,Math.sin(a)*r);cuv.push(k/segments,row);
    if(row===0&&k<segments){indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
  }
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(cpositions,3));cg.setAttribute('uv',new THREE.Float32BufferAttribute(cuv,2));cg.setIndex(indices);cg.computeVertexNormals();
  const crownMaterial=new THREE.MeshPhysicalNodeMaterial({color:0xb7d4c9,metalness:.28,roughness:.11,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,clearcoat:1});
  const age=hit.w,life=clamp(age.div(.18),0,1),r=hit.z.mul(2.4).add(age.mul(.036));
  crownMaterial.positionNode=vec3(hit.x.add(positionLocal.x.mul(r)),float(.001).add(positionLocal.y.mul(hit.z).mul(6).mul(life.mul(Math.PI).sin())),hit.y.add(positionLocal.z.mul(r)));
  crownMaterial.opacityNode=life.oneMinus().mul(.65);crownMaterial.maskNode=age.lessThan(.18).and(hit.z.greaterThan(0));
  const crowns=instances(cg,crownMaterial,MAX_RAIN);crowns.renderOrder=2;scene.add(crowns);
  const bm=new THREE.MeshPhysicalNodeMaterial({color:0xabcbbd,roughness:.08,metalness:.38,transparent:true,depthWrite:false,clearcoat:1});
  bm.positionNode=positionLocal.mul(vec3(1,.32,1)).mul(hit.z.mul(.85)).add(vec3(hit.x,.0006,hit.y));
  bm.opacityNode=smoothstep(.5,.08,age).mul(.35);bm.maskNode=age.greaterThan(.04).and(age.lessThan(.5)).and(hit.z.greaterThan(.0021));
  const bubbles=instances(new THREE.SphereGeometry(1,8,6),bm,MAX_RAIN);bubbles.renderOrder=2;scene.add(bubbles);
  return {rain,crowns,bubbles,wind};
}

export function createWater(renderer,scene,simulation){
  const domainData=new Uint8Array(512*512*4);
  for(let z=0;z<512;z++)for(let x=0;x<512;x++){
    const wx=(x+.5)/512*SIZE-SIZE/2,wz=(z+.5)/512*SIZE-SIZE/2,i=(z*512+x)*4;
    domainData[i]=shoreDistance(wx,wz)<0?255:0;domainData[i+1]=Math.round(Math.max(0,-terrainHeight(wx,wz))/.55*255);domainData[i+2]=255;domainData[i+3]=255;
  }
  const domainTexture=new THREE.DataTexture(domainData,512,512);domainTexture.minFilter=domainTexture.magFilter=THREE.LinearFilter;domainTexture.needsUpdate=true;
  const refractionRT=new THREE.RenderTarget(800,600,{type:THREE.HalfFloatType,depthBuffer:true});refractionRT.texture.name='Underwater radiance';
  const mirror=reflector({resolutionScale:.7,generateMipmaps:true,bounces:false,samples:0});mirror.target.rotation.x=-Math.PI/2;mirror.target.position.y=.002;scene.add(mirror.target);
  const waterUV=positionLocal.xz.div(SIZE).add(.5),s=texture(simulation.surface,waterUV);
  const domain=texture(domainTexture,waterUV),columnDepth=domain.g.mul(.55).max(.015);
  const normal=normalize(vec3(s.g.mul(-2.2),1,s.b.mul(-2.2)));
  const view=normalize(cameraPosition.sub(positionWorld)),fresnel=float(.0204).add(pow(float(1).sub(max(dot(normal,view),0)),5).mul(.9796));
  const roughness=uniform(.15);
  mirror.levelNode=roughness.mul(3);
  // Refraction through a 55 cm water column. The known bed provides a stable
  // screen-space endpoint; above-bed stems retain the usual single-depth error.
  const transmitted=refract(view.negate(),normal,1/1.333);
  const endpoint=positionWorld.add(transmitted.mul(columnDepth.negate().sub(positionWorld.y).div(transmitted.y.min(-.05))));
  const clip=cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(endpoint,1));
  const refractUV=vec2(clip.x.div(clip.w).mul(.5).add(.5),clip.y.div(clip.w).mul(-.5).add(.5));
  const through=texture(refractionRT.texture,clamp(refractUV,.002,.998)).rgb;
  const depth=columnDepth.div(max(view.y,.13));
  const attenuation=exp(vec3(.85,.41,.32).mul(depth).negate());
  const below=through.mul(attenuation).add(color(0x31534a).mul(vec3(1).sub(attenuation)).mul(.3));
  // Convert world slopes to screen directions so orbiting preserves reflection distortion.
  const viewNormal=cameraViewMatrix.mul(vec4(vec3(s.g.mul(-2.2),0,s.b.mul(-2.2)),0)).xy;
  mirror.uvNode=screenUV.flipX().add(vec2(viewNormal.x.negate(),viewNormal.y).mul(.25));
  const reflected=mirror.rgb;
  const material=new THREE.MeshBasicNodeMaterial();
  material.maskNode=domain.r.greaterThan(.5);
  material.positionNode=positionLocal.add(vec3(0,texture(simulation.surface,waterUV).level(0).r,0));
  const skyHighlight=pow(max(dot(normal,normalize(view.add(vec3(-.38,.79,-.48)))),0),90).mul(.2);
  const slopeLight=clamp(s.g.mul(.65).add(s.b.mul(.75)).mul(3),-.07,.07);
  material.colorNode=mix(below,reflected,clamp(fresnel.add(.12),0,.98)).add(vec3(skyHighlight)).add(vec3(.5,.59,.57).mul(slopeLight));
  const geometry=new THREE.PlaneGeometry(SIZE,SIZE,192,192);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Persistent wave surface';mesh.frustumCulled=false;mesh.renderOrder=1;scene.add(mesh);
  return {mesh,material,mirror,refractionRT,roughness,debugNormals:normal,debugFresnel:fresnel,debugWave:s,debugRefraction:below,resize(w,h,quality){refractionRT.setSize(Math.round(w*(quality?1:.72)),Math.round(h*(quality?1:.72)));mirror.reflector.resolutionScale=quality?1:.7;}};
}
