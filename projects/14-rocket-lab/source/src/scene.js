import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUFields } from './effects.js';
import { CONSTANTS, clamp } from './physics.js';
import { createSurfaces } from './surfaces.js';
import { enrichFacility, enrichRocket, batchStatic } from './details.js';
import { Cinematic } from './cinematic.js';
import { validateFirstFrame } from './render-health.js';
import { buildStarship, CatchTower } from './starship-model.js';
import { LaunchRange } from './launch-range.js';
import { ThermalView } from './thermal.js';
import {buildCoastalGround,buildEarth} from './coastal-world.js';
import { buildPlanet, buildRecoverySite } from './orbital-world.js';
import { positionWorld, mx_noise_float, vec3, mix, smoothstep, texture, normalWorld } from 'three/tsl';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const terrainNoise=(x,z)=>{
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
  const h=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return (n-Math.floor(n))*2-1;};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iz),h(ix+1,iz),sx),THREE.MathUtils.lerp(h(ix,iz+1),h(ix+1,iz+1),sx),sz);
};
// Both stages meet at one shared plane; payload-local geometry uses the same datum.
const STACK = Object.freeze({ interstageBottom: 13, jointY: 17.7, payloadOriginY: 38, payloadCylinderTop: 24.7 });
export class FlightScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#9aadb2');
    this.scene.fog = new THREE.FogExp2('#bac4c7', 0.000038);
    this.camera = new THREE.PerspectiveCamera(36, 1, 12, 20000000);
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 14; this.controls.maxDistance = 2000000;
    this.controls.maxPolarAngle = Math.PI * 0.93;
    this.mode = 'launch'; this.autoCamera = true; this.lastAutoPhase = '';
    this.maps=createSurfaces();this.heatDose=0;
    this.materials = {
      shell: new THREE.MeshStandardMaterial({ color: '#e2e8df', roughness: 0.38, metalness: 0.35 }),
      metal: new THREE.MeshStandardMaterial({ color: '#708581', roughness: 0.45, metalness: 0.66 }),
      steel: new THREE.MeshStandardMaterial({ color: '#a6b3a8', roughness: 0.54, metalness: 0.55 }),
      dark: new THREE.MeshStandardMaterial({ color: '#25312e', roughness: 0.58, metalness: 0.38 }),
      black: new THREE.MeshStandardMaterial({ color: '#101c1a', roughness: 0.7, metalness: 0.27 }),
      orange: new THREE.MeshStandardMaterial({ color: '#eb6b2a', roughness: 0.53, metalness: 0.2 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#9ba394', roughness: 0.97 }),
      pale: new THREE.MeshStandardMaterial({ color: '#d2d1bb', roughness: 0.97 }),
      road: new THREE.MeshStandardMaterial({ color: '#68796c', roughness: 1 }),
      line: new THREE.MeshBasicMaterial({ color: '#ddd8b9' }),
      nozzle: new THREE.MeshStandardMaterial({ color: '#443d32', roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide })
    };
    this.applySurfaceMaps();
    this.buildLights(); this.buildGround(); this.buildFacility(); this.buildRocket();
    buildEarth(this);buildRecoverySite(this);
    enrichFacility(this);
    this.range = new LaunchRange(this);
    this.landingGear = new CatchTower(this);
    this.legs = this.landingGear.assemblies.map(gear => gear.root);
    const skips=new Set([this.rocket,this.landingGear.root,this.planet,this.earthClouds,this.atmosphereRim,this.umbilical,this.trail,this.range.waterJets,this.range.wetDeck,this.range.basin,...this.arms,...this.launchSupports.map(x=>x.mesh)]);
    this.batchedDrawsSaved=batchStatic(this.scene,skips);
    for(const arm of this.arms)this.batchedDrawsSaved+=batchStatic(arm);
    for(const group of [...this.fins,...this.enginePods,...this.upperEnginePods])this.batchedDrawsSaved+=batchStatic(group);
    this.batchedDrawsSaved += this.landingGear.batch(batchStatic);
    this.batchedDrawsSaved += batchStatic(this.range.waterJets);
    this.batchedDrawsSaved+=batchStatic(this.rocket,new Set([this.bodyMesh,this.interstageShell,this.payloadGroup,this.engines,...this.fins,...this.legs]));
    this.effects = new GPUFields(this.renderer, this.scene, this.maps.cloud, this.maps.cloudNormal);
    this.cinematic=new Cinematic(this);
    this.thermal=new ThermalView(this);
    this.setCamera('launch');
    new ResizeObserver(() => this.resize()).observe(container); this.resize();
  }
  applySurfaceMaps(){
    const tiled=(texture,x,y=x)=>{const t=texture.clone();t.repeat.set(x,y);return t;};
    for(const name of ['metal','steel','nozzle']){this.materials[name].map=tiled(this.maps.steel,1,2);this.materials[name].normalMap=tiled(this.maps.steelNormal,1,2);this.materials[name].normalScale=new THREE.Vector2(.20,.20);}
    this.materials.concrete.map=tiled(this.maps.concrete,3);this.materials.concrete.normalMap=tiled(this.maps.concreteNormal,3);this.materials.concrete.normalScale=new THREE.Vector2(.48,.48);this.materials.concrete.color.set('#dad9d2');
    this.materials.road.map=tiled(this.maps.asphalt,6);this.materials.road.normalMap=tiled(this.maps.asphaltNormal,6);this.materials.road.color.set('#b6bbc0');
    this.materials.dark.map=tiled(this.maps.carbon,12);this.materials.dark.normalMap=tiled(this.maps.carbonNormal,12);this.materials.dark.normalScale=new THREE.Vector2(.12,.12);this.materials.dark.color.set('#9aa6ad');
    this.materials.shell.color.set('#eef0e8');this.materials.shell.roughness=.42;this.materials.shell.metalness=.28;
    this.materials.upperShell=this.materials.shell.clone();this.materials.upperShell.map=this.maps.upper;this.materials.upperShell.roughness=.55;
  }
  box(parent, sx, sy, sz, x, y, z, material = 'steel') {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), typeof material === 'string' ? this.materials[material] : material);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  cylinder(parent, rt, rb, h, x, y, z, material, segments = 32, open = false) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments, 1, open), this.materials[material]);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  rod(parent, start, end, radius = 0.12, material = 'steel') {
    const delta = end.clone().sub(start);
    const o = this.cylinder(parent, radius, radius, delta.length(), 0, 0, 0, material, 8);
    o.position.copy(start).add(end).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(v(0, 1, 0), delta.normalize()); return o;
  }
  ring(parent, radius, tube, x, y, z, material = 'metal') {
    const o = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 64), this.materials[material]);
    o.rotation.x = Math.PI / 2; o.position.set(x, y, z); parent.add(o); return o;
  }
  label(text, width = 512, height = 128, color = '#d3d8c9', background = null) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d');
    if (background) { c.fillStyle = background; c.fillRect(0, 0, width, height); }
    c.fillStyle = color; c.font = `600 ${Math.round(height * 0.52)}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#bbd4ed', '#746957', 0.67));
    this.sun = new THREE.DirectionalLight('#ffe2ba', 4.0); this.sun.position.set(-120,92,155); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096); Object.assign(this.sun.shadow.camera, { left: -145, right: 145, top: 145, bottom: -145, near: 0.5, far: 720 });
    this.sun.shadow.bias = -0.00035; this.sun.shadow.normalBias=.14; this.scene.add(this.sun);this.scene.add(this.sun.target);
    this.engineLight = new THREE.PointLight('#ff7024', 0, 140, 1.6); this.scene.add(this.engineLight);
    this.blastLight = new THREE.PointLight('#ff9b31', 0, 1000, 1.3); this.scene.add(this.blastLight);
    this.trenchLights=[-18,18].map(z=>{const light=new THREE.PointLight('#ffb16a',0,115,2);light.position.set(0,3,z);this.scene.add(light);return light;});
  }
  buildGround(){buildCoastalGround(this);}
  buildFacility() {
    const s = this.scene;
    this.cylinder(s, 33, 35, 0.7, 0, 0.0, 0, 'dark', 12);
    this.ring(s, 27, 0.18, 0, 0.38, 0, 'pale');
    this.ring(s, 28.5, 0.09, 0, 0.4, 0, 'orange');
    this.ring(s, 8.4, 0.16, 0, 0.42, 0, 'pale');
    for (const k of [-1, 1]) {
      this.box(s, 6.2, 0.25, 24, 0, 0.42, k * 14, 'black');
      for (const x of [-3.8, 3.8]) {
        this.box(s, 1.25, 2.9, 21, x, 1, k * 15, 'concrete');
        this.box(s, 1.5, 0.16, 22, x, 2.45, k * 15, 'pale');
      }
      this.box(s, 4.5, 0.3, 0.5, 0, 0.54, k * 27, 'orange');
    }
    const landingText = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), this.label('L C — 0 1'));
    landingText.rotation.x = -Math.PI / 2; landingText.position.set(0, 0.4, 20); s.add(landingText);
    this.launchSupports = [];
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      this.launchSupports.push({ mesh: this.box(s, 2.3, 2.5, 2.3, Math.cos(angle) * 5, 1.2, Math.sin(angle) * 5, 'metal'), angle });
      const light = this.box(s, 0.5, 0.2, 0.5, Math.cos(angle) * 28, 0.6, Math.sin(angle) * 28, 'orange');
      light.material = new THREE.MeshStandardMaterial({ color: '#f4bd4f', emissive: '#f4b942', emissiveIntensity: 1.5 });
    }
    this.ring(s, 3.1, 0.45, 0, 2.2, 0, 'metal');
    this.tower = new THREE.Group(); this.tower.position.set(-27, 0, -17.6);this.tower.scale.setScalar(2.2); s.add(this.tower);
    this.box(this.tower, 13, 2, 13, 0, 0.5, 0, 'concrete');
    for (const x of [-4, 4]) for (const z of [-4, 4]) this.box(this.tower, 0.85, 54, 0.85, x, 28, z, 'steel');
    for (let y = 4; y <= 53; y += 7) {
      for (const z of [-4, 4]) {
        this.rod(this.tower, v(-4, y, z), v(4, y + 7, z), 0.2);
        this.rod(this.tower, v(4, y, z), v(-4, y + 7, z), 0.2);
      }
      for (const x of [-4, 4]) this.rod(this.tower, v(x, y, -4), v(x, y + 7, 4), 0.18);
      this.box(this.tower, 9, 0.42, 9, 0, y, 0, 'metal');
      for (const z of [-4.5, 4.5]) this.rod(this.tower, v(-4.5, y + 1.3, z), v(4.5, y + 1.3, z), 0.09, 'orange');
    }
    this.box(this.tower, 9.8, 2.8, 9.8, 0, 57, 0, 'dark');
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.3), this.label('A S T R A', 512, 128, '#f0e7ce'));
    badge.position.set(0, 57, 4.96); this.tower.add(badge);
    this.rod(this.tower, v(-2, 58, -2), v(-2, 68, -2), 0.12);
    this.arms = [];
    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group(); pivot.position.set(4, 33 + i * 11, 4); this.tower.add(pivot);
      this.box(pivot, 11, 0.7, 2.1, 5.5, 0, 0, 'metal');
      for (const z of [-1, 1]) {
        this.rod(pivot, v(0, 1.4, z), v(10.5, 1.4, z), 0.10, 'orange');
        this.rod(pivot, v(1, -1, z), v(10.5, 0, z), 0.16);
        for (let x = 1; x < 11; x += 2) this.rod(pivot, v(x, 0, z), v(x, 1.4, z), 0.08, 'orange');
      }
      this.arms.push(pivot);
    }
    this.umbilical = new THREE.Group(); this.umbilical.position.set(-10, 15, 0); s.add(this.umbilical);
    this.rod(this.umbilical, v(0, 0, 0), v(8.2, 0, 0), 0.23, 'orange');
    this.rod(s, v(-10, 0, 0), v(-10, 15, 0), 0.2, 'orange');
    // Ground water headers and opposed trench spray manifolds.
    for (const x of [-8, 8]) {
      this.rod(s, v(x, 0.8, -26), v(x, 0.8, 26), 0.18, 'steel');
      for (let z = -20; z <= 20; z += 5) this.rod(s, v(x, 0.8, z), v(x * 0.8, 1.5, z), 0.10, 'metal');
    }
    for (let i = 0; i < 3; i++) {
      const x = -67 + i * 15;
      this.cylinder(s, 5.5, 5.5, 15, x, 7, -47, 'shell');
      this.cylinder(s, 0.5, 5.5, 3, x, 16, -47, 'metal');
      this.ring(s, 5.55, 0.11, x, 11, -47, 'orange');
      this.rod(s, v(x, 2, -41.5), v(x, 2, -18), 0.32, 'orange');
    }
    this.box(s, 28, 5, 14, -60, 2.2, 43, 'shell');
    this.box(s, 29, 0.6, 15, -60, 5.1, 43, 'dark');
    for (let x = -70; x < -49; x += 5) this.box(s, 3.5, 1.5, 0.1, x, 3.2, 50.1, 'dark');
    for (let z = -95; z <= 85; z += 9) {
      this.rod(s, v(-110, 0, z), v(-110, 3, z), 0.08);
      if (z < 85) this.rod(s, v(-110, 2.6, z), v(-110, 2.6, z + 9), 0.045);
    }
    this.ring(s,7.7,1.1,0,16.5,0,'metal');this.ring(s,7.8,.4,0,18.2,0,'metal');
    for(let n=0;n<6;n++){const a=n*Math.PI/3;this.cylinder(s,1.1,1.8,15.5,Math.cos(a)*7.6,7.8,Math.sin(a)*7.6,'concrete',16);this.rod(s,v(Math.cos(a)*9.5,0,Math.sin(a)*9.5),v(Math.cos(a)*7.6,17,Math.sin(a)*7.6),.36,'steel');}
    // Tall utility poles define the scale without external assets.
    for (const [x, z] of [[54, -55], [55, 42], [-82, 71]]) {
      this.rod(s, v(x, 0, z), v(x, 25, z), 0.16);
      this.box(s, 4.5, 0.5, 1, x, 25, z, 'dark');
    }
  }
  buildRocket(){buildStarship(this);}
  async init(sim) {
    if (!navigator.gpu) throw new Error('此浏览器未开放 WebGPU。请使用支持 WebGPU 的 Chrome / Edge，并通过 localhost 或 HTTPS 打开。');
    await this.renderer.init();
    if (!this.renderer.backend.isWebGPUBackend) throw new Error('未获得 WebGPU 适配器；本项目不会把 WebGL 回退标记为 GPU compute 验证成功。');
    this.gpuErrors=[];this.renderHealth={validated:false};
    this.renderer.backend.device.addEventListener('uncapturederror',event=>{this.gpuErrors.push(event.error.message);this.onFailure?.(new Error(event.error.message));});
    const deviceLost=this.renderer.onDeviceLost.bind(this.renderer);
    this.renderer.onDeviceLost=info=>{deviceLost(info);this.onFailure?.(new Error(`WebGPU 设备连接已丢失：${info.message}`));};
    await this.effects.init();await this.cinematic.init(); await this.renderer.compileAsync(this.scene, this.camera);
    this.update(sim);this.renderHealth=await validateFirstFrame(this,sim);
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.camera.aspect = Math.max(1, width) / Math.max(1, height); this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  }
  setCamera(mode, sim = null) {
    this.mode = mode;
    this.camera.fov=36;
    const y = sim?.y || CONSTANTS.contactHeight, x = sim?.x || 0, z=sim?.z||0;
    if (mode === 'launch') { this.camera.position.set(-235,135,295); this.controls.target.set(-4,75,0);this.camera.fov=39; }
    if (mode === 'follow') { this.camera.position.set(x - 310, y + 20, z+570); this.controls.target.set(x, y-88, z);this.camera.fov=42; }
    if (mode === 'entry') { this.camera.position.set(x + 90, y + 95, z+160); this.controls.target.set(x, y, z);this.camera.fov=42; }
    if (mode === 'landing') {const targetX=sim?.separationAt!==null&&sim?.separationAt!==undefined?x:CONSTANTS.landingX;this.camera.position.set(targetX + 170,100,z+220);this.controls.target.set(targetX,Math.min(y,90),z);}
    if (mode === 'inspect') { this.camera.position.set(x+33,y+8,z+55); this.controls.target.set(x,y+3,z);this.camera.fov=42; }
    if (mode === 'pad') { this.camera.position.set(36,8,54);this.controls.target.set(x,y+32,z);this.camera.fov=64; }
    if (mode === 'range') { this.camera.position.set(970,1000,1450);this.controls.target.set(360,10,-75);this.camera.fov=44; }
    if (mode === 'telephoto') { this.camera.position.set(470,28,735);this.controls.target.set(x,y+5,z);this.camera.fov=8; }
    if (mode === 'upper') { const p=sim?.upper;this.camera.position.set((p?.x||x)+200,(p?.y||y)-5,(p?.z||z)+350);this.controls.target.set(p?.x||x,(p?.y||y)-65,p?.z||z);this.camera.fov=44; }
    if (mode === 'separation') { this.camera.position.set(x+200,y+60,z+370);this.controls.target.set(x,y+20,z);this.camera.fov=44; }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  reset() {
    this.rocket.visible = true;
    this.heatDose=0;
    this.landingGear.reset();
    this.range.update({t:0});this.ascentCameraSwitched=false;this.separationCameraUntil=0;
    this.rocket.add(this.payloadGroup); this.payloadGroup.position.set(0, STACK.payloadOriginY, 0); this.payloadGroup.rotation.set(0, 0, 0); this.payloadGroup.visible = true; this.payloadState = null;
    this.trailCount = 0; this.trail.visible = false; this.trailGeometry.setDrawRange(0, 0); this.effects.reset(); this.lastAutoPhase = ''; this.setCamera('launch');
  }
  physicsStep(sim, dt) {
    if(['ENTRY','LANDING'].includes(sim.phase))this.heatDose+=sim.heatFlux*dt;
    if (sim.upper && !this.payloadState) {this.scene.attach(this.payloadGroup);this.payloadState=sim.upper;}
    if (sim.upper) this.updateUpper(sim);
    if (sim.tick % 40 === 0 && this.trailCount < 3000 && !sim.terminal) {
      this.trailArray.set([sim.x, sim.y, sim.z], this.trailCount * 3); this.trailCount++;
      this.trail.visible = this.trailCount > 1;
      this.trailGeometry.attributes.position.needsUpdate = true; this.trailGeometry.setDrawRange(0, this.trailCount);
    }
  }
  updateUpper(sim){
    const p=sim.upper;if(!p)return;this.payloadState=p;
    this.payloadGroup.quaternion.fromArray(p.attitude);
    this.payloadGroup.position.set(p.x,p.y,p.z).add(v(0,-CONSTANTS.upperCOM,0).applyQuaternion(this.payloadGroup.quaternion));
    this.upperEnginePods.forEach((pod,i)=>pod.quaternion.setFromUnitVectors(v(0,1,0),v(...sim.upperEngines[i].direction)));
    this.payloadGroup.visible=!p.touchdown;
  }
  update(sim) {
    this.earthTime.value=sim.t;this.earthClouds.visible=sim.altitude>10000;
    this.rocket.position.set(sim.x, sim.y, sim.z); this.rocket.quaternion.fromArray(sim.attitude);
    this.enginePods.forEach((pod,i)=>pod.quaternion.setFromUnitVectors(v(0,1,0),v(...sim.engines[i].direction)));
    this.updateUpper(sim);
    const shadowY=Math.max(0,sim.altitude-70);this.sun.target.position.set(sim.x,shadowY,sim.z);this.sun.position.set(sim.x-120,shadowY+92,sim.z+155);
    this.rocket.visible = sim.phase !== 'CRASHED';
    this.upperEngineLight.intensity=(sim.upper?.thrust||0)/CONSTANTS.upperThrust*1300;
    this.arms.forEach((arm, i) => { arm.rotation.y = -clamp((sim.t - i * 1.5) / 1.5, 0, 1) * Math.PI * 0.6; });
    this.umbilical.scale.x = 1 - clamp((sim.t - 3.4) / 0.9, 0, 1) * 0.90;
    // Retract the launch supports beyond the complete landing-shoe footprint.
    this.launchSupports.forEach(({mesh, angle}) => { const radius = 5 + 9 * clamp((sim.t - 8) / 2, 0, 1); mesh.position.x = Math.cos(angle) * radius; mesh.position.z = Math.sin(angle) * radius; });
    this.fins.forEach(fin => { fin.rotation.z = sim.finsDeployed ? sim.finDeflection : 0; });
    this.landingGear.update(sim);
    this.range.update(sim);
    this.engineLight.position.copy(this.rocket.position).add(v(0,-35.9,0).applyQuaternion(this.rocket.quaternion));
    this.engineLight.intensity = sim.thrust / CONSTANTS.thrustSL * 6800;
    this.trenchLights.forEach(light=>{light.intensity=sim.thrust/CONSTANTS.thrustSL*12500*Math.exp(-Math.max(0,sim.y-19)/36);});
    const explosionAge = sim.terminalAt !== null ? sim.t - sim.terminalAt : 999;
    this.blastLight.position.set(sim.touchdown?.x || 0, 7, sim.touchdown?.z || 0);
    this.blastLight.intensity = sim.phase === 'CRASHED' ? 28000 * (sim.touchdown.blastScale / 10) * Math.exp(-explosionAge * 2) : 0;
    this.scene.fog.color.set('#bbc7cd');
    const observedAltitude=this.mode==='upper'?(sim.upper?.altitude||sim.altitude):sim.altitude;
    this.scene.fog.density=.000038*Math.exp(-observedAltitude/8000);
    this.atmosphereRim.visible=observedAltitude>18000;this.surfaceDetail.value=clamp((30000-observedAltitude)/15000,0,1);
    if (this.autoCamera && this.lastAutoPhase !== sim.phase) {
      if (sim.phase === 'ASCENT') this.ascentCameraSwitched=false;
      if (sim.phase === 'SEPARATION') {this.setCamera('separation',sim);this.separationCameraUntil=sim.t+12;}
      if (sim.phase === 'BOOSTBACK') this.setCamera('follow',sim);
      if (sim.phase === 'ENTRY') this.setCamera('entry', sim);
      if (sim.phase === 'LANDING') this.setCamera('follow', sim);
      if (sim.phase === 'CRASHED') {this.setCamera('landing',sim);this.camera.position.set(sim.x+170,95,sim.z+220);this.controls.target.set(sim.x,20,sim.z);}
      if (sim.phase === 'LANDED') this.setCamera('landing', sim);
      this.lastAutoPhase = sim.phase;
    }
    if(this.autoCamera&&sim.phase==='ASCENT'&&!this.ascentCameraSwitched){
      if(sim.altitude>100){this.setCamera('follow',sim);this.ascentCameraSwitched=true;}
      else if(this.mode==='launch')this.controls.target.set(-4,75+sim.altitude*.52,0);
    }
    if(this.mode==='telephoto')this.controls.target.set(sim.x,sim.y+5,sim.z);
    if(this.mode==='upper'&&sim.upper){const target=v(0,-65,0).applyQuaternion(this.payloadGroup.quaternion).add(v(sim.upper.x,sim.upper.y,sim.upper.z)),delta=target.clone().sub(this.controls.target);this.camera.position.add(delta);this.controls.target.copy(target);}
    if(this.mode==='separation'){
      const p=sim.upper,target=v((sim.x+(p?.x||sim.x))*.5,(sim.y+(p?.y||sim.y))*.5,(sim.z+(p?.z||sim.z))*.5),delta=target.clone().sub(this.controls.target);this.camera.position.add(delta);this.controls.target.copy(target);
      if(p){const distance=Math.hypot(p.x-sim.x,p.y-sim.y,p.z-sim.z),required=Math.max(380,distance*1.15);const offset=this.camera.position.clone().sub(target);this.camera.position.copy(target).add(offset.setLength(required));}
      if(this.autoCamera&&sim.t>this.separationCameraUntil)this.setCamera('follow',sim);
    }
    if (this.mode === 'follow' || this.mode === 'entry') {
      const target = v(0,this.mode==='follow'?-88:0,0).applyQuaternion(this.rocket.quaternion).add(v(sim.x,sim.y,sim.z)), delta = target.clone().sub(this.controls.target);
      this.camera.position.add(delta); this.controls.target.copy(target);
    }
    this.controls.update();
    // Keep millimetre shell offsets resolvable while retaining the planetary far plane.
    // A 0.3 m near plane with a 20,000 km far plane caused metal/tiles/ocean z-fighting.
    const near=clamp(this.camera.position.distanceTo(this.controls.target)*.06,1,1000);
    if(Math.abs(near-this.camera.near)>.01){this.camera.near=near;this.camera.updateProjectionMatrix();}
    this.cinematic.update(sim);
    this.thermal.update(sim);
  }
  render(sim) {
    const position = this.camera.position.clone();
    const blast = sim.phase === 'CRASHED' ? Math.exp(-(sim.t - sim.terminalAt) * 1.6) * 1.2 : 0;
    const vibration = (sim.altitude < 80 ? sim.thrust / CONSTANTS.thrustSL * 0.085 : 0) + blast;
    this.camera.position.x += Math.sin(sim.t * 64) * vibration; this.camera.position.y += Math.cos(sim.t * 79) * vibration;
    this.cinematic.render(); this.camera.position.copy(position);
  }
}

