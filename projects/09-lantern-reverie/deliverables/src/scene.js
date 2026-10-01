import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// All artwork is generated locally. No fonts, models, textures or APIs are fetched.
const $ = id => document.getElementById(id);
const host = $('scene');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 87123;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const rand = (a, b) => a + random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const state = { mode: 'free', motion: !reducedMotion, time: 0, tourTime: 0, view: 'street', quality: 1, sound: false };
$('motion').checked = state.motion;

function fail(message) {
  $('loading').classList.add('error');
  $('loading-text').textContent = '灯境暂时未能点亮';
  document.querySelector('.loading-sub').textContent = message;
  const retry = document.createElement('button');
  retry.textContent = '重新点灯'; retry.className = 'error-retry';
  retry.onclick = () => location.reload(); $('loading').append(retry);
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (error) { fail('请使用支持 WebGL 2 的现代浏览器，并开启浏览器的硬件加速。'); throw error; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
host.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); renderer.setAnimationLoop(null); fail('图形连接已暂停，请重新点灯以恢复场景。'); });

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080e20');
scene.fog = new THREE.FogExp2('#151e34', 0.0105);
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `varying vec3 vDirection; void main(){ vec3 d=normalize(vDirection); float altitude=max(d.y,0.0); vec3 horizon=vec3(.032,.044,.082); vec3 zenith=vec3(.005,.012,.031); vec3 col=mix(horizon,zenith,smoothstep(0.,.7,altitude)); float haze=sin(d.x*23.+d.z*14.)*.5+.5; col+=vec3(.009,.013,.021)*haze*exp(-pow((d.y-.14)*9.,2.)); gl_FragColor=vec4(col,1.0); }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(335, 32, 20), skyMaterial); scene.add(sky);
const camera = new THREE.PerspectiveCamera(57, host.clientWidth / host.clientHeight, 0.15, 430);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 0.48, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight('#abc6ec', '#30201c', 1.25));
const moonLight = new THREE.DirectionalLight('#94b8e6', 2.3);
moonLight.position.set(-35, 60, -35); scene.add(moonLight);
const fillLight = new THREE.DirectionalLight('#edb088', 0.45);
fillLight.position.set(5, 6, 30); scene.add(fillLight);
for (const z of [10, -9, -29, -48, -69]) {
  const light = new THREE.PointLight('#ff9d42', 110, 26, 2);
  light.position.set(0, 5.8, z); scene.add(light);
}

const batches = new Map();
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const coneGeo = new THREE.ConeGeometry(1, 1, 10);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const allStatic = new THREE.Group(); scene.add(allStatic);
const materials = {};
function mat(name, color, options = {}) {
  return materials[name] = new THREE.MeshStandardMaterial({ color, roughness: .73, ...options });
}
const wood = mat('wood', '#542521');
const redWood = mat('redWood', '#8d3327', { roughness: .52 });
const darkWood = mat('darkWood', '#211c24');
const stone = mat('stone', '#54566a');
const wall = mat('wall', '#655152');
const paleWall = mat('paleWall', '#9a806a');
const gold = mat('gold', '#bd8846', { metalness: .6, roughness: .35 });
const roofMat = mat('roof', '#223b49', { metalness: .26, roughness: .49, side: THREE.DoubleSide });
const roofEdge = mat('roofEdge', '#3b636a', { metalness: .2, roughness: .48 });
const bark = mat('bark', '#4c2924');
const glowGold = mat('glowGold', '#ffce79', { emissive: '#ffa040', emissiveIntensity: 2.1 });
const glowRed = mat('glowRed', '#fa7b39', { emissive: '#ff5423', emissiveIntensity: .8 });
const blossomGold = mat('blossomGold', '#ffd384', { emissive: '#ff8a43', emissiveIntensity: .58 });
const blossomPink = mat('blossomPink', '#e97e74', { emissive: '#b53545', emissiveIntensity: .48 });
const windowMats = [.28, .49, .68].map((value, i) => mat(`window${i}`, ['#b37f49', '#d69f58', '#c57736'][i], { emissive: ['#ff9b42', '#ffc57b', '#ff762d'][i], emissiveIntensity: value }));

function instance(geometry, material, position, scale = v3(1, 1, 1), rotation = new THREE.Euler()) {
  quaternion.setFromEuler(rotation); matrix.compose(position, quaternion, scale);
  const key = geometry.uuid + material.uuid;
  if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [] });
  batches.get(key).matrices.push(matrix.clone());
}
function box(x, y, z, w, h, d, material = wood, ry = 0) {
  instance(boxGeo, material, v3(x, y, z), v3(w, h, d), new THREE.Euler(0, ry, 0));
}
function ball(x, y, z, r, material, sy = 1) {
  instance(sphereGeo, material, v3(x, y, z), v3(r, r * sy, r));
}
function branch(a, b, radius, material = wood, topRatio = 1) {
  const mid = a.clone().add(b).multiplyScalar(.5), delta = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), delta.clone().normalize());
  const geometry = topRatio === 1 ? cylinderGeo : new THREE.CylinderGeometry(topRatio, 1, 1, 7);
  matrix.compose(mid, q, v3(radius, delta.length(), radius));
  const key = geometry.uuid + material.uuid;
  if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [] });
  batches.get(key).matrices.push(matrix.clone());
}
function flushBatches() {
  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere(); allStatic.add(mesh);
  }
  batches.clear();
}
function canvasTexture(w, h, paint) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); return texture;
}
const lightTexture = canvasTexture(128, 128, (ctx, w, h) => {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(.08, '#fff9'); gradient.addColorStop(.3, '#fff3'); gradient.addColorStop(1, '#fff0');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
});
const glows = [];
function addGlow(x, y, z, size, color = '#ffa647', opacity = .45) { glows.push({ x, y, z, size, color: new THREE.Color(color), opacity }); }

// Slightly irregular paving and a subdued planar reflection create a rain-washed street.
const paving = canvasTexture(1024, 1024, (ctx, w, h) => {
  ctx.fillStyle = '#1b2330'; ctx.fillRect(0, 0, w, h);
  for (let row = 0; row < 14; row++) for (let col = -1; col < 6; col++) {
    const x = col * 205 + (row % 2) * 102, y = row * 73;
    const shade = Math.floor(rand(48, 66));
    ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 12})`;
    ctx.fillRect(x + 3, y + 2, 199, 69);
    ctx.strokeStyle = '#8c919b15'; ctx.strokeRect(x + 5, y + 4, 195, 65);
    for (let i = 0; i < 26; i++) { ctx.fillStyle = random() > .5 ? '#ffffff06' : '#00000012'; ctx.fillRect(x + rand(5, 200), y + rand(3, 68), rand(2, 14), 1); }
  }
});
paving.wrapS = paving.wrapT = THREE.RepeatWrapping; paving.repeat.set(3, 21);
const roadMat = new THREE.MeshStandardMaterial({ map: paving, roughness: .56, metalness: .12, transparent: true, opacity: .87, color: '#b9bdc9' });
const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 155), roadMat);
road.rotation.x = -Math.PI / 2; road.position.set(0, .025, -36); scene.add(road);
const reflection = new Reflector(new THREE.PlaneGeometry(18, 155), { color: '#65717b', textureWidth: 768, textureHeight: 768, clipBias: .005 });
reflection.rotation.x = -Math.PI / 2; reflection.position.set(0, .01, -36); scene.add(reflection);
box(0, -.22, -40, 250, .4, 260, mat('ground', '#151d2b'));
for (const side of [-1, 1]) {
  box(side * 8.4, .14, -35, 2.2, .3, 152, stone);
  box(side * 7.29, .16, -35, .16, .34, 152, darkWood);
  for (let z = 34; z > -111; z -= 1.4) box(side * 7.35, .34, z, .3, .13, 1.3, stone);
}

const lanternTexture = canvasTexture(256, 256, (ctx, w, h) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#622316'); gradient.addColorStop(.22, '#dc5424'); gradient.addColorStop(.5, '#ffbe59'); gradient.addColorStop(.78, '#db4e20'); gradient.addColorStop(1, '#682114');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { ctx.fillStyle = '#602d1844'; ctx.fillRect(i * 16, 0, 2, h); ctx.fillStyle = '#ffd37e30'; ctx.fillRect(i * 16 + 3, 0, 1, h); }
  for (let y = 13; y < 250; y += 9) { ctx.fillStyle = '#ffee9a13'; ctx.fillRect(0, y, w, 1); }
});
const lanternMat = mat('lantern', '#ffffff', { map: lanternTexture, emissiveMap: lanternTexture, emissive: '#ffba61', emissiveIntensity: 1.55, roughness: .65 });
const lanternGeo = new THREE.SphereGeometry(1, 20, 14);
function lantern(x, y, z, size = 1, tassel = true) {
  instance(lanternGeo, lanternMat, v3(x, y, z), v3(.37 * size, .47 * size, .37 * size));
  instance(cylinderGeo, gold, v3(x, y + .445 * size, z), v3(.155 * size, .075 * size, .155 * size));
  instance(cylinderGeo, gold, v3(x, y - .445 * size, z), v3(.15 * size, .07 * size, .15 * size));
  branch(v3(x, y + .46 * size, z), v3(x, y + .8 * size, z), .014, darkWood);
  if (tassel) {
    branch(v3(x, y - .49 * size, z), v3(x, y - .81 * size, z), .017 * size, gold);
    instance(coneGeo, redWood, v3(x, y - .9 * size, z), v3(.055 * size, .24 * size, .055 * size), new THREE.Euler(Math.PI, 0, 0));
  }
  addGlow(x, y, z, size * 3.8, '#ffa146', .33);
}

function sign(text, x, y, z, w, h, rotate = 0, vertical = false) {
  const texture = canvasTexture(vertical ? 128 : 512, vertical ? 512 : 192, (ctx, cw, ch) => {
    ctx.fillStyle = '#291c21'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#b48247'; ctx.lineWidth = 5; ctx.strokeRect(9, 9, cw - 18, ch - 18);
    ctx.lineWidth = 1; ctx.strokeRect(17, 17, cw - 34, ch - 34);
    ctx.fillStyle = '#f5d09a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${vertical ? 69 : 87}px "KaiTi","STKaiti","SimSun",serif`;
    if (vertical) [...text].forEach((c, i) => ctx.fillText(c, cw / 2, 60 + i * (ch - 115) / Math.max(text.length - 1, 1)));
    else { const step = cw / (text.length + 1); [...text].forEach((c, i) => ctx.fillText(c, step * (i + 1), ch / 2 + 2)); }
  });
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#eeba73', emissiveIntensity: .33, roughness: .6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z); mesh.rotation.y = rotate; scene.add(mesh);
}

// A curved, hipped roof is sampled as concentric rectangular rings.
function roof(cx, cy, cz, width, depth, height, rotation = 0) {
  const rings = 9, segments = 16, perim = segments * 4;
  const pos = [], uv = [], index = [];
  function localPoint(t, side, u) {
    const halfW = width * (.5 - .26 * t), halfD = depth * (.5 - .485 * t);
    let x, z;
    if (side === 0) { x = (u * 2 - 1) * halfW; z = halfD; }
    else if (side === 1) { x = halfW; z = (1 - u * 2) * halfD; }
    else if (side === 2) { x = (1 - u * 2) * halfW; z = -halfD; }
    else { x = -halfW; z = (u * 2 - 1) * halfD; }
    const y = height * Math.pow(t, 1.7) + .25 * Math.pow(1 - t, 10) + .36 * Math.pow(Math.abs(u * 2 - 1), 6) * Math.pow(1 - t, 4);
    return v3(x, y, z);
  }
  for (let r = 0; r <= rings; r++) for (let s = 0; s < 4; s++) for (let j = 0; j < segments; j++) {
    const p = localPoint(r / rings, s, j / segments); pos.push(p.x, p.y, p.z); uv.push(j / segments * 5, r / rings * 3);
  }
  for (let r = 0; r < rings; r++) for (let j = 0; j < perim; j++) {
    const a = r * perim + j, b = r * perim + (j + 1) % perim, c = a + perim, d = b + perim;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(index); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, roofMat); mesh.position.set(cx, cy, cz); mesh.rotation.y = rotation; scene.add(mesh);
  const transform = p => p.applyAxisAngle(v3(0, 1, 0), rotation).add(v3(cx, cy, cz));
  for (let side = 0; side < 4; side++) {
    for (let j = 0; j < segments; j++) branch(transform(localPoint(0, side, j / segments)), transform(localPoint(0, side, (j + 1) / segments)), .055, roofEdge);
    for (let j = 0; j <= segments; j++) {
      for (let r = 0; r < 5; r++) {
        const a = localPoint(r / 5, side, j / segments); a.y += .035;
        const b = localPoint((r + 1) / 5, side, j / segments); b.y += .035;
        branch(transform(a), transform(b), .028, roofEdge);
      }
    }
  }
  branch(transform(v3(-width * .27, height + .1, 0)), transform(v3(width * .27, height + .1, 0)), .095, roofEdge);
  for (const side of [-1, 1]) {
    const a = transform(v3(side * width * .27, height + .1, 0)), b = transform(v3(side * (width * .27 + .23), height + .5, 0));
    branch(a, b, .06, gold); ball(b.x, b.y, b.z, .09, gold);
  }
}

const shopNames = ['听雨茶坊', '长乐酒肆', '锦绣坊', '浮生小筑', '花间集', '醉春风', '云水客栈', '拾光灯铺'];
function building(side, row) {
  const z = 15 - row * 12.8, x = side * (12.3 + (row % 3) * .25);
  const h = [8, 9, 7.5, 9.2][row % 4], width = 7.7, depth = 11.6;
  box(x, .35, z, width + .4, .7, depth + .4, stone);
  box(x, h / 2 + .7, z, width, h, depth, row % 2 ? paleWall : wall);
  const front = Math.abs(x) - width / 2;
  const fbox = (t, y, out, w, hh, d, material) => box(side * (front - out), y, z + t, d, hh, w, material);
  for (const y of [.85, 4.5, h + .5]) fbox(0, y, .07, depth + .2, .24, .28, darkWood);
  for (const t of [-5.25, -2.7, 0, 2.7, 5.25]) {
    fbox(t, (h + 1) / 2, .08, .22, h, .32, redWood);
    fbox(t, .77, .13, .4, .36, .4, gold);
  }
  for (const level of [2.55, 6.25]) {
    for (let col = 0; col < 4; col++) {
      const t = -4 + col * 2.65, wm = windowMats[(col + row) % 3];
      fbox(t, level, .18, 2.22, 2.35, .05, darkWood);
      fbox(t, level, .23, 1.98, 2.13, .035, wm);
      for (let u = -2; u <= 2; u++) fbox(t + u * .37, level, .265, .045, 2.15, .06, wood);
      for (const dy of [-.91, -.49, .49, .91]) fbox(t, level + dy, .27, 2.02, .045, .065, wood);
      fbox(t, level, .28, 2.1, .08, .08, redWood);
    }
  }
  // Deep eaves and a timber balcony produce readable architectural silhouettes.
  fbox(0, 4.4, .55, depth + .2, .26, 1.35, darkWood);
  for (let t = -5.5; t <= 5.5; t += .57) fbox(t, 4.92, 1.03, .055, .88, .055, redWood);
  fbox(0, 5.36, 1.03, depth, .08, .1, gold);
  roof(x, h + .62, z, depth + 1.9, width + 2.4, 1.7, Math.PI / 2);
  roof(side * (front + .1), 3.98, z, depth + 1.05, 2.8, .66, Math.PI / 2);
  for (const t of [-4.1, 0, 4.1]) {
    lantern(side * (front - 1.38), 3.62, z + t, .87);
    lantern(side * (front - .64), h + .2, z + t, .74);
  }
  sign(shopNames[(row + (side === 1 ? 3 : 0)) % shopNames.length], side * (front - .47), 3.54, z, 2.55, .63, -side * Math.PI / 2);
  if (row % 2 === 0) sign(side === 1 ? '酒暖人间' : '花灯如昼', side * (front - 1.25), 6.8, z - 4.95, .64, 2.3, -side * Math.PI / 2, true);
}
for (let row = 0; row < 8; row++) for (const side of [-1, 1]) building(side, row);

// Lantern canopies are intentionally staggered so the street retains a view of the sky.
for (let row = 0; row < 9; row++) {
  const z = 15 - row * 12.2;
  const points = [];
  for (let i = 0; i <= 40; i++) { const x = -8 + i * .4; points.push(v3(x, 10.7 - 2.15 * (1 - (x / 8) ** 2), z + Math.sin(i / 40 * Math.PI) * .8)); }
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#7a5540' })); scene.add(cable);
  for (let i = 0; i < 11; i++) {
    const x = -7.5 + i * 1.5, y = 10.7 - 2.15 * (1 - (x / 8) ** 2);
    lantern(x, y - .67, z + Math.sin((x + 8) / 16 * Math.PI) * .8, i % 2 === 0 ? .94 : .72);
  }
}

function gate(z) {
  for (const x of [-6.25, 6.25]) {
    box(x, .65, z, 1.2, 1.3, 1.2, stone);
    branch(v3(x, .8, z), v3(x, 11.7, z), .32, redWood);
    for (const y of [1.5, 8.2, 10.5]) instance(cylinderGeo, gold, v3(x, y, z), v3(.35, .12, .35));
    box(x, 9.8, z, 2.1, .2, 1.7, redWood);
    lantern(x - Math.sign(x) * 1.1, 9, z + .4, 1.35);
  }
  box(0, 10.3, z, 14.2, .8, 1.2, redWood); box(0, 11.1, z, 13, .38, 1.5, gold);
  roof(0, 11.35, z, 17.3, 5, 2.3);
  box(0, 11.78, z, 4.7, 2.3, 1.55, redWood); roof(0, 13, z, 7.2, 4.4, 1.5);
  sign('一夜鱼龙舞', 0, 10.37, z + .63, 4.6, 1.03);
  for (const x of [-3.3, -1.7, 0, 1.7, 3.3]) lantern(x, 9.0, z + .2, .65);
}
gate(-44);
function tower(z) {
  box(0, .65, z, 14, 1.3, 11, stone);
  for (let floor = 0; floor < 4; floor++) {
    const w = 11.5 - floor * 2.1, h = 4.8, y = 1.3 + floor * 5.7;
    box(0, y + h / 2, z, w, h, w * .65, redWood);
    for (let i = -2; i <= 2; i++) {
      box(i * w / 6, y + 2.5, z + w * .325 + .01, w / 8, 2.6, .05, windowMats[floor % 3]);
      box(i * w / 6, y + 2.5, z + w * .325 + .055, .08, 2.6, .07, darkWood);
      box(i * w / 6, y + 2.5, z + w * .325 + .06, w / 8, .07, .07, darkWood);
    }
    roof(0, y + h, z, w + 4, w * .65 + 4, 2);
    for (const x of [-w / 2, w / 2]) lantern(x, y + 4.3, z + w * .325 + .6, .85);
  }
  branch(v3(0, 25, z), v3(0, 29, z), .07, gold); ball(0, 28.4, z, .3, gold, 1.5);
}
tower(-88);

function floweringTree(x, z, size = 1, pink = false) {
  const endpoints = [], blossomMat = pink ? blossomPink : blossomGold;
  const origin = v3(x, .3, z), top = v3(x + .5 * size, 4.6 * size, z - .3);
  branch(origin, top, .24 * size, bark);
  for (let limb = 0; limb < 9; limb++) {
    const angle = limb / 9 * Math.PI * 2 + rand(-.3, .3);
    const reach = rand(2.2, 4.6) * size;
    const elbow = v3(top.x + Math.cos(angle) * reach * .55, top.y + rand(.4, 1.4) * size, top.z + Math.sin(angle) * reach * .55);
    const end = v3(top.x + Math.cos(angle) * reach, top.y + rand(1.9, 3.2) * size, top.z + Math.sin(angle) * reach);
    branch(top.clone().add(v3(0, rand(-1.6, .1), 0)), elbow, .10 * size, bark);
    branch(elbow, end, .049 * size, bark); endpoints.push(end);
    for (let twig = 0; twig < 4; twig++) {
      const t = rand(.3, .9), start = elbow.clone().lerp(end, t);
      const tip = start.clone().add(v3(rand(-1.4, 1.4), rand(.6, 1.65), rand(-1.4, 1.4)).multiplyScalar(size));
      branch(start, tip, .024 * size, bark);
      for (let petal = 0; petal < 16; petal++) {
        const p = tip.clone().add(v3(rand(-.78, .78), rand(-.37, .48), rand(-.78, .78)).multiplyScalar(size));
        ball(p.x, p.y, p.z, rand(.07, .16) * size, blossomMat, .78);
        if (petal % 4 === 0) addGlow(p.x, p.y, p.z, rand(.38, .72) * size, pink ? '#ffa392' : '#ffd083', .6);
      }
    }
    if (limb % 2 === 0) lantern(end.x, end.y - .95 * size, end.z, .48 * size);
  }
  box(x, .4, z, 2.4 * size, .8, 2.4 * size, stone);
  box(x, .85, z, 2.7 * size, .15, 2.7 * size, darkWood);
}
floweringTree(6.9, -17.5, 1.16, true);
floweringTree(-7, -28, 1.22);
floweringTree(7.2, -56, .95);
floweringTree(-7, -68, 1, true);

const awning = mat('awning', '#9b4231');
const fruitMats = [mat('fruitRed', '#c64930'), mat('fruitOrange', '#de9844'), mat('ceramic', '#7fada6', { metalness: .15 })];
function marketStall(side, z, index) {
  const x = side * 5.7;
  box(x, 1.15, z, 1.5, 1.6, 2.8, wood); box(x, 2, z, 1.9, .15, 3.1, darkWood);
  for (const dz of [-1.45, 1.45]) {
    branch(v3(x, .2, z + dz), v3(x, 3.7, z + dz), .045, gold);
    lantern(x - side * .7, 3.1, z + dz, .5);
  }
  box(x, 3.74, z, 2.35, .1, 3.5, awning);
  box(x - side * 1.14, 3.52, z, .05, .45, 3.48, redWood);
  for (let i = 0; i < 7; i++) {
    const zz = z - 1.12 + i * .36;
    ball(x, 2.18, zz, .19, fruitMats[index % 3], index % 3 === 2 ? 1.6 : 1);
    ball(x - .37, 2.16, zz + .08, .17, fruitMats[index % 3]);
  }
}
[-5, -34, -62].forEach((z, i) => marketStall(-1, z, i));
[-8, -32, -66].forEach((z, i) => marketStall(1, z, i + 1));

// Small silhouettes give the lantern market a human scale.
const robes = ['#33475b', '#623b43', '#827366', '#394d4b'].map((c, i) => mat(`robe${i}`, c));
const skin = mat('skin', '#b88a6d');
for (let i = 0; i < 25; i++) {
  const x = rand(-4.4, 4.4), z = rand(-80, -17), s = rand(.85, 1.1);
  instance(coneGeo, robes[i % 4], v3(x, .68 * s, z), v3(.28 * s, 1.15 * s, .23 * s));
  ball(x, 1.44 * s, z, .15 * s, skin, 1.15); ball(x, 1.54 * s, z - .035, .145 * s, darkWood, .65);
  branch(v3(x - .12, .22, z), v3(x - .13, .04, z), .05, darkWood); branch(v3(x + .12, .22, z), v3(x + .14, .04, z), .05, darkWood);
  if (i % 3 === 0) { branch(v3(x + .16, 1.1 * s, z), v3(x + .46, .95 * s, z), .055, robes[i % 4]); lantern(x + .49, .71 * s, z, .3); }
}

// Moon, distant layered mountains and warm paper lanterns fill the skyline.
const moon = new THREE.Mesh(new THREE.SphereGeometry(4.4, 32, 24), new THREE.MeshBasicMaterial({ color: '#e8d7b3', fog: false }));
moon.position.set(-46, 57, -156); scene.add(moon);
addGlow(-46, 57, -156, 33, '#b8c9e7', .13);
for (let layer = 0; layer < 3; layer++) {
  const pts = [v3(-190, -5, 0)];
  for (let i = 0; i <= 32; i++) pts.push(v3(-190 + i * 12, rand(6, 23) + Math.sin(i * .7) * 7 + layer * 3, 0));
  pts.push(v3(194, -5, 0));
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: ['#19263b', '#152136', '#101b2d'][layer], fog: false }));
  mesh.position.set(0, 0, -185 + layer * 15); scene.add(mesh);
}
const floatingLanterns = new THREE.Group(); scene.add(floatingLanterns);
const floatingData = [];
const skyLanternMaterial = new THREE.MeshBasicMaterial({ color: '#ffc77b' });
const floatingGeo = new THREE.CylinderGeometry(.25, .18, .47, 4, 1, true);
for (let i = 0; i < 66; i++) {
  const mesh = new THREE.Mesh(floatingGeo, skyLanternMaterial);
  mesh.position.set(rand(-58, 58), rand(15, 51), rand(-125, -27)); mesh.rotation.y = rand(0, Math.PI);
  const s = rand(.5, 1.3); mesh.scale.setScalar(s); floatingLanterns.add(mesh);
  floatingData.push({ mesh, initial: mesh.position.clone(), phase: rand(0, 6.28), speed: rand(.025, .07) });
  addGlow(mesh.position.x, mesh.position.y, mesh.position.z, s * 2.7, '#ffc786', .23);
}

function makePoints(data, options = {}) {
  const geometry = new THREE.BufferGeometry();
  const positions = [], sizes = [], colors = [], alphas = [];
  for (const point of data) { positions.push(point.x, point.y, point.z); sizes.push(point.size); colors.push(point.color.r, point.color.g, point.color.b); alphas.push(point.opacity ?? 1); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: host.clientHeight * renderer.getPixelRatio() * .5 }, uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float uScale; uniform float uTime; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*p; gl_PointSize=clamp(aSize*uScale/max(1.0,-p.z),1.0,200.0); vColor=color; vAlpha=aAlpha; }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; void main(){float d=length(gl_PointCoord-.5)*2.0; if(d>1.)discard; float a=exp(-d*d*${options.soft ? '5.8' : '9.0'})*smoothstep(1.,.55,d); gl_FragColor=vec4(vColor*${options.brightness || '1.7'},a*vAlpha);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, toneMapped: false
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points); return points;
}
flushBatches();
const staticGlows = makePoints(glows, { soft: true, brightness: '1.4' });
const stars = [];
for (let i = 0; i < 1150; i++) {
  const angle = rand(0, Math.PI * 2), elev = rand(.09, 1.5), r = rand(220, 300);
  stars.push({ x: Math.cos(angle) * Math.cos(elev) * r, y: Math.sin(elev) * r, z: Math.sin(angle) * Math.cos(elev) * r, size: rand(.10, .44), color: new THREE.Color(i % 6 === 0 ? '#ffd0a2' : '#baccea'), opacity: rand(.25, .8) });
}
const starPoints = makePoints(stars);
const dust = [];
for (let i = 0; i < 700; i++) dust.push({ x: rand(-15, 15), y: rand(.2, 22), z: rand(-100, 27), size: rand(.025, .1), color: new THREE.Color(random() > .18 ? '#ffd487' : '#ff9b72'), opacity: rand(.16, .8) });
const dustPoints = makePoints(dust);

// Fireworks use a single dynamic point buffer, with persistent falling spark trails.
const particleLimit = 11500;
const fireData = Array.from({ length: particleLimit }, () => ({ life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, color: new THREE.Color(), drag: .3, trail: false }));
let particleCursor = 0;
const firePoints = makePoints(Array.from({ length: particleLimit }, () => ({ x: 0, y: -100, z: 0, size: 0, color: new THREE.Color('#fff'), opacity: 0 })), { brightness: '3.1' });
for (const attr of Object.values(firePoints.geometry.attributes)) attr.setUsage(THREE.DynamicDrawUsage);
const fireworks = { launched: 0, next: 1.4, rockets: [] };
const firePalettes = [['#ffd98a', '#ffb259', '#fff3cb'], ['#ff9a80', '#ffe3a5', '#ffbe79'], ['#a8d3d7', '#f6db9a', '#fff1ce']];
function emitParticle(p) {
  const target = fireData[particleCursor++ % particleLimit]; Object.assign(target, p); target.color = p.color;
}
function burst(x, y, z, large = false) {
  const palette = firePalettes[fireworks.launched++ % firePalettes.length].map(c => new THREE.Color(c));
  const count = large ? 290 : 200, power = large ? 10.4 : rand(6.2, 9.5);
  for (let i = 0; i < count; i++) {
    const theta = i * 2.3999632, vy = 1 - 2 * (i + .5) / count, radial = Math.sqrt(1 - vy * vy), speed = power * rand(.68, 1.08);
    const life = rand(3.1, 5.2);
    emitParticle({ x, y, z, vx: Math.cos(theta) * radial * speed, vy: vy * speed, vz: Math.sin(theta) * radial * speed, life, maxLife: life, size: rand(.18, .29), color: palette[i % palette.length], drag: rand(.3, .5), trail: false });
  }
  for (let i = 0; i < 25; i++) emitParticle({ x, y, z, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-1, 1), life: .22, maxLife: .22, size: 2, color: palette[2], drag: .8, trail: true });
  if (state.sound) playBoom(x, z);
}
function launch(x, z, large = false) {
  const targetY = rand(25, 42), duration = rand(1.15, 1.65);
  fireworks.rockets.push({ x, z, y: 3, startY: 3, targetY, duration, t: 0, large });
}
// Opening tableau: two different ages expose both the bloom and the falling stars.
burst(12, 33, -47, true); burst(-19, 41, -71, false);

function updateFireworks(dt) {
  fireworks.next -= dt;
  if (fireworks.next < 0) { launch(rand(-24, 25), rand(-91, -45), random() > .7); fireworks.next = rand(1.9, 3.3); }
  for (let i = fireworks.rockets.length - 1; i >= 0; i--) {
    const r = fireworks.rockets[i]; r.t += dt;
    r.y = THREE.MathUtils.lerp(r.startY, r.targetY, Math.min(1, r.t / r.duration));
    for (let j = 0; j < 3; j++) emitParticle({ x: r.x + rand(-.04, .04), y: r.y - j * .17, z: r.z, vx: rand(-.1, .1), vy: -.2, vz: 0, life: .6, maxLife: .6, size: .12, color: new THREE.Color('#ffcc76'), drag: .5, trail: true });
    if (r.t >= r.duration) { burst(r.x, r.targetY, r.z, r.large); fireworks.rockets.splice(i, 1); }
  }
  const positions = firePoints.geometry.attributes.position.array, alphas = firePoints.geometry.attributes.aAlpha.array;
  const colors = firePoints.geometry.attributes.color.array, sizes = firePoints.geometry.attributes.aSize.array;
  for (let i = 0; i < particleLimit; i++) {
    const p = fireData[i];
    if (p.life <= 0) { alphas[i] = 0; continue; }
    p.life -= dt; const damping = Math.exp(-p.drag * dt);
    p.vx *= damping; p.vz *= damping; p.vy = p.vy * damping - (p.trail ? .5 : 1.65) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
    const life = Math.max(0, p.life / p.maxLife);
    alphas[i] = Math.pow(life, .65) * (life < .45 ? .64 + .36 * Math.sin(p.life * 35 + i) ** 2 : 1);
    sizes[i] = p.size; colors[i * 3] = p.color.r; colors[i * 3 + 1] = p.color.g; colors[i * 3 + 2] = p.color.b;
    if (!p.trail && p.life > .3 && random() < dt * 19) emitParticle({ x: p.x, y: p.y, z: p.z, vx: .04, vy: -.23, vz: 0, life: .56, maxLife: .56, size: p.size * .65, color: p.color, drag: .3, trail: true });
  }
  for (const attr of Object.values(firePoints.geometry.attributes)) attr.needsUpdate = true;
}
for (let i = 0; i < 38; i++) updateFireworks(.033);

const views = {
  street: { position: v3(.3, 5.2, 32), target: v3(.1, 14.0, -47), label: '长街灯市' },
  tree: { position: v3(-2.4, 4.0, -8), target: v3(6.0, 6.1, -19.5), label: '花树流光' },
  sky: { position: v3(0, 18, 4), target: v3(-1, 19, -65), label: '凌空望月' }
};
let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
let transition = null, hasExplored = false;
const keys = new Set();
const travel = v3();
function readOrientation() {
  const direction = v3(); camera.getWorldDirection(direction);
  yaw = targetYaw = Math.atan2(-direction.x, -direction.z);
  pitch = targetPitch = Math.asin(direction.y);
}
camera.position.copy(views.street.position); camera.lookAt(views.street.target); readOrientation();
function explore() {
  if (!hasExplored) { hasExplored = true; document.body.classList.add('is-exploring'); }
}
function markView(name) {
  state.view = name; $('scene-caption').textContent = views[name]?.label || '自由行走';
  document.querySelectorAll('.waypoint').forEach(button => { const on = button.dataset.view === name; button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); });
}
function setMode(mode, announce = true) {
  state.mode = mode;
  $('wander').classList.toggle('selected', mode === 'free'); $('wander').setAttribute('aria-pressed', String(mode === 'free'));
  $('tour').classList.toggle('selected', mode === 'tour'); $('tour').setAttribute('aria-pressed', String(mode === 'tour'));
  if (mode === 'tour') {
    explore(); state.tourTime = 0; transition = null; markView('');
    if (announce) toast('循着灯火缓缓前行 · 拖动画面即可恢复漫游');
  } else if (announce) toast('W A S D 移动 · 拖拽环视 · Q E 升降');
}
function goToView(name, reset = false) {
  setMode('free', false); keys.clear(); markView(name);
  const view = views[name];
  const targetCamera = camera.clone(); targetCamera.position.copy(view.position); targetCamera.lookAt(view.target);
  transition = { from: camera.position.clone(), to: view.position.clone(), qFrom: camera.quaternion.clone(), qTo: targetCamera.quaternion.clone(), t: 0, duration: reducedMotion ? .01 : 2.6 };
  if (reset) { hasExplored = false; document.body.classList.remove('is-exploring'); }
  else explore();
}
function manualControl() { if (transition) readOrientation(); if (state.mode !== 'free') setMode('free', false); transition = null; explore(); markView(''); }

let pointer = null;
host.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  host.setPointerCapture(event.pointerId); host.classList.add('dragging');
});
host.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 1) manualControl();
  targetYaw -= dx * .003; targetPitch = clamp(targetPitch - dy * .0027, -1.05, 1.22);
  pointer.x = event.clientX; pointer.y = event.clientY;
});
function releasePointer() { pointer = null; host.classList.remove('dragging'); }
host.addEventListener('pointerup', releasePointer); host.addEventListener('pointercancel', releasePointer); host.addEventListener('lostpointercapture', releasePointer);
host.addEventListener('wheel', event => {
  event.preventDefault(); manualControl(); camera.getWorldDirection(travel); camera.position.addScaledVector(travel, -clamp(event.deltaY, -120, 120) * .024); keepInBounds();
}, { passive: false });
host.addEventListener('dblclick', event => {
  const normalized = new THREE.Vector3(event.clientX / host.clientWidth * 2 - 1, -(event.clientY / host.clientHeight) * 2 + 1, .5).unproject(camera);
  const direction = normalized.sub(camera.position).normalize();
  const center = camera.position.clone().addScaledVector(direction, 58);
  userFirework(clamp(center.x, -42, 42), clamp(center.z, -120, -30));
});
const movementCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (movementCodes.includes(event.code)) { event.preventDefault(); keys.add(event.code); manualControl(); }
  if (event.repeat) return;
  if (event.code === 'KeyR') goToView('street', true);
  if (event.code === 'KeyF') userFirework();
  if (event.code === 'Escape') { $('help-panel').hidden = true; $('help-toggle').setAttribute('aria-expanded', 'false'); }
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); releasePointer(); });
document.querySelectorAll('.touch-controls button').forEach(button => {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.key); manualControl(); });
  const release = () => keys.delete(button.dataset.key);
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
document.querySelectorAll('.waypoint').forEach(button => button.addEventListener('click', () => goToView(button.dataset.view)));
$('brand-home').addEventListener('click', event => { event.preventDefault(); goToView('street', true); });
$('wander').addEventListener('click', () => setMode('free'));
$('tour').addEventListener('click', () => setMode(state.mode === 'tour' ? 'free' : 'tour'));
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3400); }
function userFirework(x = camera.position.x + rand(-17, 17), z = camera.position.z - 65) {
  if (!state.motion) { state.motion = true; $('motion').checked = true; }
  launch(x, z, true); setTimeout(() => launch(x + 11, z - 10), 450); toast('愿此刻灯火，照见心中所愿');
}
$('firework').addEventListener('click', () => userFirework());
$('help-toggle').addEventListener('click', () => { const hidden = !$('help-panel').hidden; $('help-panel').hidden = hidden; $('help-toggle').setAttribute('aria-expanded', String(!hidden)); });
$('help-close').addEventListener('click', () => { $('help-panel').hidden = true; $('help-toggle').setAttribute('aria-expanded', 'false'); });
$('motion').addEventListener('change', event => { state.motion = event.target.checked; });
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('experience').requestFullscreen(); }
  catch { toast('当前窗口不支持全屏，可在浏览器中打开赏灯'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏赏灯'); });

let audioContext = null, masterGain = null, wind = null, chimeNext = 0;
function startAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) { toast('当前浏览器暂不支持环境音'); return false; }
  if (!audioContext) {
    audioContext = new AudioContext(); masterGain = audioContext.createGain(); masterGain.gain.value = .0; masterGain.connect(audioContext.destination);
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate);
    const samples = buffer.getChannelData(0); let previous = 0;
    for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .023) / 1.026; samples[i] = previous; }
    wind = audioContext.createBufferSource(); wind.buffer = buffer; wind.loop = true;
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
    const gain = audioContext.createGain(); gain.gain.value = .23; wind.connect(filter).connect(gain).connect(masterGain); wind.start();
  }
  audioContext.resume(); return true;
}
function playChime() {
  const now = audioContext.currentTime, tones = [392, 440, 523.25, 587.33, 659.25, 783.99];
  const frequency = tones[Math.floor(random() * tones.length)];
  [1, 2.76, 5.4].forEach((multiple, i) => {
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = frequency * multiple;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.028 / (i + 1), now + .014); gain.gain.exponentialRampToValueAtTime(.0001, now + 3.6 / (i + 1));
    oscillator.connect(gain).connect(masterGain); oscillator.start(now); oscillator.stop(now + 4);
  });
}
function playBoom() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime, duration = .85;
  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
  const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * .12));
  const source = audioContext.createBufferSource(); source.buffer = buffer;
  const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 180;
  const gain = audioContext.createGain(); gain.gain.value = .48; source.connect(filter).connect(gain).connect(masterGain); source.start(now);
}
$('sound').addEventListener('click', () => {
  if (!startAudio()) return; state.sound = !state.sound;
  masterGain.gain.setTargetAtTime(state.sound ? .72 : 0, audioContext.currentTime, .2);
  $('sound').setAttribute('aria-pressed', String(state.sound)); $('sound').setAttribute('aria-label', state.sound ? '关闭环境音' : '开启环境音');
  if (state.sound) { playChime(); toast('风过灯铃，远处烟花 · 环境音已开启'); }
});

function keepInBounds() {
  camera.position.x = clamp(camera.position.x, camera.position.y > 13 ? -23 : -5.0, camera.position.y > 13 ? 23 : 5.0);
  camera.position.y = clamp(camera.position.y, 1.4, 34); camera.position.z = clamp(camera.position.z, -78, 32);
  // Stay in front of the central tower and above any stall overhangs.
}
const tourPath = new THREE.CatmullRomCurve3([v3(.3, 5.2, 32), v3(-.8, 3.4, 4), v3(-2.5, 4.2, -13), v3(2.1, 5.1, -30), v3(0, 7.5, -40), v3(.2, 17, -20), v3(1, 19, 6), v3(.3, 5.2, 32)], true, 'catmullrom', .3);
const directionQuat = new THREE.Quaternion();
const lookMatrix = new THREE.Matrix4();
function updateCamera(dt) {
  if (transition) {
    transition.t += dt; const t = clamp(transition.t / transition.duration, 0, 1), eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, eased); camera.quaternion.slerpQuaternions(transition.qFrom, transition.qTo, eased);
    if (t >= 1) { transition = null; readOrientation(); } return;
  }
  if (state.mode === 'tour') {
    state.tourTime += dt;
    const t = (state.tourTime / 100) % 1, destination = tourPath.getPointAt(t);
    camera.position.lerp(destination, 1 - Math.exp(-dt * .7));
    const look = v3(Math.sin(t * Math.PI * 4) * 3.2, t > .6 ? 22 : 9, -65);
    lookMatrix.lookAt(camera.position, look, v3(0, 1, 0)); directionQuat.setFromRotationMatrix(lookMatrix); camera.quaternion.slerp(directionQuat, 1 - Math.exp(-dt * .85)); readOrientation(); return;
  }
  const amount = 1 - Math.exp(-dt * 13);
  yaw = THREE.MathUtils.lerp(yaw, targetYaw, amount); pitch = THREE.MathUtils.lerp(pitch, targetPitch, amount);
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const sideways = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const vertical = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  if (forward || sideways || vertical) {
    travel.set(-Math.sin(yaw) * forward + Math.cos(yaw) * sideways, vertical, -Math.cos(yaw) * forward - Math.sin(yaw) * sideways).normalize();
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 12 : 5;
    camera.position.addScaledVector(travel, speed * dt); keepInBounds();
  }
}

function resize() {
  const width = host.clientWidth, height = host.clientHeight;
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); composer.setSize(width, height);
  for (const points of [staticGlows, starPoints, dustPoints, firePoints]) points.material.uniforms.uScale.value = height * renderer.getPixelRatio() * .5;
}
window.addEventListener('resize', resize);
const clock = new THREE.Clock(); let frames = 0, frameTotal = 0, qualityChecked = false;
const frameStats = { fps: 0, frames: 0, renderCalls: 0 };
document.addEventListener('visibilitychange', () => { keys.clear(); clock.getDelta(); if (audioContext && state.sound) masterGain.gain.setTargetAtTime(document.hidden ? 0 : .72, audioContext.currentTime, .15); });
function animate() {
  if (document.hidden) { clock.getDelta(); return; }
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, .05);
  updateCamera(dt);
  if (state.motion) {
    state.time += dt; updateFireworks(dt);
    const positions = dustPoints.geometry.attributes.position.array;
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i]; positions[i * 3] = p.x + Math.sin(state.time * .22 + i) * .7;
      positions[i * 3 + 1] = ((p.y - state.time * (.12 + (i % 5) * .035)) % 22 + 22) % 22;
      positions[i * 3 + 2] = p.z + Math.sin(state.time * .15 + i * 3) * .5;
    }
    dustPoints.geometry.attributes.position.needsUpdate = true;
    for (const data of floatingData) { data.mesh.position.y = data.initial.y + Math.sin(state.time * data.speed + data.phase) * 1.6; data.mesh.position.x = data.initial.x + Math.sin(state.time * .09 + data.phase) * .6; data.mesh.rotation.z = Math.sin(state.time * .6 + data.phase) * .06; }
  }
  if (state.sound && audioContext && audioContext.state === 'running') { chimeNext -= dt; if (chimeNext <= 0) { playChime(); chimeNext = rand(2.9, 6.6); } }
  composer.render(); frames++; frameTotal += rawDt;
  if (frameTotal > 1) {
    frameStats.fps = Math.round(frames / frameTotal); frameStats.frames += frames; frameStats.renderCalls = renderer.info.render.calls;
    host.dataset.sceneState = JSON.stringify({ mode: state.mode, motion: state.motion, position: camera.position.toArray().map(n => +n.toFixed(2)), rotation: [yaw, pitch].map(n => +n.toFixed(3)), fireworks: fireworks.launched, sound: state.sound, quality: state.quality, ...frameStats });
    frames = 0; frameTotal = 0;
  }
  if (!qualityChecked && state.time > 8 && frameStats.fps) {
    qualityChecked = true;
    if (frameStats.fps < 32) { state.quality = .8; renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); reflection.getRenderTarget().setSize(512, 512); resize(); }
  }
}
// The first composed frame must be visible before the loading curtain disappears.
try {
  composer.render();
  requestAnimationFrame(() => { $('loading').classList.add('hidden'); setTimeout(() => $('loading').remove(), 1300); });
  renderer.setAnimationLoop(animate);
} catch (error) { fail('场景初始化失败，请尝试更新浏览器后重新点灯。'); console.error(error); }

// A small read-only diagnostics API supports manual QA without affecting the experience.
window.lanternScene = { getState: () => ({ mode: state.mode, motion: state.motion, position: camera.position.toArray(), rotation: [yaw, pitch], fireworks: fireworks.launched, sound: state.sound, quality: state.quality, ...frameStats }) };
