import * as THREE from 'three/webgpu';
import {CONSTANTS} from './physics.js';
import {VEHICLE} from './vehicle.js';
import {PLUME_MODEL} from './plume-model.js';
import { Fn, If, float, vec2, vec3, vec4, uniform, uniformArray, instancedArray, instanceIndex, uv, sin, cos, fract, mix, max, min, smoothstep, texture, cameraViewMatrix, dot, positionGeometry, normalGeometry, rotate } from 'three/tsl';

export const FIELD_COUNTS = { plume: 65536, upperPlume: 24576, steam: 24576, reentry: 8192, explosion: 24576, upperExplosion:8192, dust: 8192 };
const hash = n => fract(sin(n.mul(12.9898).add(78.233)).mul(43758.5453));

// Five physical categories, seven storage sets. Plume slots belong permanently to individual engines.
// CPU supplies boundary conditions only. No particle position is uploaded per frame.
export class GPUFields {
  constructor(renderer, scene, cloudAtlas, cloudNormal) {
    this.renderer = renderer;
    this.cloudAtlas=cloudAtlas;
    this.cloudNormal=cloudNormal;
    this.u = {
      dt: uniform(1 / 30), time: uniform(0), center: uniform(new THREE.Vector3(0, 21, 0)),
      nozzle: uniform(new THREE.Vector3(0, 3, 0)), direction: uniform(new THREE.Vector3(0, -1, 0)),
      velocity: uniform(new THREE.Vector3()), expansion: uniform(1), halfAngle:uniform(.06), upperExpansion:uniform(1), upperHalfAngle:uniform(.06), upperPlume:uniform(0), upperNozzle:uniform(new THREE.Vector3()), upperDirection:uniform(new THREE.Vector3(0,-1,0)), upperVelocity:uniform(new THREE.Vector3()), upperSide:uniform(new THREE.Vector3(1,0,0)), heatColor: uniform(new THREE.Color('#c95120')),
      side: uniform(new THREE.Vector3(1,0,0)), binormal:uniform(new THREE.Vector3(0,0,1)),upperBinormal:uniform(new THREE.Vector3(0,0,1)),
      ...Object.fromEntries([['engine',33],['ship',6]].flatMap(([prefix,count])=>['Nozzle','Direction','Side','Binormal','Velocity','Parameters'].map(k=>[prefix+k,uniformArray(Array.from({length:count},()=>new THREE.Vector3()),'vec3')]))),
      sun: uniform(new THREE.Vector3(-120,92,155).normalize()), thermalGain: uniform(0.065),
      blastAge: uniform(-1), blastRadius: uniform(0), blastDuration: uniform(1), debrisRange: uniform(0), impact: uniform(new THREE.Vector3()),
      plume: uniform(0), steam: uniform(0), reentry: uniform(0), explosion: uniform(0), upperExplosion:uniform(0),dust: uniform(0),
      upperBlastAge:uniform(-1),upperBlastRadius:uniform(0),upperBlastDuration:uniform(1),upperDebrisRange:uniform(0),upperImpact:uniform(new THREE.Vector3())
    };
    this.fields = Object.fromEntries(Object.entries(FIELD_COUNTS).map(([name, count]) => [name, this.makeField(name==='upperExplosion'?'explosion':name, count, scene,name==='upperExplosion')]));
    this.dispatches = Object.fromEntries(Object.keys(this.fields).map(n => [n, 0]));
    this.simulatedTime = 0;
  }
  makeField(name, count, scene,upperImpact=false) {
    const position = instancedArray(count, 'vec3');
    const velocity = instancedArray(count, 'vec3');
    const state = instancedArray(count, 'vec4'); // age, lifetime, generation, active
    const engineField=name==='plume'||name==='upperPlume',upper=name==='upperPlume';
    const base=this.u,index=instanceIndex.mod(upper?6:33),prefix=upper?'ship':'engine',get=k=>base[prefix+k].element(index),parameters=get('Parameters');
    const u=engineField?{...base,nozzle:get('Nozzle'),direction:get('Direction'),velocity:get('Velocity'),side:get('Side'),binormal:get('Binormal'),plume:parameters.x,upperPlume:parameters.x,expansion:parameters.z,halfAngle:parameters.y}
     :upperImpact?{...base,blastAge:base.upperBlastAge,blastRadius:base.upperBlastRadius,blastDuration:base.upperBlastDuration,debrisRange:base.upperDebrisRange,impact:base.upperImpact,explosion:base.upperExplosion}:base;
    const init = Fn(() => {
      position.element(instanceIndex).assign(vec3(0, -2000, 0));
      velocity.element(instanceIndex).assign(vec3(0));
      state.element(instanceIndex).assign(vec4(100, 1, 0, 0));
    })().compute(count);
    const update = Fn(() => {
      const p = position.element(instanceIndex), v = velocity.element(instanceIndex), s = state.element(instanceIndex);
      const id = float(instanceIndex), seed = id.add(s.z.mul(911.17)).add(u.time.mul(0.7));
      const a = hash(seed), b = hash(seed.add(41.8)), c = hash(seed.add(91.23));
      const phi = a.mul(Math.PI * 2), radial = engineField?u.side.mul(cos(phi)).add(u.binormal.mul(sin(phi))):vec3(cos(phi),0,sin(phi));
      s.x.addAssign(u.dt);
      If(s.x.greaterThanEqual(s.y), () => { s.w.assign(0); });
      // Birth rules differ: continuous engine, water gate, heat-driven sheath,
      // a single energy-dependent detonation, and surface momentum entrainment.
      let birth;
      if (name === 'explosion') {
        birth = s.z.lessThan(0.5).and(u.blastAge.greaterThanEqual(0)).and(u.blastAge.lessThan(0.45)).and(hash(seed.add(307.3)).lessThan(u.dt.mul(19)));
      } else {
        const rate = { plume: 18, upperPlume:18, steam: 2.4, reentry: 12, dust: 3.5 }[name];
        birth = s.w.lessThan(0.5).and(u[name].greaterThan(0.002)).and(hash(seed.add(307.3)).lessThan(min(1, u[name].mul(u.dt).mul(rate))));
        if(name==='dust')birth=birth.and(hash(seed.add(514)).greaterThan(u.steam.mul(.68)));
      }
      If(birth, () => {
        s.x.assign(0); s.z.addAssign(1); s.w.assign(1);
        if (engineField) {
          p.assign(u.nozzle.add(radial.mul(b.mul(upper?1.25:.46))));
          const jetSpeed=u.plume.mul(PLUME_MODEL.tracerThrottleSpeed).add(PLUME_MODEL.tracerBaseSpeed);
          v.assign(u.velocity.add(u.direction.mul(jetSpeed)).add(radial.mul(c.mul(.8).add(.2)).mul(jetSpeed).mul(u.halfAngle.tan())));
          s.y.assign(b.mul(PLUME_MODEL.lifetimeSpread).add(PLUME_MODEL.lifetimeBase).add(u.plume.mul(PLUME_MODEL.lifetimeThrottle)));
        } else if (name === 'steam') {
          const side = a.greaterThan(0.5).select(float(1), float(-1));
          If(id.mod(16).lessThan(5),()=>{
            const outlet=id.div(16).floor().mod(9).sub(4).mul(5);
            p.assign(vec3(side.mul(6.4),1.52,outlet.add(c.sub(.5).mul(.13))));
            v.assign(vec3(side.mul(-9.8),b.mul(1.5).add(7.5),c.sub(.5).mul(1.5)));
            s.y.assign(b.mul(.4).add(1.7));
          }).Else(()=>{
            p.assign(vec3(b.sub(.5).mul(4.2),c.mul(1.1).add(.8),side.mul(b.mul(9).add(7))));
            v.assign(vec3(c.sub(.5).mul(6),c.mul(.7).add(.8),side.mul(u.plume.mul(21).add(13)).mul(b.mul(.65).add(.7))));
            s.y.assign(b.mul(5).add(8));
          });
        } else if (name === 'reentry') {
          const flightDirection = u.velocity.div(max(u.velocity.length(), 1));
          p.assign(u.center.add(flightDirection.mul(35.5)).add(radial.mul(4.8).add(vec3(0, b.sub(0.5).mul(4), 0))));
          v.assign(u.velocity.mul(0.88).add(radial.mul(c.mul(10))));
          s.y.assign(b.mul(0.40).add(0.15));
        } else if (name === 'explosion') {
          p.assign(u.impact.add(vec3(0, 3, 0)).add(radial.mul(b.mul(3))));
          const isDebris = id.mod(9).lessThan(1);
          const ballisticSpeed = u.debrisRange.mul(9.81).sqrt().mul(b.mul(0.55).add(0.5));
          const fireSpeed = u.blastRadius.div(max(u.blastDuration, 1)).mul(b.mul(3).add(1.5));
          const speed = isDebris.select(ballisticSpeed, fireSpeed);
          const gasDirection=radial.mul(float(1).sub(c.mul(c)).sqrt()).add(vec3(0,c.mul(1.25),0));
          const debrisDirection=radial.add(vec3(0,c.mul(1.4).add(.3),0));
          v.assign(isDebris.select(debrisDirection,gasDirection).mul(speed));
          s.y.assign(u.blastDuration.mul(b.mul(0.6).add(0.65)));
        } else {
          p.assign(vec3(u.nozzle.x, 0.4, u.nozzle.z).add(radial.mul(b.mul(6).add(3))));
          const impulseSpeed = u.dust.sqrt().mul(18).add(5);
          v.assign(radial.mul(impulseSpeed.mul(c.mul(0.7).add(0.7))).add(vec3(0, 1.5 + 0.8, 0)));
          s.y.assign(b.mul(3).add(4));
        }
        // Uniform birth time within this compute interval avoids discrete exhaust disks at 30 Hz.
        // The subsequent full step leaves each newborn with its correct fractional-step flight.
        const fraction=hash(id.add(s.z.mul(17.77)).add(u.time.mul(9.1)));
        p.addAssign(v.mul(u.dt).mul(fraction.sub(1)));
        // Inputs describe the emitter at the END of this interval. Reconstruct
        // its earlier birth position; otherwise km/s vehicle motion sprays fire ahead.
        if(engineField||name==='reentry')p.subAssign(u.velocity.mul(u.dt).mul(fraction));
        s.x.assign(fraction.mul(u.dt));
      });
      If(s.w.greaterThan(0.5), () => {
        if (engineField) {
          v.addAssign(vec3(sin(s.x.mul(24).add(id)).mul(6).add(1.2), -2, cos(s.x.mul(23).add(id)).mul(6)).mul(u.dt));
          v.mulAssign(max(0, float(1).sub(u.dt.mul(0.12))));
          p.addAssign(v.mul(u.dt));
          If(p.y.lessThan(.7),()=>{p.y.assign(.7);const speed=v.y.abs();v.z.addAssign(p.z.greaterThan(0).select(speed.mul(.6),speed.mul(-.6)));v.x.mulAssign(.7);v.y.assign(speed.mul(.045));s.y.assign(min(s.y,s.x.add(.18)));});
        } else if (name === 'steam') {
          If(id.mod(16).lessThan(5),()=>{
            v.y.subAssign(u.dt.mul(9.81));v.x.addAssign(u.dt.mul(.6));
            p.addAssign(v.mul(u.dt));If(p.y.lessThan(.65),()=>{s.w.assign(0);});
          }).Else(()=>{
            // Channelized outflow develops large rolling billows beyond the trench.
            If(s.x.lessThan(1.3),()=>{v.x.mulAssign(.88);v.y.assign(.7);}).Else(()=>{
              v.y.addAssign(u.dt.mul(hash(id.add(66)).mul(.65).add(.45)));
              v.x.addAssign(sin(p.z.mul(.085).add(u.time.mul(.55))).mul(2.4).add(2.2).mul(u.dt));
              v.y.addAssign(sin(p.z.mul(.12).sub(u.time.mul(.85))).mul(u.dt).mul(.4));
              v.z.addAssign(cos(p.y.mul(.16).add(p.x.mul(.07)).sub(u.time.mul(.7))).mul(u.dt).mul(3.4));
            });
            v.mulAssign(max(0,float(1).sub(u.dt.mul(.14))));p.addAssign(v.mul(u.dt));p.y.assign(max(.72,p.y));
          });
        } else if (name === 'reentry') {
          v.x.addAssign(sin(id.add(s.x.mul(40))).mul(u.dt).mul(25));
          v.z.addAssign(cos(id.add(s.x.mul(34))).mul(u.dt).mul(25));
          p.addAssign(v.mul(u.dt));
        } else if (name === 'explosion') {
          If(id.mod(9).lessThan(1), () => {
            v.y.subAssign(u.dt.mul(9.81));
            p.addAssign(v.mul(u.dt));
            If(p.y.lessThan(0.5), () => { p.y.assign(0.5); v.y.assign(v.y.abs().mul(0.23)); v.xz.mulAssign(0.65); });
          }).Else(() => {
            v.mulAssign(max(0, float(1).sub(u.dt.mul(0.35))));
            v.y.addAssign(u.dt.mul(4.6));
            v.x.addAssign(sin(p.z.mul(.09).add(s.x)).mul(u.dt).mul(5));
            v.z.addAssign(cos(p.x.mul(.09).add(s.x)).mul(u.dt).mul(5));
            p.addAssign(v.mul(u.dt));
          });
        } else {
          v.mulAssign(max(0, float(1).sub(u.dt.mul(0.35))));
          v.x.addAssign(u.dt.mul(1.4));
          v.y.addAssign(u.dt.mul(0.22));
          p.addAssign(v.mul(u.dt));
          p.y.assign(max(0.4, p.y));
        }
      });
    })().compute(count);
    const age = state.toAttribute().x.div(max(state.toAttribute().y, 0.001)).clamp(0, 1);
    const active = state.toAttribute().w;
    const circle = uv().sub(0.5).length().mul(2);
    const feather = float(1).sub(smoothstep(0.05, 1, circle));
    const lifeFade = float(1).sub(age).mul(smoothstep(0, 0.08, age));
    const tile=hash(float(instanceIndex).add(137)).mul(15.999).floor();
    const atlasUV=uv().mul(.984).add(.008).add(vec2(tile.mod(4),tile.div(4).floor())).div(4);
    const cloud=texture(this.cloudAtlas,atlasUV);
    const cloudDensity=cloud.a;
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, alphaTest:name==='reentry'||engineField?.00001:.003, blending: engineField || name === 'reentry' ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.positionNode = position.toAttribute();
    const rotation=hash(float(instanceIndex).add(44)).mul(Math.PI*2).add(state.toAttribute().x.mul(name==='explosion'?.35:.065));
    mat.rotationNode=rotation;
    const normal=texture(this.cloudNormal,atlasUV).rgb.mul(2).sub(1);
    const rotatedNormal=vec3(normal.x.mul(cos(rotation)).sub(normal.y.mul(sin(rotation))),normal.x.mul(sin(rotation)).add(normal.y.mul(cos(rotation))),normal.z);
    const sunlight=max(0,dot(rotatedNormal,cameraViewMatrix.mul(vec4(u.sun,0)).xyz));
    const volumeLight=vec3(.32,.41,.54).add(vec3(.95,.85,.68).mul(sunlight.mul(.90).add(.25))).mul(cloud.r.pow(1.3).mul(.85).add(.22));
    let color, scale, opacity;
    if (engineField) {
      color = upper?mix(vec3(1.4,2.4,4.0),vec3(.14,.23,.9),age):mix(vec3(3.0,2.15,.95), vec3(1.25,0.20,0.012), age);
      scale = age.mul(7.5).mul(u.expansion).add(.38);
      opacity = cloudDensity.mul(lifeFade).mul(upper?.0011:.0018);
    } else if (name === 'steam') {
      const droplet=float(instanceIndex).mod(16).lessThan(5);
      const billow=float(instanceIndex).mod(64).equal(5);
      color=volumeLight.mul(1.55);
      const ignitionLight=u.plume.mul(260).div(position.toAttribute().sub(u.nozzle).length().pow(2).add(45)).clamp(0,1.3);
      color=color.add(vec3(1.35,.54,.13).mul(ignitionLight));
      color=droplet.select(vec3(.82,1.02,1.16).add(vec3(1,.5,.2).mul(ignitionLight)),color);
      const variation=hash(float(instanceIndex).add(66)).mul(.7).add(.65);
      scale=billow.select(age.mul(38).add(3.4),age.mul(9).add(1.3)).mul(variation);
      opacity=droplet.select(feather.mul(lifeFade).mul(.42),cloudDensity.mul(lifeFade).mul(billow.select(float(.26),float(.012))));
      mat.scaleNode=droplet.select(vec2(.060,.31),vec2(scale.mul(1.15),scale.mul(.72)));
    } else if (name === 'reentry') {
      color = vec3(u.heatColor).mul(2.2).mul(float(1).sub(age.mul(0.7)));
      scale = age.mul(4.5).add(1.8);
      opacity = cloudDensity.mul(lifeFade).mul(0.028).mul(u.thermalGain);
    } else if (name === 'explosion') {
      const debris = float(instanceIndex).mod(9).lessThan(1);
      color=mix(vec3(4.2,1.35,.10).mul(cloud.r.mul(.8).add(.35)),volumeLight.mul(.19),smoothstep(.02,.38,age));
      scale = debris.select(float(1.5), u.blastRadius.mul(0.10).mul(age.mul(2).add(0.3)));
      opacity=debris.select(float(0),cloudDensity.mul(lifeFade).mul(.27));
    } else {
      color=mix(vec3(.40,.31,.20),vec3(.64,.52,.34),age).mul(volumeLight);
      scale = age.mul(11).add(2);
      opacity=cloudDensity.mul(lifeFade).mul(.019);
    }
    mat.colorNode = color;
    mat.opacityNode = opacity.mul(active);
    if(name!=='steam')mat.scaleNode=vec2(scale);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.count = count; mesh.frustumCulled = false; mesh.renderOrder = engineField ? 4 : 2;
    mesh.name = `GPU ${name} / ${count}`; scene.add(mesh);
    if(name==='explosion'){
      // Solid spinning plate fragments reuse the explosion field's ballistic particles.
      const index=instanceIndex.mul(9),ps=position.element(index),ss=state.element(index);
      const spin=vec3(hash(float(index)),hash(float(index).add(31)),hash(float(index).add(72))).mul(ss.x.mul(4).add(1));
      const size=hash(float(index).add(101)).mul(.7).add(.22).mul(u.blastRadius.div(140).clamp(.5,2));
      const debrisMaterial=new THREE.MeshStandardNodeMaterial({color:'#465052',metalness:.7,roughness:.52,transparent:true,side:THREE.DoubleSide});
      debrisMaterial.positionNode=rotate(positionGeometry.mul(size),spin).add(ps);
      debrisMaterial.normalNode=cameraViewMatrix.mul(vec4(rotate(normalGeometry,spin),0)).xyz;
      debrisMaterial.opacityNode=ss.w.mul(float(1).sub(smoothstep(.80,1,ss.x.div(max(ss.y,.01)))));
      debrisMaterial.emissiveNode=vec3(2.4,.24,.015).mul(float(1).sub(smoothstep(.2,2.5,ss.x)));
      const fragments=new THREE.Mesh(new THREE.BoxGeometry(1,.065,.63),debrisMaterial);
      fragments.count=Math.ceil(count/9);fragments.frustumCulled=false;fragments.name='GPU ballistic metal fragments';scene.add(fragments);this.fragments=fragments;
    }
    return { position, velocity, state, init, update, mesh, count };
  }
  async init() { await this.renderer.computeAsync(Object.values(this.fields).map(f => f.init)); }
  reset() {
    this.renderer.compute(Object.values(this.fields).map(f => f.init));
    this.dispatches = Object.fromEntries(Object.keys(this.fields).map(n => [n, 0])); this.simulatedTime = 0;
  }
  step(sim, dt) {
    const u = this.u;
    u.dt.value = dt; u.time.value = sim.t;
    const q=new THREE.Quaternion().fromArray(sim.attitude);
    u.center.value.set(sim.x, sim.y, sim.z);
    u.direction.value.set(0,-1,0).applyQuaternion(q);
    u.nozzle.value.set(0,-35.9,0).applyQuaternion(q).add(u.center.value);
    u.side.value.set(1,0,0).applyQuaternion(q);u.binormal.value.set(0,0,1).applyQuaternion(q);
    u.velocity.value.set(sim.vx, sim.vy, sim.vz);
    const emitter=(body,e,prefix,i,exitOffset)=>{
     const nozzle={value:u[prefix+'Nozzle'].array[i]},direction={value:u[prefix+'Direction'].array[i]},side={value:u[prefix+'Side'].array[i]},binormal={value:u[prefix+'Binormal'].array[i]},velocity={value:u[prefix+'Velocity'].array[i]};
     u[prefix+'Parameters'].array[i].set(e.emission||0,e.exhaust.halfAngle,e.exhaust.expansion);
     const attitude=new THREE.Quaternion().fromArray(body.attitude),gimbal=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...e.direction)),rotation=attitude.clone().multiply(gimbal);
     const offset=new THREE.Vector3(...e.position).add(new THREE.Vector3(0,-exitOffset,0).applyQuaternion(gimbal)).applyQuaternion(attitude);
     nozzle.value.copy(offset).add(new THREE.Vector3(body.x,body.y,body.z));direction.value.set(0,-1,0).applyQuaternion(rotation);side.value.set(1,0,0).applyQuaternion(rotation);binormal.value.set(0,0,1).applyQuaternion(rotation);
     velocity.value.set(body.vx,body.vy,body.vz).add(new THREE.Vector3(...body.angularVelocity).applyQuaternion(attitude).cross(offset));
    };
    sim.engines.forEach((e,i)=>emitter(sim,e,'engine',i,VEHICLE.boosterExit));
    u.expansion.value=sim.nozzleExpansion;u.halfAngle.value=sim.exhaust.halfAngle;
    const stage=sim.upper;if(stage){sim.upperEngines.forEach((e,i)=>emitter(stage,e,'ship',i,VEHICLE.shipExit));u.upperExpansion.value=stage.exhaust?.expansion||1;u.upperHalfAngle.value=stage.exhaust?.halfAngle||.1;}
    else u.shipParameters.array.forEach(v=>v.set(0,0,1));
    // False-color thermography gain is explicit: this suborbital flight does not produce orbital plasma.
    const heatT = Math.max(0, Math.min(1, (sim.skinTemperature - 450) / 500));
    u.heatColor.value.setRGB(1.0, 0.13 + heatT * 0.62, 0.015 + heatT * heatT * 0.3);
    for (const n of Object.keys(this.fields)) u[n].value = sim.fields[n].emission;
    const td = sim.touchdown;
    u.blastAge.value = td && !td.success ? sim.t - sim.terminalAt : -1;
    u.blastRadius.value = td?.blastRadius || 0;
    u.blastDuration.value = td?.blastDuration || 1;
    u.debrisRange.value = td?.debrisRange || 0;
    u.impact.value.set(td?.x || 0, 0, td?.z||0);
    const upperTD=sim.upper?.touchdown;u.upperBlastAge.value=upperTD?sim.t-upperTD.t:-1;u.upperBlastRadius.value=upperTD?.blastRadius||0;u.upperBlastDuration.value=upperTD?.blastDuration||1;u.upperDebrisRange.value=upperTD?.debrisRange||0;u.upperImpact.value.set(upperTD?.x||0,upperTD?.impactY||0,upperTD?.z||0);
    this.renderer.compute(Object.values(this.fields).map(f => f.update));
    for (const n of Object.keys(this.fields)) this.dispatches[n]++;
    this.simulatedTime += dt;
  }
  async evidence() {
    const fields = {};
    for (const [name, f] of Object.entries(this.fields)) {
      const positions = new Float32Array(await this.renderer.getArrayBufferAsync(f.position.value));
      const velocities = new Float32Array(await this.renderer.getArrayBufferAsync(f.velocity.value));
      const states = new Float32Array(await this.renderer.getArrayBufferAsync(f.state.value));
      let checksum = 0, velocityChecksum = 0, stateChecksum = 0, active = 0, finite = true, generationTotal = 0;
      for (let i = 0; i < positions.length; i++) { finite &&= Number.isFinite(positions[i]); checksum += positions[i] * ((i % 17) + 1); }
      for (let i = 0; i < velocities.length; i++) { finite &&= Number.isFinite(velocities[i]); velocityChecksum += velocities[i] * ((i % 13) + 1); }
      for (let i = 0; i < states.length; i++) { finite &&= Number.isFinite(states[i]); stateChecksum += states[i] * ((i % 11) + 1); }
      for (let i = 0; i < f.count; i++) { active += states[i * 4 + 3] > 0.5 ? 1 : 0; generationTotal += states[i * 4 + 2]; }
      const emitterCount=name==='plume'?33:name==='upperPlume'?6:0;
      const emitters=emitterCount?Object.fromEntries(Array.from({length:emitterCount},(_,engine)=>{let active=0,generations=0;for(let i=engine;i<f.count;i+=emitterCount){active+=states[i*4+3]>.5?1:0;generations+=states[i*4+2];}return [(name==='plume'?'B':'S')+(engine+1),{active,generations}];})):undefined;
      fields[name] = { count: f.count, dispatches: this.dispatches[name], active, generationTotal, positionChecksum: checksum, velocityChecksum, stateChecksum, finite,emitters };
    }
    return { backend: this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'unsupported', simulatedTime: this.simulatedTime, fields };
  }
}

