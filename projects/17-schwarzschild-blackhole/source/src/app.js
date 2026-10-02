import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createIcons, Pause, Play, RotateCcw, Camera, Maximize, Minimize, SlidersHorizontal, Sigma, X } from 'lucide';
import { unzlibSync } from 'fflate';
import geodesics from '../data/geodesics.json';
import spectrum from '../data/blackbody.json';
import { BC, S_MIN, S_MAX, G, C, MSUN, temperatureScale, peakTemperature } from './physics.mjs';
import { vertexShader, rayShader, accumulationShader, blurShader, displayShader } from './shaders.js';
import { createSky } from './sky.js';

const $ = id => document.getElementById(id);
const icons = { Pause, Play, RotateCcw, Camera, Maximize, Minimize, SlidersHorizontal, Sigma, X };
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
refreshIcons();
const state = {
  massLog: 8, rateLog: -4, outer: 28, speed: 24, exposure: .8, structure: .55,
  bloom: .2, disk: true, delay: true, sky: true, mode: 0, quality: 'auto',
  paused: matchMedia('(prefers-reduced-motion: reduce)').matches,
};
let time = 0, renderer, controls, initialized = false;
let width = 1, height = 1, renderWidth = 1, renderHeight = 1, adaptiveScale = .85;
let frameCount = 0, averageFrame = 20, elapsedFrames = 0, elapsedTime = 0, lastHud = 0;
let historyIndex = 0, accumulated = 0, dirty = true, toastTimer;
let currentTarget, historyTargets, bloomTargets;
let rayMaterial, accumulationMaterial, blurMaterial, displayMaterial;
const camera = new THREE.PerspectiveCamera(48, 1, .1, 1000);
const quadCamera = new THREE.Camera();
const scene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
scene.add(quad);
const previousCamera = new THREE.Vector3();
const basis = new THREE.Matrix3();
const spherical = new THREE.Spherical(62, THREE.MathUtils.degToRad(76), 0.38);
camera.position.setFromSpherical(spherical);
camera.lookAt(0, 0, 0);

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2300);
}
function fatal(error) {
  console.error(error);
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `模拟无法启动：${error.message || error}。请使用支持 WebGL 2 的现代浏览器，并开启硬件加速。`;
  document.body.dataset.status = 'error';
}
window.addEventListener('error', event => { if (!initialized) fatal(event.error || event.message); });

function decode(encoded) {
  const raw = atob(encoded);
  const compressed = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) compressed[i] = raw.charCodeAt(i);
  const bytes = unzlibSync(compressed);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}
function floatTexture(data, w, h, channels) {
  const texture = new THREE.DataTexture(data, w, h, channels === 2 ? THREE.RGFormat : THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
function material(fragmentShader, uniforms) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
}
function target(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
}
function invalidate() { dirty = true; }
function resize() {
  if (!renderer) return;
  const rect = $('canvas-host').getBoundingClientRect();
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const scale = state.quality === 'ultra' ? dpr : state.quality === 'high' ? Math.min(dpr, 1.5) : adaptiveScale;
  const cap = state.quality === 'ultra' ? 5e6 : state.quality === 'high' ? 3e6 : 1.7e6;
  const cappedScale = Math.min(scale, Math.sqrt(cap / (width * height)));
  renderWidth = Math.max(1, Math.round(width * cappedScale));
  renderHeight = Math.max(1, Math.round(height * cappedScale));
  renderer.setPixelRatio(Math.min(dpr, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(24)) * Math.max(1, 1.15 / camera.aspect)));
  camera.updateProjectionMatrix();
  currentTarget?.dispose();
  historyTargets?.forEach(t => t.dispose());
  bloomTargets?.forEach(t => t.dispose());
  currentTarget = target(renderWidth, renderHeight);
  historyTargets = [target(renderWidth, renderHeight), target(renderWidth, renderHeight)];
  bloomTargets = [target(Math.max(1, renderWidth >> 2), Math.max(1, renderHeight >> 2)),
    target(Math.max(1, renderWidth >> 2), Math.max(1, renderHeight >> 2))];
  if (rayMaterial) {
    rayMaterial.uniforms.uResolution.value.set(renderWidth, renderHeight);
    rayMaterial.uniforms.uAspect.value = camera.aspect;
    rayMaterial.uniforms.uFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  }
  accumulated = 0; dirty = true;
  updateCameraReadouts();
}
function setPaused(paused) {
  state.paused = paused;
  const button = $('pause-button');
  const text = paused ? '继续时间' : '暂停时间';
  button.setAttribute('aria-label', text);
  button.dataset.tooltip = text;
  button.innerHTML = `<i data-lucide="${paused ? 'play' : 'pause'}"></i>`;
  button.setAttribute('aria-pressed', String(paused));
  refreshIcons(); invalidate();
}
function updateCameraReadouts() {
  spherical.setFromVector3(camera.position);
  const inclination = THREE.MathUtils.radToDeg(spherical.phi);
  const distance = spherical.radius;
  $('inclination').value = inclination;
  $('distance').value = distance;
  $('inclination-value').textContent = `${inclination.toFixed(1)}°`;
  $('inclination-readout').textContent = `${inclination.toFixed(1)}°`;
  $('distance-value').textContent = `${distance.toFixed(1)} rg`;
  $('distance-readout').innerHTML = `${distance.toFixed(1)} r<sub>g</sub>`;
  const angle = Math.asin(BC * Math.sqrt(1 - 2 / distance) / distance);
  const pixels = height * Math.tan(angle) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  $('critical-circle').style.width = `${pixels}px`;
  $('critical-circle').style.height = `${pixels}px`;
}
function updateReadouts() {
  const mass = 10 ** state.massLog, rate = 10 ** state.rateLog;
  $('mass-value').textContent = `${mass.toExponential(2)} M☉`;
  $('accretion-value').textContent = `${rate.toExponential(2)} M☉/yr`;
  $('outer-value').textContent = `${state.outer.toFixed(1)} rg`;
  $('temperature-value').textContent = `${Math.round(peakTemperature(mass, rate)).toLocaleString('en-US')} K`;
  $('speed-value').textContent = `${state.speed} tg/s`;
  $('exposure-value').textContent = `${state.exposure >= 0 ? '+' : ''}${state.exposure.toFixed(1)} EV`;
  $('structure-value').textContent = `${Math.round(state.structure * 100)}%`;
  $('bloom-value').textContent = `${Math.round(state.bloom * 100)}%`;
  if (!rayMaterial) return;
  Object.assign(rayMaterial.uniforms.uTempScale, { value: temperatureScale(mass, rate) });
  rayMaterial.uniforms.uOuter.value = state.outer;
  rayMaterial.uniforms.uStructure.value = state.structure;
  rayMaterial.uniforms.uDisk.value = state.disk;
  rayMaterial.uniforms.uDelay.value = state.delay;
  rayMaterial.uniforms.uSkyStrength.value = state.sky ? .9 : 0;
  rayMaterial.uniforms.uMode.value = state.mode;
  displayMaterial.uniforms.uExposure.value = 2 ** state.exposure;
  displayMaterial.uniforms.uBloomAmount.value = state.bloom * .5;
  displayMaterial.uniforms.uMode.value = state.mode;
  invalidate();
}
function renderPass(mat, destination) {
  quad.material = mat;
  renderer.setRenderTarget(destination);
  renderer.render(scene, quadCamera);
}
function halton(index, base) {
  let f = 1, result = 0;
  while (index > 0) { f /= base; result += f * (index % base); index = Math.floor(index / base); }
  return result;
}
function frame(now) {
  if (!initialized) return;
  requestAnimationFrame(frame);
  if (document.hidden || width < 2 || height < 2) { lastHud = now; return; }
  const dt = Math.max(0, Math.min((now - (frame.last || now)) / 1000, .12));
  frame.last = now;
  controls.update();
  const moved = camera.position.distanceToSquared(previousCamera) > 1e-9;
  previousCamera.copy(camera.position);
  if (moved) { invalidate(); updateCameraReadouts(); }
  const evolving = !state.paused && state.speed > 0 && state.structure > 0 && state.disk && state.mode === 0;
  if (!state.paused) time += dt * state.speed;
  if (!dirty && !evolving && accumulated >= (state.quality === 'ultra' ? 128 : 48)) return;
  if (dirty || evolving) accumulated = 0;
  const index = ++frameCount;
  rayMaterial.uniforms.uTime.value = time;
  rayMaterial.uniforms.uJitter.value.set(halton(index % 1024 + 1, 2) - .5, halton(index % 1024 + 1, 3) - .5);
  camera.updateMatrixWorld();
  basis.setFromMatrix4(camera.matrixWorld);
  rayMaterial.uniforms.uBasis.value.copy(basis);
  rayMaterial.uniforms.uCamera.value.copy(camera.position);
  renderPass(rayMaterial, currentTarget);
  const nextHistory = 1 - historyIndex;
  accumulationMaterial.uniforms.uCurrent.value = currentTarget.texture;
  accumulationMaterial.uniforms.uHistory.value = historyTargets[historyIndex].texture;
  accumulationMaterial.uniforms.uWeight.value = 1 / (accumulated + 1);
  renderPass(accumulationMaterial, historyTargets[nextHistory]);
  historyIndex = nextHistory;
  const image = historyTargets[historyIndex].texture;
  if (state.bloom > 0 && state.mode === 0) {
    blurMaterial.uniforms.uImage.value = image;
    blurMaterial.uniforms.uStep.value.set(2 / renderWidth, 0);
    blurMaterial.uniforms.uExtract.value = true;
    renderPass(blurMaterial, bloomTargets[0]);
    blurMaterial.uniforms.uImage.value = bloomTargets[0].texture;
    blurMaterial.uniforms.uStep.value.set(0, 1.5 / bloomTargets[0].height);
    blurMaterial.uniforms.uExtract.value = false;
    renderPass(blurMaterial, bloomTargets[1]);
    displayMaterial.uniforms.uBloom.value = bloomTargets[1].texture;
  }
  displayMaterial.uniforms.uImage.value = image;
  renderPass(displayMaterial, null);
  accumulated++;
  dirty = false;
  elapsedFrames++; elapsedTime += dt;
  if (now - lastHud > 1100) {
    const fps = elapsedFrames / Math.max(elapsedTime, .001);
    averageFrame = 1000 / fps;
    $('fps-readout').textContent = `${Math.min(999, Math.round(fps))} FPS`;
    $('engine-state').textContent = state.paused ? `STATIC / ${accumulated} SAMPLES` : 'NULL GEODESICS / RK4';
    if (state.quality === 'auto' && elapsedFrames > 3) {
      const next = averageFrame > 42 ? Math.max(.45, adaptiveScale - .08) : averageFrame < 22 ? Math.min(1.2, adaptiveScale + .04) : adaptiveScale;
      if (Math.abs(next - adaptiveScale) > .01) { adaptiveScale = next; resize(); }
    }
    elapsedFrames = 0; elapsedTime = 0; lastHud = now;
  }
}

function bindControls() {
  document.querySelectorAll('[data-key]').forEach(input => {
    input.addEventListener('input', () => {
      state[input.dataset.key] = input.type === 'checkbox' ? input.checked : Number(input.value);
      updateReadouts();
    });
  });
  for (const id of ['inclination', 'distance']) {
    $(id).addEventListener('input', () => {
      spherical.setFromVector3(camera.position);
      if (id === 'inclination') spherical.phi = THREE.MathUtils.degToRad(Number($(id).value));
      else spherical.radius = Number($(id).value);
      camera.position.setFromSpherical(spherical);
      controls.update(); updateCameraReadouts(); invalidate();
    });
  }
  $('quality').addEventListener('change', () => { state.quality = $('quality').value; resize(); });
  $('sky-toggle').addEventListener('change', () => { state.sky = $('sky-toggle').checked; updateReadouts(); });
  $('critical-toggle').addEventListener('change', () => { $('critical-circle').hidden = !$('critical-toggle').checked; });
  $('pause-button').addEventListener('click', () => setPaused(!state.paused));
  $('reset-button').addEventListener('click', () => {
    controls.enableDamping = false;
    controls.update();
    camera.position.setFromSpherical(new THREE.Spherical(62, THREE.MathUtils.degToRad(76), .38));
    controls.target.set(0, 0, 0); controls.update(); updateCameraReadouts(); invalidate();
    controls.enableDamping = true;
  });
  $('capture-button').addEventListener('click', () => {
    renderer.domElement.toBlob(blob => {
      if (!blob) { toast('图像导出失败'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `BlackHole-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('图像已导出');
    }, 'image/png');
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('此浏览器不支持全屏');
    } catch { toast('浏览器未允许全屏'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen-button').innerHTML = `<i data-lucide="${document.fullscreenElement ? 'minimize' : 'maximize'}"></i>`;
    refreshIcons();
  });
  $('panel-button').addEventListener('click', () => {
    const closed = $('observatory').classList.toggle('panel-closed');
    $('panel-button').setAttribute('aria-expanded', String(!closed));
  });
  $('model-button').addEventListener('click', () => $('physics-dialog').showModal());
  $('close-dialog').addEventListener('click', () => $('physics-dialog').close());
  $('physics-dialog').addEventListener('click', event => {
    if (event.target === $('physics-dialog')) {
      const r = $('physics-dialog').getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('physics-dialog').close();
    }
  });
  const legends = [
    '',
    '<span><i style="background:#ff6535"></i>g &lt; 1 红移</span><span><i style="background:#dce7e8"></i>g = 1</span><span><i style="background:#358aff"></i>g &gt; 1 蓝移</span>',
    '<span><i style="background:#62dabb"></i>直接像</span><span><i style="background:#ffb05a"></i>二次交面</span><span><i style="background:#7aaaff"></i>三次交面</span><span><i style="background:#f26cae"></i>更高阶</span>',
  ];
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      state.mode = Number(button.dataset.mode);
      document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      $('mode-legend').hidden = state.mode === 0;
      $('mode-legend').innerHTML = legends[state.mode];
      updateReadouts();
    });
  });
  if (matchMedia('(max-width: 700px)').matches) {
    $('observatory').classList.add('panel-closed');
    $('panel-button').setAttribute('aria-expanded', 'false');
  }
}

async function initialize() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('缺少 EXT_color_buffer_float');
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      throw new Error(`${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(fragment) || gl.getShaderInfoLog(vertex)}`);
    };
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.setAttribute('aria-label', 'Schwarzschild 黑洞、吸积盘及引力透镜星场');
    renderer.domElement.setAttribute('role', 'img');
    $('canvas-host').append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); initialized = false; fatal(new Error('WebGL 上下文丢失，请重新打开页面')); });
    const data = decode(geodesics.data);
    const radial = floatTexture(data.subarray(0, geodesics.radialFloats), geodesics.width, geodesics.height, 2);
    const meta = floatTexture(data.subarray(geodesics.radialFloats), geodesics.width, 1, 4);
    const color = floatTexture(decode(spectrum.data), spectrum.count, 1, 4);
    const sky = createSky();
    rayMaterial = material(rayShader, {
      uRadial: { value: radial }, uMeta: { value: meta }, uSpectrum: { value: color }, uSky: { value: sky },
      uResolution: { value: new THREE.Vector2() }, uJitter: { value: new THREE.Vector2() },
      uCamera: { value: new THREE.Vector3() }, uBasis: { value: new THREE.Matrix3() },
      uFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) }, uAspect: { value: 1 },
      uTime: { value: 0 }, uTempScale: { value: 1 }, uOuter: { value: 28 }, uStructure: { value: .55 },
      uSkyStrength: { value: .9 }, uSMin: { value: S_MIN }, uSMax: { value: S_MAX },
      uDisk: { value: true }, uDelay: { value: true }, uMode: { value: 0 },
    });
    accumulationMaterial = material(accumulationShader, {
      uCurrent: { value: null }, uHistory: { value: null }, uWeight: { value: 1 },
    });
    blurMaterial = material(blurShader, {
      uImage: { value: null }, uStep: { value: new THREE.Vector2() }, uExtract: { value: true },
    });
    displayMaterial = material(displayShader, {
      uImage: { value: null }, uBloom: { value: sky }, uExposure: { value: 1 }, uBloomAmount: { value: .1 }, uMode: { value: 0 },
    });
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.enablePan = false; controls.minDistance = 48; controls.maxDistance = 160;
    controls.minPolarAngle = .001745; controls.maxPolarAngle = Math.PI - .001745;
    controls.rotateSpeed = .5; controls.zoomSpeed = .8;
    controls.addEventListener('change', invalidate);
    bindControls(); setPaused(state.paused); updateReadouts(); resize();
    new ResizeObserver(resize).observe($('canvas-host'));
    window.addEventListener('resize', resize);
    previousCamera.copy(camera.position);
    initialized = true;
    frame(performance.now());
    $('loading').hidden = true;
    document.body.dataset.status = 'ready';
    window.blackHole = {
      get state() { return { ...state }; },
      get diagnostics() {
        return {
          model: 'Schwarzschild', orbitControls: controls instanceof OrbitControls ? 'OrbitControls' : 'unknown',
          camera: camera.position.toArray(), distance: camera.position.length(),
          time, frameCount, accumulated, resolution: [renderWidth, renderHeight],
          viewport: [width, height], geodesicHash: geodesics.sha256,
          massSolar: 10 ** state.massLog, gravitationalTimeSeconds: G * 10 ** state.massLog * MSUN / C ** 3,
          webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
        };
      },
    };
  } catch (error) { initialized = false; fatal(error); }
}

updateReadouts();
setTimeout(initialize, 60);
