import * as THREE from 'three';
import { buildLandscape } from './landscape.js';

const C = {
  stone: 0xbec7b5, ivory: 0xe1dfc5, stoneDark: 0x8d9c8e,
  red: 0x923e31, vermilion: 0xb25136, redDark: 0x672e2b,
  wood: 0x453e33, teal: 0x296464, tealDark: 0x214d51,
  gold: 0xe5ad4f, goldLight: 0xf7cb6e, goldDark: 0xb57932,
  roof: [0xc88837, 0xe0a344, 0xd89636, 0xe4ae52, 0xca8d39],
  blue: [0x476660, 0x567970, 0x3d5d59, 0x5a756b],
  grass: 0x48614a, ground: 0x51684e,
  paving: [0x89998b, 0x96a392, 0x7e9084, 0xa2ad99],
};
let seed = 3929;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const pick = array => array[Math.floor(random() * array.length)];

class Voxels {
  constructor(scene) {
    this.scene = scene; this.batches = new Map(); this.count = 0;
    this.waterTime = { value: 0 };
    this.materials = {
      matte: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.02 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.43, metalness: 0.22 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.58 }),
      ground: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      water: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0.16 }),
      glow: new THREE.MeshStandardMaterial({ color: 0xffc16b, emissive: 0xffa33a, emissiveIntensity: 0.4, roughness: 0.65 }),
    };
    this.materials.water.onBeforeCompile = shader => {
      shader.uniforms.uFlowTime = this.waterTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlowPosition;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 flowWorld = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nflowWorld = instanceMatrix * flowWorld;\n#endif\nvFlowPosition = (modelMatrix * flowWorld).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlowTime; varying vec3 vFlowPosition;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripple=sin(vFlowPosition.z*0.8+vFlowPosition.x*0.16-uFlowTime*1.6); diffuseColor.rgb *= 0.96 + 0.06*ripple;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nvec3 waveSlope = vec3(cos(vFlowPosition.x*0.27+vFlowPosition.z*0.16+uFlowTime*0.65)*0.055,0.0,sin(vFlowPosition.z*0.34-uFlowTime*0.8)*0.045); normal=normalize(normal+mat3(viewMatrix)*waveSlope);');
    };
  }
  add(kind, color, x, y, z, w, h, d, rotation = 0) {
    if (!this.batches.has(kind)) this.batches.set(kind, []);
    this.batches.get(kind).push({ color, x, y, z, w, h, d, rotation }); this.count++;
  }
  finish() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D(); const color = new THREE.Color();
    for (const [kind, boxes] of this.batches) {
      const mesh = new THREE.InstancedMesh(geometry, this.materials[kind], boxes.length);
      boxes.forEach((box, i) => {
        dummy.position.set(box.x, box.y, box.z); dummy.scale.set(box.w, box.h, box.d);
        dummy.rotation.set(0, box.rotation, 0); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.setHex(box.color));
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = kind !== 'ground' && kind !== 'glow' && kind !== 'water'; mesh.receiveShadow = kind !== 'glow';
      mesh.computeBoundingSphere(); this.scene.add(mesh);
    }
  }
}

export function buildPalace(scene, { full = true } = {}) {
  seed = 3929;
  const voxels = new Voxels(scene);
  const add = (color, x, y, z, w, h, d, kind = 'matte', rotation = 0) => voxels.add(kind, color, x, y, z, w, h, d, rotation);
  let buildingCount = 0, treeCount = 0, flowerCount = 0;
  const footprints = [];
  const G = 2.5;
  function railing(b, w, d, y) {
    for (const s of [-1, 1]) {
      b(C.ivory, 0, y + 1.45, s * d / 2, w, 0.65, 0.8);
      for (let x = -w / 2; x <= w / 2; x += 6) {
        if (s === 1 && Math.abs(x) < 10) continue;
        b(C.ivory, x, y + 1.2, s * d / 2, 1.05, 2.4, 1.05);
        b(C.ivory, x, y + 2.5, s * d / 2, 1.6, 0.35, 1.6);
      }
      b(C.ivory, s * w / 2, y + 1.45, 0, 0.8, 0.65, d);
      for (let z = -d / 2; z <= d / 2; z += 6) {
        b(C.ivory, s * w / 2, y + 1.2, z, 1.05, 2.4, 1.05);
        b(C.ivory, s * w / 2, y + 2.5, z, 1.6, 0.35, 1.6);
      }
    }
  }
  function roof(b, w, d, y, rise, blue = false, fine = false) {
    const colors = blue ? C.blue : C.roof;
    const step = fine ? 2.35 : 3.15;
    const nx = Math.ceil(w / step), nz = Math.ceil(d / step), sx = w / nx, sz = d / nz;
    b(blue ? C.tealDark : C.redDark, 0, y - 1.25, 0, w + 0.6, 1.7, d + 0.6);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = (ix + 0.5) * sx - w / 2, z = (iz + 0.5) * sz - d / 2;
      const t = Math.max(0, Math.min(1, (w / 2 - Math.abs(x)) / (d * 0.44), 1 - Math.abs(z) / (d / 2)));
      const corner = Math.pow(Math.abs(x) / (w / 2) * Math.abs(z) / (d / 2), 6);
      const height = Math.round((rise * (t * 0.3 + t * t * 0.7) + corner * 3.5) / 0.7) * 0.7;
      const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
      b(edge && !blue ? C.gold : pick(colors), x, y + height, z, sx + 0.04, 2.1, sz + 0.04, 'roof');
      if (fine && iz % 2 === 0) b(blue ? C.teal : C.goldLight, x, y + height + 1.07, z - sz * 0.25, sx * 0.23, 0.25, sz * 0.82, 'gold');
    }
    const ridge = Math.max(w - d * 0.88, 4);
    b(blue ? C.teal : C.goldLight, 0, y + rise + 1.1, 0, ridge, 1.4, 1.9, 'gold');
    b(blue ? C.teal : C.goldDark, 0, y + rise + 0.35, 0, ridge + 3, 1.4, 3, 'roof');
    for (const s of [-1, 1]) {
      const rx = s * (ridge / 2 + 0.5);
      b(C.gold, rx, y + rise + 2.9, 0, 2.2, 3.3, 2, 'gold');
      b(C.goldLight, rx + s * 1.1, y + rise + 4.5, 0, 2.1, 1, 1.7, 'gold');
      b(C.gold, rx + s * 1.9, y + rise + 5.2, 0, 1, 1.8, 1.3, 'gold');
      for (const front of [-1, 1]) for (let i = 0; i < 4; i++) b(blue ? C.teal : C.goldLight, s * (w / 2 - 1 + i * 0.65), y + 1.6 + i * 0.55, front * (d / 2 - 1 + i * 0.65), 2.2 - i * 0.24, 1.1, 2.2 - i * 0.24, 'gold');
    }
  }
  function lantern(b, x, y, z, scale = 1) {
    b(C.wood, x, y + 1.8 * scale, z, 0.16 * scale, 1.3 * scale, 0.16 * scale);
    b(0xffc073, x, y + 0.65 * scale, z, 1.45 * scale, 1.6 * scale, 1.45 * scale, 'glow');
    b(C.gold, x, y + 1.5 * scale, z, 1.65 * scale, 0.28 * scale, 1.65 * scale, 'gold');
    b(C.gold, x, y - 0.2 * scale, z, 1.4 * scale, 0.25 * scale, 1.4 * scale, 'gold');
    b(C.vermilion, x, y - 0.75 * scale, z, 0.3 * scale, 0.9 * scale, 0.3 * scale);
  }
  function plaque({ x, z, w, d, h, plinth, turn }, text) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 180;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#14373a'; ctx.fillRect(0, 0, 512, 180);
    ctx.strokeStyle = '#d7aa57'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 164);
    ctx.font = '86px SimSun, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#efcb82'; ctx.fillText(text, 256, 95);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.3, 22), 5.4), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x + Math.sin(turn) * (d / 2 + 0.98), G + plinth + h - 3.7, z + Math.cos(turn) * (d / 2 + 0.98));
    mesh.rotation.y = turn; scene.add(mesh);
  }
  function hall(options) {
    const spec = { h: 17, plinth: 3, tiers: 1, turn: 0, blue: false, fine: false, ...options };
    const { x, z, w, d, h, plinth, tiers, turn, blue, fine } = spec;
    buildingCount++;
    const rotated = Math.abs(Math.sin(turn)) > 0.5;
    footprints.push({ x, z, w: (rotated ? d : w) + 20, d: (rotated ? w : d) + 28 });
    const b = (color, lx, y, lz, bw, bh, bd, kind = 'matte') => add(color, x + lx * Math.cos(turn) + lz * Math.sin(turn), G + y, z - lx * Math.sin(turn) + lz * Math.cos(turn), bw, bh, bd, kind, turn);
    for (let i = 0; i < 3; i++) {
      const extension = plinth >= 7 ? 34 - i * 10 : 14 - i * 3;
      b(i === 2 ? C.ivory : C.stone, 0, plinth / 3 * (i + 0.5), 0, w + extension, plinth / 3, d + extension);
    }
    if (plinth >= 7) {
      railing(b, w + 7, d + 7, plinth);
      b(C.stoneDark, 0, plinth * 0.43, 0, w + 10, 0.45, d + 10);
      for (const s of [-1, 1]) for (let p = -w / 2; p < w / 2; p += 8) b(C.ivory, p, plinth * 0.5, s * (d / 2 + 5.1), 4, plinth * 0.46, 0.6);
    }
    b(C.redDark, 0, plinth + h / 2, 0, w - 3.5, h, d - 3.5);
    const bays = Math.max(3, Math.round(w / 9));
    for (const s of [-1, 1]) {
      for (let i = 0; i <= bays; i++) {
        const px = -w / 2 + i * w / bays;
        b(C.vermilion, px, plinth + h / 2, s * d / 2, 1.6, h, 1.6);
        b(C.ivory, px, plinth + 0.65, s * d / 2, 2.5, 1.3, 2.5);
        b(C.goldDark, px, plinth + h - 1, s * d / 2, 2.1, 1.2, 2.1, 'gold');
        for (let j = 0; j < 3; j++) b(j === 1 ? C.teal : C.gold, px, plinth + h + 0.4 + j * 0.75, s * (d / 2 + j * 0.55), 2.4 + j * 1.7, 0.65, 2.2 + j * 0.85, 'gold');
        if (i === bays) continue;
        const cx = px + w / bays / 2, ww = w / bays - 2;
        const door = Math.abs(cx) < w * 0.18;
        b(door ? C.red : C.wood, cx, plinth + h * 0.43, s * (d / 2 - 0.6), ww, h * 0.7, 0.5);
        b(C.goldDark, cx, plinth + h * 0.81, s * (d / 2 - 0.1), ww, 0.55, 0.6, 'gold');
        if (door) {
          for (let a = -1; a <= 1; a++) for (let q = 0; q < 5; q++) b(C.gold, cx + a * ww / 4, plinth + 3 + q * (h * 0.105), s * (d / 2 - 0.17), 0.32, 0.32, 0.2, 'gold');
          b(C.gold, cx, plinth + h * 0.43, s * (d / 2 - 0.18), 0.2, h * 0.7, 0.28, 'gold');
        } else {
          b(0xffb659, cx, plinth + h * 0.54, s * (d / 2 - 0.27), ww * 0.78, h * 0.33, 0.16, 'glow');
          for (let a = -2; a <= 2; a++) b(C.tealDark, cx + a * ww / 6, plinth + h * 0.54, s * (d / 2 - 0.1), 0.28, h * 0.38, 0.24);
          for (let q = 0; q < 3; q++) b(C.tealDark, cx, plinth + h * (0.41 + q * 0.13), s * (d / 2 - 0.08), ww, 0.3, 0.26);
        }
      }
      b(C.teal, 0, plinth + h + 0.8, s * d / 2, w + 1.8, 1.4, 2.4);
      b(C.gold, 0, plinth + h + 1.8, s * d / 2, w + 2.1, 0.45, 2.6, 'gold');
      if (w >= 40) for (let i = -1; i <= 1; i += 2) lantern(b, i * w * 0.25, plinth + h - 4.4, s * (d / 2 + 1.7), fine ? 1.35 : 0.9);
    }
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
      const pz = i * d * 0.3;
      b(C.vermilion, s * w / 2, plinth + h / 2, pz, 1.7, h, 1.7);
      b(C.gold, s * w / 2, plinth + h + 1.3, pz, 3.3, 2, 5.7, 'gold');
    }
    const steps = Math.max(5, Math.round(plinth * 2)), stairWidth = fine ? w * 0.36 : w * 0.31;
    for (let i = 0; i < steps; i++) {
      const sy = (i + 0.5) * plinth / steps, pz = d / 2 + 7 + (steps - i) * 0.85;
      b(C.ivory, 0, sy, pz, stairWidth, plinth / steps, 1.05);
      for (const s of [-1, 1]) b(C.stone, s * (stairWidth / 2 + 0.4), sy + 1, pz, 1, 2.3, 1);
    }
    roof(b, w + 10, d + 10, plinth + h + 3.8, Math.min(15, d * 0.26), blue, fine);
    if (tiers > 1) {
      b(C.red, 0, plinth + h + 11.5, 0, w * 0.77, 6, d * 0.7);
      b(C.teal, 0, plinth + h + 13.5, 0, w * 0.8, 1.6, d * 0.74);
      roof(b, w * 0.83, d * 0.79, plinth + h + 15.4, Math.min(15, d * 0.25), blue, fine);
    }
    if (options.name) plaque(spec, options.name);
    return b;
  }
  function wall(x, z, w, d) {
    add(C.stoneDark, x, 2.2, z, w + 1, 4.4, d + 1);
    add(C.red, x, 8, z, w, 11, d);
    add(C.stone, x, 14, z, w + 1.3, 1, d + 1.3);
    const horizontal = w > d, length = horizontal ? w : d;
    for (let i = -length / 2 + 2; i < length / 2; i += 7) add(C.ivory, x + (horizontal ? i : 0), 15.3, z + (horizontal ? 0 : i), horizontal ? 3.6 : w, 1.8, horizontal ? d : 3.6);
  }
  const landscape = buildLandscape(scene, { add, waterMaterial: voxels.materials.water });
  add(0x607565, 0, 0, 0, 698, 2.5, 868, 'ground');
  add(0x28585a, 0, 1.12, 0, 654, 0.7, 826, 'water');
  add(C.ground, 0, G - 0.4, 0, 608, 0.8, 778, 'ground');
  for (const s of [-1, 1]) { wall(s * 301, 0, 7, 780); wall(s * 184, 386, 232, 7); }
  wall(0, -386, 608, 7);
  add(C.ivory, 0, G + 0.62, 0, 20, 0.3, 754, 'ground');
  for (const z of [295, 80, -147, -262]) {
    const depth = z === 295 ? 118 : z === 80 ? 153 : 55;
    add(C.stoneDark, 0, G + 0.13, z, 204, 0.32, depth + 4, 'ground');
    for (let x = -96; x <= 96; x += 8) for (let pz = z - depth / 2 + 4; pz < z + depth / 2; pz += 8) add(pick(C.paving), x, G + 0.32, pz, 7.7, 0.2, 7.7, 'ground');
    for (const s of [-1, 1]) add(C.ivory, s * 100, G + 0.4, z, 1.6, 0.6, depth + 3);
  }
  for (const s of [-1, 1]) {
    add(C.stone, s * 218, G + 0.1, 0, 11, 0.25, 736, 'ground');
    for (const z of [298, 208, 110, -25, -177, -285]) add(C.stone, s * 167, G + 0.12, z, 266, 0.28, 8, 'ground');
  }
  hall({ x: 0, z: -55, w: 132, d: 80, h: 27, plinth: 10, tiers: 2, fine: true, name: '太和殿' });
  hall({ x: 0, z: -198, w: 88, d: 49, h: 22, plinth: 6, tiers: 2, fine: true, name: '乾元殿' });
  hall({ x: 0, z: -304, w: 72, d: 41, h: 18, plinth: 4, tiers: 2, name: '承光殿' });
  hall({ x: 0, z: 205, w: 90, d: 36, h: 20, plinth: 5, tiers: 2, fine: true, name: '昭德门' });
  hall({ x: 0, z: 373, w: 111, d: 34, h: 23, plinth: 6, tiers: 2, fine: true, name: '承天门' });
  for (const s of [-1, 1]) {
    for (const z of [290, 122, -43, -190]) hall({ x: s * 155, z, w: 62, d: 35, h: 17, plinth: 3.2, turn: -s * Math.PI / 2 });
    for (const z of [300, 201, 102, 3, -96, -195, -294]) hall({ x: s * 260, z, w: 43, d: 27, h: 13, plinth: 2.5, blue: z < -90 });
    for (const z of [-366, 366]) hall({ x: s * 281, z, w: 31, d: 31, h: 24, plinth: 5, tiers: 2 });
  }
  if (full) {
    function local(x, z, turn = 0) {
      return (color, lx, y, lz, w, h, d, kind = 'matte') => add(color, x + lx * Math.cos(turn) + lz * Math.sin(turn), G + y, z - lx * Math.sin(turn) + lz * Math.cos(turn), w, h, d, kind, turn);
    }
    function gallery(x, z, length, turn) {
      buildingCount++;
      footprints.push({ x, z, w: 20, d: length + 8 });
      const b = local(x, z, turn);
      b(C.ivory, 0, 0.65, 0, length + 4, 1.3, 15);
      for (let px = -length / 2 + 2; px < length / 2; px += 7) for (const s of [-1, 1]) {
        b(C.vermilion, px, 5.9, s * 4.8, 1, 10, 1);
        b(C.gold, px, 10.4, s * 4.8, 3.2, 0.6, 2.6, 'gold');
      }
      b(C.teal, 0, 10.5, 0, length, 1.3, 12);
      roof(b, length + 4, 16, 12, 4.2, false);
    }
    function pagoda(x, z, levels = 9) {
      buildingCount++;
      footprints.push({ x, z, w: 48, d: 48 });
      const b = local(x, z);
      for (let i = 0; i < 3; i++) b(C.ivory, 0, 1 + i * 1.3, 0, 45 - i * 4, 1.3, 45 - i * 4);
      railing(b, 38, 38, 4);
      for (let floor = 0; floor < levels; floor++) {
        const width = 28 - floor * 1.65, y = 4 + floor * 11.7;
        b(C.red, 0, y + 4.4, 0, width, 8.8, width);
        for (const s of [-1, 1]) {
          b(C.teal, 0, y + 8.2, s * width / 2, width + 1, 1.1, 1.5);
          b(C.gold, s * width / 2, y + 8.2, 0, 1.5, 0.6, width + 1, 'gold');
          for (const p of [-0.33, 0, 0.33]) {
            b(C.redDark, p * width, y + 4.8, s * (width / 2 + 0.1), width * 0.18, 4.4, 0.3);
            b(0xffba64, p * width, y + 4.8, s * (width / 2 + 0.3), width * 0.12, 3.6, 0.15, 'glow');
            b(C.goldDark, p * width, y + 4.8, s * (width / 2 + 0.5), 0.25, 4, 0.3);
          }
          for (const t of [-1, 1]) b(C.vermilion, s * (width / 2 - 0.6), y + 4.5, t * (width / 2 - 0.6), 1.2, 9, 1.2);
        }
        roof(b, width + 10, width + 10, y + 9.1, 5.2, false, false);
      }
      const top = 4 + (levels - 1) * 11.7 + 15;
      for (let i = 0; i < 7; i++) b(i % 2 ? C.goldDark : C.goldLight, 0, top + i * 1.1, 0, 3.8 - i * 0.38, 0.9, 3.8 - i * 0.38, 'gold');
      b(C.goldLight, 0, top + 8.1, 0, 0.55, 4, 0.55, 'gold');
    }
    function tree(x, z, scale = 1, pine = false, golden = false, base = G) {
      treeCount++;
      const trunk = pine ? 10 : 7;
      add(0x55402d, x, base + trunk * scale / 2, z, 1.5 * scale, trunk * scale, 1.5 * scale);
      const palette = golden ? [0xbfa550, 0xd0ad56, 0x938847, 0x9f923d] : [0x304f3c, 0x3e6549, 0x557849, 0x405c3e];
      if (pine) {
        for (let i = 0; i < 5; i++) {
          const size = (13 - i * 2) * scale;
          add(pick(palette), x, base + (7 + i * 2.6) * scale, z, size, 3 * scale, size);
          add(pick(palette), x + 1.4 * scale, base + (9 + i * 2.6) * scale, z, size * 0.65, 1.3 * scale, size * 0.7);
        }
      } else {
        for (let i = 0; i < 9; i++) {
          const dx = (random() - 0.5) * 8, dz = (random() - 0.5) * 8, dy = random() * 5;
          const size = (5 + random() * 5) * scale;
          add(pick(palette), x + dx * scale, base + (8 + dy) * scale, z + dz * scale, size, size * 0.65, size);
        }
        add(pick(palette), x, base + 15 * scale, z, 6.5 * scale, 2.2 * scale, 6.5 * scale);
      }
    }
    function lion(x, z, scale = 1) {
      const b = local(x, z);
      b(C.ivory, 0, 0.8 * scale, 0, 5 * scale, 1.6 * scale, 6 * scale);
      b(C.stone, 0, 2.3 * scale, -0.5 * scale, 3.6 * scale, 1.5 * scale, 4.6 * scale);
      b(C.ivory, 0, 3.8 * scale, 0, 3.1 * scale, 2.9 * scale, 3.1 * scale);
      b(C.stone, 0, 5 * scale, 1.1 * scale, 3.8 * scale, 3.3 * scale, 3.6 * scale);
      b(C.ivory, 0, 5.5 * scale, 2.8 * scale, 2.5 * scale, 1.1 * scale, 1.2 * scale);
      for (const s of [-1, 1]) {
        b(C.ivory, s * 1.55 * scale, 2.4 * scale, 1.6 * scale, 1.1 * scale, 2.2 * scale, 2.4 * scale);
        b(C.stoneDark, s * 0.9 * scale, 5.9 * scale, 2.8 * scale, 0.32 * scale, 0.3 * scale, 0.2 * scale);
        b(C.ivory, s * 1.3 * scale, 6.6 * scale, 0.9 * scale, 0.8 * scale, 1 * scale, 1.1 * scale);
      }
      b(C.stone, 2.7 * scale, 1.8 * scale, 2 * scale, 1.5 * scale, 1.5 * scale, 1.5 * scale);
    }
    function garden(x, z, w, d) {
      add(C.stone, x, G + 0.25, z, w + 6, 0.5, d + 6, 'ground');
      add(0x355448, x, G + 0.55, z, w, 0.35, d, 'ground');
      add(0x326968, x, G + 0.78, z, w * 0.75, 0.15, d * 0.73, 'water');
      const b = local(x, z);
      railing(b, w + 1, d + 1, 0.3);
      for (let i = 0; i < 22; i++) {
        const px = x + (random() - 0.5) * w * 0.68, pz = z + (random() - 0.5) * d * 0.68;
        const size = 1.4 + random() * 1.7;
        add(0x69814c, px, G + 0.91, pz, size, 0.18, size, 'ground');
        if (i % 4 === 0) add(0xcf9980, px, G + 1.14, pz, 0.8, 0.4, 0.8);
      }
      for (const s of [-1, 1]) tree(x + s * (w / 2 + 7), z, 0.9, false, true);
      bridge(x + w * 0.17, z, 7, d + 4);
      for (const a of [-1, 1]) for (const b of [-1, 1]) flowerbed(x + a * w * 0.36, z + b * (d / 2 + 6), 8, 6);
    }
    function bridge(x, z, w, d) {
      const b = local(x, z);
      for (let i = 0; i < 11; i++) {
        const pz = (i - 5) * d / 11, y = 0.65 + (1 - Math.abs(i - 5) / 5) * 2;
        b(C.ivory, 0, y, pz, w, 1.1, d / 11 + 0.15);
        for (const s of [-1, 1]) {
          b(C.ivory, s * (w / 2 - 0.6), y + 1.7, pz, 0.85, 2.5, 0.85);
          b(C.ivory, s * (w / 2 - 0.6), y + 2.7, pz, 1.4, 0.35, 1.4);
          b(C.stone, s * (w / 2 - 0.6), y + 1.4, pz, 0.6, 0.45, d / 11 + 0.25);
        }
      }
    }
    function crossBridge(x, z) {
      const b = local(x, z, Math.PI / 2);
      for (let i = 0; i < 7; i++) {
        const pz = (i - 3) * 2.8, y = 0.9 + (1 - Math.abs(i - 3) / 3) * 1.9;
        b(C.ivory, 0, y, pz, 9, 0.75, 3);
        for (const s of [-1, 1]) {
          b(C.ivory, s * 4, y + 1.2, pz, 0.7, 1.8, 0.7);
          b(C.stone, s * 4, y + 1.9, pz, 0.6, 0.45, 3);
        }
      }
    }
    function flowerbed(x, z, w = 10, d = 7) {
      add(C.stoneDark, x, G + 0.35, z, w + 1.6, 0.65, d + 1.6);
      add(0x365938, x, G + 0.72, z, w, 0.2, d, 'ground');
      for (let i = 0; i < 22; i++) {
        const px = x + (random() - 0.5) * (w - 1), pz = z + (random() - 0.5) * (d - 1);
        const height = 0.7 + random() * 1.1;
        add(0x5c7c37, px, G + 0.7 + height / 2, pz, 0.18, height, 0.18);
        add(pick([0xe5b747, 0xe9cb81, 0xd78173, 0xe6a09d, 0xe4d7b6]), px, G + 0.7 + height, pz, 0.8, 0.55, 0.8);
        add(0x537b3f, px + 0.33, G + 0.85 + height * 0.35, pz, 0.6, 0.2, 0.3);
        flowerCount++;
      }
    }
    // Two nine-storey golden pagodas mark the rear skyline.
    for (const s of [-1, 1]) {
      pagoda(s * 155, -301, 9);
      hall({ x: s * 155, z: 205, w: 40, d: 37, h: 31, plinth: 6, tiers: 2, fine: true, name: s < 0 ? '钟楼' : '鼓楼' });
      for (const z of [330, 252, 174, 96, 18, -60, -138, -216, -333]) hall({ x: s * 207, z, w: 31, d: 20, h: 11.5, plinth: 2, blue: true });
      for (const z of [296, 82, -174]) gallery(s * 112, z, z === 82 ? 117 : 85, Math.PI / 2);
      for (const z of [247, -120]) hall({ x: s * 69, z, w: 22, d: 22, h: 12, plinth: 3, blue: false });
      hall({ x: s * 92, z: 377, w: 25, d: 17, h: 13, plinth: 3, blue: true });
      garden(s * 162, 34, 49, 46);
      garden(s * 207, -279, 30, 36);
      bridge(s * 83, 421, 19, 78);
      for (let pz = -330; pz <= 330; pz += 26) {
        tree(s * 285, pz, 0.58, true);
      }
      for (let pz = -340; pz < 340; pz += 24) {
        if ([300, 201, 102, 3, -96, -195, -294].some(v => Math.abs(v - pz) < 22)) continue;
        tree(s * 248, pz, 0.7, false, pz > 0);
      }
      for (const pz of [333, 158]) {
        add(C.ivory, s * 42, G + 1, pz, 6, 2, 6);
        add(C.ivory, s * 42, G + 9, pz, 2.5, 15, 2.5);
        add(C.ivory, s * 42, G + 13, pz, 10, 1.6, 3);
        add(C.stone, s * 42, G + 17, pz, 4, 1.2, 4);
        add(C.ivory, s * 42, G + 19, pz, 2.8, 2.8, 3.5);
      }
      for (const pz of [244, 14, -154]) lion(s * (pz === 14 ? 35 : 27), pz, pz === 14 ? 1.2 : 0.95);
      // Lamp-lined processional route, clear of the monumental main platform.
      for (let pz = 37; pz < 355; pz += 26) {
        if (Math.abs(pz - 205) < 41) continue;
        const b = local(s * 30, pz);
        b(C.stone, 0, 0.5, 0, 3.5, 1, 3.5); b(C.wood, 0, 4.5, 0, 0.9, 8, 0.9);
        b(C.gold, 0, 8, 0, 4.8, 0.4, 1.2, 'gold');
        lantern(b, -1.7, 5.5, 0, 1.05); lantern(b, 1.7, 5.5, 0, 1.05);
      }
    }
    bridge(0, 421, 37, 78);
    add(C.ivory, 0, G + 0.12, 473, 46, 0.2, 100, 'ground');
    add(C.stoneDark, 0, G + 0.09, 477, 105, 0.16, 61, 'ground');
    for (const s of [-1, 1]) for (let x = 36; x < 270; x += 22) {
      tree(s * x, -421, 0.8 + random() * 0.5, true);
    }
    // Retaining walls give the moats a visible stone embankment.
    for (const s of [-1, 1]) {
      add(C.stoneDark, s * 309, 1.1, 0, 2, 2.4, 786);
      add(C.stoneDark, s * 330, 0.8, 0, 2, 2, 827);
      add(C.stoneDark, 0, 1.1, s * 394, 618, 2.4, 2);
      add(C.stoneDark, 0, 0.8, s * 416, 660, 2, 2);
      for (let pz = -365; pz < 365; pz += 15) add(0x477d76, s * 320, 1.5, pz, 7 + random() * 4, 0.06, 0.4, 'ground');
    }
    // Linked garden canals and repeated arched stone bridges through both wings.
    for (const s of [-1, 1]) {
      const x = s * 186;
      add(0x244f4d, x, G + 0.23, -4, 13, 0.42, 681, 'ground');
      add(0x3b8780, x, G + 0.51, -4, 9, 0.1, 680, 'water');
      for (const edge of [-1, 1]) add(C.stoneDark, x + edge * 6.3, G + 0.68, -4, 1.8, 0.9, 682);
      for (const pz of [-306, -228, -151, -73, 5, 83, 161, 239, 317]) {
        crossBridge(x, pz);
        const b = local(x, pz);
        for (const bank of [-1, 1]) { b(C.wood, bank * 11.5, 4.5, 7, 0.65, 8, 0.65); lantern(b, bank * 11.5, 5.3, 7, 0.85); }
      }
      for (let pz = -335; pz < 335; pz += 13) {
        add(0x63a09a, x + Math.sin(pz) * 1.7, G + 0.58, pz, 4.3, 0.04, 0.5, 'ground');
        for (let i = 0; i < 3; i++) add(0x789851, x + s * 5, G + 1.2, pz + i, 0.25, 1.3, 0.25);
      }
    }
    const clear = (x, z, margin) => !footprints.some(f => Math.abs(x - f.x) < f.w / 2 + margin && Math.abs(z - f.z) < f.d / 2 + margin)
      && !(Math.abs(Math.abs(x) - 162) < 35 && Math.abs(z - 34) < 34)
      && !(Math.abs(Math.abs(x) - 207) < 24 && Math.abs(z + 279) < 26)
      && Math.abs(Math.abs(x) - 186) > 13;
    // Dense planting is mirrored about the central axis and kept clear of roads.
    for (let x = 94; x <= 278; x += 15) for (let z = -340; z <= 337; z += 17) {
      const px = x + (random() - 0.5) * 4, pz = z + (random() - 0.5) * 4;
      if (!clear(px, pz, 2) || [298,208,110,-25,-177,-285].some(road => Math.abs(road - pz) < 6)) continue;
      for (const s of [-1, 1]) {
        if ((x + z) % 4 === 0) flowerbed(s * px, pz, 8, 6);
        else tree(s * px, pz, 0.9 + random() * 0.55, (x + z) % 3 === 0, (x + z) % 5 === 0);
      }
    }
    // Parterre gardens frame the large courtyards without filling the central way.
    for (const s of [-1, 1]) {
      for (const z of [270, 320, 55, 105, -141, -257]) {
        flowerbed(s * 81, z, 13, 7);
        add(0x3d683f, s * 84, G + 1.1, z + 8, 20, 1.8, 3);
        add(0x557a46, s * 84, G + 1.1, z - 8, 20, 1.8, 3);
      }
      for (let pz = -352; pz < 350; pz += 15) {
        if (Math.abs(pz - 205) < 33 || Math.abs(pz + 55) < 69 || Math.abs(pz + 198) < 42 || Math.abs(pz + 304) < 35) continue;
        tree(s * 64, pz, 0.8, false, true);
      }
      // Level pavilion glades connect to the winding outer promenade.
      for (const z of [270, 30, -207]) {
        hall({ x: s * 413, z, w: 23, d: 23, h: 14, plinth: 3, tiers: 1, blue: true });
        for (let offset = -22; offset <= 22; offset += 11) flowerbed(s * 414, z + offset + 29, 8, 6);
      }
      // Bronze tripods, banners and tall stone planters beside the main approach.
      for (const pz of [48, 139, 271, 321]) {
        const b = local(s * 39, pz);
        for (const a of [-1, 1]) for (const f of [-1, 1]) b(0x37504b, a * 2.2, 2.6, f * 2.2, 1.2, 5, 1.2, 'gold');
        b(0x576452, 0, 5.5, 0, 7, 4, 7, 'gold');
        b(C.goldDark, 0, 7.6, 0, 7.8, 0.8, 7.8, 'gold');
        b(0x263f3a, 0, 8.1, 0, 5.4, 0.4, 5.4);
        for (const a of [-1, 1]) b(C.goldDark, a * 3.9, 8.3, 0, 0.9, 3.3, 3, 'gold');
      }
      for (let pz = 26; pz < 355; pz += 42) {
        if (Math.abs(pz - 205) < 35) continue;
        const b = local(s * 52, pz);
        b(C.ivory, 0, 0.6, 0, 3.5, 1.2, 3.5);
        b(C.goldDark, 0, 8, 0, 0.6, 15, 0.6, 'gold');
        b(C.goldLight, 0, 15.7, 0, 1.2, 1.5, 1.2, 'gold');
        b(C.red, s * 2.4, 12.5, 0, 4.8, 5.5, 0.26);
        b(C.gold, s * 2.4, 10.1, 0.2, 4.8, 0.4, 0.3, 'gold');
        b(C.goldLight, s * 2.4, 12.5, 0.21, 0.7, 2.8, 0.15, 'gold');
      }
      for (const pz of [39, -133, -244]) {
        const b = local(s * 47, pz);
        b(C.ivory, 0, 1.2, 0, 5, 2.4, 5);
        b(C.stone, 0, 3.1, 0, 3.7, 2, 3.7);
        b(C.ivory, 0, 4, 0, 5.5, 0.65, 5.5);
        for (let i = 0; i < 5; i++) { b(0x617d3f, (i - 2) * 0.7, 5.1, 0, 0.3, 2, 0.3); b(0xe3b158, (i - 2) * 0.7, 6.3, 0, 1.1, 0.65, 1.1); flowerCount++; }
      }
    }
    const planting = landscape.dress(tree);
    flowerCount += planting.wildFlowers;
    landscape.outsideTrees = planting.outsideTrees;
  }
  voxels.finish();
  return { buildingCount, voxelCount: voxels.count, treeCount, flowerCount, landscape, waterTime: voxels.waterTime, glowMaterial: voxels.materials.glow };
}
