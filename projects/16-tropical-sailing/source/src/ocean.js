import * as THREE from 'three/webgpu';
import { Fn, wgslFn, uniform, storage, instanceIndex, positionLocal, positionWorld, cameraPosition, varying, attribute, vec2, vec3, vec4, float, uint, normalize, cross } from 'three/tsl';
import { BATHYMETRY_WGSL, random } from './bathymetry.js';

export const FIELD_SIZE=256, CELL=2, FIELD_SPAN=FIELD_SIZE*CELL;
const f=n=>Number(n).toFixed(8);

// Stratified, incommensurate samples of a JONSWAP-shaped spectrum, plus a
// restrained long-period swell. Fixed frequencies preserve phase as wind changes.
function makeSpectrum() {
  const rand=random(42), waves=[];
  for(let i=0;i<48;i++) {
    const lambda=Math.exp(Math.log(1.6)+(Math.log(180)-Math.log(1.6))*(i+rand()*.72)/47.72);
    const k=2*Math.PI/lambda, omega=Math.sqrt(9.81*k), peak=1.03;
    const sigma=omega<=peak?.07:.09;
    const gamma=Math.exp(-Math.pow(omega-peak,2)/(2*sigma*sigma*peak*peak));
    const energy=.0081*9.81**2/omega**5*Math.exp(-1.25*(peak/omega)**4)*3.3**gamma;
    const a=Math.sqrt(Math.max(0,energy)*omega*.12)+.009*Math.sqrt(lambda/8);
    const direction=.87+(rand()-.5)*1.85;
    waves.push({k,omega,a,dx:Math.cos(direction),dz:Math.sin(direction),phase:rand()*2*Math.PI});
  }
  const rms=Math.sqrt(waves.reduce((s,w)=>s+w.a*w.a/2,0));
  waves.forEach(w=>w.a*=.48/rms);
  return waves;
}
export const WAVES=makeSpectrum();
const bedFn=wgslFn(BATHYMETRY_WGSL);
const spectrumFn=wgslFn(`
fn spectrum(p:vec2<f32>, t:f32, wind:f32, footprint:f32) -> mat3x3<f32> {
  let waves=array<vec4<f32>,48>(${WAVES.map(w=>`vec4<f32>(${f(w.dx)},${f(w.dz)},${f(w.k)},${f(w.a)})`).join(',')});
  let phases=array<f32,48>(${WAVES.map(w=>f(w.phase)).join(',')});
  let depth=-bed(p);
  let windScale=0.055+pow(wind/9.0,1.65);
  let shoal=(1.0+0.31*exp(-pow(abs((depth-3.5)/3.2),2.0)))*smoothstep(-1.0,5.0,depth);
  var displacement=vec3<f32>(0.0);
  var tx=vec3<f32>(1.0,0.0,0.0);
  var tz=vec3<f32>(0.0,0.0,1.0);
  for(var i=0u;i<48u;i++) {
    let w=waves[i]; let k=w.z; let d=w.xy;
    let filtering=1.0-smoothstep(0.55,1.4,k*footprint);
    let amp=w.w*min(windScale*shoal,(max(depth,0.0)+0.5)*0.46)*filtering;
    let phase=dot(d,p)*k-sqrt(9.81*k)*t+phases[i];
    let s=sin(phase); let c=cos(phase);
    let chop=min(1.15,0.68+wind*0.035);
    displacement+=vec3<f32>(chop*amp*d.x*c,amp*s,chop*amp*d.y*c);
    tx+=vec3<f32>(-chop*amp*k*d.x*d.x*s,amp*k*d.x*c,-chop*amp*k*d.x*d.y*s);
    tz+=vec3<f32>(-chop*amp*k*d.x*d.y*s,amp*k*d.y*c,-chop*amp*k*d.y*d.y*s);
  }
  return mat3x3<f32>(displacement,tx,tz);
}`, [bedFn]);

const fieldRead=wgslFn(`
fn readField(p:vec2<f32>, origin:vec2<f32>, field:ptr<storage,array<vec4<f32>>,read>) -> vec4<f32> {
  let uv=(p-origin)/2.0;
  if(any(uv<vec2<f32>(1.0)) || any(uv>vec2<f32>(254.0))) { return vec4<f32>(0.0); }
  let q=vec2<u32>(floor(uv)); let f=fract(uv); let idx=q.y*256u+q.x;
  let a=mix((*field)[idx],(*field)[idx+1u],f.x);
  let b=mix((*field)[idx+256u],(*field)[idx+257u],f.x);
  return mix(a,b,f.y);
}`);

const evolveFn=wgslFn(`
fn evolve(i:u32, old:ptr<storage,array<vec4<f32>>,read>, origin:vec2<f32>, previous:vec2<f32>,
  boat:vec4<f32>, motion:vec4<f32>, t:f32, dt:f32, wind:f32) -> vec4<f32> {
  let cell=vec2<f32>(f32(i%256u),f32(i/256u)); let p=origin+cell*2.0;
  var state=readField(p,previous,old);
  let px=readField(p+vec2<f32>(2.0,0.0),previous,old);
  let nx=readField(p-vec2<f32>(2.0,0.0),previous,old);
  let pz=readField(p+vec2<f32>(0.0,2.0),previous,old);
  let nz=readField(p-vec2<f32>(0.0,2.0),previous,old);
  let hbed=bed(p); let depth=max(0.1,-hbed);
  let lap=(px.x+nx.x+pz.x+nz.x-4.0*state.x)/4.0;
  let waveC2=clamp(9.81*depth,4.0,85.0);
  var velocity=(state.y+lap*waveC2*dt)*exp(-dt*0.75);
  let rel=p-boat.xy; let forward=vec2<f32>(sin(boat.z),cos(boat.z));
  let right=vec2<f32>(forward.y,-forward.x);
  let along=dot(rel,forward); let side=dot(rel,right); let speed=motion.x;
  // Local moving pressure sources emit real propagating waves. Only the near
  // stern is seeded as a V: the older trail exists exclusively in this field.
  let bow=exp(-pow(abs((along-18.0)/2.1),2.0)-pow(abs(side/4.0),2.0));
  let bowTrough=exp(-pow(abs((along-14.5)/2.7),2.0)-pow(abs(side/5.2),2.0));
  let behind=max(0.0,-along-15.0);
  let sternGate=smoothstep(0.0,2.0,behind)*(1.0-smoothstep(18.0,25.0,behind));
  let vArm=exp(-pow(abs((abs(side)-(3.0+behind*0.355))/1.35),2.0))*sternGate;
  let track=exp(-pow(abs(side/3.2),2.0)-pow(abs((along+20.0)/5.0),2.0));
  let power=clamp(speed*speed/18.0,0.0,3.5);
  velocity+=(bow*2.1-bowTrough*1.3+vArm*0.55-track*0.25)*power*dt;
  let wet=smoothstep(-0.5,0.4,-hbed);
  let edge=smoothstep(0.0,14.0,min(min(cell.x,255.0-cell.x),min(cell.y,255.0-cell.y)));
  let height=clamp(state.x+velocity*dt,-1.6,1.6)*wet*edge;
  let wave=spectrum(p,t,wind,1.0);
  let jac=wave[1].x*wave[2].z-wave[2].x*wave[1].z;
  let crest=(1.0-smoothstep(0.29,0.57,jac))*smoothstep(0.3,1.0,wave[0].y);
  let shore=exp(-pow(abs(hbed-wave[0].y+0.18),2.0));
  let breaker=shore*smoothstep(0.03,0.5,wave[0].y+0.18)*(0.2+wind/12.0);
  let diff=(px.z+nx.z+pz.z+nz.z-4.0*state.z)*0.09;
  let injection=(bow*.4+vArm*.72+track*1.5)*power+crest*.36+breaker*1.7;
  let foam=clamp(state.z*exp(-dt/7.5)+dt*(injection+diff),0.0,1.0)*edge;
  // Wet sand remembers wave run-up for considerably longer than the foam.
  let wetSand=max(state.w*exp(-dt/22.0),shore*smoothstep(-0.1,0.35,wave[0].y-hbed));
  return vec4<f32>(height,velocity*wet*edge,foam,wetSand);
}`, [fieldRead,bedFn,spectrumFn]);

const noiseFn=wgslFn(`fn cloudNoise(p:vec2<f32>) -> f32 {
  let i=floor(p); let f=fract(p); let u=f*f*(3.0-2.0*f);
  let a=fract(sin(dot(i,vec2<f32>(127.1,311.7)))*43758.5453);
  let b=fract(sin(dot(i+vec2<f32>(1.0,0.0),vec2<f32>(127.1,311.7)))*43758.5453);
  let c=fract(sin(dot(i+vec2<f32>(0.0,1.0),vec2<f32>(127.1,311.7)))*43758.5453);
  let d=fract(sin(dot(i+vec2<f32>(1.0,1.0),vec2<f32>(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}`);
export const skyFn=wgslFn(`
fn tropicalSky(ray:vec3<f32>, sun:vec3<f32>) -> vec3<f32> {
  let elevation=max(ray.y,0.0); let sunset=1.0-smoothstep(0.06,0.55,sun.y);
  let zenith=mix(vec3<f32>(0.07,0.24,0.46),vec3<f32>(0.18,0.29,0.42),sunset);
  let horizon=mix(vec3<f32>(0.54,0.71,0.76),vec3<f32>(1.12,0.57,0.28),sunset);
  var col=mix(horizon,zenith,pow(elevation,0.44));
  let s=max(dot(ray,sun),0.0);
  col+=mix(vec3<f32>(1.0,0.86,0.58),vec3<f32>(1.0,0.43,0.15),sunset)*pow(s,18.0)*0.24;
  col+=vec3<f32>(6.0,4.8,3.5)*smoothstep(0.99982,0.99994,s);
  // Distant trade-wind clouds: procedural, softly layered, no image assets.
  let c=ray.xz/max(0.065,ray.y+0.06)*2.7;
  let n=cloudNoise(c)*.57+cloudNoise(c*2.07+7.0)*.28+cloudNoise(c*4.13)*.15;
  let cloud=smoothstep(0.54,0.75,n)*smoothstep(0.025,0.14,ray.y)*(1.0-smoothstep(0.44,0.77,ray.y));
  col=mix(col,mix(vec3<f32>(1.08,1.1,1.03),vec3<f32>(1.1,.74,.47),sunset),cloud*.68);
  return col;
}`, [noiseFn]);

const colorFn=wgslFn(`
fn waterColor(p:vec3<f32>, normal:vec3<f32>, eye:vec3<f32>, sun:vec3<f32>, t:f32, wind:f32,
  field:ptr<storage,array<vec4<f32>>,read>, origin:vec2<f32>, boat:vec4<f32>) -> vec3<f32> {
  let v=normalize(eye-p); let dist=length(eye-p);
  let state=readField(p.xz,origin,field);
  let depth=max(0.05,p.y-bed(p.xz));
  let pixelFootprint=max(length(dpdx(p.xz)),length(dpdy(p.xz)));
  let rippleFade=(1.0-smoothstep(65.0,240.0,dist))*(1.0-smoothstep(.13,.65,pixelFootprint));
  let uv=p.xz;
  let ripple=vec2<f32>(
    sin(dot(uv,vec2<f32>(4.1,3.7))-t*4.1)+.31*sin(dot(uv,vec2<f32>(-9.2,8.4))-t*7.2)+.45*cos(dot(uv,vec2<f32>(3.14,-2.51))-t*6.25),
    cos(dot(uv,vec2<f32>(3.8,-5.2))-t*4.7)+.3*cos(dot(uv,vec2<f32>(11.1,5.1))-t*7.5)+.47*sin(dot(uv,vec2<f32>(-2.63,3.91))-t*5.13));
  let n=normalize(normal+vec3<f32>(ripple.x,0.0,ripple.y)*(.003+wind*.0012)*rippleFade);
  let ndv=max(0.025,dot(n,v)); let reflected=reflect(-v,n);
  let fresnel=0.0204+0.9796*pow(1.0-ndv,5.0);
  let opticalDepth=depth/min(1.0,ndv*.7+.3);
  let transmission=exp(-vec3<f32>(.22,.072,.039)*opticalDepth);
  let grain=sin(uv.x*.41+sin(uv.y*.63))*sin(uv.y*.35-uv.x*.21);
  let sand=vec3<f32>(.54,.48,.30)*(0.85+grain*.10);
  let causticA=sin(uv.x*.62+sin(uv.y*.81+t*.23)+t*.25);
  let causticB=sin(uv.y*.71+sin(uv.x*.64-t*.21)-t*.19);
  let caustic=pow(1.0-abs(causticA*causticB),15.0)*exp(-depth*.16);
  let illumination=.62+sun.y*.65;
  let scatter=vec3<f32>(.004,.102,.137)*(vec3<f32>(1.0)-transmission);
  var below=(sand*(1.0+caustic*.55)*transmission+scatter)*illumination;
  let br=p.xz-boat.xy; let fwd=vec2<f32>(sin(boat.z),cos(boat.z));
  let local=vec2<f32>(dot(br,vec2<f32>(fwd.y,-fwd.x)),dot(br,fwd));
  let hullShadow=exp(-pow(abs(local.x/5.6),2.0)-pow(abs(local.y/19.0),4.0));
  below*=1.0-hullShadow*.53;
  let reflectedSky=mix(tropicalSky(reflected,sun),tropicalSky(normalize(reflected+vec3<f32>(0.0,.20,0.0)),sun),.35);
  var col=mix(below,reflectedSky,fresnel);
  let halfVector=normalize(v+sun); let ndh=max(0.0,dot(n,halfVector));
  let ndl=max(0.0,dot(n,sun)); let roughness=.095+wind*.002;
  let alpha2=pow(roughness,4.0); let divisor=ndh*ndh*(alpha2-1.0)+1.0;
  let distribution=alpha2/(3.14159*divisor*divisor);
  let visibility=1.0/(4.0*(ndv*(1.0-roughness)+roughness)*(ndl*(1.0-roughness)+roughness)+.001);
  let spec=min(24.0,distribution*visibility*.023*ndl);
  col+=vec3<f32>(1.0,.89,.67)*spec*1.8;
  // Thin wave crests admit warm sunlight without whitening the whole ocean.
  let thin=max(0.0,p.y)*pow(max(0.0,dot(v,-sun)),3.0)*.13;
  col+=vec3<f32>(.01,.19,.12)*thin;
  let bubbles=.25+cloudNoise(uv*2.1)*.82+cloudNoise(uv*6.2)*.22;
  let foam=clamp(state.z*(.3+bubbles),0.0,.9);
  col=mix(col,vec3<f32>(.81,.88,.81)*(.7+.35*sun.y),foam);
  let atmosphere=1.0-exp(-dist*.00017);
  return mix(col,tropicalSky(normalize(p-eye),sun),atmosphere);
}`, [fieldRead,bedFn,skyFn,noiseFn]);

const queryFn=wgslFn(`
fn sampleWater(p:vec2<f32>, t:f32, wind:f32, field:ptr<storage,array<vec4<f32>>,read>, origin:vec2<f32>) -> vec4<f32> {
  // Invert horizontal Gerstner displacement to query an Eulerian world point.
  var q=p;
  for(var j=0;j<5;j++) { let s=spectrum(q,t,wind,0.7); q=p-s[0].xz; }
  let w=spectrum(q,t,wind,0.7);
  let n=normalize(cross(w[2],w[1]));
  return vec4<f32>(w[0].y+readField(p,origin,field).x,n.x,n.z,t);
}`, [spectrumFn,fieldRead]);

export class Ocean {
  constructor(renderer,scene,sun) {
    this.renderer=renderer;
    this.time=uniform(0); this.wind=uniform(8.0); this.dt=uniform(1/60);
    this.origin=uniform(new THREE.Vector2(-256,-256));
    this.previous=uniform(new THREE.Vector2(-256,-256));
    this.boat=uniform(new THREE.Vector4(0,0,0,0));
    this.tilt=uniform(new THREE.Vector2());
    this.motion=uniform(new THREE.Vector4(0,0,0,0)); this.sun=sun;
    this.meshOrigin=uniform(new THREE.Vector2());
    this.buffers=[new THREE.StorageBufferAttribute(FIELD_SIZE**2,4),new THREE.StorageBufferAttribute(FIELD_SIZE**2,4)];
    this.write=this.buffers.map(b=>storage(b,'vec4',FIELD_SIZE**2));
    this.read=this.buffers.map(b=>storage(b,'vec4',FIELD_SIZE**2).toReadOnly());
    this.computes=[0,1].map(i=>Fn(()=>{
      this.write[1-i].element(instanceIndex).assign(evolveFn({i:instanceIndex,old:this.read[i],origin:this.origin,previous:this.previous,boat:this.boat,motion:this.motion,t:this.time,dt:this.dt,wind:this.wind}));
    })().compute(FIELD_SIZE**2));
    this.current=0; this.frame=0;
    this.geometry=createOceanGrid();
    this.materials=this.read.map((buffer,index)=>{
      const material=new THREE.MeshBasicNodeMaterial({side:THREE.FrontSide});
      const n=varying(vec3(0,1,0),'seaNormal'+index);
      material.positionNode=Fn(()=>{
        const q=positionLocal.xz.add(this.meshOrigin).toVar();
        const footprint=attribute('footprint','float');
        const wave=spectrumFn({p:q,t:this.time,wind:this.wind,footprint}).toVar();
        const disp=wave.element(0).toVar();
        const p=q.add(disp.xz).toVar();
        const height=fieldRead({p,origin:this.origin,field:buffer}).x;
        const dhx=fieldRead({p:p.add(vec2(2,0)),origin:this.origin,field:buffer}).x.sub(fieldRead({p:p.sub(vec2(2,0)),origin:this.origin,field:buffer}).x).div(4);
        const dhz=fieldRead({p:p.add(vec2(0,2)),origin:this.origin,field:buffer}).x.sub(fieldRead({p:p.sub(vec2(0,2)),origin:this.origin,field:buffer}).x).div(4);
        n.assign(normalize(cross(wave.element(2),wave.element(1)).add(vec3(dhx.negate(),0,dhz.negate()))));
        return vec3(p.x,disp.y.add(height),p.y);
      })();
      material.colorNode=colorFn({p:positionWorld,normal:n,eye:cameraPosition,sun,t:this.time,wind:this.wind,field:buffer,origin:this.origin,boat:this.boat});
      // The watertight interior mask is narrower than the physical hull sides.
      material.maskNode=wgslFn(`fn hullCut(p:vec3<f32>, b:vec4<f32>, tilt:vec2<f32>) -> bool {
        let r=p.xz-b.xy; let fw=vec2<f32>(sin(b.z),cos(b.z));
        let yawX=dot(r,vec2<f32>(fw.y,-fw.x)); let yawZ=dot(r,fw); let yawY=p.y-b.w;
        let yy=yawY*cos(tilt.x)+yawZ*sin(tilt.x); let z=-yawY*sin(tilt.x)+yawZ*cos(tilt.x);
        let x=yawX*cos(tilt.y)+yy*sin(tilt.y); let y=-yawX*sin(tilt.y)+yy*cos(tilt.y);
        let stations=array<vec2<f32>,8>(vec2<f32>(-19.0,.65),vec2<f32>(-17.0,3.5),vec2<f32>(-13.0,4.65),vec2<f32>(-6.0,5.0),vec2<f32>(2.0,4.85),vec2<f32>(10.0,3.7),vec2<f32>(16.0,2.0),vec2<f32>(20.0,.08));
        var halfWidth=0.0;
        for(var j=1;j<8;j++){if(z>=stations[j-1].x && z<stations[j].x){halfWidth=mix(stations[j-1].y,stations[j].y,(z-stations[j-1].x)/(stations[j].x-stations[j-1].x));}}
        let sheer=.55*pow(abs(z)/20.0,2.0)+select(0.0,.2,z<0.0);
        let cosTheta=1.0-pow(clamp((y+3.4-sheer)/6.4,0.0,1.0),1.0/.74);
        let width=max(0.0,halfWidth*sqrt(max(0.0,1.0-cosTheta*cosTheta))-.10);
        return !(z> -18.9 && z<19.9 && abs(x)<width);
      }`)({p:positionWorld,b:this.boat,tilt:this.tilt});
      return material;
    });
    this.mesh=new THREE.Mesh(this.geometry,this.materials[0]); this.mesh.frustumCulled=false; this.mesh.renderOrder=1; scene.add(this.mesh);
    this.points=new THREE.StorageBufferAttribute(9,4); this.points.setUsage(THREE.DynamicDrawUsage);
    this.pointNode=storage(this.points,'vec4',9).toReadOnly();
    this.samples=new THREE.StorageBufferAttribute(9,4); this.sampleNode=storage(this.samples,'vec4',9);
    this.query=this.read.map(buffer=>Fn(()=>{
      this.sampleNode.element(instanceIndex).assign(queryFn({p:this.pointNode.element(instanceIndex).xy,t:this.time,wind:this.wind,field:buffer,origin:this.origin}));
    })().compute(9));
    this.latest=null; this.pending=false; this.lastReadTime=0; this.reads=0; this.queryError=null;
  }
  step(dt,time,boat,wind) {
    this.time.value=time; this.wind.value=wind; this.dt.value=dt;
    this.previous.value.copy(this.origin.value);
    this.origin.value.set(Math.floor(boat.x/CELL)*CELL-FIELD_SPAN/2,Math.floor(boat.z/CELL)*CELL-FIELD_SPAN/2);
    this.boat.value.set(boat.x,boat.z,boat.heading,boat.heave);
    this.tilt.value.set(boat.pitch,boat.roll);
    this.motion.value.set(boat.speed,boat.yawRate,0,0);
    this.meshOrigin.value.set(boat.x,boat.z);
    this.renderer.compute(this.computes[this.current]); this.current=1-this.current;
    this.mesh.material=this.materials[this.current]; this.frame++;
  }
  sample(points,time) {
    if(this.pending || time-this.lastReadTime<1/30) return;
    points.forEach((p,i)=>this.points.setXYZW(i,p.x,p.z,0,0));
    this.points.needsUpdate=true; this.renderer.compute(this.query[this.current]);
    this.pending=true; this.lastReadTime=time;
    this.renderer.getArrayBufferAsync(this.samples).then(buffer=>{
      const result=new Float32Array(buffer);
      if(result.every(Number.isFinite)) {this.latest=result; this.reads++;}
      this.pending=false;
    }).catch(e=>{this.queryError=String(e);this.pending=false;});
  }
  wetNode() { return fieldRead({p:positionWorld.xz,origin:this.origin,field:this.read[0]}).w; }
  reset() {for(const b of this.buffers){b.array.fill(0);b.needsUpdate=true;}this.latest=null;}
  async stats() {
    const data=new Float32Array(await this.renderer.getArrayBufferAsync(this.buffers[this.current]));
    let foam=0,height=0,wet=0,energy=0,invalid=0;
    for(let i=0;i<data.length;i+=4) {height=Math.max(height,Math.abs(data[i]));foam+=data[i+2];wet+=data[i+3];energy+=data[i]*data[i];if(!Number.isFinite(data[i]+data[i+1]+data[i+2]+data[i+3]))invalid++;}
    return { maxWakeHeight:height,foamMass:foam,wetSandMass:wet,energy,invalidCells:invalid,readbacks:this.reads,queryError:this.queryError };
  }
}

function createOceanGrid() {
  const n=320, positions=[],indices=[],footprints=[];
  const warp=u=>Math.sign(u)*(Math.abs(u)*220+Math.pow(Math.max(0,(Math.abs(u)-.72)/.28),3)*5200);
  const derivative=u=>220+5200*3/.28*Math.pow(Math.max(0,(Math.abs(u)-.72)/.28),2);
  for(let z=0;z<=n;z++) for(let x=0;x<=n;x++) {
    const u=x/n*2-1,v=z/n*2-1;positions.push(warp(u),0,warp(v));
    footprints.push(Math.max(.7,derivative(u)/n,derivative(v)/n));
  }
  for(let z=0;z<n;z++) for(let x=0;x<n;x++) {const i=z*(n+1)+x;indices.push(i,i+n+1,i+1,i+1,i+n+1,i+n+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('footprint',new THREE.Float32BufferAttribute(footprints,1));g.setIndex(indices);g.computeVertexNormals();return g;
}
