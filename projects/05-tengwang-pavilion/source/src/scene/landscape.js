import * as THREE from 'three';
import { Voxels, palette as P, random } from './voxels.js';

export const WATER = { width: 132, depth: 106, x: -8, z: -3, y: 0.08 };
export const LAND = { back: -46.5, front: 40.5, right: 51 };
export const bankAt = z => z < -28.5 ? -34.5 : z < -7.5 ? -33 : z < 9 ? -28.5 : z < 22.5 ? -22.5 : -15;
const pondDistance = (x, z) => ((x - 40) / 7) ** 2 + ((z - 25) / 8.5) ** 2;

function tree(v, x, z, scale, kind, seed, base = 1.0) {
  const rng = random(seed);
  const trunk = kind === 'pine' ? '#5e5743' : '#6d5442';
  v.box(x, base + 1.8 * scale, z, 0.57 * scale, 3.6 * scale, 0.56 * scale, trunk);
  v.box(x + 0.28 * scale, base + 3.48 * scale, z, 0.43 * scale, 0.93 * scale, 0.43 * scale, trunk);
  const colours = kind === 'gold' ? ['#d5a34f', '#e0b75f', '#bb7e3f', '#ecc97d']
    : kind === 'rust' ? ['#b56843', '#c97b48', '#d19553', '#994c39']
      : ['#426c57', '#577b5d', '#638966', '#345b4d'];
  const clusters = kind === 'pine'
    ? [[0, 4.9, 0, 2.2, 0.85], [-1.3, 3.6, 0.2, 2, 0.8], [1.2, 4.1, -0.3, 1.7, 0.8], [0.3, 6.0, 0, 1.35, 0.8]]
    : [[0, 4.8, 0, 2.0, 1.7], [-1.2, 3.9, 0.15, 1.65, 1.2], [1.25, 4.2, 0.0, 1.6, 1.25], [0.3, 4.0, 1.2, 1.6, 1.3]];
  clusters.forEach(([bx, by, bz, radius, height]) => {
    v.line([x, base + 2.0 * scale, z], [x + bx * scale, base + by * scale, z + bz * scale], 0.3 * scale, trunk);
    const unit = 0.57 * scale;
    for (let xx = -radius; xx <= radius; xx += 0.56) for (let zz = -radius; zz <= radius; zz += 0.56) {
      for (let yy = -height; yy <= height; yy += 0.56) {
        const dist = (xx * xx + zz * zz) / (radius * radius) + (yy * yy) / (height * height);
        if (dist > 1.03 + rng() * 0.18 || (dist > 0.8 && rng() > 0.81)) continue;
        // Only the outer shell is needed; no invisible interior leaf cubes.
        if (dist < 0.35 && yy < height * 0.35) continue;
        v.cube(x + (bx + xx) * scale, base + (by + yy) * scale, z + (bz + zz) * scale,
          unit, colours[Math.floor(rng() * colours.length)], 'leaves', 0.1);
      }
    }
  });
  // Squared-off root buttresses and a few fallen leaves anchor each tree.
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 0.7 + rng() * 2.5 * scale;
    v.box(x + Math.cos(a) * r, base + 0.04, z + Math.sin(a) * r, 0.22, 0.04, 0.18,
      kind === 'pine' ? '#899275' : colours[i % colours.length], 'ground');
  }
}

function willow(v, x, z, scale = 1, seed = 18) {
  const rng = random(seed), trunk = '#6c6246';
  v.line([x, 1.05, z], [x + 0.4 * scale, 5.1 * scale, z], 0.49 * scale, trunk);
  const colours = ['#718963', '#859c6c', '#9daa79', '#637e5b'];
  for (let branch = 0; branch < 12; branch++) {
    const angle = branch / 12 * Math.PI * 2;
    const r = (2.0 + rng() * 0.8) * scale;
    const xx = x + Math.cos(angle) * r, zz = z + Math.sin(angle) * r;
    const top = (4.6 + rng() * 1.25) * scale;
    v.line([x + 0.3, 3.8 * scale, z], [xx, top, zz], 0.18 * scale, trunk);
    for (let dx = -0.85; dx <= 0.85; dx += 0.55) for (let dz = -0.85; dz <= 0.85; dz += 0.55) {
      v.cube(xx + dx * scale, top + (0.5 - Math.abs(dx) * 0.3) * scale,
        zz + dz * scale, 0.63 * scale, colours[branch % colours.length], 'leaves', 0.12);
    }
    for (let strand = 0; strand < 5; strand++) {
      const drop = (1.4 + rng() * 1.8) * scale;
      const offset = (strand - 2) * 0.4 * scale;
      for (let h = 0; h < drop; h += 0.36 * scale) {
        v.box(xx + Math.cos(angle) * h * 0.12 + Math.sin(angle) * offset,
          top - h, zz + Math.sin(angle) * h * 0.12 + Math.cos(angle) * offset,
          0.27 * scale, 0.36 * scale, 0.28 * scale, colours[(strand + branch) % colours.length], 'leaves', 0.1);
      }
    }
  }
}

function rocks(v, x, z, scale, seed) {
  const rng = random(seed);
  for (let chunk = 0; chunk < 5; chunk++) {
    const xx = x + (rng() - 0.5) * 2.1 * scale;
    const zz = z + (rng() - 0.5) * 1.8 * scale;
    const h = (0.65 + rng() * 1.2) * scale;
    v.box(xx, 1.02 + h / 2, zz, (0.8 + rng() * 0.6) * scale, h,
      (0.8 + rng() * 0.7) * scale, chunk % 2 ? '#91998a' : '#a9ad99', 'matte', 0.12);
    v.box(xx - 0.1 * scale, 1.02 + h, zz, 0.7 * scale, 0.25 * scale, 0.7 * scale, '#b7b59c');
  }
}

function bench(v, x, z, alongZ = false) {
  v.box(x, 1.67, z, alongZ ? 0.62 : 2.4, 0.18, alongZ ? 2.4 : 0.62, '#a99570');
  for (const s of [-1, 1]) v.box(x + (alongZ ? 0 : s * 0.8), 1.37, z + (alongZ ? s * 0.8 : 0), 0.35, 0.5, 0.35, '#aaa68e');
}

function stoneLamp(v, x, z) {
  v.box(x, 1.15, z, 0.94, 0.3, 0.94, P.stone);
  v.box(x, 1.75, z, 0.35, 1.03, 0.35, P.stone);
  v.box(x, 2.2, z, 0.7, 0.22, 0.7, P.ivory);
  v.box(x, 2.57, z, 0.56, 0.57, 0.56, '#e8be77', 'glow');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(x + sx * 0.28, 2.57, z + sz * 0.28, 0.1, 0.66, 0.1, P.stoneDark);
  v.box(x, 2.94, z, 1, 0.22, 0.98, P.stone);
  v.box(x, 3.12, z, 0.66, 0.17, 0.64, P.ivory);
  v.box(x, 3.28, z, 0.3, 0.16, 0.3, P.stone);
}

function person(v, x, z, coat, height = 0.94) {
  v.box(x - 0.09, 1.2, z, 0.1, 0.4, 0.16, '#3e4740');
  v.box(x + 0.09, 1.2, z, 0.1, 0.4, 0.16, '#3e4740');
  v.box(x, 1.36 + height * 0.23, z, 0.32, height * 0.48, 0.23, coat);
  v.cube(x, 1.43 + height * 0.51, z, 0.23, '#d2ad7e');
  v.box(x, 1.58 + height * 0.51, z, 0.25, 0.13, 0.25, '#3c3930');
}

function createBoat() {
  const group = new THREE.Group();
  group.name = '一叶归舟';
  const v = new Voxels(675);
  for (let i = -7; i <= 7; i++) {
    const w = 1.9 * Math.pow(1 - Math.pow(Math.abs(i) / 8, 2), 0.45);
    v.box(0, 0.1 + Math.abs(i) * 0.024, i * 0.42, w, 0.34, 0.43, '#654936', 'matte', 0.12);
    v.box(0, 0.31 + Math.abs(i) * 0.024, i * 0.42, w - 0.15, 0.13, 0.41, '#bb8f57', 'matte', 0.08);
    for (const s of [-1, 1]) v.box(s * (w / 2 - 0.09), 0.46 + Math.abs(i) * 0.026, i * 0.42, 0.18, 0.34, 0.43, '#745038');
  }
  v.box(0, 2.7, -0.32, 0.13, 5.3, 0.13, '#6e5139');
  // A battened junk sail built from deliberately visible cloth pixels.
  for (let row = 0; row < 13; row++) {
    const y = 1.4 + row * 0.3;
    const width = row < 9 ? 2.28 - row * 0.04 : 2.0 - (row - 9) * 0.3;
    const belly = Math.sin(row / 12 * Math.PI) * 0.37;
    for (let k = 0; k * 0.27 < width; k++) {
      v.box(0.04 + k * 0.27, y, -0.32 + belly, 0.28, 0.3, 0.09, row % 3 === 0 ? '#b99560' : '#eee0b9', 'matte', 0.06);
    }
  }
  v.box(0, 0.72, 1.45, 1.67, 0.16, 0.53, '#9b744b');
  v.box(-0.2, 1.0, 1.51, 0.27, 0.6, 0.3, '#4d6770');
  v.cube(-0.2, 1.45, 1.51, 0.25, '#be956b');
  v.box(-0.2, 1.56, 1.51, 0.53, 0.1, 0.48, '#d2b375');
  v.line([-0.3, 1.03, 1.6], [-1.8, 0.1, 2.7], 0.09, '#76543e');
  v.build(group, '归舟');
  group.position.set(-36, 0.15, 17);
  group.rotation.y = -0.52;
  return group;
}

function createBird() {
  const group = new THREE.Group();
  group.name = '孤鹜';
  const body = new Voxels(9);
  body.box(0, 0, 0, 0.62, 0.26, 0.28, '#48473c');
  body.box(0.36, 0.06, 0, 0.31, 0.2, 0.18, '#c4bc9d');
  body.box(0.56, 0.08, 0, 0.15, 0.07, 0.1, '#bd9253');
  body.box(-0.37, 0, 0, 0.3, 0.1, 0.3, '#393e38');
  body.build(group, '孤鹜');
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(), blocks = new Voxels(7);
    for (let i = 0; i < 5; i++) blocks.box(-i * 0.05, i * 0.07, side * (0.15 + i * 0.2),
      0.43 - i * 0.045, 0.095, 0.25, i > 2 ? '#35443e' : '#9a9e86');
    blocks.build(wing, '羽');
    group.add(wing);
    wings.push(wing);
  }
  return { group, wings };
}

export function createLandscape() {
  const group = new THREE.Group();
  group.name = '一院 · 一江';
  const v = new Voxels(653), rng = random(2026);
  // The water's cut edge makes the bounded, hand-built landscape legible.
  v.box(WATER.x, -1.78, WATER.z, WATER.width, 1.45, WATER.depth, '#56736a', 'ground');
  v.box(WATER.x, -0.79, WATER.z, WATER.width, 0.65, WATER.depth, '#73948a', 'ground');
  v.box(WATER.x, -0.37, WATER.z, WATER.width, 0.19, WATER.depth, '#8ca79a', 'ground');

  const unit = 1.5;
  for (let z = LAND.back; z < LAND.front; z += unit) for (let x = bankAt(z); x < LAND.right; x += unit) {
    const pond = pondDistance(x + unit / 2, z + unit / 2);
    if (pond < 1) {
      v.box(x + unit / 2, -0.2, z + unit / 2, unit, 0.15, unit, '#688e7e', 'ground');
      continue;
    }
    v.box(x + unit / 2, 0.0, z + unit / 2, unit + 0.005, 1.9, unit + 0.005, '#8c957b', 'ground', 0.07);
    v.box(x + unit / 2, 0.99, z + unit / 2, unit - 0.014, 0.11, unit - 0.014, '#929a77', 'ground', 0.085);
    const edge = x === bankAt(z) || z >= LAND.front - unit || x >= LAND.right - unit || z === LAND.back;
    if (edge) {
      v.box(x + unit / 2, 0.16, z + unit / 2, unit + 0.06, 1.55, unit + 0.04, '#a1a28c', 'ground', 0.17);
      v.box(x + unit / 2, 0.96, z + unit / 2, unit + 0.08, 0.2, unit + 0.06, '#c4baa0', 'ground', 0.13);
    }
    if (pond < 1.35) v.box(x + unit / 2, 1.08, z + unit / 2, unit * 0.93, 0.25, unit * 0.93, '#b4b39a', 'ground', 0.13);
  }

  // One coherent paved courtyard; patterned central paving remains deliberately quiet.
  for (let x = -8.9; x < 26.1; x += 1.38) for (let z = 5; z < 27.2; z += 1.38) {
    v.box(x, 1.071, z, 1.345, 0.08, 1.345, '#c6baa0', 'ground', 0.1);
  }
  for (let x = -8.5; x < 26.1; x += 0.78) for (const z of [4.4, 27.8]) v.box(x, 1.095, z, 0.74, 0.12, 0.41, '#9e9c82', 'ground');
  for (let z = 5; z < 27.5; z += 0.8) for (const x of [-9.65, 26.55]) v.box(x, 1.095, z, 0.4, 0.12, 0.76, '#9e9c82', 'ground');
  for (let z = 15.2; z <= 25.2; z += 0.55) for (const x of [0.3, 9.7]) v.box(x, 1.135, z, 0.17, 0.04, 0.51, '#797e6d', 'ground');
  // Central square inlaid with a restrained stepped cloud motif.
  for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
    const border = Math.max(Math.abs(a), Math.abs(b)) === 5;
    const cloud = (Math.abs(a) + Math.abs(b) === 4) || (a === 0 && Math.abs(b) <= 1);
    if (border || cloud) v.box(5 + a * 0.56, 1.14, 21 + b * 0.56, 0.53, 0.035, 0.53, '#9a9c82', 'ground');
  }

  // A river walk follows every step of the embankment, rather than crossing the water.
  let previousWalkX = null;
  for (let z = -43; z < 38; z += 1.15) {
    const x = bankAt(z) + 2.0;
    v.box(x, 1.087, z, 1.6, 0.08, 1.12, '#c8b996', 'ground', 0.08);
    if (previousWalkX !== null && x !== previousWalkX) {
      for (let xx = previousWalkX; xx < x; xx += 1.1) v.box(xx, 1.087, z - 1.15, 1.12, 0.08, 1.6, '#c8b996', 'ground', 0.08);
    }
    previousWalkX = x;
    if (Math.floor(z + 29) % 5 === 0) {
      v.box(x - 0.92, 1.63, z, 0.18, 1.15, 0.18, P.stone);
      v.box(x - 0.92, 2.19, z, 0.29, 0.17, 0.28, P.ivory);
    }
  }
  // Quiet gardens flank the processional axis.
  for (const [x, z, w, d] of [[-5, 17, 5.0, 5.4], [20.5, 15.5, 6, 7]]) {
    v.box(x, 1.11, z, w, 0.2, d, '#748363', 'ground');
    for (const side of [-1, 1]) {
      v.box(x + side * w / 2, 1.18, z, 0.22, 0.3, d, P.stone);
      v.box(x, 1.18, z + side * d / 2, w, 0.3, 0.22, P.stone);
    }
    for (let i = 0; i < 23; i++) v.box(x + (rng() - 0.5) * (w - 0.5), 1.42 + rng() * 0.3,
      z + (rng() - 0.5) * (d - 0.6), 0.62, 0.65, 0.58, i % 3 ? '#748c66' : '#99a071', 'leaves', 0.13);
  }
  tree(v, -5.2, 17.2, 0.83, 'gold', 15);
  tree(v, 21.1, 15.4, 0.95, 'rust', 46);
  tree(v, 30, 34.5, 1.04, 'gold', 75);
  tree(v, 33.9, 5.1, 0.9, 'pine', 20);
  tree(v, -23.2, -27, 1.1, 'pine', 61);
  tree(v, 27.6, -29.2, 1.08, 'pine', 34);
  tree(v, -13.1, 9, 0.69, 'rust', 80);
  for (const x of [-0.65, 10.65]) stoneLamp(v, x, 14.2);
  for (const x of [-7.5, 24.7]) stoneLamp(v, x, 25.5);

  // Low courtyard boundary on the landward edge, with dark green coping.
  for (let z = -43; z < 38; z += 1.25) {
    v.box(50.15, 1.85, z, 0.52, 1.64, 1.22, '#d4c9ab', 'matte', 0.06);
    v.box(50.15, 2.72, z, 0.79, 0.21, 1.24, P.jadeDark, 'roof');
    if (Math.round(z * 4) % 5 === 0) v.box(50.15, 2.04, z, 0.57, 0.7, 0.13, P.redDark);
  }

  // A larger riverside garden wraps the original court, with paths linking each
  // quiet place rather than scattering unrelated objects around the pavilion.
  for (let z = 28.2; z < 39; z += 1.15) v.box(5, 1.085, z, 3.2, 0.09, 1.12, '#c8bda0', 'ground', 0.07);
  for (let x = -9; x < 47; x += 1.15) v.box(x, 1.085, 37.5, 1.12, 0.09, 1.9, '#c8bda0', 'ground', 0.07);
  for (let x = 26.6; x < 32.9; x += 1.0) v.box(x, 1.09, 28, 0.98, 0.1, 2, '#c8bda0', 'ground', 0.08);
  for (let z = -41; z < 15; z += 1.15) v.box(45.8, 1.09, z, 1.9, 0.1, 1.12, '#bcb496', 'ground', 0.08);

  // The pond is an actual opening in the terrain: the same reflective water
  // surface continues below it, so its bridge and foliage also have real reflections.
  for (let i = -10; i <= 10; i++) {
    const xx = 40 + i * 0.75;
    const yy = 1.2 + Math.cos(i / 10 * Math.PI / 2) * 0.67;
    v.box(xx, yy, 28, 0.71, 0.18, 2.15, '#92704e', 'matte', 0.12);
    for (const s of [-1, 1]) {
      v.box(xx, yy + 0.77, 28 + s * 1.03, 0.79, 0.11, 0.13, '#73593e');
      if (i % 2 === 0) v.box(xx, yy + 0.4, 28 + s * 1.03, 0.13, 0.83, 0.15, '#9d7950');
    }
  }
  for (let i = 0; i < 28; i++) {
    const x = 34 + rng() * 12, z = 18 + rng() * 14;
    if (pondDistance(x, z) > 0.83 || Math.abs(z - 28) < 1.6) continue;
    v.box(x, WATER.y + 0.07, z, 0.47 + rng() * 0.3, 0.045, 0.51, '#71885d', 'leaves', 0.12);
    if (i % 4 === 0) {
      v.box(x, 0.26, z, 0.26, 0.1, 0.26, '#d8b3a1', 'matte');
      v.box(x, 0.35, z, 0.14, 0.12, 0.14, '#ead4b9', 'matte');
    }
  }
  willow(v, 47.3, 16.5, 1.07, 31);
  willow(v, -19.4, 16.5, 1.05, 47);
  willow(v, -10, 33.5, 0.95, 39);
  rocks(v, 46.7, 32.4, 1.25, 55);
  rocks(v, 33.3, 19, 0.9, 19);
  rocks(v, -27.4, -34.5, 1.1, 73);
  bench(v, -18.9, 21, true);
  bench(v, 17, 35.5);
  bench(v, 47.3, 9, true);
  stoneLamp(v, 31.2, 29.5);
  stoneLamp(v, 47.9, 29.5);
  stoneLamp(v, 5, 39.2);

  tree(v, 17.5, 32.8, 0.77, 'rust', 213);
  tree(v, 23.7, 39, 0.85, 'gold', 214);
  tree(v, -5.3, -40.5, 0.95, 'rust', 215);
  tree(v, -27.9, -39.5, 1.18, 'pine', 216);
  tree(v, -19.5, -42, 0.88, 'pine', 217);
  tree(v, -30, -29.4, 0.8, 'gold', 218);
  tree(v, 12, -41.4, 1.0, 'gold', 219);
  tree(v, 47.4, -17, 0.87, 'rust', 220);
  tree(v, 39.7, -27.5, 1.1, 'pine', 221);
  // Low terraced ground adds a distant plane behind the court.
  for (let xx = -7; xx <= 7; xx += 1.5) for (let zz = -6; zz <= 6; zz += 1.5) {
    const r = (xx / 7.5) ** 2 + (zz / 6.5) ** 2;
    if (r > 1) continue;
    const h = Math.round((1 - r) * 4) * 0.5 + 0.45;
    v.box(35 + xx, 1.03 + h / 2, -39 + zz, 1.52, h, 1.52, '#78896d', 'ground', 0.1);
    v.box(35 + xx, 1.03 + h, -39 + zz, 1.51, 0.09, 1.51, '#8c9877', 'ground', 0.09);
  }
  tree(v, 34.3, -39, 1.03, 'pine', 227, 3.5);
  tree(v, 38.8, -38, 0.86, 'pine', 228, 2.5);
  tree(v, 32.5, -43, 0.72, 'gold', 229, 2.25);

  // Sparse meadow tufts and low shrubs break up the expanded garden edges.
  for (let i = 0; i < 185; i++) {
    const z = LAND.back + 2 + rng() * (LAND.front - LAND.back - 4);
    const x = bankAt(z) + 4 + rng() * (LAND.right - bankAt(z) - 7);
    const peripheral = z < -30 || z > 31 || x > 43 || x < bankAt(z) + 6;
    if (!peripheral || pondDistance(x, z) < 1.45 || Math.abs(z - 37.5) < 1.7 || Math.abs(x - 45.8) < 1.9 || (Math.abs(x - 5) < 2 && z > 26)) continue;
    const s = 0.3 + rng() * 0.5;
    v.box(x, 1.05 + s / 2, z, s * 1.2, s, s, i % 3 === 0 ? '#a3a274' : '#778965', 'leaves', 0.14);
    if (i % 7 === 0) v.box(x + 0.1, 1.12 + s, z, 0.22, 0.14, 0.23, '#d2bc84');
  }

  // Embankment rocks and reeds form a sparse transition into the actual river.
  for (let i = 0; i < 116; i++) {
    const z = LAND.back + 2 + rng() * (LAND.front - LAND.back - 4), x = bankAt(z) - 0.4 - rng() * 1.15;
    const sz = 0.3 + rng() * 0.8;
    v.box(x, 0.12 + sz * 0.1, z, sz, 0.27 + rng() * 0.6, sz * 0.72, i % 3 ? '#879082' : '#b5ac90', 'matte', 0.2);
    if (i % 4 === 0) for (let k = 0; k < 4; k++) {
      const h = 0.65 + rng() * 0.7;
      v.box(x + (rng() - 0.5) * 0.7, 0.24 + h / 2, z + (rng() - 0.5) * 0.7,
        0.09, h, 0.09, '#899466', 'leaves');
    }
  }
  // A distant low shoal provides the far plane without enlarging the garden.
  for (let z = -44; z < -24; z += 0.7) for (let x = -61.5; x < -50.5; x += 0.7) {
    if (((x + 56) / 5.5) ** 2 + ((z + 34) / 10) ** 2 < 1) {
      v.box(x, 0.16, z, 0.72, 0.22, 0.72, '#9fa384', 'ground', 0.08);
      if (rng() > 0.74) v.box(x, 0.53, z, 0.13, 0.59 + rng() * 0.3, 0.12, '#788b70', 'leaves');
    }
  }
  for (let z = -18; z < -10; z += 0.7) for (let x = -65; x < -59; x += 0.7) {
    if (((x + 62) / 3) ** 2 + ((z + 14) / 4) ** 2 < 1) {
      v.box(x, 0.14, z, 0.72, 0.2, 0.72, '#a9ab87', 'ground', 0.08);
      if (rng() > 0.6) v.box(x, 0.44, z, 0.1, 0.6, 0.12, '#949967', 'leaves');
    }
  }
  // Short timber landing at the edge of the river walk.
  const dockStart = bankAt(11.8) + 0.25;
  for (let i = 0; i < 23; i++) v.box(dockStart - i * 0.32, 0.97, 11.8, 0.29, 0.19, 2.25, '#92754e', 'matte', 0.15);
  for (const x of [dockStart - 0.65, dockStart - 6.9]) for (const z of [10.85, 12.75]) v.box(x, 0.68, z, 0.22, 1.8, 0.24, '#6d5b40');

  person(v, 11.5, 23.8, '#597c81');
  person(v, 12.2, 23.5, '#ac7151', 0.86);
  person(v, -9.3, -0.7, '#c2a675');
  person(v, -29.8, -22, '#8397a0');
  person(v, 18.8, 37.4, '#b38c66', 0.88);
  v.build(group, '江岸与庭院');
  const boat = createBoat(), bird = createBird();
  group.add(boat, bird.group);
  return {
    group, voxels: v,
    update(t) {
      boat.position.y = 0.19 + Math.sin(t * 0.65) * 0.055;
      boat.rotation.z = Math.sin(t * 0.72) * 0.012;
      boat.position.z = 17 + Math.sin(t * 0.027) * 2.3;
      const a = t * 0.075;
      bird.group.position.set(-29 + Math.sin(a) * 10, 18.6 + Math.sin(a * 1.7) * 1.1, -3 + Math.cos(a) * 11);
      bird.group.rotation.y = a;
      const flap = Math.sin(t * 4.3) * 0.27 + 0.18;
      bird.wings[0].rotation.x = -flap;
      bird.wings[1].rotation.x = flap;
    },
  };
}
