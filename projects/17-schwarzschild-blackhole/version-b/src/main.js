import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createIcons, ChevronDown, ChevronUp, Orbit, Scan, Camera, Info, X } from 'lucide';
import { G, C, MASS, SOLAR_MASS, YEAR, SIGMA, diskTemperature, makeSpectrumTable } from './physics.js';
import fragmentShader from './raytrace.glsl?raw';
import './style.css';

const $ = selector => document.querySelector(selector);
const icons = { ChevronDown, ChevronUp, Orbit, Scan, Camera, Info, X };
createIcons({ icons });
const viewport = $('#viewport');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
} catch (error) {
  $('#loading').innerHTML = '<p>无法启动 WebGL 2，请启用浏览器硬件加速。</p>';
  throw error;
}
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, .1, 1000);
const initialRadius = 80;
const initialInclination = 82 * Math.PI / 180;
camera.position.set(0, initialRadius * Math.cos(initialInclination), initialRadius * Math.sin(initialInclination));
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.enablePan = false;
controls.minDistance = 48;
controls.maxDistance = 140;
controls.minPolarAngle = .025;
controls.maxPolarAngle = Math.PI - .025;
controls.autoRotateSpeed = .4;
controls.zoomSpeed = .6;
controls.update();

// A fixed, procedural all-sky texture supplies background emission, not lensing.
function makeSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 4096; canvas.height = 2048;
  const context = canvas.getContext('2d');
  context.fillStyle = '#030406'; context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 620318;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < 16000; i++) {
    const x = random() * canvas.width;
    const lat = Math.asin(random() * 2 - 1);
    const y = (lat / Math.PI + .5) * canvas.height;
    const brightness = .15 + random() ** 5 * .82;
    const size = random() < .009 ? 1.5 : .35 + random() * .55;
    const warm = random();
    context.fillStyle = warm < .22 ? `rgba(255,211,159,${brightness})` : warm > .82 ? `rgba(183,212,255,${brightness})` : `rgba(230,236,238,${brightness})`;
    context.fillRect(Math.round(x), Math.round(y), size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
const thermal = new THREE.DataTexture(makeSpectrumTable(), 1024, 1, THREE.RGBAFormat, THREE.FloatType);
const thermalFilter = renderer.getContext().getExtension('OES_texture_float_linear') ? THREE.LinearFilter : THREE.NearestFilter;
thermal.minFilter = thermalFilter;
thermal.magFilter = thermalFilter;
thermal.needsUpdate = true;
const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uObserver: { value: camera.position.clone() },
  uRight: { value: new THREE.Vector3(1, 0, 0) },
  uUp: { value: new THREE.Vector3(0, 1, 0) },
  uForward: { value: new THREE.Vector3(0, 0, -1) },
  uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) },
  uAspect: { value: 1 },
  uStep: { value: .008 },
  uSupersample: { value: true },
  uScreenOffset: { value: 0 },
  uTemperatureScale: { value: 1 },
  uOuter: { value: 32 },
  uExposure: { value: 1 },
  uSpectrum: { value: 0 },
  uDisk: { value: true },
  uStars: { value: true },
  uProbe: { value: false },
  uSky: { value: makeSky() },
  uThermal: { value: thermal },
};
const material = new THREE.ShaderMaterial({
  uniforms, fragmentShader,
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
  depthTest: false, depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
quad.frustumCulled = false;
scene.add(quad);
const renderCamera = new THREE.Camera();
const presets = {
  inclined: { radius: 80, inclination: 82, azimuth: 0 },
  edge: { radius: 80, inclination: 87, azimuth: 0 },
  pole: { radius: 95, inclination: 8, azimuth: 0 },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let transition = null;
let quality = 'high';
let resolutionScale = 1;
let exposure = 0;
let rate = .2;
let fps = 0;
let frameNumber = 0;
let fpsHistory = [];
let noticeTimer;
function notice(text) {
  $('#notice').textContent = text;
  $('#notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 3000);
}
function setRate(value) {
  rate = value;
  const mdot = rate * SOLAR_MASS / YEAR;
  uniforms.uTemperatureScale.value = (mdot * C ** 6 / (G * G * MASS * MASS * SIGMA)) ** .25;
  $('#accretion-value').textContent = `${rate.toFixed(2)} M☉/yr`;
  $('#temperature').innerHTML = `${Math.round(diskTemperature(9.551, rate)).toLocaleString('en-US')} <small>K</small>`;
}
setRate(.2);
$('#accretion').addEventListener('input', event => setRate(10 ** Number(event.target.value)));
$('#outer').addEventListener('input', event => {
  uniforms.uOuter.value = Number(event.target.value);
  $('#outer-value').innerHTML = `${event.target.value} r<sub>g</sub>`;
});
$('#exposure').addEventListener('input', event => {
  exposure = Number(event.target.value);
  uniforms.uExposure.value = 2 ** exposure;
  $('#exposure-value').textContent = `${exposure >= 0 ? '+' : ''}${exposure.toFixed(1)} EV`;
});
$('#spectrum').addEventListener('change', event => {
  uniforms.uSpectrum.value = Number(event.target.value);
  $('#legend').hidden = uniforms.uSpectrum.value !== 2;
});
$('#disk').addEventListener('change', event => { uniforms.uDisk.value = event.target.checked; });
$('#stars').addEventListener('change', event => { uniforms.uStars.value = event.target.checked; });
function resize() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  uniforms.uAspect.value = camera.aspect;
  uniforms.uScreenOffset.value = width > 1120 ? .14 : 0;
  // Keep the complete disk visible on portrait displays without changing the geodesic model.
  uniforms.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1.4 / camera.aspect);
  const pixelScale = Math.min(devicePixelRatio, 1.25) * resolutionScale;
  renderer.setSize(Math.round(width * pixelScale), Math.round(height * pixelScale), false);
  uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
}
addEventListener('resize', resize);
$('#quality').addEventListener('change', event => {
  quality = event.target.value;
  uniforms.uStep.value = { balanced: .02, high: .008, ultra: .004 }[quality];
  uniforms.uSupersample.value = quality !== 'balanced';
  resolutionScale = { balanced: .8, high: 1, ultra: 1.25 }[quality];
  resize();
});
function chooseView(name) {
  const preset = presets[name];
  const to = new THREE.Vector3().setFromSphericalCoords(preset.radius, THREE.MathUtils.degToRad(preset.inclination), preset.azimuth);
  controls.autoRotate = false;
  $('#orbit').setAttribute('aria-pressed', 'false');
  transition = { from: camera.position.clone(), to, start: performance.now(), duration: reducedMotion ? 0 : 1100 };
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => chooseView(button.dataset.view)));
$('#reset').addEventListener('click', () => chooseView('inclined'));
$('#orbit').addEventListener('click', () => {
  transition = null;
  controls.autoRotate = !controls.autoRotate;
  $('#orbit').setAttribute('aria-pressed', String(controls.autoRotate));
});
controls.addEventListener('start', () => { transition = null; });
function collapsePanel(collapsed) {
  $('#settings').hidden = collapsed;
  $('#collapse').setAttribute('aria-expanded', String(!collapsed));
  $('#collapse').setAttribute('aria-label', collapsed ? '展开参数' : '收起参数');
  $('#collapse').title = collapsed ? '展开参数' : '收起参数';
  $('#collapse').innerHTML = `<i data-lucide="${collapsed ? 'chevron-down' : 'chevron-up'}"></i>`;
  createIcons({ icons });
}
collapsePanel(innerWidth <= 700);
$('#collapse').addEventListener('click', () => collapsePanel(!$('#settings').hidden));
$('#info').addEventListener('click', () => $('#physics-dialog').showModal());
$('#close-info').addEventListener('click', () => $('#physics-dialog').close());
$('#physics-dialog').addEventListener('click', event => {
  if (event.target === $('#physics-dialog')) {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  }
});
$('#capture').addEventListener('click', () => {
  renderer.render(scene, renderCamera);
  const link = document.createElement('a');
  link.download = 'schwarzschild-blackhole.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  notice('画面已保存');
});
function syncCamera() {
  camera.updateMatrixWorld();
  uniforms.uObserver.value.copy(camera.position);
  uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
  uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
  uniforms.uForward.value.setFromMatrixColumn(camera.matrixWorld, 2).negate();
}
resize();
syncCamera();
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  console.error('Ray tracer shader:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(fragment));
  $('#loading').innerHTML = '<p>当前图形驱动无法编译测地线追踪器，请更换支持 WebGL 2 的浏览器。</p>';
};
let last = performance.now(), sampleStart = last, samples = 0;
let hidden = document.hidden;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  notice('图形上下文丢失，请刷新页面恢复');
});
renderer.setAnimationLoop(now => {
  const delta = Math.min((now - last) / 1000, .1);
  last = now;
  if (hidden) return;
  if (transition) {
    const t = transition.duration === 0 ? 1 : Math.min((now - transition.start) / transition.duration, 1);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, k);
    if (t === 1) transition = null;
  }
  controls.update(delta);
  syncCamera();
  renderer.render(scene, renderCamera);
  frameNumber++; samples++;
  if (now - sampleStart > 1000) {
    fps = samples * 1000 / (now - sampleStart);
    fpsHistory.push(Math.round(fps));
    if (fpsHistory.length > 30) fpsHistory.shift();
    $('#fps').textContent = `${Math.round(fps)} FPS`;
    $('#distance').innerHTML = `${camera.position.length().toFixed(1)} <small>r<sub>g</sub></small>`;
    const inclination = THREE.MathUtils.radToDeg(Math.acos(camera.position.y / camera.position.length()));
    $('#inclination').innerHTML = `${inclination.toFixed(1)}<small>°</small>`;
    samples = 0; sampleStart = now;
  }
  if (frameNumber === 2) {
    $('#loading').style.opacity = '0';
    setTimeout(() => $('#loading')?.remove(), 550);
  }
});
window.blackholeDiagnostics = () => ({
  model: 'Schwarzschild null geodesics + zero-torque Novikov-Thorne disk',
  fps: Math.round(fps), fpsHistory: [...fpsHistory], frames: frameNumber,
  quality, step: uniforms.uStep.value, camera: camera.position.toArray(),
  observerRadius: camera.position.length(), autoRotate: controls.autoRotate,
  rate, maxTemperature: diskTemperature(9.551, rate), disk: uniforms.uDisk.value,
  stars: uniforms.uStars.value, spectrum: uniforms.uSpectrum.value,
  canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
  renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
});

// Run the real GPU tracer against an analytical capture cone on a separate target.
window.blackholeShadowProbe = () => {
  const size = 513;
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, stencilBuffer: false });
  const pixels = new Uint8Array(size * size * 4);
  const saved = {
    aspect: uniforms.uAspect.value, offset: uniforms.uScreenOffset.value,
    supersample: uniforms.uSupersample.value, disk: uniforms.uDisk.value,
    resolution: uniforms.uResolution.value.clone(), target: renderer.getRenderTarget(),
  };
  try {
    uniforms.uProbe.value = true;
    uniforms.uDisk.value = false;
    uniforms.uAspect.value = 1;
    uniforms.uScreenOffset.value = 0;
    uniforms.uSupersample.value = false;
    uniforms.uResolution.value.set(size, size);
    renderer.setRenderTarget(target);
    renderer.render(scene, renderCamera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    const mid = (size - 1) / 2;
    let left = mid, right = mid, down = mid, up = mid;
    const dark = (x, y) => pixels[(y * size + x) * 4] < 128;
    while (left > 0 && dark(left - 1, mid)) left--;
    while (right < size - 1 && dark(right + 1, mid)) right++;
    while (down > 0 && dark(mid, down - 1)) down--;
    while (up < size - 1 && dark(mid, up + 1)) up++;
    const radius = camera.position.length();
    const angle = Math.asin(3 * Math.sqrt(3) * Math.sqrt(1 - 2 / radius) / radius);
    const expected = Math.tan(angle) / uniforms.uTanHalfFov.value * size / 2;
    return {
      width: size, observerRadius: radius, step: uniforms.uStep.value,
      horizontalRadiusPixels: (right - left + 1) / 2,
      verticalRadiusPixels: (up - down + 1) / 2,
      analyticRadiusPixels: expected,
      errorPixels: Math.abs((right - left + 1) / 2 - expected),
      centerCaptured: dark(mid, mid), cornerEscapes: !dark(0, 0),
    };
  } finally {
    uniforms.uProbe.value = false;
    uniforms.uDisk.value = saved.disk;
    uniforms.uAspect.value = saved.aspect;
    uniforms.uScreenOffset.value = saved.offset;
    uniforms.uSupersample.value = saved.supersample;
    uniforms.uResolution.value.copy(saved.resolution);
    renderer.setRenderTarget(saved.target);
    target.dispose();
  }
};
