import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createIcons, Sun, Sunset, Moon, RotateCw, House, Camera, Maximize } from 'lucide';
import './style.css';

createIcons({ icons: { Sun, Sunset, Moon, RotateCw, House, Camera, Maximize } });

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dbe6df');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch (error) {
  document.querySelector('#loading').innerHTML = '<p>此浏览器无法启用 WebGL，请使用支持硬件加速的浏览器。</p>';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
viewport.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-65, 65, 50, -50, .5, 450);
camera.position.set(100, 94, 119);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.minZoom = .55;
controls.maxZoom = 3.5;
controls.minPolarAngle = .08;
controls.maxPolarAngle = Math.PI * .465;
controls.autoRotateSpeed = .55;
controls.enablePan = true;

const hemi = new THREE.HemisphereLight('#f3f9e8', '#6e8075', 2.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1ce', 4.2);
sun.position.set(-45, 85, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 230 });
sun.shadow.normalBias = .12;
sun.shadow.bias = -.00012;
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);

const palettes = {
  stone: ['#c9cbbb', '#dadbcc', '#b9c2b2', '#e0dfcd'],
  paving: ['#bdc3af', '#c9ceba', '#d5d7c4', '#b3bba7'],
  wall: ['#a74635', '#b7523c', '#b14a36', '#bd5d43'],
  wood: ['#653c29', '#744631', '#86583a'],
  green: ['#42674e', '#4d7857', '#5c835d', '#668f63', '#385e47'],
  gold: ['#c6a35c', '#ddbd75', '#bc994f'],
  leaf: ['#638459', '#779962', '#8da870', '#54774b'],
  grass: ['#849b6a', '#8da375', '#96aa7c'],
  earth: ['#73846a', '#66765d', '#92a284'],
  lantern: ['#df6941', '#e57f49'],
  dark: ['#302e26'],
  water: ['#327d79', '#448d80', '#539a8a'],
  blossom: ['#dbb1a7', '#e7c2b3', '#dba599'],
};
const buckets = new Map();
let seed = 427;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
let local = { x: 0, z: 0, angle: 0 };
function box(type, x, y, z, w = 1, h = 1, d = 1, tint) {
  const colors = palettes[type];
  const color = tint ?? colors[Math.floor(random() * colors.length)];
  const key = `${type}:${color}`;
  if (!buckets.has(key)) buckets.set(key, { type, color, items: [] });
  const c = Math.cos(local.angle), s = Math.sin(local.angle);
  buckets.get(key).items.push({
    x: local.x + x * c + z * s, y, z: local.z - x * s + z * c,
    w, h, d, angle: local.angle,
  });
}
function at(x, z, angle, fn) {
  const previous = local;
  local = { x, z, angle };
  fn();
  local = previous;
}

// Roof tiles are individual quantized blocks; the edge rises at the corners.
function roof(y, width, depth, rise, ornate = false) {
  const unit = .8;
  const nx = Math.ceil(width / unit), nz = Math.ceil(depth / unit);
  const hx = nx * unit / 2, hz = nz * unit / 2;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x = (ix + .5) * unit - hx, z = (iz + .5) * unit - hz;
      const edge = Math.min(hx - Math.abs(x), hz - Math.abs(z));
      const t = Math.max(0, Math.min(1, edge / hz));
      const corner = Math.pow(Math.abs(x) / hx, 7) * Math.pow(Math.abs(z) / hz, 5);
      const yy = y + Math.round((rise * Math.pow(t, 1.25) + corner * 1.85) / .32) * .32;
      const border = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
      box(border ? 'gold' : 'green', x, yy, z, unit, .85, unit);
      if (border) box('wood', x, yy - .36, z, .78, .3, .78);
    }
  }
  const ridge = Math.max(1.6, width - depth);
  for (let x = -ridge / 2; x <= ridge / 2; x += .65) box('gold', x, y + rise + .4, 0, .63, .5, .65);
  for (const sign of [-1, 1]) {
    box('gold', sign * (ridge / 2 + .2), y + rise + .85, 0, .6, 1, .6);
    box('gold', sign * (ridge / 2 + .65), y + rise + 1.2, 0, .55, .45, .6);
  }
  if (ornate) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) box('gold', sx * (hx - .8 + k * .3), y + 1.1 + k * .42, sz * (hz - .8 + k * .3), .52, .48, .52);
    }
  }
}

function column(x, z, base, height) {
  box('stone', x, base + .23, z, 1.15, .46, 1.15);
  box('wall', x, base + height / 2 + .35, z, .62, height, .62);
  box('gold', x, base + .6, z, .69, .2, .69);
  box('gold', x, base + height - .1, z, .7, .22, .7);
  for (let i = 0; i < 3; i++) {
    box(i === 2 ? 'gold' : 'wood', x, base + height + i * .3, z, 1.2 + i * .5, .28, .54);
    box('wood', x, base + height + i * .3 + .12, z, .5, .24, 1.2 + i * .5);
  }
}
function windowPanel(x, y, z, w = 2.3, h = 2.6) {
  box('wood', x, y, z, w + .25, h + .25, .25);
  box('dark', x, y, z + .15, w, h, .12);
  for (let i = 0; i < 5; i++) box('gold', x - w / 2 + i * w / 4, y, z + .25, .075, h, .1);
  for (let i = 0; i < 5; i++) box('wood', x, y - h / 2 + i * h / 4, z + .27, w, .1, .12);
}
function lantern(x, y, z) {
  box('dark', x, y + .95, z, .1, .7, .1);
  box('lantern', x, y, z, .75, 1.15, .75);
  box('gold', x, y + .64, z, .88, .16, .88);
  box('gold', x, y - .64, z, .85, .16, .85);
  box('gold', x, y - 1, z, .12, .6, .12);
}
const plaqueMaterial = new THREE.MeshStandardMaterial({ color: '#133f37', roughness: .85 });
function plaque(text, x, y, z, width = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20483d'; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#d7b675'; ctx.lineWidth = 8; ctx.strokeRect(9, 9, 494, 142);
  ctx.fillStyle = '#efd496'; ctx.font = '600 90px "Noto Serif SC", "SimSun", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 85);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width / 3.2, .2), [
    plaqueMaterial, plaqueMaterial, plaqueMaterial, plaqueMaterial,
    new THREE.MeshStandardMaterial({ map: texture, roughness: .8 }), plaqueMaterial,
  ]);
  const c = Math.cos(local.angle), s = Math.sin(local.angle);
  mesh.position.set(local.x + x * c + z * s, y, local.z - x * s + z * c);
  mesh.rotation.y = local.angle;
  mesh.castShadow = true;
  scene.add(mesh);
}
function steps(width, front, height) {
  const count = Math.ceil(height / .28);
  for (let i = 0; i < count; i++) box('stone', 0, (i + 1) * height / count / 2, front + (count - i) * .48, width, (i + 1) * height / count, .53);
}
function railing(x1, x2, z, base) {
  for (let x = x1; x <= x2; x += 2) {
    box('stone', x, base + .65, z, .38, 1.3, .38);
    box('stone', x, base + 1.35, z, .55, .3, .55);
    if (x + 2 <= x2) {
      box('stone', x + 1, base + .94, z, 1.7, .21, .22);
      box('stone', x + 1, base + .45, z, 1.7, .2, .22);
    }
  }
}
function hall({ x, z, width, depth, height, angle = 0, main = false, name }) {
  at(x, z, angle, () => {
    const base = main ? 1.65 : 1.05;
    box('stone', 0, base / 2, 0, width + 4, base, depth + 4);
    box('stone', 0, base - .13, 0, width + 4.4, .3, depth + 4.4);
    box('wood', 0, base + .15, 0, width, .3, depth);
    box('wall', 0, base + height / 2, -1, width - 2, height, depth - 3.5);
    const front = depth / 2 - 1.8;
    for (let x = -width / 2 + 1; x <= width / 2; x += (width - 2) / 4) {
      column(x, depth / 2, base, height);
      column(x, -depth / 2, base, height);
    }
    box('wood', 0, base + height - .15, depth / 2, width + 1, .7, .7);
    for (const sx of [-1, 1]) {
      column(sx * (width / 2 - 1), 0, base, height);
      windowPanel(sx * width * .32, base + height * .48, front + .1, main ? 3.4 : 2.1, height * .53);
      lantern(sx * width * .36, base + height - 1.35, depth / 2 + .2);
    }
    box('wood', 0, base + height * .39, front + .12, width * .26, height * .78, .3);
    for (const sx of [-1, 1]) {
      windowPanel(sx * width * .065, base + height * .5, front + .32, width * .105, height * .46);
      box('gold', sx * .25, base + height * .29, front + .55, .13, .34, .1);
    }
    plaque(name, 0, base + height - .65, depth / 2 + .4, main ? 4.3 : 3);
    steps(main ? 7 : 4, depth / 2 + 2, base);
    railing(-width / 2 - 1, -4.5, depth / 2 + 1.75, base);
    railing(4.5, width / 2 + 1, depth / 2 + 1.75, base);
    roof(base + height + .65, width + 5, depth + 5, main ? 4.2 : 3.4, true);
    if (main) {
      box('wall', 0, base + height + 3.25, 0, width - 4, 3, depth - 4);
      for (const side of [-1, 1]) for (let xx = -7; xx <= 7; xx += 3.5) {
        box('gold', xx, base + height + 3.4, side * (depth / 2 - 1.9), .22, 1.3, .18);
      }
      roof(base + height + 4.6, width + 1, depth + .5, 4.1, true);
    }
  });
}

// Ground is a raised, block-edged garden island with a continuous axial path.
box('earth', 0, -1.7, 0, 87, 3.4, 94);
box('stone', 0, -.32, 0, 88, .65, 95);
box('grass', 0, .03, 0, 85.8, .3, 92.8);
for (let x = -42; x <= 42; x += 2) {
  box('stone', x, -.7, 47, 1.97, .6, .7);
  box('earth', x, -2, 46.7, 1.98, 1.7, .6);
}
for (let z = -46; z <= 46; z += 2) {
  box('stone', 43.5, -.7, z, .7, .6, 1.97);
  box('earth', 43.2, -2, z, .6, 1.7, 1.98);
}
for (let x = -16; x <= 16; x += 2) for (let z = -10; z <= 29; z += 2) {
  box('paving', x, .24, z, 1.95, .2, 1.95);
}
for (let z = -39; z <= 45; z += 1.5) for (let x = -3; x <= 3; x += 1.5) {
  box('stone', x, .36, z, 1.45, .23, 1.45);
}
for (const side of [-1, 1]) {
  for (let x = 4; x <= 34; x += 1.6) for (let z = -5; z <= -1; z += 1.5) box('paving', side * x, .34, z, 1.55, .2, 1.45);
}
hall({ x: 0, z: -23, width: 23, depth: 14, height: 6.8, main: true, name: '清和殿' });
hall({ x: -27, z: -1, width: 17, depth: 10, height: 4.9, angle: Math.PI / 2, name: '听松' });
hall({ x: 27, z: -1, width: 17, depth: 10, height: 4.9, angle: -Math.PI / 2, name: '观澜' });

function gate() {
  at(0, 33, 0, () => {
    box('stone', 0, .45, 0, 22, .9, 9);
    for (const side of [-1, 1]) {
      box('wall', side * 7.2, 3.2, 0, 5.2, 5.5, 5);
      windowPanel(side * 7.2, 3.3, 2.6, 2.3, 2.7);
      column(side * 3.4, 2.8, .9, 5.4);
      column(side * 9.2, 2.8, .9, 5.4);
      column(side * 3.4, -2.8, .9, 5.4);
      lantern(side * 3.6, 4.7, 3.3);
      box('wood', side * 3.1, 3, .6, .35, 4.5, 3);
    }
    box('wood', 0, 6.3, 2.8, 20.5, .6, .65);
    plaque('清和苑', 0, 5.95, 3.15, 3.8);
    roof(6.9, 24, 12, 3.1, true);
    steps(8, 4.5, .9);
  });
}
gate();

function tower(x, z, name) {
  at(x, z, 0, () => {
    box('stone', 0, .65, 0, 11.5, 1.3, 11.5);
    steps(4, 5.7, 1.3);
    for (let level = 0; level < 3; level++) {
      const base = 1.3 + level * 5.25;
      const size = 7.6 - level * 1.1;
      box('wood', 0, base + .2, 0, size + .6, .4, size + .6);
      if (level !== 1) box('wall', 0, base + 1.9, 0, size - 1.6, 3.3, size - 1.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(sx * (size / 2 - .3), sz * (size / 2 - .3), base, 3.5);
      windowPanel(0, base + 1.8, size / 2 - .7, 1.8, 2.2);
      if (level === 1) {
        box('gold', 0, base + 2, 0, 2.3, 2.4, 2.3);
        box('gold', 0, base + .65, 0, 2.8, .45, 2.8);
      }
      roof(base + 4.1, size + 3.4, size + 3.4, 2.35, true);
    }
    box('gold', 0, 20, 0, .55, 2.2, .55);
    box('gold', 0, 21.2, 0, .85, .5, .85);
    plaque(name, 0, 4.2, 3.95, 2.5);
  });
}
tower(-30, -30, '钟楼');
tower(30, -30, '鼓楼');

function gardenWall() {
  for (const sx of [-1, 1]) {
    box('stone', sx * 40, .55, -2, 1.2, 1.1, 81);
    box('wall', sx * 40, 1.8, -2, .8, 2.1, 81);
    for (let z = -42; z <= 39; z += .85) box('green', sx * 40, 3.05, z, 1.55, .45, .82);
    box('wall', sx * 27, 1.8, 34, 25, 2.9, .8);
    for (let x = 15; x <= 39; x += .85) box('green', sx * x, 3.4, 34, .82, .45, 1.6);
  }
  box('wall', 0, 1.8, -42, 80, 2.9, .8);
  for (let x = -40; x <= 40; x += .85) box('green', x, 3.4, -42, .82, .45, 1.6);
}
gardenWall();

for (const sx of [-1, 1]) {
  const x = sx * 10.5, z = 15;
  box('dark', x, .32, z, 9.5, .3, 12);
  box('water', x, .52, z, 8.8, .15, 11.2);
  for (const edge of [-1, 1]) {
    box('stone', x + edge * 4.7, .64, z, .55, .65, 12);
    box('stone', x, .64, z + edge * 5.9, 9.6, .65, .55);
  }
  for (let i = 0; i < 15; i++) {
    box('water', x + (random() - .5) * 7, .63, z + (random() - .5) * 9, .6 + random() * 1.4, .025, .12, '#a3c5ac');
  }
  for (let i = 0; i < 4; i++) {
    const px = x + (random() - .5) * 6, pz = z + (random() - .5) * 8;
    box('leaf', px, .69, pz, .8, .12, .8);
    box('blossom', px + .1, .85, pz, .32, .24, .32);
  }
  at(x, z, 0, () => {
    for (let i = -5; i <= 5; i++) {
      const y = 1.1 + (1 - Math.abs(i) / 6) * .65;
      box('wood', i * .85, y, 0, .81, .28, 2.1);
      for (const side of [-1, 1]) {
        box('wall', i * .85, y + .65, side * 1.15, .18, 1.3, .18);
        box('gold', i * .85, y + 1.28, side * 1.15, .86, .16, .19);
      }
    }
  });
}

function pine(x, z, height = 8, blossom = false) {
  at(x, z, 0, () => {
    box('stone', 0, .35, 0, 4, .5, 4);
    box('grass', 0, .63, 0, 3.5, .15, 3.5);
    for (let i = 0; i < height; i++) box('wood', Math.floor(i / 3) * .3, i + .8, 0, .8, 1, .8);
    box('wood', 1.2, height * .65, 0, 2.5, .5, .6);
    box('wood', -.9, height * .75, .7, 2.3, .5, .6);
    for (let layer = 0; layer < 3; layer++) {
      const y = height * .6 + layer * 1.65, radius = 3.4 - layer * .65;
      for (let xx = -Math.ceil(radius); xx <= radius; xx++) for (let zz = -Math.ceil(radius); zz <= radius; zz++) {
        if (Math.abs(xx) + Math.abs(zz) > radius * 1.6 || random() < .08) continue;
        box(blossom ? 'blossom' : 'leaf', xx + .5, y + Math.floor(random() * 2) * .5, zz, 1.04, 1.2, 1.04);
      }
    }
  });
}
for (const side of [-1, 1]) {
  pine(side * 32, 23, 7);
  pine(side * 22, 23, 5.5, true);
  pine(side * 20, -34, 6.5);
  pine(side * 34, -16, 6);
  pine(side * 32, 40, 5.5);
  for (let z = 8; z <= 27; z += 3.1) {
    box('leaf', side * 35, .95, z, 2.2, 1.6, 2.7);
    box('leaf', side * 35, 1.85, z, 1.65, .3, 2.1);
  }
  for (const z of [26, -11]) {
    box('stone', side * 17, .8, z, 1.6, 1.3, 1.6);
    box('stone', side * 17, 2, z, .5, 1.3, .5);
    box('lantern', side * 17, 3, z, .8, .9, .8);
    box('green', side * 17, 3.65, z, 1.5, .4, 1.5);
    box('green', side * 17, 4, z, .9, .3, .9);
  }
}

function lion(x, z) {
  at(x, z, 0, () => {
    box('stone', 0, .6, 0, 2.7, 1.2, 3);
    box('stone', 0, 1.3, 0, 2.9, .3, 3.2);
    box('stone', 0, 2.2, -.2, 1.4, 1.6, 1.5);
    box('stone', 0, 3.1, .3, 1.65, 1.3, 1.5);
    box('stone', 0, 3, 1.1, .85, .6, .7);
    for (const s of [-1, 1]) {
      box('stone', s * .65, 1.8, .85, .4, 1, .7);
      box('stone', s * .65, 3.9, .4, .45, .45, .5);
      box('dark', s * .4, 3.35, 1.07, .15, .14, .09);
    }
    box('stone', .95, 1.75, 1.2, .7, .7, .7);
  });
}
lion(-7, 40);
lion(7, 40);

// Ceremonial bronze incense burner at the center of the first court.
at(0, -1, 0, () => {
  box('stone', 0, .55, 0, 4.4, .55, 4.4);
  for (const x of [-1, 1]) for (const z of [-.7, .7]) box('gold', x, 1.35, z, .35, 1.3, .35);
  box('green', 0, 2.2, 0, 2.8, 1.4, 2);
  box('gold', 0, 2.95, 0, 3.2, .22, 2.3);
  for (const side of [-1, 1]) {
    box('gold', side * 1.7, 2.75, 0, .35, 1.1, .4);
    box('gold', side * 1.45, 3.35, 0, .7, .25, .4);
  }
  for (let x = -.5; x <= .5; x += .5) box('wood', x, 3.4, 0, .07, 1, .07);
});

const geometry = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
const lanternMaterials = [];
let voxelCount = 0;
for (const { type, color, items } of buckets.values()) {
  const material = new THREE.MeshStandardMaterial({
    color, roughness: type === 'water' ? .26 : .83,
    metalness: type === 'gold' ? .22 : 0,
    ...(type === 'lantern' ? { emissive: color, emissiveIntensity: .5 } : {}),
  });
  if (type === 'lantern') lanternMaterials.push(material);
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, b.angle, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = !['grass', 'paving', 'water', 'earth'].includes(type);
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  voxelCount += items.length;
}
buckets.clear();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#dbe6df', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.5;
floor.receiveShadow = true;
scene.add(floor);

document.querySelector('#voxel-count').textContent = `${(voxelCount / 1000).toFixed(1)}k 体素`;
const presets = {
  overview: { position: [100, 94, 119], target: [0, 3, 0], zoom: 1, caption: '一庭山水，六座殿宇' },
  axis: { position: [0, 75, 137], target: [0, 3, -2], zoom: 1.02, caption: '山门入境，礼序中轴' },
  hall: { position: [47, 47, 43], target: [0, 7, -21], zoom: 1.8, caption: '重檐叠翠，清和主殿' },
  top: { position: [0, 160, 15], target: [0, 0, 0], zoom: 1.03, caption: '方正有序，左右相映' },
};
let transition = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function chooseView(name, immediate = false) {
  const preset = presets[name];
  controls.autoRotate = false;
  document.querySelector('#rotate').setAttribute('aria-pressed', 'false');
  transition = {
    start: performance.now(), duration: immediate || reducedMotion ? 0 : 1100,
    from: camera.position.clone(), to: new THREE.Vector3(...preset.position),
    oldTarget: controls.target.clone(), target: new THREE.Vector3(...preset.target),
    oldZoom: camera.zoom, zoom: preset.zoom,
  };
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
  document.querySelector('#view-caption').textContent = preset.caption;
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => chooseView(button.dataset.view)));
controls.addEventListener('start', () => { transition = null; });
document.querySelector('#reset').addEventListener('click', () => chooseView('overview'));
document.querySelector('#rotate').addEventListener('click', event => {
  transition = null;
  controls.autoRotate = !controls.autoRotate;
  event.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
});
let noticeTimer;
function notice(text) {
  const element = document.querySelector('#notice');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { element.hidden = true; }, 3000);
}
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('#app').requestFullscreen();
  } catch { notice('当前浏览器不支持全屏模式'); }
});
document.querySelector('#capture').addEventListener('click', () => {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = 'qinghe-garden.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  notice('画面已保存');
});
const lights = {
  day: { background: '#dbe6df', sun: '#fff1ce', power: 4.2, ambient: 2.4, position: [-45, 85, 40], exposure: 1.25 },
  sunset: { background: '#d9c3b3', sun: '#ffc68a', power: 4.8, ambient: 1.7, position: [-65, 40, 25], exposure: 1.12 },
  night: { background: '#263b40', sun: '#a6c5cf', power: 2.1, ambient: 1.1, position: [-30, 75, -40], exposure: .95 },
};
document.querySelectorAll('[data-light]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.light, light = lights[mode];
  document.body.dataset.light = mode;
  scene.background.set(light.background);
  floor.material.color.set(light.background);
  sun.color.set(light.sun);
  sun.intensity = light.power;
  sun.position.set(...light.position);
  hemi.intensity = light.ambient;
  renderer.toneMappingExposure = light.exposure;
  lanternMaterials.forEach(material => { material.emissiveIntensity = mode === 'night' ? 3 : .5; });
  document.querySelectorAll('[data-light]').forEach(b => {
    b.classList.toggle('active', b === button);
    b.setAttribute('aria-pressed', String(b === button));
  });
}));
function resize() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  const aspect = width / height;
  const halfHeight = aspect < 1 ? 70 / aspect : 57;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
addEventListener('resize', resize);
resize();
let previous = performance.now();
let frameCount = 0;
let sampleStart = previous;
let fps = 0;
renderer.setAnimationLoop(now => {
  const delta = Math.min((now - previous) / 1000, .1);
  previous = now;
  if (transition) {
    const t = transition.duration === 0 ? 1 : Math.min((now - transition.start) / transition.duration, 1);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, k);
    controls.target.lerpVectors(transition.oldTarget, transition.target, k);
    camera.zoom = THREE.MathUtils.lerp(transition.oldZoom, transition.zoom, k);
    camera.updateProjectionMatrix();
    if (t === 1) transition = null;
  }
  controls.update(delta);
  renderer.render(scene, camera);
  frameCount++;
  if (now - sampleStart > 1000) {
    fps = frameCount * 1000 / (now - sampleStart);
    frameCount = 0;
    sampleStart = now;
  }
});
// Exposes small, read-only diagnostics for renderer verification.
window.sceneDiagnostics = () => ({
  voxels: voxelCount, drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles, fps: Math.round(fps),
  camera: camera.position.toArray(), target: controls.target.toArray(),
  autoRotate: controls.autoRotate, mode: document.body.dataset.light || 'day',
  canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
});
renderer.compile(scene, camera);
requestAnimationFrame(() => {
  const loading = document.querySelector('#loading');
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 600);
});
