import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, TRACK_LENGTH, trackPoint, CAR_SPACING } from './simulation.js';

const WORLD_WIDTH = 35.5;
const WORLD_DEPTH = 24;
// Requested enlargement: 1.5 × each dimension gives 2.25 × the original sandtable area.
const MODEL_SCALE = 1.5;
const riverX = z => 5.3 + .7 * Math.sin(z * .38) + .25 * Math.cos(z * .8);
const RIVER_HALF_WIDTH = 1.05;

export function createDiorama(canvas, simulation, labels, onFrame) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const camera = new THREE.OrthographicCamera(-25, 25, 15, -15, .1, 180);
  const initialPosition = new THREE.Vector3(31, 29, 37).multiplyScalar(MODEL_SCALE);
  const initialTarget = new THREE.Vector3(0, .2, 0).multiplyScalar(MODEL_SCALE);
  camera.position.copy(initialPosition);
  function makeControls() {
    const orbit = new OrbitControls(camera, canvas);
    orbit.target.copy(initialTarget); orbit.enableDamping = true; orbit.dampingFactor = .07; orbit.enablePan = false;
    orbit.minZoom = .75; orbit.maxZoom = 2.7; orbit.minPolarAngle = .22; orbit.maxPolarAngle = 1.22; orbit.rotateSpeed = .55; orbit.zoomSpeed = .7; orbit.update(); orbit.saveState(); return orbit;
  }
  let controls = makeControls();
  let disposed = false;
  let night = false;
  let frameId;
  let lastTime;
  let width = 1;
  let height = 1;
  let frames = 0;
  let fps = 0;
  let fpsTimer = 0;
  let performanceWindows = 0;
  let shadowFrame = 0;
  const modelRoot = new THREE.Group(); modelRoot.name = '松溪沙盘'; modelRoot.scale.setScalar(MODEL_SCALE); scene.add(modelRoot);
  const statics = new THREE.Group();
  modelRoot.add(statics);
  const allMaterials = new Set();
  const allGeometries = new Set();
  const allTextures = new Set();
  const glowing = [];
  const nightObjects = [];
  const nightLights = [];
  const wheels = [];
  const rand = (() => { let seed = 9282026; return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; })();
  const material = (color, roughness = .85, extra = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    allMaterials.add(mat); return mat;
  };
  const geometryCache = new Map();
  function cached(key, make) {
    if (!geometryCache.has(key)) { const geom = make(); geometryCache.set(key, geom); allGeometries.add(geom); }
    return geometryCache.get(key);
  }
  const unitBox = cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  const unitSphere = cached('sphere', () => new THREE.SphereGeometry(1, 12, 8));
  const tinySphere = cached('tinySphere', () => new THREE.SphereGeometry(1, 7, 5));
  const cylinderGeom = cached('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 12));
  function mesh(geometry, mat, x = 0, y = 0, z = 0, parent = statics, castShadow = true) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.castShadow = castShadow; object.receiveShadow = true;
    parent.add(object); allGeometries.add(geometry); return object;
  }
  function box(w, h, d, x, y, z, mat, parent = statics, bevel = 0) {
    const geom = bevel ? cached(`rounded:${w}:${h}:${d}:${bevel}`, () => new RoundedBoxGeometry(w, h, d, 2, bevel)) : unitBox;
    const object = mesh(geom, mat, x, y, z, parent);
    if (!bevel) object.scale.set(w, h, d);
    return object;
  }
  function sphere(x, y, z, sx, sy, sz, mat, parent = statics) {
    const object = mesh(Math.max(sx,sy,sz) < .20 ? tinySphere : unitSphere, mat, x, y, z, parent); object.scale.set(sx, sy, sz); return object;
  }
  function cylinder(r, h, x, y, z, mat, parent = statics, rTop = r) {
    const geom = rTop === r ? cylinderGeom : cached(`taper:${r}:${rTop}:${h}`, () => new THREE.CylinderGeometry(rTop, r, h, 12));
    const object = mesh(geom, mat, x, y, z, parent);
    if (r === rTop) object.scale.set(r, h, r);
    return object;
  }
  function beam(from, to, radius, mat, parent = statics) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), midpoint = a.clone().add(b).multiplyScalar(.5);
    const object = cylinder(radius, a.distanceTo(b), midpoint.x, midpoint.y, midpoint.z, mat, parent);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return object;
  }
  function flatPolygon(points, mat, y = 0, depth = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], -points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], -points[i][1]);
    shape.closePath();
    const geom = depth ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    return mesh(geom, mat, 0, y, 0);
  }
  function texture(type) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    if (type === 'wood') {
      ctx.fillStyle = '#966744'; ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 1.5) {
        ctx.strokeStyle = `rgba(${rand() > .5 ? '47,24,12' : '236,193,126'},${.06 + rand() * .14})`;
        ctx.lineWidth = .5 + rand(); ctx.beginPath();
        for (let x = 0; x <= 256; x += 8) { const py = y + Math.sin(x * .028 + y * .12) * (1 + rand() * 2); if (!x) ctx.moveTo(x, py); else ctx.lineTo(x, py); }
        ctx.stroke();
      }
    } else if (type === 'grass') {
      ctx.fillStyle = '#96ac6b'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 15000; i++) { ctx.fillStyle = rand() > .45 ? `rgba(56,81,31,${rand() * .17})` : `rgba(218,226,149,${rand() * .35})`; ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 3); }
    } else {
      ctx.fillStyle = '#ae7357'; ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 16) { ctx.fillStyle = '#6e473336'; ctx.fillRect(0, y, 256, 2); for (let x = (y % 32 ? 0 : 10); x < 256; x += 22) { ctx.fillStyle = '#ebb18433'; ctx.fillRect(x, y + 3, 18, 9); ctx.fillStyle = '#6b403029'; ctx.fillRect(x, y + 3, 1, 13); } }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(type === 'grass' ? 4 : 2, type === 'grass' ? 4 : 2); tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); allTextures.add(tex); return tex;
  }
  const M = {
    wood: material('#dfb78e', .66, { map: texture('wood'), bumpScale: .035 }),
    rim: material('#b38a61', .65), soil: material('#776448'), grass: material('#fafbd8', .97, { map: texture('grass') }),
    sand: material('#c0b293'), stone: material('#aca998'), darkStone: material('#797d6f'), road: material('#c1b9a2'), pavement: material('#d5cfbc'),
    ballast: material('#a6a08b'), tie: material('#6f5645'), rail: material('#667170', .38, { metalness: .55 }), iron: material('#394c44', .56, { metalness: .5 }),
    cream: material('#efe2be'), white: material('#f4edda'), green: material('#537368'), red: material('#b1765a'), yellow: material('#dbc596'),
    roof: material('#a0755a', .92, { map: texture('roof') }), slate: material('#627277', .82), timber: material('#79513c'), brass: material('#bc9860', .4, { metalness: .65 }),
    foliage: [material('#6b914d'), material('#859c55'), material('#4e7c52'), material('#9ca568')], trunk: material('#7f6247'),
    window: material('#678989', .35, { metalness: .15 }), engine: material('#2d6958', .45, { metalness: .24 }), black: material('#34413a', .68), coach: material('#c49b61'), coachRoof: material('#606654', .7),
  };
  M.wood.bumpMap = M.wood.map; M.grass.bumpMap = M.grass.map; M.grass.bumpScale = .04;
  const warmGlass = material('#afbb98', .35, { emissive: '#ffd788', emissiveIntensity: .08 });
  const lampGlass = material('#fce1a0', .32, { emissive: '#ffd48a', emissiveIntensity: .16 });
  glowing.push({ mat: warmGlass, day: .08, night: 2.2 }, { mat: lampGlass, day: .16, night: 4.5 });
  const waterMat = material('#70aaa3', .24, { metalness: .32, transparent: true, opacity: .94 });

  const hemisphere = new THREE.HemisphereLight('#e1ebed', '#857050', 2.4); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffd89b', 3.3); sun.position.set(-16, 25, 14); sun.castShadow = true;
  sun.position.multiplyScalar(MODEL_SCALE);
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -39; sun.shadow.camera.right = 39; sun.shadow.camera.top = 34.5; sun.shadow.camera.bottom = -34.5; sun.shadow.camera.near = 1; sun.shadow.camera.far = 135; sun.shadow.bias = -.0005; sun.shadow.normalBias = .04; sun.shadow.radius = 3; scene.add(sun);
  renderer.shadowMap.autoUpdate = false;
  const fill = new THREE.DirectionalLight('#cfdfde', .6); fill.position.set(20, 12, -14); scene.add(fill);
  const groundMat = material('#f3f0e8', 1);
  const table = mesh(new THREE.PlaneGeometry(250, 250), groundMat, 0, -1.53 * MODEL_SCALE, 0, scene, false); table.rotation.x = -Math.PI / 2;

  // A shallow relief terrain, framed by a substantial stained wood exhibition base.
  box(WORLD_WIDTH, 1.16, WORLD_DEPTH, 0, -.91, 0, M.wood, statics, .22);
  box(35.25, .12, 23.75, 0, -.29, 0, M.soil, statics, .12);
  box(35.5, .22, .57, 0, -.15, 11.71, M.rim, statics, .10);
  box(35.5, .22, .57, 0, -.15, -11.71, M.rim, statics, .10);
  box(.57, .22, 23.6, -17.46, -.15, 0, M.rim, statics, .10);
  box(.57, .22, 23.6, 17.46, -.15, 0, M.rim, statics, .10);
  const zs = Array.from({ length: 100 }, (_, i) => -11.38 + i / 99 * 22.76);
  const left = zs.map(z => [riverX(z) - RIVER_HALF_WIDTH - .16, z]);
  const right = zs.map(z => [riverX(z) + RIVER_HALF_WIDTH + .16, z]);
  flatPolygon([[-17.15, -11.38], ...left, [-17.15, 11.38]], M.grass, -.24, .24);
  flatPolygon([[17.15, -11.38], [17.15, 11.38], ...right.toReversed()], M.grass, -.24, .24);
  flatPolygon([...zs.map(z => [riverX(z) - RIVER_HALF_WIDTH, z]), ...zs.toReversed().map(z => [riverX(z) + RIVER_HALF_WIDTH, z])], waterMat, -.14);
  for (const side of [-1, 1]) flatPolygon([...zs.map(z => [riverX(z) + side * RIVER_HALF_WIDTH, z]), ...zs.toReversed().map(z => [riverX(z) + side * (RIVER_HALF_WIDTH + .23), z])], M.sand, -.095);

  class RailCurve extends THREE.Curve {
    constructor(offset = 0, y = TRACK.height) { super(); this.offset = offset; this.y = y; }
    getPoint(t, target = new THREE.Vector3()) { const p = trackPoint(t * TRACK_LENGTH); return target.set(p.x - p.tz * this.offset, this.y, p.z + p.tx * this.offset); }
  }
  function ribbon(offset, width, y, mat, skipRiver = false) {
    const points = [], indices = [], n = 520;
    for (let i = 0; i <= n; i++) { const p = trackPoint(i / n * TRACK_LENGTH); for (const o of [offset - width / 2, offset + width / 2]) points.push(p.x - p.tz * o, y, p.z + p.tx * o); }
    for (let i = 0; i < n; i++) { const p = trackPoint((i + .5) / n * TRACK_LENGTH); if (skipRiver && Math.abs(p.x - riverX(p.z)) < 1.45) continue; const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geom.setIndex(indices); geom.computeVertexNormals(); return mesh(geom, mat);
  }
  ribbon(0, 1.44, .10, M.ballast, true);
  for (const offset of [-TRACK.gauge / 2, TRACK.gauge / 2]) mesh(new THREE.TubeGeometry(new RailCurve(offset), 550, .028, 5, true), M.rail);
  const tiesCount = Math.floor(TRACK_LENGTH / .34);
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.145, .075, 1.13), M.tie, tiesCount);
  const temp = new THREE.Object3D();
  for (let i = 0; i < tiesCount; i++) { const p = trackPoint(i / tiesCount * TRACK_LENGTH); temp.position.set(p.x, .19, p.z); temp.rotation.set(0, Math.atan2(-p.tz, p.tx), 0); temp.updateMatrix(); ties.setMatrixAt(i, temp.matrix); }
  ties.castShadow = true; ties.receiveShadow = true; statics.add(ties); allGeometries.add(ties.geometry);

  function railwayBridge(z) {
    const x = riverX(z), length = 3.35;
    box(length, .17, 1.25, x, .09, z, M.timber);
    for (const side of [-1, 1]) {
      box(length + .13, .12, .11, x, .28, z + side * .63, M.iron);
      box(length + .13, .085, .085, x, .88, z + side * .67, M.iron);
      for (let i = 0; i <= 4; i++) {
        const px = x - length / 2 + i * length / 4;
        box(.085, .7, .085, px, .54, z + side * .67, M.iron);
        if (i < 4) beam([px, .3, z + side * .67], [px + length / 4, .87, z + side * .67], .032, M.iron);
      }
    }
    for (const dx of [-1.57, 1.57]) box(.43, .47, 1.48, x + dx, -.10, z, M.stone);
  }
  railwayBridge(TRACK.radius); railwayBridge(-TRACK.radius);

  function road(x1, z1, x2, z2, width = .95) {
    const length = Math.hypot(x2 - x1, z2 - z1), x = (x1 + x2) / 2, z = (z1 + z2) / 2;
    const border = box(length + .10, .06, width + .18, x, .03, z, M.pavement, statics, .025);
    border.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
    const surface = box(length + .05, .055, width, x, .065, z, M.road, statics, .024); surface.rotation.copy(border.rotation);
  }
  road(-10.4, .25, 3.4, .25, 1.22);
  road(-5.6, .25, -5.6, 3.04, 1.02);
  road(-9.3, .25, -9.3, -3.8, .85);
  road(-2.65, .25, -2.65, -3.8, .9);
  road(-2.8, 2.7, -6.6, 2.7, 1.05);
  road(6.7, .25, 11.5, .25, .98);
  const rx = riverX(.25);
  box(3.25, .14, 1.45, rx, .12, .25, M.pavement);
  for (const side of [-1, 1]) { beam([rx - 1.65, .68, .25 + side * .70], [rx + 1.65, .68, .25 + side * .70], .045, M.timber); for (let i = 0; i <= 6; i++) box(.06, .52, .06, rx - 1.6 + i * 3.2 / 6, .41, .25 + side * .70, M.timber); }

  function roof(parent, w, d, y, rise, mat = M.roof) {
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - .13, -.06); shape.lineTo(0, rise + .1); shape.lineTo(d / 2 + .13, -.06); shape.lineTo(d / 2 + .13, -.15); shape.lineTo(0, rise -.02); shape.lineTo(-d / 2 - .13, -.15); shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: w + .28, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 1 }); geom.rotateY(Math.PI / 2);
    mesh(geom, mat, -w / 2 - .14, y, 0, parent);
    const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.closePath();
    const wallGeom = new THREE.ExtrudeGeometry(gable, { depth: w, bevelEnabled: false }); wallGeom.rotateY(Math.PI / 2); mesh(wallGeom, M.cream, -w / 2, y - .10, 0, parent);
    cylinder(.075, w + .4, 0, y + rise + .075, 0, mat, parent).rotation.z = Math.PI / 2;
  }
  function house(x, z, w, d, h, wall, roofMat = M.roof, angle = 0, name = '') {
    const group = new THREE.Group(); group.position.set(x, .07, z); group.rotation.y = angle; statics.add(group);
    box(w + .2, .16, d + .2, 0, .02, 0, M.stone, group, .04);
    box(w, h, d, 0, h / 2 + .06, 0, wall, group, .025);
    roof(group, w, d, h + .09, .66, roofMat);
    box(.45, .72, .06, .0, .44, d / 2 + .04, M.timber, group, .02);
    box(.48, .08, .32, 0, .02, d / 2 + .16, M.pavement, group, .025);
    for (const sx of [-1, 1]) for (const level of (h > 1.9 ? [.62, 1.48] : [.80])) {
      const wx = sx * w * .31;
      box(.55, .58, .08, wx, level, d / 2 + .06, M.white, group);
      box(.43, .46, .09, wx, level, d / 2 + .075, rand() > .3 ? warmGlass : M.window, group);
      box(.035, .49, .025, wx, level, d / 2 + .13, M.white, group);
      box(.46, .035, .025, wx, level, d / 2 + .13, M.white, group);
      for (const shutter of [-1, 1]) box(.12, .52, .07, wx + shutter * .31, level, d / 2 + .09, M.green, group);
    }
    for (const side of [-1, 1]) {
      box(.06, .62, .61, side * (w / 2 + .03), .87, 0, M.white, group);
      box(.07, .49, .48, side * (w / 2 + .06), .87, 0, warmGlass, group);
    }
    box(.28, .75, .28, w * .25, h + .43, -d * .12, M.red, group, .03);
    box(.38, .10, .38, w * .25, h + .84, -d * .12, M.stone, group);
    if (name) sign(name, w * .6, .29, 0, 1.12, d / 2 + .14, group, '#f5e9ca', '#476452');
    return group;
  }
  function sign(text, w, h, x, y, z, parent = statics, bg = '#e9d5a6', fg = '#425a44') {
    const c = document.createElement('canvas'); c.width = 768; c.height = 160; const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 78px "Microsoft YaHei", sans-serif'; ctx.fillText(text, 384, 84);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; allTextures.add(tex); const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .8 }); allMaterials.add(mat); return mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, parent, false);
  }

  // Main street and station form a compact, readable village core.
  house(-8, -1.9, 2.0, 1.55, 2.05, M.white, M.roof, 0, '松溪面包房');
  house(-4.8, -1.9, 2.12, 1.65, 2.4, M.yellow, M.slate, 0, '邮 局');
  house(-.4, -2.3, 2.4, 1.8, 2.05, M.cream, M.roof, 0, '溪畔旅舍');
  house(-9.8, 2.75, 2.35, 1.75, 1.45, M.red, M.slate, Math.PI);
  house(-.9, 2.8, 2.0, 1.65, 1.55, M.white, M.roof, Math.PI);
  house(10, -2.05, 2.7, 2.15, 1.45, M.cream, M.roof, 0);
  house(-11.4, -3.4, 1.65, 1.3, 1.30, M.cream, M.roof, -.20);

  const station = house(-5.1, 3.8, 4.4, 1.42, 1.65, M.cream, M.roof, 0);
  sign('松 溪 站', 1.9, .35, 0, 1.39, .83, station);
  box(7.1, .16, 1.02, -5.1, .12, 4.89, M.pavement, statics, .04);
  box(7.0, .05, .07, -5.1, .22, 5.35, M.yellow);
  for (const px of [-8.18, -6.1, -4.12, -2.1]) {
    box(.08, 1.84, .08, px, 1.12, 5.12, M.green);
    beam([px, 1.75, 5.12], [px, 2.12, 4.65], .035, M.green);
  }
  const canopy = box(7.3, .13, 1.08, -5.1, 2.08, 4.96, M.slate); canopy.rotation.x = -.10;
  for (let i = 0; i < 15; i++) box(.03, .02, 1.04, -8.4 + i * .47, 2.16, 4.96, M.iron).rotation.x = -.10;
  sign('P I N E   C R E E K', 3.3, .22, 0, -.77, 12.015, statics, '#b69864', '#393a2f');

  function tree(x, z, scale = 1, type = 0) {
    const group = new THREE.Group(); group.position.set(x, .02, z); group.scale.setScalar(scale); statics.add(group);
    cylinder(.10, 1.6, 0, .8, 0, M.trunk, group, .06);
    if (type === 1) {
      for (let i = 0; i < 3; i++) { const geom = cached(`cone:${i}`, () => new THREE.ConeGeometry(.69 - i * .15, 1.28 - i * .12, 9)); mesh(geom, M.foliage[2], 0, 1.17 + i * .54, 0, group); }
    } else {
      const leaf = M.foliage[Math.floor(rand() * M.foliage.length)];
      sphere(0, 1.84, 0, .68, .88, .67, leaf, group);
      sphere(-.42, 1.51, .05, .43, .58, .47, leaf, group);
      sphere(.35, 1.58, .21, .46, .60, .44, leaf, group);
    }
  }
  const treePositions = [[-15.2,-8.4,1.1,1],[-13.8,-9.6,1,1],[-11.8,-9.8,.9,0],[-8.4,-9.3,1.05,0],[-5.7,-9.6,1.2,1],[-3.1,-8.8,.85,0],[.2,-9.5,.95,0],[2.4,-8.7,.9,0],[9.9,-9.3,1.1,1],[12.1,-8.8,1.25,1],[14.7,-9.4,.85,0],[15.7,-6.8,.8,0],[-15.1,7.8,1,0],[-13.8,9.6,.83,0],[-10.7,9.3,.95,0],[-8.4,8.9,.8,0],[-3.1,9.3,1.1,0],[.1,9.9,.82,0],[2.7,8.7,.9,0],[9.9,9.3,.9,0],[12.3,8.8,1.1,1],[14.6,8.1,1.15,1],[-11.3,-.1,.65,0],[-2.9,-4.2,.75,0],[1.5,-3.8,.65,0],[2.3,2.5,.7,0],[11.9,2.5,.75,0]];
  treePositions.forEach(p => tree(...p));

  function lamp(x, z, light = false, y = 0) {
    cylinder(.08, .15, x, y + .12, z, M.iron);
    cylinder(.036, 1.73, x, y + .9, z, M.iron);
    box(.24, .32, .24, x, y + 1.92, z, lampGlass, statics, .025);
    const cap = new THREE.ConeGeometry(.22, .14, 4); cap.rotateY(Math.PI / 4); mesh(cap, M.iron, x, y + 2.15, z);
    for (const side of [-1, 1]) box(.023, .34, .023, x + side * .11, y + 1.92, z + .11, M.iron);
    const poolMat = new THREE.MeshBasicMaterial({ color: '#ffd58a', transparent: true, opacity: .075, depthWrite: false }); allMaterials.add(poolMat);
    const pool = mesh(new THREE.CircleGeometry(.78, 24), poolMat, x, y + .105, z, modelRoot, false); pool.rotation.x = -Math.PI / 2; pool.visible = false; nightObjects.push(pool);
    if (light) { const point = new THREE.PointLight('#ffd58c', 0, 5.2 * MODEL_SCALE, 2); point.position.set(x, y + 1.98, z); modelRoot.add(point); nightLights.push(point); }
  }
  [[-10.1,.95,false],[-6.35,1,true],[-2.65,.95,false],[1.5,-.55,false],[9.2,.95,true],[-7.2,4.74,true,.16],[-3.15,4.74,true,.16]].forEach(p => lamp(...p));

  // Small hand-built details make streets, cultivated land and river banks read as one place.
  const terracotta = material('#ba7652');
  const flowerPink = material('#d39a88');
  const flowerYellow = material('#e9c76a');
  const meadow = material('#97a86b');
  function bench(x, z, angle = 0) {
    const group = new THREE.Group(); group.position.set(x, .09, z); group.rotation.y = angle; statics.add(group);
    for (const dx of [-.4,.4]) { box(.065,.37,.42,dx,.19,0,M.iron,group); box(.045,.66,.045,dx,.33,-.15,M.iron,group); }
    for (let i = 0; i < 3; i++) box(.98,.055,.09,0,.4,-.10 + i * .105,M.timber,group);
    for (let i = 0; i < 2; i++) box(.98,.09,.055,0,.55 + i * .12,-.17,M.timber,group);
  }
  bench(-6.7,4.83); bench(-3.4,4.83); bench(-3.3,-1.6,Math.PI/2); bench(1.5,1.15);
  function pot(x,z, y = .1) {
    cylinder(.13,.22,x,y+.1,z,terracotta,statics,.16);
    sphere(x,y+.25,z,.17,.18,.17,M.foliage[0]);
    for (let i = 0; i < 4; i++) sphere(x + (rand()-.5)*.20,y+.39,z+(rand()-.5)*.20,.035,.045,.035,flowerPink);
  }
  [[-7.5,-.92],[-8.5,-.92],[-.98,-1.28],[.2,-1.28],[-6.72,2.95],[-3.6,2.95],[-9.4,1.82],[10.2,-.81]].forEach(p => pot(...p));
  for (const px of [-8,-4.8,-.4]) road(px,-.93,px,-.30,.52);
  box(2.8,.06,1.13,-5.5,.09,2.55,M.pavement,statics,.06);
  for (let i = 0; i < 13; i++) box(.025,.008,1.11,-6.79 + i*.215,.126,2.55,M.stone);
  // Striped bakery awning and a pair of outdoor tables.
  for (let i = 0; i < 8; i++) { const strip = box(.205,.065,.60,-8.72 + i*.205,1.17,-.73,i%2 ? M.cream : M.green); strip.rotation.x = .18; box(.205,.14,.035,-8.72 + i*.205,1.075,-.43,i%2 ? M.cream : M.green); }
  for (const x of [-7.15,-.65]) { cylinder(.19,.035,x,.49,-.73,M.timber); cylinder(.026,.39,x,.28,-.73,M.iron); cylinder(.13,.045,x+.31,.24,-.68,M.timber); cylinder(.026,.22,x+.31,.13,-.68,M.iron); }

  const tower = new THREE.Group(); tower.position.set(-6.6,.03,-4.06); statics.add(tower);
  box(1.14,.18,1.14,0,.09,0,M.stone,tower,.035);
  box(.86,3.02,.86,0,1.58,0,M.yellow,tower,.025);
  for (const y of [.33,2.22,3.12]) box(1.00,.09,1.00,0,y,0,M.cream,tower,.025);
  for (const side of [-1,1]) box(.05,.54,.23,side*.44,1.53,0,M.green,tower);
  const clock = cylinder(.29,.035,0,2.65,.457,M.cream,tower); clock.rotation.x = Math.PI/2;
  const hour = box(.035,.19,.03,-.047,2.706,.483,M.iron,tower); hour.rotation.z = -.65;
  const minute = box(.025,.24,.03,.037,2.74,.486,M.iron,tower); minute.rotation.z = .35;
  for (let i = 0; i < 12; i++) { const a = i/12*Math.PI*2; sphere(Math.sin(a)*.24,2.65+Math.cos(a)*.24,.483,.013,.013,.013,M.timber,tower); }
  const spire = mesh(new THREE.ConeGeometry(.78,1.12,4),M.slate,0,3.65,0,tower); spire.rotation.y = Math.PI/4;
  sphere(0,4.24,0,.055,.055,.055,M.brass,tower);

  function fence(x,z,w,d) {
    for (const side of [-1,1]) {
      for (let i = 0; i <= Math.ceil(w/.62); i++) box(.065,.45,.065,x-w/2+i*w/Math.ceil(w/.62),.27,z+side*d/2,M.timber);
      for (const y of [.20,.42]) beam([x-w/2,y,z+side*d/2],[x+w/2,y,z+side*d/2],.023,M.timber);
      for (let i = 0; i <= Math.ceil(d/.62); i++) box(.065,.45,.065,x+side*w/2,.27,z-d/2+i*d/Math.ceil(d/.62),M.timber);
      for (const y of [.20,.42]) beam([x+side*w/2,y,z-d/2],[x+side*w/2,y,z+d/2],.023,M.timber);
    }
  }
  // A working garden fills the right bank without crowding the railway.
  box(4.22,.035,2.65,10.35,.045,3.08,M.soil,statics,.10);
  fence(10.35,3.08,4.52,2.95);
  for (let row = 0; row < 7; row++) {
    const x = 8.68 + row*.54; box(.29,.07,2.40,x,.094,3.08,M.sand,statics,.07);
    for (let plant = 0; plant < 9; plant++) { const z = 2.04 + plant*.26; sphere(x,.21,z,.13,.13,.14,M.foliage[row%3]); if (row%3===1 && plant%2===0) sphere(x,.24,z,.045,.035,.045,terracotta); }
  }
  box(.37,.36,.37,12.07,.23,1.83,M.timber,statics,.025);
  cylinder(.22,.48,8.02,.27,2.28,M.timber);
  for (const y of [.11,.39]) { const ring = mesh(new THREE.TorusGeometry(.225,.018,5,12),M.iron,8.02,y,2.28); ring.rotation.x = Math.PI/2; }
  fence(-9.75,2.95,3.35,2.62);
  for (let i = 0; i < 5; i++) sphere(-10.9+i*.45,.3,4.09,.25,.27,.28,M.foliage[1]);
  // Orchard beyond the railway, meadow hills and clustered trees at the edge of the board.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x = 8.8+col*1.54, z = -8.0-row*1.63; tree(x,z,.71);
    for (let i = 0; i < 5; i++) { const a = i*1.25; sphere(x+Math.cos(a)*.30,1.19+(i%2)*.15,z+Math.sin(a)*.29,.045,.045,.045,terracotta); }
  }
  function hill(cx,cz,w,d,h) {
    const geom = new THREE.PlaneGeometry(w,d,32,16); geom.rotateX(-Math.PI/2);
    const position = geom.attributes.position;
    for (let i = 0; i < position.count; i++) { const x=position.getX(i),z=position.getZ(i); position.setY(i,.015 + h*Math.cos(x/w*Math.PI)**2*Math.cos(z/d*Math.PI)**2); }
    geom.computeVertexNormals(); mesh(geom,meadow,cx,0,cz);
  }
  hill(-6.0,-9.22,9.2,3.4,.65); hill(-14.3,-8.45,4.9,3.6,.47);
  [[-15.8,-9.7,.72,1],[-14.9,-7.2,.8,1],[-12.7,-8.4,.68,0],[-7.0,-10.2,.70,1],[-4.3,-10.3,.83,1],[-1.9,-10.1,.66,0],[.9,-8.4,.58,0],[-15.3,9.7,.58,0],[-12.3,8.2,.60,0],[13.5,9.8,.65,1],[15.4,9.4,.78,1],[15.8,6.8,.67,0]].forEach(p=>tree(...p));

  // River stones, reeds and sparse wildflowers use rounded pieces, like a physical model.
  for (let i = 0; i < 58; i++) {
    const z = -10.8+rand()*21.6; if (Math.abs(Math.abs(z)-6.1)<.85 || Math.abs(z-.25)<1) continue;
    const side = rand()>.5?1:-1, x = riverX(z)+side*(1.08+rand()*.33), r=.07+rand()*.11;
    sphere(x,-.005,z,r*1.25,r*.70,r,M.stone);
    if (i%3===0) for(let k=0;k<4;k++) { const stem=cylinder(.012,.15+rand()*.16,x+(rand()-.5)*.14,.12,z+(rand()-.5)*.14,M.foliage[0]); stem.rotation.z=(rand()-.5)*.40; }
  }
  const rippleMat = new THREE.MeshBasicMaterial({ color:'#d4e4d1',transparent:true,opacity:.30,depthWrite:false }); allMaterials.add(rippleMat);
  for (let i=0;i<32;i++) {
    const z=-10.5+i*.66,x=riverX(z)+(rand()-.5)*1.1;
    const ripple=mesh(new THREE.PlaneGeometry(.12+rand()*.30,.016),rippleMat,x,-.125,z); ripple.rotation.x=-Math.PI/2; ripple.castShadow=false;
  }
  for (let i=0;i<150;i++) {
    const x = -15.7+rand()*18, z=rand()>.5 ? 7.65+rand()*3.3 : -8.4-rand()*2.4;
    sphere(x,.09,z,.025,.055,.025,i%3===0 ? flowerPink : flowerYellow);
  }
  const gravelCount=580;
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),M.stone,gravelCount);
  for(let i=0;i<gravelCount;i++) { const p=trackPoint(i/gravelCount*TRACK_LENGTH),off=(i%2?1:-1)*(.48+rand()*.17); temp.position.set(p.x-p.tz*off,.145,p.z+p.tx*off); if(Math.abs(p.x-riverX(p.z))<1.4) temp.scale.setScalar(0); else temp.scale.set(.028+rand()*.03,.028,.028+rand()*.03); temp.rotation.set(rand(),rand(),rand()); temp.updateMatrix(); gravel.setMatrixAt(i,temp.matrix); }
  gravel.receiveShadow=true; statics.add(gravel); allGeometries.add(gravel.geometry);
  function person(x,z,color,angle=0,y=.09) {
    const group=new THREE.Group(); group.position.set(x,y,z); group.rotation.y=angle; statics.add(group);
    const coat=material(color); const skin=M.cream;
    cylinder(.06,.24,0,.24,0,coat,group,.07); sphere(0,.425,0,.063,.073,.063,skin,group);
    for(const side of [-1,1]) { cylinder(.023,.16,side*.032,.08,0,M.black,group); beam([side*.07,.34,0],[side*.09,.20,.014],.021,coat,group); }
  }
  [[-5.1,4.95,'#a16b57',0,.21],[-7.58,4.95,'#a6ae85',.3,.21],[-3.86,4.98,'#667587',-.4,.21],[-5.12,1.1,'#b68955'],[-8.45,.50,'#658979'],[-1.4,.30,'#a86e5d'],[.15,.45,'#838e64'],[7.8,.35,'#9b7959']].forEach(p=>person(...p));

  // Three individually positioned cars, with separate wheel meshes and couplers.
  const cars = [];
  function trainWheels(parent, positions) {
    for (const px of positions) for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.userData.dynamic = true; pivot.position.set(px, .18, side * .43); parent.add(pivot); wheels.push(pivot);
      const wheel = cylinder(.18, .075, 0, 0, 0, M.black, pivot); wheel.rotation.x = Math.PI / 2;
      const hub = cylinder(.075, .081, 0, 0, 0, M.brass, pivot); hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const spoke = box(.022, .27, .012, 0, 0, side * .043, M.brass, pivot); spoke.rotation.z = i * Math.PI / 3; }
    }
  }
  function locomotive() {
    const group = new THREE.Group(); modelRoot.add(group);
    box(1.94, .15, .8, 0, .32, 0, M.black, group, .04);
    trainWheels(group, [-.61, -.01, .57]);
    const boiler = cylinder(.30, 1.15, .22, .70, 0, M.engine, group); boiler.rotation.z = Math.PI / 2;
    for (const px of [-.16,.16,.51]) { const ring = mesh(new THREE.TorusGeometry(.303, .016, 6, 18), M.brass, px, .70, 0, group); ring.rotation.y = Math.PI / 2; }
    const nose = cylinder(.27, .10, .81, .70, 0, M.black, group); nose.rotation.z = Math.PI / 2;
    box(.68, .74, .82, -.59, .77, 0, M.engine, group, .035);
    for (const side of [-1, 1]) { box(.48, .37, .025, -.59, 1.0, side * .43, M.brass, group); box(.38, .27, .035, -.59, 1.0, side * .445, warmGlass, group); box(.035, .28, .038, -.59, 1.0, side * .465, M.engine, group); }
    box(.88, .13, 1.0, -.59, 1.19, 0, M.black, group, .055);
    cylinder(.085, .4, .52, 1.08, 0, M.black, group); cylinder(.145, .12, .52, 1.3, 0, M.black, group);
    cylinder(.10, .18, -.05, 1.07, 0, M.brass, group, .065);
    const headlamp = cylinder(.09, .10, .91, .9, 0, lampGlass, group); headlamp.rotation.z = Math.PI / 2;
    box(.20, .19, .89, .96, .29, 0, M.red, group, .035);
    for (const side of [-1, 1]) { beam([-.66,.20,side*.50],[.61,.20,side*.50],.03,M.brass,group); box(.12,.12,.17,.98,.38,side*.29,M.black,group); }
    return group;
  }
  function carriage(index) {
    const group = new THREE.Group(); modelRoot.add(group);
    box(1.85, .14, .81, 0, .32, 0, M.black, group, .025); trainWheels(group, [-.60, .60]);
    box(1.71, .67, .79, 0, .75, 0, M.coach, group, .045);
    box(1.78, .10, .81, 0, .48, 0, M.engine, group, .025);
    const top = cylinder(.48, 1.98, 0, 1.09, 0, M.coachRoof, group); top.rotation.z = Math.PI / 2; top.scale.x *= .35;
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { box(.30, .34, .045, -.59 + i * .395, .86, side * .415, M.cream, group); box(.235, .265, .05, -.59 + i * .395, .86, side * .428, warmGlass, group); }
    for (const end of [-1, 1]) { box(.08, .44, .31, end * .88, .69, 0, M.engine, group); box(.14, .12, .55, end * .92, .34, 0, M.black, group); }
    return group;
  }
  cars.push(locomotive(), carriage(0), carriage(1));
  const couplers = [0, 1].map(() => cylinder(.024, .25, 0, 0, 0, M.black, scene));
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#f4eedc', roughness: 1, transparent: true, opacity: .35, depthWrite: false }); allMaterials.add(smokeMat);
  const smoke = Array.from({ length: 7 }, () => sphere(0,0,0,.1,.1,.1,smokeMat,scene)); smoke.forEach(s => { s.castShadow = false; s.receiveShadow = false; });

  // Merge static model pieces by material. Repeated rail sleepers stay instanced.
  function compactGroup(group, destination = group, skipDynamic = false) {
    modelRoot.updateMatrixWorld(true); group.updateMatrixWorld(true);
    const buckets = new Map(); const originals = [];
    group.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
      if(skipDynamic) { let parent=object.parent; while(parent && parent!==group) { if(parent.userData.dynamic) return; parent=parent.parent; } }
      const key = `${object.material.uuid}:${object.castShadow}`;
      if (!buckets.has(key)) buckets.set(key, { mat: object.material, cast: object.castShadow, geometries: [] });
      let geom = object.geometry.clone(); if (geom.index) { const nonIndexed = geom.toNonIndexed(); geom.dispose(); geom = nonIndexed; }
      const localMatrix = destination.matrixWorld.clone().invert().multiply(object.matrixWorld);
      geom.applyMatrix4(localMatrix); buckets.get(key).geometries.push(geom); originals.push(object);
    });
    originals.forEach(o => o.removeFromParent());
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      bucket.geometries.forEach(geom => geom.dispose());
      if (merged) { merged.computeBoundingSphere(); mesh(merged, bucket.mat, 0,0,0, destination, bucket.cast); }
    }
  }
  compactGroup(statics,modelRoot); cars.forEach(car=>compactGroup(car,car,true)); wheels.forEach(wheel=>compactGroup(wheel));

  function setNight(value) {
    night = value;
    const bg = night ? '#172632' : '#f3f0e8'; scene.background = new THREE.Color(bg); groundMat.color.set(bg);
    sun.color.set(night ? '#b2ccf2' : '#ffd89b'); sun.intensity = night ? 1.05 : 3.3;
    sun.position.set(night ? 15 : -16, 25, 14).multiplyScalar(MODEL_SCALE);
    hemisphere.color.set(night ? '#b5cbeb' : '#e1ebed'); hemisphere.groundColor.set(night ? '#667e83' : '#857050'); hemisphere.intensity = night ? 1.7 : 2.4;
    fill.intensity = night ? .75 : .6; renderer.toneMappingExposure = night ? 1.03 : 1.08;
    glowing.forEach(g => { g.mat.emissiveIntensity = night ? g.night : g.day; });
    nightLights.forEach(l => { l.visible = night; l.intensity = night ? 4.2 * MODEL_SCALE ** 2 : 0; }); nightObjects.forEach(o => { o.visible = night; });
    sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
  }
  function resize() {
    width = canvas.clientWidth || 1; height = canvas.clientHeight || 1;
    const aspect = width / height, h = Math.max(28.8, 43.0 / aspect) * MODEL_SCALE, offset = (width < 700 ? -.5 : -1.35) * MODEL_SCALE;
    camera.left = -h * aspect / 2; camera.right = h * aspect / 2; camera.top = h / 2 + offset; camera.bottom = -h / 2 + offset; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); setNight(false);
  const anchors = { station: new THREE.Vector3(-5.1, 2.9, 4.8).multiplyScalar(MODEL_SCALE), river: new THREE.Vector3(7.15, .25, 8.5).multiplyScalar(MODEL_SCALE) };
  function updateLabels() {
    for (const [key, element] of Object.entries(labels)) { const p = anchors[key].clone().project(camera); element.style.left = `${(p.x + 1) * width / 2}px`; element.style.top = `${(1 - p.y) * height / 2}px`; element.style.opacity = Math.abs(p.x) < .85 && Math.abs(p.y) < .85 && camera.zoom < 2.1 ? '1' : '0'; }
  }
  const vectorA = new THREE.Vector3(), vectorB = new THREE.Vector3();
  function animate(time) {
    if (disposed) return;
    const wallDelta = lastTime == null ? 0 : (time - lastTime) / 1000;
    const dt = Math.min(wallDelta,.5); lastTime = time;
    simulation.advance(dt); controls.update();
    simulation.poses.forEach((pose, i) => { cars[i].position.set(pose.x, TRACK.height, pose.z); cars[i].rotation.y = pose.angle; cars[i].updateMatrixWorld(); });
    for (let i = 0; i < 2; i++) {
      vectorA.set(-1.00,.33,0).applyMatrix4(cars[i].matrixWorld); vectorB.set(1.0,.33,0).applyMatrix4(cars[i+1].matrixWorld);
      couplers[i].position.copy(vectorA).add(vectorB).multiplyScalar(.5); couplers[i].scale.set(.024 * MODEL_SCALE,vectorA.distanceTo(vectorB),.024 * MODEL_SCALE); couplers[i].quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vectorB.sub(vectorA).normalize());
    }
    wheels.forEach(wheel => { wheel.rotation.z = -simulation.totalDistance / .18; });
    smoke.forEach((puff, i) => { const age = (simulation.elapsed * .65 + i / smoke.length) % 1; vectorA.set(.52 - age * .75, 1.65 + age * 1.85, age * .45).applyMatrix4(cars[0].matrixWorld); puff.position.copy(vectorA); puff.scale.setScalar((.085 + age * .23) * MODEL_SCALE); puff.visible = simulation.playing && simulation.dwellRemaining === 0; });
    updateLabels(); onFrame();
    // Static scenery shares one cached shadow map; the tiny moving train refreshes it every other frame.
    if (simulation.playing && shadowFrame++ % 2 === 0) { sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; }
    renderer.render(scene, camera);
    frames++; fpsTimer += wallDelta;
    if (fpsTimer >= 1) {
      fps = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; performanceWindows++;
      // Fall back gently on software WebGL / slower devices without changing the visible scene or controls.
      if (performanceWindows > 2 && fps < 24 && pixelRatio > .7) { pixelRatio = Math.max(.7,pixelRatio-.15); renderer.setPixelRatio(pixelRatio); renderer.setSize(width,height,false); }
    }
    frameId = requestAnimationFrame(animate);
  }
  const visibility = () => { lastTime = undefined; }; document.addEventListener('visibilitychange', visibility);
  frameId = requestAnimationFrame(animate);
  function resetCamera() {
    // Recreate controls to also clear residual damping, then return to one deterministic view.
    controls.dispose(); camera.position.copy(initialPosition); camera.zoom = 1; camera.updateProjectionMatrix(); controls = makeControls(); lastTime = undefined;
  }
  return {
    setNight, resetCamera,
    zoom(factor) { camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom); camera.updateProjectionMatrix(); },
    rotate(key) { const p = camera.position.clone().sub(controls.target); const spherical = new THREE.Spherical().setFromVector3(p); if (key === 'ArrowLeft') spherical.theta -= .12; if (key === 'ArrowRight') spherical.theta += .12; if (key === 'ArrowUp') spherical.phi -= .08; if (key === 'ArrowDown') spherical.phi += .08; spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle); camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update(); },
    cameraState: () => ({ position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom }),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps, pixelRatio, nightLights: nightLights.filter(l => l.intensity > 0).length, boardWidth: WORLD_WIDTH * MODEL_SCALE, boardDepth: WORLD_DEPTH * MODEL_SCALE, boardAreaMultiplier: MODEL_SCALE ** 2 }),
    dispose() { disposed = true; cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose(); document.removeEventListener('visibilitychange',visibility); allGeometries.forEach(g => g.dispose()); allMaterials.forEach(m => m.dispose()); allTextures.forEach(t => t.dispose()); renderer.dispose(); },
  };
}
