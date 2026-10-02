import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createIcons, Pause, Play, RotateCcw, Camera, Maximize, Minimize, SlidersHorizontal, Sigma, X } from 'lucide';
import { unzlibSync } from 'fflate';
import spectrum from '../data/blackbody.json';
import { G, C, MSUN, temperatureScale, makeFluxTable, horizon, FLUX_COUNT } from './physics.mjs';
import { vertexShader, traceShader, rayShader, accumulationShader, blurShader, displayShader } from './shaders.js';
import { createSky } from './sky.js';

const $ = id => document.getElementById(id);
const icons = { Pause, Play, RotateCcw, Camera, Maximize, Minimize, SlidersHorizontal, Sigma, X };
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
refreshIcons();
const state = {
  spin: .94, massLog: 8, rateLog: -4, outer: 28, speed: 24, exposure: -.5, structure: .55,
  bloom: .2, disk: true, delay: true, sky: true, mode: 0, quality: 'auto',
  interactiveQuality: true,
  paused: matchMedia('(prefers-reduced-motion: reduce)').matches,
};
let time = 0, renderer, controls, initialized = false;
let width = 1, height = 1, renderWidth = 1, renderHeight = 1;
let frameCount = 0, averageFrame = 20, elapsedFrames = 0, elapsedTime = 0, lastHud = 0;
let historyIndex = 0, accumulated = 0, dirty = true, toastTimer;
let currentTarget, historyTargets, bloomTargets, mapTarget;
let rayMaterial, traceMaterial, accumulationMaterial, blurMaterial, displayMaterial;
let traceDirty = true, traceCount = 0, lastMotion = -1000, quick = false, staticSamples = 0;
let flux = makeFluxTable(state.spin), fluxTexture, fluxSpin = state.spin;
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
function invalidate() { dirty = true; staticSamples = 0; }
function requestTrace(interactive = true) {
  traceDirty = true; invalidate();
  if (interactive && state.interactiveQuality) {
    lastMotion = performance.now();
    if (!quick) { quick = true; resize(); }
  } else if (quick) {
    quick = false;
    resize();
  }
}
function resize() {
  if (!renderer) return;
  const rect = $('canvas-host').getBoundingClientRect();
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const scale = quick ? .36 : state.quality === 'ultra' ? Math.min(dpr, 1.6) : state.quality === 'high' ? 1.1 : .92;
  const cap = quick ? 105000 : state.quality === 'ultra' ? 3000000 : state.quality === 'high' ? 1800000 : 1100000;
  const cappedScale = Math.min(scale, Math.sqrt(cap / (width * height)));
  renderWidth = Math.max(1, Math.round(width * cappedScale));
  renderHeight = Math.max(1, Math.round(height * cappedScale));
  renderer.setPixelRatio(Math.min(dpr, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(24)) * Math.max(1, 1.15 / camera.aspect)));
  camera.updateProjectionMatrix();
  currentTarget?.dispose();
  mapTarget?.dispose();
  historyTargets?.forEach(t => t.dispose());
  bloomTargets?.forEach(t => t.dispose());
  currentTarget = target(renderWidth, renderHeight);
  mapTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
    type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false,
  });
  historyTargets = [target(renderWidth, renderHeight), target(renderWidth, renderHeight)];
  bloomTargets = [target(Math.max(1, renderWidth >> 2), Math.max(1, renderHeight >> 2)),
    target(Math.max(1, renderWidth >> 2), Math.max(1, renderHeight >> 2))];
  if (traceMaterial) {
    traceMaterial.uniforms.uResolution.value.set(renderWidth, renderHeight);
    traceMaterial.uniforms.uAspect.value = camera.aspect;
    traceMaterial.uniforms.uFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    traceMaterial.uniforms.uStep.value = quick ? .095 : state.quality === 'ultra' ? .026 : state.quality === 'high' ? .040 : .055;
    traceMaterial.uniforms.uMaxSteps.value = quick ? 480 : state.quality === 'ultra' ? 1024 : 800;
    rayMaterial.uniforms.uMap.value = mapTarget.texture;
  }
  accumulated = 0; dirty = true; staticSamples = 0; traceDirty = true;
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
}
function updateReadouts() {
  const mass = 10 ** state.massLog, rate = 10 ** state.rateLog;
  if (fluxSpin !== state.spin) {
    flux = makeFluxTable(state.spin);
    fluxSpin = state.spin;
    if (fluxTexture) { fluxTexture.image.data = flux.data; fluxTexture.needsUpdate = true; }
  }
  $('spin-value').textContent = `${state.spin >= 0 ? '+' : ''}${state.spin.toFixed(3)}`;
  $('spin-subtitle').textContent = `a* = ${state.spin >= 0 ? '+' : ''}${state.spin.toFixed(3)}`;
  $('horizon-value').innerHTML = `${horizon(state.spin).toFixed(3)} r<sub>g</sub>`;
  $('isco-value').innerHTML = `${flux.inner.toFixed(3)} r<sub>g</sub>`;
  $('orbit-value').textContent = state.spin > 0 ? 'PROGRADE' : state.spin < 0 ? 'RETROGRADE' : 'SCHWARZSCHILD LIMIT';
  $('mass-value').textContent = `${mass.toExponential(2)} M☉`;
  $('accretion-value').textContent = `${rate.toExponential(2)} M☉/yr`;
  $('outer-value').textContent = `${state.outer.toFixed(1)} rg`;
  $('temperature-value').textContent = `${Math.round(temperatureScale(mass, rate) * flux.peak ** .25).toLocaleString('en-US')} K`;
  $('speed-value').textContent = `${state.speed} tg/s`;
  $('exposure-value').textContent = `${state.exposure >= 0 ? '+' : ''}${state.exposure.toFixed(1)} EV`;
  $('structure-value').textContent = `${Math.round(state.structure * 100)}%`;
  $('bloom-value').textContent = `${Math.round(state.bloom * 100)}%`;
  if (!rayMaterial) return;
  Object.assign(rayMaterial.uniforms.uTempScale, { value: temperatureScale(mass, rate) });
  traceMaterial.uniforms.uSpin.value = state.spin;
  traceMaterial.uniforms.uInner.value = flux.inner;
  traceMaterial.uniforms.uOuter.value = state.outer;
  traceMaterial.uniforms.uDisk.value = state.disk;
  rayMaterial.uniforms.uSpin.value = state.spin;
  rayMaterial.uniforms.uInner.value = flux.inner;
  rayMaterial.uniforms.uStructure.value = state.structure;
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
  if (document.hidden || width < 2 || height < 2) { frame.last = now; lastHud = now; return; }
  const dt = Math.max(0, Math.min((now - (frame.last || now)) / 1000, .12));
  frame.last = now;
  controls.update();
  const moved = camera.position.distanceToSquared(previousCamera) > 1e-9;
  previousCamera.copy(camera.position);
  if (moved) { requestTrace(); updateCameraReadouts(); }
  if (quick && now - lastMotion > 220) { quick = false; resize(); }
  const evolving = !state.paused && state.speed > 0 && state.structure > 0 && state.disk && state.mode === 0;
  if (!state.paused) time += dt * state.speed;
  const sampleLimit = state.quality === 'ultra' ? 16 : state.quality === 'high' ? 8 : 4;
  if (!dirty && !evolving && staticSamples >= sampleLimit) return;
  if (dirty || evolving) accumulated = 0;
  ++frameCount;
  rayMaterial.uniforms.uTime.value = time;
  camera.updateMatrixWorld();
  basis.setFromMatrix4(camera.matrixWorld);
  traceMaterial.uniforms.uBasis.value.copy(basis);
  traceMaterial.uniforms.uCamera.value.copy(camera.position);
  if (traceDirty || (!evolving && !quick && staticSamples < sampleLimit)) {
    traceMaterial.uniforms.uJitter.value.set(
      !evolving && !quick ? halton(staticSamples + 1, 2) - .5 : 0,
      !evolving && !quick ? halton(staticSamples + 1, 3) - .5 : 0);
    renderPass(traceMaterial, mapTarget);
    traceDirty = false; traceCount++;
  }
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
  if (!evolving && !quick) staticSamples++;
  dirty = false;
  elapsedFrames++; elapsedTime += dt;
  if (now - lastHud > 1100) {
    const fps = elapsedFrames / Math.max(elapsedTime, .001);
    averageFrame = 1000 / fps;
    $('fps-readout').textContent = `${Math.min(999, Math.round(fps))} FPS`;
    $('engine-state').textContent = quick ? 'KERR / INTERACTIVE' : state.paused ? `STATIC / ${staticSamples} SAMPLES` : 'KERR / RAY CACHE';
    elapsedFrames = 0; elapsedTime = 0; lastHud = now;
  }
}

function bindControls() {
  document.querySelectorAll('[data-key]').forEach(input => {
    input.addEventListener('input', () => {
      state[input.dataset.key] = input.type === 'checkbox' ? input.checked : Number(input.value);
      updateReadouts();
      if (['spin', 'outer', 'disk'].includes(input.dataset.key)) requestTrace();
      if (input.dataset.key === 'interactiveQuality') requestTrace(false);
    });
  });
  for (const id of ['inclination', 'distance']) {
    $(id).addEventListener('input', () => {
      spherical.setFromVector3(camera.position);
      if (id === 'inclination') spherical.phi = THREE.MathUtils.degToRad(Number($(id).value));
      else spherical.radius = Number($(id).value);
      camera.position.setFromSpherical(spherical);
      controls.update(); updateCameraReadouts(); requestTrace();
    });
  }
  $('quality').addEventListener('change', () => { state.quality = $('quality').value; resize(); });
  $('sky-toggle').addEventListener('change', () => { state.sky = $('sky-toggle').checked; updateReadouts(); });
  $('pause-button').addEventListener('click', () => setPaused(!state.paused));
  $('reset-button').addEventListener('click', () => {
    controls.enableDamping = false;
    controls.update();
    camera.position.setFromSpherical(new THREE.Spherical(62, THREE.MathUtils.degToRad(76), .38));
    controls.target.set(0, 0, 0); controls.update(); updateCameraReadouts(); requestTrace();
    controls.enableDamping = true;
  });
  $('capture-button').addEventListener('click', () => {
    renderer.domElement.toBlob(blob => {
      if (!blob) { toast('图像导出失败'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `Kerr-BlackHole-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
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
    '<span><i style="background:#62dabb"></i>直接像</span><span><i style="background:#ffb05a"></i>二次交面</span><span><i style="background:#7aaaff"></i>三次交面</span><span><i style="background:#f26cae"></i>更高阶</span><span><i style="background:#ff20c0"></i>未收敛</span>',
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
    renderer.domElement.setAttribute('aria-label', 'Kerr 自旋黑洞、吸积盘及引力透镜星场');
    renderer.domElement.setAttribute('role', 'img');
    $('canvas-host').append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); initialized = false; fatal(new Error('WebGL 上下文丢失，请重新打开页面')); });
    const color = floatTexture(decode(spectrum.data), spectrum.count, 1, 4);
    fluxTexture = floatTexture(flux.data, FLUX_COUNT, 1, 4);
    const sky = createSky();
    traceMaterial = material(traceShader, {
      uResolution: { value: new THREE.Vector2() }, uJitter: { value: new THREE.Vector2() },
      uCamera: { value: new THREE.Vector3() }, uBasis: { value: new THREE.Matrix3() },
      uFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) }, uAspect: { value: 1 },
      uSpin: { value: state.spin }, uInner: { value: flux.inner }, uOuter: { value: state.outer },
      uStep: { value: .055 }, uMaxSteps: { value: 800 }, uDisk: { value: true },
    });
    rayMaterial = material(rayShader, {
      uMap: { value: null }, uSpectrum: { value: color }, uFlux: { value: fluxTexture }, uSky: { value: sky },
      uSpin: { value: state.spin }, uInner: { value: flux.inner },
      uTime: { value: 0 }, uTempScale: { value: 1 }, uStructure: { value: .55 },
      uSkyStrength: { value: .9 }, uDelay: { value: true }, uMode: { value: 0 },
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
    controls.addEventListener('change', () => requestTrace());
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
          model: 'Kerr-Schild Hamiltonian', orbitControls: controls instanceof OrbitControls ? 'OrbitControls' : 'unknown',
          camera: camera.position.toArray(), distance: camera.position.length(),
          time, frameCount, accumulated, resolution: [renderWidth, renderHeight],
          viewport: [width, height], spin: state.spin, horizon: horizon(state.spin), isco: flux.inner,
          traceCount, quick, staticSamples, step: traceMaterial.uniforms.uStep.value, fov: camera.fov,
          massSolar: 10 ** state.massLog, gravitationalTimeSeconds: G * 10 ** state.massLog * MSUN / C ** 3,
          webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
        };
      },
      readMapSummary() {
        const data = new Float32Array(renderWidth * renderHeight * 4);
        renderer.readRenderTargetPixels(mapTarget, 0, 0, renderWidth, renderHeight, data);
        const result = { disk: 0, sky: 0, captured: 0, unresolved: 0, highOrder: 0, minG: 100, maxG: 0, maxSkyNullResidual: 0 };
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 0) {
            result.disk++;
            if (data[i] > 64) result.highOrder++;
            result.minG = Math.min(result.minG, data[i + 3]);
            result.maxG = Math.max(result.maxG, data[i + 3]);
          } else if (data[i] > -1.5) {
            result.sky++; result.maxSkyNullResidual = Math.max(result.maxSkyNullResidual, data[i + 3]);
          } else if (data[i] > -2.5) result.captured++;
          else result.unresolved++;
        }
        return result;
      },
    };
  } catch (error) { initialized = false; fatal(error); }
}

updateReadouts();
setTimeout(initialize, 60);
