import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { buildPalace } from './palace.js';
import './style.css';

const icons = {
  roof: '<path d="M3 11c4 0 6-3 9-7 3 4 5 7 9 7M5 12h14M7 12v8m10-8v8M4 20h16M10 12v5m4-5v5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sunset: '<path d="M3 17h18M5 21h14M7 17a5 5 0 0 1 10 0M12 3v3M4 9l2 2m14-2-2 2M12 8v5m-2-2 2 2 2-2"/>',
  moon: '<path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z"/>',
  play: '<path d="m9 5 10 7-10 7Z"/>', pause: '<path d="M8 5v14m8-14v14"/>',
  reset: '<path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.querySelector('#app').innerHTML = `
  <div class="viewport" id="viewport" aria-label="中国古典宫城三维场景"></div>
  <div class="vignette" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="天阙宫城，回到全景"><span class="brand-mark">${icon('roof')}</span><span class="brand-name">天阙<span>宫城</span></span><span class="brand-en">TIANQUE<br>IMPERIAL PALACE</span></a>
    <nav class="views" aria-label="选择观景视角"><button class="view-button active" data-view="overview" aria-pressed="true">宫城全景</button><button class="view-button" data-view="axis" aria-pressed="false">中轴俯瞰</button><button class="view-button" data-view="hall" aria-pressed="false">重檐主殿</button><button class="view-button" data-view="garden" aria-pressed="false">园林水榭</button><button class="view-button" data-view="landscape" aria-pressed="false">山河远眺</button></nav>
    <div class="header-right"><span class="edition">中国古典 · 体素建筑</span><button class="icon-button" id="fullscreen" title="全屏观景" aria-label="全屏观景">${icon('expand')}</button></div>
  </header>
  <aside class="scene-info"><p class="eyebrow"><span></span>山河之间 · 宫阙万重</p><h1 id="view-title">一城宫阙</h1><p class="scene-description" id="view-description">沿中轴展开的东方建筑群</p><div class="scene-stats"><div><strong>47.6<small>公顷</small></strong><span>宫城占地</span></div><i></i><div><strong id="building-count">—<small>座</small></strong><span>殿阁楼台</span></div><i></i><div><strong>780<small>米</small></strong><span>南北纵深</span></div></div></aside>
  <div class="scene-coordinate" aria-hidden="true"><span>南门</span><b>北阙</b><span class="coordinate-line"></span></div>
  <div class="bottom-bar"><div class="interaction-hint"><span class="mouse-icon"></span><span>拖动旋转<span class="hint-divider"> / </span>滚轮缩放<span class="hint-divider"> / </span>右键平移</span></div><div class="environment-controls" aria-label="光影与环绕控制"><div class="time-options" role="group" aria-label="选择光影"><button data-time="dawn" class="time-button active" aria-pressed="true">${icon('sun')}<span>晨曦</span></button><button data-time="dusk" class="time-button" aria-pressed="false">${icon('sunset')}<span>日暮</span></button><button data-time="night" class="time-button" aria-pressed="false">${icon('moon')}<span>月夜</span></button></div><span class="control-divider"></span><button class="orbit-button" id="orbit" aria-pressed="false">${icon('play')}<span>环绕</span></button></div><div class="view-utilities"><span class="fps" id="fps" aria-label="实时帧率">— FPS</span><button class="icon-button reset" id="reset" title="恢复当前视角" aria-label="恢复当前视角">${icon('reset')}</button></div></div>
  <div class="compass" aria-hidden="true"><span>N</span><div id="compass-needle"><i></i><b></b></div><small>方位</small></div>
  <div class="loading" id="loading" role="status"><span class="loading-mark">${icon('roof')}</span><span>宫城正在展开</span><small>构筑殿阁与山河</small></div><div class="toast" id="toast" role="status"></div>
`;
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch (error) { document.querySelector('#loading').innerHTML = '<strong>暂时无法打开 3D 场景</strong><p>请使用支持 WebGL 2 的浏览器，并开启硬件加速。</p><button onclick="location.reload()">重新加载</button>'; throw error; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', '可旋转、缩放的中国古典体素宫城'); renderer.domElement.tabIndex = 0;
document.querySelector('#viewport').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x8d9b96, 0.00032);
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 12, 12000);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 95, maxDistance: 5000, maxPolarAngle: Math.PI / 2.17, minPolarAngle: 0.12, panSpeed: 0.8, zoomSpeed: 0.7, rotateSpeed: 0.5, autoRotateSpeed: 0.55 });
controls.target.set(0, 0, 0); camera.position.set(800, 735, 1010);
const hemisphere = new THREE.HemisphereLight(0xc7e4e3, 0x445441, 2.1); scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xffdca4, 3.3); sun.position.set(-380, 490, 330); sun.castShadow = true;
sun.shadow.mapSize.set(window.innerWidth < 600 ? 2048 : 4096, window.innerWidth < 600 ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -690, right: 690, top: 690, bottom: -690, near: 1, far: 2600 });
sun.shadow.normalBias = 0.35; sun.shadow.bias = -0.00006; sun.shadow.radius = 3.2; scene.add(sun);
const fill = new THREE.DirectionalLight(0xb9d5e6, 0.8); fill.position.set(300, 280, -400); scene.add(fill);
const skyUniforms = { top: { value: new THREE.Color(0x3d6677) }, horizon: { value: new THREE.Color(0xc8b697) }, bottom: { value: new THREE.Color(0x879c99) }, sunDirection: { value: new THREE.Vector3(-1, 0.4, 0.5).normalize() }, sunTint: { value: new THREE.Color(0xffd5a0) }, sunPower: { value: 1 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `varying vec3 vPosition; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDirection; uniform vec3 sunTint; uniform float sunPower;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){vec3 dir=normalize(vPosition);float h=dir.y;vec3 c=mix(horizon,top,pow(max(h,0.0),0.55));c=mix(c,bottom,clamp(-h*4.0,0.0,1.0));
    vec2 p=dir.xz/(max(h,0.0)+0.18)*2.3;float n=noise(p)*0.6+noise(p*2.3)*0.27+noise(p*5.7)*0.13;
    float cloud=smoothstep(0.59,0.78,n)*smoothstep(0.07,0.3,h)*(1.-smoothstep(0.5,0.85,h));c=mix(c,horizon*1.12,cloud*0.38);
    float s=max(dot(dir,sunDirection),0.0);c+=sunTint*sunPower*(pow(s,28.0)*0.13+pow(s,240.0)*0.23+smoothstep(0.99985,0.99996,s)*5.0);
    gl_FragColor=vec4(c,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
}));
scene.add(sky);
const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
const pmrem = new THREE.PMREMGenerator(renderer), environmentMaps = new Map();
scene.environmentIntensity = 0.35;
const palace = buildPalace(scene);
Object.assign(document.querySelector('#viewport').dataset, { buildings: palace.buildingCount, trees: palace.treeCount, flowers: palace.flowerCount, voxels: palace.voxelCount, outsideTrees: palace.landscape.outsideTrees, terrainTriangles: palace.landscape.terrainTriangles });
document.querySelector('#building-count').innerHTML = `${palace.buildingCount}<small>座</small>`;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const contactShadows = new SAOPass(scene, camera);
Object.assign(contactShadows.params, { saoIntensity: 0.038, saoScale: 900, saoBias: 0.5, saoKernelRadius: 14, saoMinResolution: 0.00002, saoBlurRadius: 3, saoBlurStdDev: 2, saoBlurDepthCutoff: 0.001 });
composer.addPass(contactShadows);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.28, 1.35); composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));c.rgb*=mix(vec3(0.96,1.015,1.04),vec3(1.025,1.0,0.97),smoothstep(0.08,0.9,l));gl_FragColor=c;}',
}));
composer.addPass(new OutputPass());
const antialias = new ShaderPass(FXAAShader); composer.addPass(antialias);
function sizeEffects() {
  const ratio = renderer.getPixelRatio(), w = window.innerWidth, h = window.innerHeight;
  composer.setPixelRatio(ratio); composer.setSize(w, h);
  contactShadows.setSize(Math.round(w * ratio * 0.6), Math.round(h * ratio * 0.6));
  antialias.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
}
sizeEffects();
const views = {
  overview: { position: [800, 735, 1010], target: [0, 8, 0], title: '一城宫阙', description: '山林环抱 · 河流蜿蜒 · 金阙映晨光' },
  axis: { position: [0, 980, 760], target: [0, 0, -10], title: '秩序之美', description: '层层院落 · 南北一线' },
  hall: { position: [195, 158, 218], target: [0, 31, -55], title: '重檐凌云', description: '太和主殿 · 白玉高台 · 金色重檐' },
  garden: { position: [285, 115, 170], target: [167, 9, 41], title: '水榭林间', description: '小桥流水 · 银杏花木 · 灯火长廊' },
  landscape: { position: [980, 365, 1210], target: [20, 50, -120], title: '山河胜境', description: '连绵远山 · 曲水林地 · 河岸漫步' },
};
let currentView = 'overview', cameraTween = null;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setView(name, immediate = false) {
  const view = views[name]; currentView = name;
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === name; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  document.querySelector('#view-title').textContent = view.title; document.querySelector('#view-description').textContent = view.description;
  const destination = new THREE.Vector3(...view.position);
  if (name === 'overview') destination.multiplyScalar(Math.max(1, 1.12 / camera.aspect));
  if (name === 'axis') destination.multiplyScalar(Math.max(1, 1.05 / camera.aspect));
  if (name === 'landscape') destination.multiplyScalar(Math.max(1, 1.16 / camera.aspect));
  if (immediate || reduceMotion) { cameraTween = null; camera.position.copy(destination); controls.target.set(...view.target); controls.update(); }
  else cameraTween = { from: camera.position.clone(), to: destination, targetFrom: controls.target.clone(), targetTo: new THREE.Vector3(...view.target), start: performance.now() };
}
setView('overview', true);
let currentTime = 'dawn';
const environments = {
  dawn: { sky: [0x536f83, 0xddc6a3, 0x6e8273], fog: 0x9aa598, density: 0.00023, sun: 0xffd29a, strength: 4.4, ambient: 0.8, fill: 0.3, exposure: 0.94, position: [-950, 410, 550], glow: 0.28, bloom: 0.15, threshold: 1.4, sunPower: 1.1 },
  dusk: { sky: [0x3c4d6a, 0xdeaa89, 0x697c7b], fog: 0xb5a092, density: 0.00026, sun: 0xffb77c, strength: 5.0, ambient: 0.85, fill: 0.55, exposure: 0.93, position: [-950, 360, -600], glow: 1.4, bloom: 0.18, threshold: 1.35, sunPower: 1.35 },
  night: { sky: [0x0c1b30, 0x3c5264, 0x253f46], fog: 0x314859, density: 0.00032, sun: 0xb0d5f3, strength: 1.5, ambient: 0.35, fill: 0.2, exposure: 1.03, position: [-350, 850, 150], glow: 3.7, bloom: 0.38, threshold: 1.0, sunPower: 0.18 },
};
function setTime(name) {
  currentTime = name;
  const env = environments[name]; skyUniforms.top.value.setHex(env.sky[0]); skyUniforms.horizon.value.setHex(env.sky[1]); skyUniforms.bottom.value.setHex(env.sky[2]);
  scene.fog.color.setHex(env.fog); scene.fog.density = env.density / Math.max(1, 1.12 / camera.aspect); sun.color.setHex(env.sun); sun.intensity = env.strength; sun.position.set(...env.position);
  skyUniforms.sunDirection.value.copy(sun.position).normalize(); skyUniforms.sunTint.value.setHex(env.sun); skyUniforms.sunPower.value = env.sunPower;
  if (!environmentMaps.has(name)) environmentMaps.set(name, pmrem.fromScene(skyScene, 0.04, 1, 8000, { size: 128 }));
  scene.environment = environmentMaps.get(name).texture; bloom.strength = env.bloom; bloom.threshold = env.threshold;
  hemisphere.intensity = env.ambient; fill.intensity = env.fill; renderer.toneMappingExposure = env.exposure;
  palace.glowMaterial.emissiveIntensity = env.glow; renderer.shadowMap.needsUpdate = true;
  document.querySelectorAll('[data-time]').forEach(button => { const active = button.dataset.time === name; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
setTime('dawn');
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => setTime(button.dataset.time)));
document.querySelector('#reset').addEventListener('click', () => setView(currentView));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); setView('overview'); });
document.querySelector('#orbit').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate; const button = document.querySelector('#orbit');
  button.setAttribute('aria-pressed', String(controls.autoRotate)); button.classList.toggle('active', controls.autoRotate);
  button.innerHTML = `${icon(controls.autoRotate ? 'pause' : 'play')}<span>${controls.autoRotate ? '暂停' : '环绕'}</span>`;
});
controls.addEventListener('start', () => { cameraTween = null; });
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { const toast = document.querySelector('#toast'); toast.textContent = '当前窗口暂不支持全屏'; toast.classList.add('visible'); setTimeout(() => toast.classList.remove('visible'), 2400); }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement), button = document.querySelector('#fullscreen'); button.innerHTML = icon(active ? 'close' : 'expand'); button.setAttribute('aria-label', active ? '退出全屏' : '全屏观景');
});
renderer.domElement.addEventListener('keydown', event => {
  const offset = camera.position.clone().sub(controls.target);
  if (event.key === '+' || event.key === '=') camera.position.copy(controls.target).add(offset.multiplyScalar(0.9));
  else if (event.key === '-') camera.position.copy(controls.target).add(offset.multiplyScalar(1.1));
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -0.08 : 0.08); camera.position.copy(controls.target).add(offset); }
  else if (event.key.toLowerCase() === 'r') setView(currentView); else return;
  event.preventDefault();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); sizeEffects();
  scene.fog.density = environments[currentTime].density / Math.max(1, 1.12 / camera.aspect);
  if (['overview', 'axis', 'landscape'].includes(currentView)) setView(currentView, true);
});
let fpsStart = performance.now(), frames = 0, lowFpsWindows = 0, lastTime = performance.now();
function animate(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.1); lastTime = now;
  if (cameraTween) {
    const t = Math.min((now - cameraTween.start) / 1250, 1), ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(cameraTween.from, cameraTween.to, ease); controls.target.lerpVectors(cameraTween.targetFrom, cameraTween.targetTo, ease);
    if (t === 1) cameraTween = null;
  }
  palace.waterTime.value = reduceMotion ? 0 : now / 1000;
  controls.update(delta); composer.render(delta);
  document.querySelector('#compass-needle').style.transform = `rotate(${THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())}deg)`;
  frames++;
  if (now - fpsStart >= 1500) {
    const fps = Math.round(frames * 1000 / (now - fpsStart)); document.querySelector('#fps').textContent = `${fps} FPS`;
    lowFpsWindows = fps < 32 ? lowFpsWindows + 1 : 0;
    if (lowFpsWindows >= 3 && renderer.getPixelRatio() > 0.8) { renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() * 0.8)); sizeEffects(); lowFpsWindows = 0; }
    else if (lowFpsWindows >= 3 && contactShadows.enabled) { contactShadows.enabled = false; lowFpsWindows = 0; }
    fpsStart = now; frames = 0;
  }
}
renderer.setAnimationLoop(animate);
requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('#loading').classList.add('loaded')));
if (import.meta.hot) import.meta.hot.dispose(() => {
  renderer.setAnimationLoop(null); controls.dispose();
  composer.passes.forEach(pass => pass.dispose()); composer.dispose();
  environmentMaps.forEach(map => map.dispose()); pmrem.dispose();
  scene.traverse(object => { object.geometry?.dispose(); if (object.material) [object.material].flat().forEach(material => { material.map?.dispose(); material.dispose(); }); });
  renderer.dispose();
});
