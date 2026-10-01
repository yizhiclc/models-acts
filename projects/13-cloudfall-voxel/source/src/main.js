import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createIcons, Sunrise, Sun, Sunset, Pause, Play, Cloud, RotateCw, Camera, Scan } from 'lucide';
import './style.css';

const iconSet = { Sunrise, Sun, Sunset, Pause, Play, Cloud, RotateCw, Camera, Scan };
createIcons({ icons: iconSet });
const $ = selector => document.querySelector(selector);
const viewport = $('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce8e6');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (error) {
  $('#loading').innerHTML = '<p>无法启动 WebGL，请使用启用硬件加速的浏览器。</p>';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
viewport.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-65, 65, 55, -55, .5, 500);
camera.position.set(87, 73, 111);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 16, 0);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.minPolarAngle = .1;
controls.maxPolarAngle = Math.PI * .46;
controls.minZoom = .55;
controls.maxZoom = 3.8;
controls.autoRotateSpeed = .48;
const hemi = new THREE.HemisphereLight('#eafaff', '#647a66', 2.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0ce', 3.8);
sun.position.set(-55, 90, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -76, right: 76, top: 76, bottom: -76, near: 1, far: 240 });
sun.shadow.normalBias = .11;
sun.shadow.bias = -.00015;
scene.add(sun);

const palette = {
  grass: ['#668853', '#739359', '#819e61', '#90a86d'],
  moss: ['#718365', '#819070', '#91a07c'],
  rock: ['#7c8981', '#8c9890', '#9ca69b', '#a7afa2'],
  darkRock: ['#626f69', '#717e74', '#7c8a7b'],
  base: ['#56655d', '#657367', '#728071'],
  peak: ['#b4beb0', '#c3cbbd', '#d0d6c8'],
  trunk: ['#695440', '#796249'],
  pine: ['#315f4b', '#3c6c50', '#4f7c57', '#618960'],
  leaf: ['#769a61', '#8bac6e', '#9ab97d'],
  flower: ['#d6b591', '#e4c7a6', '#dc997d'],
  water: ['#4aa8a8', '#5eb9bb', '#6bc6c7'],
  river: ['#7bdbdf', '#91e2e3', '#a4e8e6'],
  foam: ['#ddf8ed', '#f2ffef'],
  sand: ['#a0ad8d', '#afbb9a', '#bac4a4'],
};
const geometry = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
const buckets = new Map();
let seed = 71389;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function add(type, x, y, z, w = 1, h = 1, d = 1, color) {
  color ??= palette[type][Math.floor(random() * palette[type].length)];
  const key = `${type}:${color}`;
  if (!buckets.has(key)) buckets.set(key, { type, color, items: [] });
  buckets.get(key).items.push({ x, y, z, w, h, d });
}
const unit = 1.2;
const peaks = [
  { x: -10, z: -13, height: 47, rx: 25, rz: 28 },
  { x: 15, z: -16, height: 35, rx: 23, rz: 23 },
  { x: -25, z: 2, height: 26, rx: 17, rz: 24 },
  { x: 26, z: 3, height: 24, rx: 16, rz: 21 },
  { x: -17, z: 20, height: 16, rx: 21, rz: 17 },
];
function terrain(x, z) {
  let height = 0;
  for (const peak of peaks) {
    const r = Math.hypot((x - peak.x) / peak.rx, (z - peak.z) / peak.rz);
    height = Math.max(height, peak.height * Math.pow(Math.max(0, 1 - r), 1.18));
  }
  const noise = Math.sin(x * .37 + z * .18) * .65 + Math.sin(z * .63 - x * .15) * .45;
  return Math.max(1.2, 2 + height + noise);
}
function lakeDistance(x, z) {
  return Math.hypot((x - 10) / 13.5, (z - 25) / 10.4);
}
const rows = [];
let lastHeight = Infinity;
for (let i = 0; i <= 30; i++) {
  const t = i / 30;
  const z = -10.8 + i * unit;
  const x = -9 + 19 * Math.pow(t, .87);
  let height = Math.max(1.6, Math.floor((terrain(x, z) - .8) / 2.4) * 2.4);
  if (lakeDistance(x, z) < .91) height = 1.6;
  height = Math.min(lastHeight, height);
  rows.push({ x, y: height + .28, z, bed: height - .15 });
  lastHeight = height;
}
function riverRow(z) {
  const index = Math.round((z + 10.8) / unit);
  if (index < 0 || index >= rows.length || Math.abs(rows[index].z - z) > .61) return null;
  return rows[index];
}
function surface(x, z) {
  let height = Math.floor(terrain(x, z) / unit) * unit;
  const lake = lakeDistance(x, z);
  if (lake < 1) height = .8;
  else if (lake < 1.3) height = Math.min(height, 1.2 + (lake - 1) * 11);
  const row = riverRow(z);
  if (row && Math.abs(x - row.x) < 2.55) height = row.bed;
  return Math.max(.7, height);
}
const groundCells = [];
// Columns are subdivided into exposed strata: interiors remain solid, not stacks of hidden cubes.
for (let ix = -35; ix <= 35; ix++) {
  for (let iz = -31; iz <= 33; iz++) {
    const x = ix * unit, z = iz * unit;
    const edge = Math.hypot(x / 42, (z - 1) / 39);
    const ragged = Math.sin(ix * .62) * .023 + Math.cos(iz * .7) * .02;
    if (edge > .99 + ragged) continue;
    const h = surface(x, z);
    const lake = lakeDistance(x, z);
    const row = riverRow(z);
    const river = row && Math.abs(x - row.x) < 2.55;
    const adjacent = [surface(x + unit, z), surface(x - unit, z), surface(x, z + unit), surface(x, z - unit)];
    const low = Math.max(-2.5, Math.min(...adjacent) - 1.2);
    const outside = edge > .94;
    const bottom = outside ? -2.5 : Math.max(-2.5, Math.min(low, h - .7));
    add('base', x, (bottom - 2.8) / 2, z, unit, bottom + 2.8, unit);
    let start = bottom;
    while (start < h - .42) {
      const thickness = Math.min(1.2, h - .42 - start);
      add(start > 30 ? 'rock' : start < 1 ? 'base' : 'darkRock', x, start + thickness / 2, z, unit, thickness, unit);
      start += thickness;
    }
    const steep = Math.max(...adjacent) - Math.min(...adjacent) > 4.8;
    let type = h > 37 ? 'peak' : h > 23 || steep ? 'rock' : h > 15 ? 'moss' : 'grass';
    if (lake < 1.2 || river) type = 'sand';
    add(type, x, h - .22, z, unit, .44, unit);
    if (lake < .94) add('water', x, 1.43, z, unit, .34, unit);
    groundCells.push({ x, z, h, lake, river: !!river, steep });
  }
}

const flowPoints = [];
const impactSites = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i], next = rows[i + 1];
  if (lakeDistance(row.x, row.z) < .8) break;
  add('river', row.x, row.y, row.z, 3.55, .22, unit + .04);
  for (const side of [-1, 1]) add('foam', row.x + side * 1.73, row.y + .08, row.z, .14, .12, unit);
  flowPoints.push(new THREE.Vector3(row.x, row.y + .3, row.z - .5));
  flowPoints.push(new THREE.Vector3(row.x, row.y + .3, row.z + .58));
  if (next && row.y - next.y > .1) {
    const drop = row.y - next.y;
    for (let stripe = 0; stripe < 8; stripe++) {
      add('river', row.x - 1.56 + stripe * .445, next.y + drop / 2, row.z + .59, .46, drop + .22, .31);
    }
    flowPoints.push(new THREE.Vector3(row.x, next.y + .3, row.z + .6));
    if (drop > 1.8) {
      impactSites.push({ x: row.x, y: next.y + .4, z: row.z + .8, width: 3.6 });
      add('foam', row.x, next.y + .2, row.z + .9, 3.6, .2, .6);
    }
  }
}
flowPoints.push(new THREE.Vector3(10, 1.92, 25.5));
const segments = [];
let flowLength = 0;
for (let i = 1; i < flowPoints.length; i++) {
  const a = flowPoints[i - 1], b = flowPoints[i];
  const length = a.distanceTo(b);
  if (length < .001) continue;
  segments.push({ a, b, start: flowLength, length });
  flowLength += length;
}
function pointOnFlow(distance, out) {
  const value = ((distance % flowLength) + flowLength) % flowLength;
  const segment = segments.find(item => value <= item.start + item.length) || segments.at(-1);
  out.lerpVectors(segment.a, segment.b, (value - segment.start) / segment.length);
  return segment;
}

function tree(x, y, z, height, broad = false) {
  add('trunk', x, y + height * .42, z, .45, height * .84, .45);
  const levels = broad ? 3 : 4;
  for (let k = 0; k < levels; k++) {
    const r = (broad ? 2.1 : 1.85) * (1 - k / (levels + 1)) * height / 6;
    const yy = y + height * .42 + k * height * .15;
    add(broad ? 'leaf' : 'pine', x, yy, z, r * 2, height * .19, r * 1.7);
    add(broad ? 'leaf' : 'pine', x, yy + height * .09, z, r * 1.35, height * .16, r * 2);
  }
}
const planted = [];
for (const cell of groundCells) {
  if (cell.h < 2.5 || cell.h > 20 || cell.river || cell.lake < 1.35 || cell.steep || random() > .062) continue;
  const row = riverRow(cell.z);
  if (row && Math.abs(cell.x - row.x) < 5.4) continue;
  if (planted.some(p => Math.hypot(p.x - cell.x, p.z - cell.z) < 3)) continue;
  tree(cell.x, cell.h, cell.z, 3.5 + random() * 3.4, random() < .2);
  planted.push(cell);
}
for (let i = 0; i < 75; i++) {
  const cell = groundCells[Math.floor(random() * groundCells.length)];
  if (cell.river || cell.lake < 1.1) continue;
  if (cell.h > 22) {
    add('rock', cell.x, cell.h + .5, cell.z, .7, 1, .8);
  } else {
    add('leaf', cell.x, cell.h + .35, cell.z, .5, .7, .55);
    if (random() < .4) add('flower', cell.x, cell.h + .75, cell.z, .38, .25, .38);
  }
}

// Small lookout and footpath give the terrain an immediately readable scale.
const lookout = { x: 22.8, z: 22.8 };
lookout.y = surface(lookout.x, lookout.z);
for (let ix = -2; ix <= 2; ix++) {
  add('trunk', lookout.x + ix * .55, lookout.y + .32, lookout.z, .51, .25, 3.2);
}
for (const side of [-1, 1]) {
  for (const z of [-1.4, 1.4]) add('trunk', lookout.x + side * 1.2, lookout.y + .85, lookout.z + z, .17, 1.3, .17);
  add('trunk', lookout.x + side * 1.2, lookout.y + 1.38, lookout.z, .18, .16, 3);
}
add('flower', lookout.x, lookout.y + 1.25, lookout.z, .5, .7, .4, '#c47c52');
add('peak', lookout.x, lookout.y + 1.88, lookout.z, .43, .45, .43);
add('trunk', lookout.x - .14, lookout.y + .65, lookout.z, .18, .55, .2);
add('trunk', lookout.x + .14, lookout.y + .65, lookout.z, .18, .55, .2);

const materials = [];
let voxelCount = 0;
for (const { type, color, items } of buckets.values()) {
  const isWater = ['water', 'river', 'foam'].includes(type);
  const material = new THREE.MeshStandardMaterial({
    color, roughness: isWater ? .35 : .95,
    metalness: 0,
    ...(isWater ? { emissive: color, emissiveIntensity: type === 'foam' ? .12 : .045 } : {}),
  });
  materials.push(material);
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((block, i) => {
    dummy.position.set(block.x, block.y, block.z);
    dummy.scale.set(block.w, block.h, block.d);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = !isWater;
  mesh.receiveShadow = true;
  scene.add(mesh);
  voxelCount += items.length;
}
buckets.clear();
const floorMaterial = new THREE.MeshStandardMaterial({ color: '#dce8e6', roughness: 1 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.1;
floor.receiveShadow = true;
scene.add(floor);

const cloudRoot = new THREE.Group();
scene.add(cloudRoot);
const cloudBands = [];
function cloudBand(x, y, z, width, depth, count, opacity, phase) {
  const material = new THREE.MeshStandardMaterial({
    color: '#f7fffa', roughness: 1, transparent: true, opacity,
    depthWrite: false, emissive: '#c9e1df', emissiveIntensity: .18,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  for (let i = 0; i < count; i++) {
    const u = random() * 2 - 1, v = random() * 2 - 1;
    const mid = 1 - Math.min(1, Math.hypot(u, v) * .65);
    dummy.position.set(u * width / 2, random() * 1.5 + mid * .7, v * depth / 2);
    dummy.scale.set(3.1 + random() * 4.5, 1 + random() * 1.3 + mid, 2.4 + random() * 3.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.position.set(x, y, z);
  mesh.computeBoundingSphere();
  cloudRoot.add(mesh);
  cloudBands.push({ mesh, x, y, z, phase });
}
cloudBand(-24, 19.5, -7, 25, 8, 23, .54, 0);
cloudBand(7, 23, -15, 25, 9, 24, .57, 2);
cloudBand(24, 17, 6, 22, 7, 23, .5, 4);
cloudBand(-12, 17.4, 15, 19, 7, 15, .38, 5);
cloudBand(-2, 28, -30, 31, 6, 18, .48, 1);

const flowMaterial = new THREE.MeshStandardMaterial({ color: '#e8fff7', emissive: '#a0dfde', emissiveIntensity: .45, roughness: .3 });
const flowMesh = new THREE.InstancedMesh(geometry, flowMaterial, 175);
flowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
flowMesh.frustumCulled = false;
scene.add(flowMesh);
const flowSeeds = Array.from({ length: 175 }, () => ({
  offset: random() * flowLength, lane: (random() - .5) * 2.9,
  size: .07 + random() * .1, speed: 7 + random() * 3,
}));
const sprayMesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
  color: '#e8fff3', emissive: '#afded4', emissiveIntensity: .3,
  transparent: true, opacity: .68, depthWrite: false,
}), 140);
sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sprayMesh.frustumCulled = false;
scene.add(sprayMesh);
const sprays = Array.from({ length: 140 }, () => ({
  site: impactSites[Math.floor(random() * impactSites.length)],
  phase: random(), dx: (random() - .5) * 3.5, dz: random() * 2,
  force: 1 + random() * 1.8, size: .07 + random() * .16,
}));
const rippleMesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
  color: '#b3e4d2', transparent: true, opacity: .62, depthWrite: false,
  emissive: '#88b6a9', emissiveIntensity: .1,
}), 48);
rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
rippleMesh.frustumCulled = false;
scene.add(rippleMesh);
const ripples = Array.from({ length: 48 }, () => {
  const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * .85;
  return { x: 10 + Math.cos(angle) * r * 12.5, z: 25 + Math.sin(angle) * r * 9.4, phase: random() * 6.28, length: .3 + random() * 1.3 };
});
const flowPosition = new THREE.Vector3();
function animateNature(time) {
  flowSeeds.forEach((particle, i) => {
    const segment = pointOnFlow(particle.offset + time * particle.speed, flowPosition);
    const vertical = Math.abs(segment.b.y - segment.a.y) > .3;
    dummy.position.set(flowPosition.x + particle.lane, flowPosition.y, flowPosition.z + (vertical ? .1 : 0));
    dummy.scale.set(particle.size, vertical ? .5 + particle.size : .07, vertical ? .08 : .55);
    dummy.updateMatrix();
    flowMesh.setMatrixAt(i, dummy.matrix);
  });
  flowMesh.instanceMatrix.needsUpdate = true;
  sprays.forEach((particle, i) => {
    const life = (time * .9 + particle.phase) % 1;
    const site = particle.site;
    dummy.position.set(site.x + particle.dx * life, site.y + Math.sin(life * Math.PI) * particle.force, site.z + particle.dz * life);
    const size = particle.size * (1 - life * .8);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    sprayMesh.setMatrixAt(i, dummy.matrix);
  });
  sprayMesh.instanceMatrix.needsUpdate = true;
  ripples.forEach((ripple, i) => {
    dummy.position.set(ripple.x + Math.sin(time * .4 + ripple.phase) * .25, 1.63, ripple.z);
    dummy.scale.set(ripple.length * (.75 + .25 * Math.sin(time + ripple.phase)), .025, .075);
    dummy.updateMatrix();
    rippleMesh.setMatrixAt(i, dummy.matrix);
  });
  rippleMesh.instanceMatrix.needsUpdate = true;
  cloudBands.forEach(band => {
    band.mesh.position.set(
      band.x + Math.sin(time * .065 + band.phase) * 3.3,
      band.y + Math.sin(time * .11 + band.phase) * .42,
      band.z + Math.sin(time * .05 + band.phase) * 1.2,
    );
  });
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let naturePlaying = !reducedMotion;
let elapsed = 0;
let transition = null;
function setMotionButton() {
  const button = $('#motion');
  button.setAttribute('aria-pressed', String(!naturePlaying));
  button.setAttribute('aria-label', naturePlaying ? '暂停水流与云雾' : '播放水流与云雾');
  button.title = button.getAttribute('aria-label');
  button.innerHTML = `<i data-lucide="${naturePlaying ? 'pause' : 'play'}"></i>`;
  createIcons({ icons: iconSet });
}
setMotionButton();
$('#motion').addEventListener('click', () => { naturePlaying = !naturePlaying; setMotionButton(); });
$('#clouds').addEventListener('click', () => {
  cloudRoot.visible = !cloudRoot.visible;
  $('#clouds').setAttribute('aria-pressed', String(cloudRoot.visible));
});
$('#rotate').addEventListener('click', () => {
  transition = null;
  controls.autoRotate = !controls.autoRotate;
  $('#rotate').setAttribute('aria-pressed', String(controls.autoRotate));
});
const presets = {
  overview: { position: [87, 73, 111], target: [0, 16, 0], zoom: 1, caption: '山出云间，水落林深' },
  fall: { position: [53, 46, 97], target: [0, 18, 7], zoom: 1.62, caption: '飞瀑叠落，一川入碧' },
  peaks: { position: [72, 64, 80], target: [-6, 30, -12], zoom: 1.62, caption: '群峰穿云，松风入境' },
  top: { position: [8, 155, 28], target: [0, 5, 0], zoom: 1.1, caption: '峰谷相依，水脉相连' },
};
function chooseView(name) {
  const preset = presets[name];
  controls.autoRotate = false;
  $('#rotate').setAttribute('aria-pressed', 'false');
  transition = {
    start: performance.now(), duration: reducedMotion ? 0 : 1100,
    from: camera.position.clone(), to: new THREE.Vector3(...preset.position),
    oldTarget: controls.target.clone(), target: new THREE.Vector3(...preset.target),
    oldZoom: camera.zoom, zoom: preset.zoom,
  };
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
  $('#caption').textContent = preset.caption;
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => chooseView(button.dataset.view)));
$('#reset').addEventListener('click', () => chooseView('overview'));
controls.addEventListener('start', () => { transition = null; });
const moods = {
  morning: { background: '#dce8e6', sun: '#fff0ce', ambient: 2.9, intensity: 3.8, position: [-55, 90, 55], exposure: 1.18 },
  day: { background: '#cee4e9', sun: '#f1fcff', ambient: 3.2, intensity: 4.1, position: [-25, 105, 20], exposure: 1.13 },
  dusk: { background: '#d8c9c5', sun: '#ffbe86', ambient: 2.4, intensity: 4, position: [-75, 42, 15], exposure: 1.07 },
};
let mood = 'morning';
document.querySelectorAll('[data-light]').forEach(button => button.addEventListener('click', () => {
  mood = button.dataset.light;
  const light = moods[mood];
  scene.background.set(light.background);
  floorMaterial.color.set(light.background);
  sun.color.set(light.sun);
  sun.intensity = light.intensity;
  sun.position.set(...light.position);
  hemi.intensity = light.ambient;
  renderer.toneMappingExposure = light.exposure;
  document.querySelectorAll('[data-light]').forEach(b => {
    b.classList.toggle('active', b === button);
    b.setAttribute('aria-pressed', String(b === button));
  });
}));
let noticeTimer;
function notice(text) {
  $('#notice').textContent = text;
  $('#notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 2500);
}
$('#capture').addEventListener('click', () => {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = 'cloudfall-landscape.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  notice('画面已保存');
});
function resize() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  const aspect = width / height;
  const halfHeight = aspect < 1 ? 59 / aspect : 48;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
addEventListener('resize', resize);
resize();
$('#scene-count').textContent = `5 座山峰 · ${(voxelCount / 1000).toFixed(1)}k 体素`;
let previous = performance.now();
let sampleStart = previous;
let sampleFrames = 0;
let fps = 0;
let frameNumber = 0;
let fpsSamples = [];
let hidden = document.hidden;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; previous = performance.now(); });
animateNature(0);
renderer.setAnimationLoop(now => {
  const delta = Math.max(0, Math.min((now - previous) / 1000, .05));
  previous = now;
  if (hidden) return;
  if (naturePlaying) {
    elapsed += delta;
    animateNature(elapsed);
  }
  if (transition) {
    const t = transition.duration === 0 ? 1 : Math.min(1, (now - transition.start) / transition.duration);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, k);
    controls.target.lerpVectors(transition.oldTarget, transition.target, k);
    camera.zoom = THREE.MathUtils.lerp(transition.oldZoom, transition.zoom, k);
    camera.updateProjectionMatrix();
    if (t === 1) transition = null;
  }
  controls.update(delta);
  renderer.render(scene, camera);
  frameNumber++;
  sampleFrames++;
  if (now - sampleStart > 1000) {
    fps = sampleFrames * 1000 / (now - sampleStart);
    fpsSamples.push(Math.round(fps));
    if (fpsSamples.length > 30) fpsSamples.shift();
    sampleStart = now;
    sampleFrames = 0;
  }
});
// Compact diagnostics allow visual and motion checks without exposing renderer internals.
window.sceneDiagnostics = () => ({
  voxels: voxelCount, trees: planted.length, peaks: peaks.length,
  waterfallDrops: impactSites.length, drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles, fps: Math.round(fps), fpsSamples: [...fpsSamples],
  frame: frameNumber, time: elapsed, naturePlaying, cloudsVisible: cloudRoot.visible,
  cloudPositions: cloudBands.map(b => b.mesh.position.toArray()),
  flowMatrix: Array.from(flowMesh.instanceMatrix.array.slice(12, 15)),
  camera: camera.position.toArray(), target: controls.target.toArray(),
  autoRotate: controls.autoRotate, mood,
  canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
});
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  notice('图形上下文已中断，请刷新页面恢复场景');
});
renderer.compile(scene, camera);
requestAnimationFrame(() => {
  $('#loading').style.opacity = '0';
  setTimeout(() => $('#loading')?.remove(), 450);
});
