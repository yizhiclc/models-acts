import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createArchitecture } from './scene/architecture.js';
import { createLandscape } from './scene/landscape.js';
import { createAtmosphere } from './scene/atmosphere.js';
import { createUI } from './ui.js';
import './style.css';

const PRESETS = {
  overview: { target: [-7, 9.5, -4], offset: [88, 60, 110], height: 96 },
  river: { target: [-3, 10.5, -5], offset: [-89, 43, 73], height: 80 },
  roof: { target: [5, 24.8, -8], offset: [48, 24, 62], height: 39 },
  garden: { target: [27, 5, 24], offset: [68, 47, 80], height: 59 },
};

let renderer, controls, atmosphere, architecture, landscape;
let camera, scene, tween = null, currentView = 'overview';
let animationTime = 0, lastTime = 0, lastRender = 0, frameCount = 0, sampleStart = 0;
let running = true, orbiting = false, targetHour = 17 + 40 / 60, currentHour = targetHour;
let frameHeight = PRESETS.overview.height, disposed = false, ready = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ui = createUI({
  view: moveTo,
  reset: () => moveTo('overview'),
  orbit: value => { orbiting = value; if (controls) controls.autoRotate = value; tween = null; },
  pause: value => { running = !value; },
  time: hour => { targetHour = hour; },
});
if (reducedMotion) { running = false; ui.setPaused(true); }

function responsiveHeight(height) {
  const aspect = window.innerWidth / window.innerHeight;
  return height * Math.max(1, (currentView === 'roof' ? 0.93 : 1.42) / aspect);
}

function updateProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  const height = responsiveHeight(frameHeight);
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

function moveTo(name, immediate = false) {
  if (!camera || !controls) return;
  const preset = PRESETS[name];
  if (!preset) return;
  currentView = name;
  const target = new THREE.Vector3(...preset.target);
  const position = new THREE.Vector3(...preset.offset).add(target);
  orbiting = false;
  controls.autoRotate = false;
  // Consume any drag inertia before a preset transition, so reset lands at the
  // exact saved composition even when invoked immediately after a fast drag.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update(0);
  controls.enableDamping = damping;
  ui.setOrbit(false);
  if (immediate || reducedMotion) {
    camera.position.copy(position);
    controls.target.copy(target);
    camera.zoom = 1;
    frameHeight = preset.height;
    tween = null;
    updateProjection();
    controls.update();
    return;
  }
  tween = {
    start: performance.now(), fromPosition: camera.position.clone(), toPosition: position,
    fromTarget: controls.target.clone(), toTarget: target,
    fromHeight: frameHeight, toHeight: preset.height, fromZoom: camera.zoom,
  };
}

function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateProjection();
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-label', '滕王阁三维画面');
  renderer.domElement.tabIndex = 0;
  ui.container.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-50, 50, 35, -35, 0.1, 550);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minZoom = 0.52;
  controls.maxZoom = 3.8;
  controls.minPolarAngle = Math.PI * 0.13;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.rotateSpeed = 0.58;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 0.38;
  controls.listenToKeyEvents(renderer.domElement);
  controls.addEventListener('start', () => {
    if (tween) tween = null;
    if (orbiting) { orbiting = false; controls.autoRotate = false; ui.setOrbit(false); }
  });
  controls.addEventListener('change', () => {
    // Bound the point of interest while preserving useful close inspection.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -74, 59);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 42);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -55, 51);
  });

  atmosphere = createAtmosphere(scene, renderer);
  architecture = createArchitecture();
  const buildingScale = 1.08;
  architecture.group.scale.setScalar(buildingScale);
  architecture.group.position.set(5 * (1 - buildingScale), 0.85 * (1 - buildingScale), -10 * (1 - buildingScale));
  landscape = createLandscape();
  scene.add(landscape.group, architecture.group);
  moveTo('overview', true);
  landscape.update(0);

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    ui.toast('图形环境暂时中断，正在等待浏览器恢复…');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    renderer.shadowMap.needsUpdate = true;
    lastTime = 0;
    renderer.setAnimationLoop(render);
    ui.toast('画面已恢复');
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (disposed) return;
    if (document.hidden) renderer.setAnimationLoop(null);
    else { lastTime = 0; renderer.setAnimationLoop(render); }
  });
  renderer.setAnimationLoop(render);
}

function render(now) {
  if (disposed) return;
  const interval = 1000 / 60;
  const elapsed = now - lastRender;
  if (elapsed < interval - 0.25) return;
  lastRender = now - elapsed % interval;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.07) : 0;
  lastTime = now;
  if (running) animationTime += dt;
  if (tween) {
    const progress = Math.min((now - tween.start) / 1450, 1);
    const t = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.fromPosition, tween.toPosition, t);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, t);
    camera.zoom = THREE.MathUtils.lerp(tween.fromZoom, 1, t);
    frameHeight = THREE.MathUtils.lerp(tween.fromHeight, tween.toHeight, t);
    updateProjection();
    if (progress === 1) tween = null;
  }
  controls.autoRotate = orbiting && running;
  controls.update(dt);
  currentHour = THREE.MathUtils.damp(currentHour, targetHour, 5.5, dt || 0.016);
  const night = atmosphere.setTime(currentHour);
  for (const voxels of [architecture.voxels, landscape.voxels]) {
    if (voxels.materials.glow) voxels.materials.glow.emissiveIntensity = 0.1 + night * 1.5;
  }
  atmosphere.update(animationTime);
  landscape.update(animationTime);
  renderer.info.reset();
  atmosphere.water.updateReflection(renderer, scene, camera);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    ui.ready(architecture.voxels.count + landscape.voxels.count);
  }
  if (!sampleStart) sampleStart = now;
  frameCount++;
  if (now - sampleStart > 2500) {
    const fps = Math.round(frameCount * 1000 / (now - sampleStart));
    ui.report({ fps: String(fps), drawCalls: String(renderer.info.render.calls), triangles: String(renderer.info.render.triangles),
      view: currentView, zoom: camera.zoom.toFixed(3), hour: currentHour.toFixed(2),
      motion: String(running), orbit: String(orbiting),
      camera: camera.position.toArray().map(n => n.toFixed(2)).join(','),
      target: controls.target.toArray().map(n => n.toFixed(2)).join(',') });
    // Dynamic resolution is deliberately conservative and never changes model detail.
    if (fps < 28 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25));
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    frameCount = 0;
    sampleStart = now;
  }
}

function dispose() {
  if (disposed) return;
  disposed = true;
  renderer?.setAnimationLoop(null);
  controls?.dispose();
  atmosphere?.dispose();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [object.material].flat()) {
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
    if (object.dispose && object.isInstancedMesh) object.dispose();
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  textures.forEach(t => t.dispose());
  renderer?.dispose();
}

// Let the loading typography paint before synchronous procedural construction begins.
requestAnimationFrame(() => setTimeout(() => {
  try { init(); } catch (error) { ui.error(error); dispose(); }
}, 30));

if (import.meta.hot) import.meta.hot.dispose(dispose);
