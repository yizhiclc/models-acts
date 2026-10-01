import * as THREE from 'three';
import { Voxels, palette as P, plaque } from './voxels.js';

const ORIGIN = { x: 5, z: -10 };

/** Curved, discretised hip roofs. The top roof has raised gables (歇山). */
function roof(v, cx, cz, y, width, depth, rise, { top = false, axis = false, opening = null } = {}) {
  const unit = 0.34;
  const nx = Math.ceil(width / unit), nz = Math.ceil(depth / unit);
  const dx = width / nx, dz = depth / nz;
  const halfW = width / 2, halfD = depth / 2;
  const ridge = halfW * (top ? 0.64 : 0.49);
  const point = (x, yy, z) => axis ? [cx + z, yy, cz + x] : [cx + x, yy, cz + z];
  const box = (x, yy, z, w, h, d, c, type = 'roof', variation = 0) => {
    const p = point(x, yy, z);
    v.box(...p, axis ? d : w, h, axis ? w : d, c, type, variation);
  };
  const height = (x, z) => {
    const zz = Math.abs(z) / halfD;
    const xx = Math.max(0, (Math.abs(x) - ridge) / (halfW - ridge));
    let t = Math.min(1, Math.max(zz, xx));
    // The broad concave slope and independently lifted corners are quantised in Y.
    let h = y + rise * Math.pow(1 - t, 1.48);
    if (top && Math.abs(x) > ridge + 0.18) {
      const hip = (Math.abs(x) - ridge - 0.18) / (halfW - ridge - 0.18);
      h = Math.min(h, y + rise * 0.43 * Math.pow(1 - Math.min(hip, 1), 1.4));
    }
    h += 0.88 * Math.pow(Math.abs(x) / halfW, 7) * Math.pow(zz, 6);
    h += 0.12 * Math.pow(t, 10);
    return Math.round(h / 0.11) * 0.11;
  };

  for (let ix = 0; ix < nx; ix++) {
    const x = -halfW + dx * (ix + 0.5);
    for (let iz = 0; iz < nz; iz++) {
      const z = -halfD + dz * (iz + 0.5);
      if (opening && Math.abs(x) < opening[0] / 2 && Math.abs(z) < opening[1] / 2) continue;
      const h = height(x, z);
      const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
      const shade = (ix + (iz % 3)) % 4 === 0 ? P.jadeLight : P.jade;
      box(x, h, z, dx * 1.015, top ? 0.42 : 0.3, dz * 1.015, edge ? P.jadeDark : shade, 'roof', 0.11);
      if (edge) {
        box(x, h - 0.25, z, dx * 1.01, 0.14, dz * 1.01, P.gold, 'gold');
        box(x, h - 0.38, z, dx * 1.01, 0.12, dz * 1.01, P.redDark);
      }
    }
  }

  // Ridge tiles, gilded end ornaments, and four diagonal hip ridges.
  for (let x = -ridge; !opening && x <= ridge; x += 0.28) {
    box(x, y + rise + 0.23, 0, 0.3, 0.32, 0.39, P.jadeDark);
    box(x, y + rise + 0.43, 0, 0.3, 0.12, 0.25, P.gold, 'gold');
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let t = 0; t <= 1; t += 0.025) {
        if (top && t < 0.36) continue;
        const x = sx * (ridge + (halfW - ridge) * t);
        const z = sz * halfD * t;
        if (opening && Math.abs(x) < opening[0] / 2 && Math.abs(z) < opening[1] / 2) continue;
        box(x, height(x, z) + 0.18, z, 0.27, 0.24, 0.27, P.jadeLight);
      }
      const end = point(sx * (halfW + 0.04), y + 1.03, sz * (halfD + 0.06));
      v.box(...end, 0.24, 0.5, 0.24, P.gold, 'gold');
      v.cube(end[0] + (axis ? sz : sx) * 0.12, end[1] + 0.34, end[2] + (axis ? sx : sz) * 0.12, 0.24, P.gold, 'gold', 0);
      // A row of small stepped roof beasts, a silhouette detail rather than spheres.
      if (top) for (let i = 0; i < 4; i++) {
        const t = 0.81 - i * 0.07;
        const x = sx * (ridge + (halfW - ridge) * t), z = sz * halfD * t;
        const h = height(x, z);
        box(x, h + 0.39, z, 0.21, 0.35, 0.25, P.gold, 'gold');
        box(x, h + 0.6, z, 0.19, 0.17, 0.2, P.goldLight, 'gold');
      }
    }
    for (let k = 0; !opening && k < 5; k++) {
      box(sx * (ridge + 0.15 + k * 0.095), y + rise + 0.43 + k * 0.17, 0,
        0.29, 0.24, 0.31 - k * 0.025, k === 4 ? P.gold : P.jadeDark);
    }
  }

  if (top) {
    // Exposed gables sit above the lower hipped skirt of the crown roof.
    for (const sx of [-1, 1]) {
      for (let z = -halfD * 0.51; z <= halfD * 0.51; z += 0.26) {
        const base = y + rise * 0.42;
        const topY = height(0, z);
        const h = topY - base;
        if (h > 0.1) {
          box(sx * (ridge + 0.18), base + h / 2, z, 0.19, h, 0.27, P.redDark);
          box(sx * (ridge + 0.3), topY - 0.04, z, 0.22, 0.15, 0.29, P.ivory);
          if (Math.round(z / 0.26) % 2 === 0) box(sx * (ridge + 0.3), base + h / 2, z, 0.1, h * 0.85, 0.055, P.gold);
        }
      }
    }
  }
}

function balustrade(v, x, z, y, width, depth, stone = false, entry = 0) {
  const c = stone ? P.ivory : P.redLight;
  const detail = stone ? P.stone : P.gold;
  const height = stone ? 0.94 : 0.85;
  for (const side of [-1, 1]) {
    for (let a = -width / 2; a <= width / 2 + 0.05; a += stone ? 1.22 : 0.84) {
      if (side === 1 && Math.abs(a) < entry) continue;
      v.box(x + a, y + height / 2, z + side * depth / 2, 0.17, height, 0.18, c);
      v.box(x + a, y + height + 0.06, z + side * depth / 2, 0.26, 0.16, 0.26, detail);
      if (stone) v.box(x + a, y + 0.4, z + side * depth / 2, 0.24, 0.24, 0.24, c);
    }
    const parts = side === 1 && entry ? [[-width / 2, -entry], [entry, width / 2]] : [[-width / 2, width / 2]];
    for (const [a, b] of parts) for (const h of [0.25, 0.75]) {
      v.box(x + (a + b) / 2, y + h, z + side * depth / 2, b - a, 0.1, 0.13, c);
    }
    for (let a = -depth / 2; a <= depth / 2; a += stone ? 1.2 : 0.8) {
      v.box(x + side * width / 2, y + height / 2, z + a, 0.18, height, 0.17, c);
      v.box(x + side * width / 2, y + height + 0.06, z + a, 0.25, 0.16, 0.25, detail);
    }
    for (const h of [0.25, 0.75]) v.box(x + side * width / 2, y + h, z, 0.13, 0.1, depth, c);
  }
}

function masonry(v, x, z, y, w, d, h) {
  v.box(x, y + h / 2, z, w - 0.06, h, d - 0.06, P.stoneDark);
  const bh = 0.46, bw = 1.13;
  for (let yy = 0; yy < h - 0.1; yy += bh) {
    const layer = Math.round(yy / bh);
    for (let xx = -w / 2; xx < w / 2; xx += bw) {
      const width = Math.min(bw, w / 2 - xx);
      for (const s of [-1, 1]) v.box(x + xx + width / 2, y + yy + Math.min(bh, h - yy) / 2,
        z + s * d / 2, width - 0.025, Math.min(bh, h - yy) - 0.025, 0.1,
        (layer % 3 === 1 && Math.floor(xx) % 4 === 0) ? P.ivory : P.stone, 'matte', 0.15);
    }
    for (let zz = -d / 2; zz < d / 2; zz += bw) {
      const depth = Math.min(bw, d / 2 - zz);
      for (const s of [-1, 1]) v.box(x + s * w / 2, y + yy + Math.min(bh, h - yy) / 2,
        z + zz + depth / 2, 0.1, Math.min(bh, h - yy) - 0.025, depth - 0.025, P.stone, 'matte', 0.15);
    }
  }
  v.box(x, y + h - 0.1, z, w + 0.38, 0.24, d + 0.38, P.ivory);
  v.box(x, y + 0.18, z, w + 0.3, 0.27, d + 0.3, P.stone);
}

function bracket(v, x, y, z, outwardX, outwardZ) {
  // Four stacked corbels per column, with contrasting painted transverse arms.
  for (let k = 0; k < 3; k++) {
    const out = 0.16 + k * 0.2;
    v.box(x + outwardX * out, y + k * 0.18, z + outwardZ * out,
      outwardX ? 0.56 : 0.34 + k * 0.18, 0.14,
      outwardZ ? 0.56 : 0.34 + k * 0.18, k === 1 ? P.jadeLight : P.gold);
  }
  v.box(x + outwardX * 0.64, y + 0.46, z + outwardZ * 0.64,
    outwardX ? 0.34 : 1.12, 0.14, outwardZ ? 0.34 : 1.12, P.redDark);
}

function hall(v, { x, z, floor, w, d, h, major = true, frontDoor = false }) {
  const inset = major ? 1.35 : 0.95;
  const coreW = w - inset * 2, coreD = d - inset * 2;
  v.box(x, floor + 0.12, z, w + 0.75, 0.3, d + 0.75, P.redDark);
  v.box(x, floor + 0.29, z, w + 0.7, 0.07, d + 0.7, P.gold);
  v.box(x, floor + h / 2, z, coreW, h, coreD, P.redDark);

  const facade = (length, side, alongX) => {
    const bays = major ? (alongX ? 7 : 5) : (alongX ? 7 : 5);
    const step = length / bays;
    const coreSide = alongX ? coreD / 2 : coreW / 2;
    const place = (a, yy, out, ww, hh, dd, color, type = 'matte') => {
      if (alongX) v.box(x + a, yy, z + side * out, ww, hh, dd, color, type);
      else v.box(x + side * out, yy, z + a, dd, hh, ww, color, type);
    };
    for (let i = 0; i < bays; i++) {
      const a = -length / 2 + step * (i + 0.5);
      const isDoor = frontDoor && alongX && side === 1 && Math.abs(a) < step * 1.3;
      const panelH = h * (isDoor ? 0.84 : 0.67);
      const yy = floor + h * (isDoor ? 0.46 : 0.54);
      place(a, yy, coreSide + 0.03, step - 0.23, panelH, 0.13, '#2c4140');
      // Amber paper behind an explicit fine wooden lattice.
      place(a, yy, coreSide + 0.11, step - 0.45, panelH - 0.16, 0.06,
        major ? '#bd8e58' : '#957149', major ? 'glow' : 'matte');
      for (let j = -2; j <= 2; j++) {
        place(a + j * (step - 0.42) / 5, yy, coreSide + 0.17, 0.055, panelH, 0.08, P.redDark);
      }
      for (let j = 0; j < (major ? 4 : 2); j++) {
        place(a, yy - panelH / 2 + 0.13 + j * (panelH - 0.26) / (major ? 3 : 1), coreSide + 0.18,
          step - 0.27, 0.065, 0.08, P.gold);
      }
      if (major) {
        place(a, floor + 0.46, coreSide + 0.14, step - 0.3, 0.57, 0.12, P.vermilion);
        place(a, floor + h - 0.28, coreSide + 0.13, step - 0.25, 0.27, 0.1, P.jade);
        place(a, floor + h - 0.28, coreSide + 0.2, 0.28, 0.16, 0.07, P.gold);
      }
    }
  };
  for (const side of [-1, 1]) {
    facade(coreW, side, true);
    facade(coreD, side, false);
  }

  for (const side of [-1, 1]) {
    const numX = 8, numZ = 6;
    for (let i = 0; i < numX; i++) {
      const xx = x - w / 2 + w * i / (numX - 1);
      v.box(xx, floor + h / 2, z + side * d / 2, major ? 0.36 : 0.27, h, major ? 0.36 : 0.27, P.vermilion);
      v.box(xx, floor + 0.3, z + side * d / 2, 0.5, 0.28, 0.5, P.stone);
      bracket(v, xx, floor + h - 0.6, z + side * d / 2, 0, side);
    }
    for (let i = 1; i < numZ - 1; i++) {
      const zz = z - d / 2 + d * i / (numZ - 1);
      v.box(x + side * w / 2, floor + h / 2, zz, major ? 0.36 : 0.27, h, major ? 0.36 : 0.27, P.vermilion);
      v.box(x + side * w / 2, floor + 0.3, zz, 0.5, 0.28, 0.5, P.stone);
      bracket(v, x + side * w / 2, floor + h - 0.6, zz, side, 0);
    }
    v.box(x, floor + h - 0.28, z + side * d / 2, w + 0.55, 0.34, 0.28, P.jadeDark);
    v.box(x, floor + h - 0.12, z + side * d / 2 + side * 0.16, w + 0.55, 0.065, 0.06, P.gold);
    v.box(x + side * w / 2, floor + h - 0.28, z, 0.28, 0.34, d + 0.55, P.jadeDark);
  }
  balustrade(v, x, z, floor + 0.28, w + 0.7, d + 0.7, false, frontDoor ? 3.4 : 0);
}

function lantern(v, x, y, z) {
  v.box(x, y + 0.35, z, 0.08, 0.55, 0.08, P.gold);
  v.box(x, y, z, 0.45, 0.63, 0.45, '#ebae65', 'glow');
  v.box(x, y + 0.33, z, 0.53, 0.12, 0.53, P.redDark);
  v.box(x, y - 0.32, z, 0.5, 0.12, 0.5, P.redDark);
  v.box(x, y - 0.57, z, 0.07, 0.38, 0.07, P.gold);
}

function wing(v, group, x, z, name) {
  masonry(v, x, z, 0.85, 11.5, 11, 2.5);
  balustrade(v, x, z, 3.43, 11.5, 10.8, true, 1.5);
  hall(v, { x, z, floor: 3.5, w: 7.2, d: 6.7, h: 3.25, frontDoor: true });
  roof(v, x, z, 6.75, 11.4, 10.5, 1.62);
  hall(v, { x, z, floor: 8.08, w: 6.1, d: 5.8, h: 1.25, major: false });
  roof(v, x, z, 9.32, 9.7, 8.9, 2.1, { top: true });
  plaque(group, name, [x, 6.13, z + 3.62], 2.45, 0.71);
}

export function createArchitecture() {
  const group = new THREE.Group();
  group.name = '滕王阁 · 三明七檐、重台两翼';
  const v = new Voxels(1989);
  const { x, z } = ORIGIN;

  masonry(v, x, z, 0.85, 43, 27, 1.48);
  masonry(v, x, z, 2.35, 35.5, 23.5, 4.1);
  v.box(x, 6.58, z, 36.25, 0.28, 24.1, P.ivory);
  balustrade(v, x, z, 6.77, 35.6, 23.5, true, 4.55);
  balustrade(v, x, z, 2.42, 43, 27.1, true, 5.1);

  // A single grand stair links the courtyard, city-wall-like platform and front hall.
  const steps = 27, front = z + 11.9, length = 11.6;
  for (let i = 0; i < steps; i++) {
    const top = 6.76 - (6.76 - 1.05) * (i + 1) / steps;
    const zz = front + (i + 0.5) * length / steps;
    v.box(x, (top + 0.89) / 2, zz, 8.8, top - 0.89, length / steps + 0.005, P.stone, 'matte', 0.07);
    v.box(x, top + 0.035, zz, 8.84, 0.07, length / steps - 0.015, P.ivory);
    for (const side of [-1, 1]) {
      v.box(x + side * 4.59, top + 0.24, zz, 0.44, 0.5, length / steps + 0.03, P.stone);
      v.box(x + side * 4.59, top + 0.86, zz, 0.26, 0.16, length / steps + 0.03, P.ivory);
      if (i % 3 === 0) {
        v.box(x + side * 4.59, top + 0.56, zz, 0.23, 0.8, 0.25, P.ivory);
        v.box(x + side * 4.59, top + 1.01, zz, 0.37, 0.22, 0.37, P.ivory);
      }
    }
  }
  // Recessed bronze doors on the tall platform, flanking the staircase.
  for (const side of [-1, 1]) {
    const xx = x + side * 11.8;
    v.box(xx, 3.72, z + 11.87, 1.9, 2.68, 0.13, P.ink);
    v.box(xx, 5.13, z + 11.96, 2.24, 0.32, 0.26, P.ivory);
    for (const s of [-1, 1]) v.box(xx + s * 1.06, 3.73, z + 11.93, 0.23, 2.74, 0.2, P.ivory);
  }

  // A continuous inner core supports ring-shaped intermediate eaves. Full hip roofs
  // here would intersect the next storey and hide its columns from an elevated view.
  v.box(x, 19.1, z, 13.7, 24.2, 8.0, P.redDark);
  const stories = [
    { floor: 7.02, w: 18.6, d: 12.3, h: 4.18 },
    { floor: 15.55, w: 17.9, d: 11.7, h: 4.08 },
    { floor: 23.88, w: 17.2, d: 11.1, h: 4.1 },
  ];
  stories.forEach((s, i) => hall(v, { x, z, ...s, frontDoor: i === 0 }));
  const mezzanines = [
    { floor: 12.73, w: 17.9, d: 11.7, h: 1.64 },
    { floor: 21.06, w: 17.2, d: 11.1, h: 1.71 },
    { floor: 29.34, w: 16.5, d: 10.5, h: 1.87 },
  ];
  mezzanines.forEach(s => hall(v, { x, z, ...s, major: false }));
  [
    [11.2, 24.2, 16.9, 1.66], [14.38, 23.5, 16.3, 1.43],
    [19.64, 23.0, 15.9, 1.56], [22.78, 22.5, 15.5, 1.39],
    [27.99, 22.0, 15.1, 1.5], [31.24, 23.3, 16.7, 3.05],
  ].forEach(([yy, w, d, h], i) => roof(v, x, z, yy, w, d, h, {
    top: i === 5,
    opening: i < 5 ? [i < 2 ? 16.3 : i < 4 ? 15.6 : 15.0, i < 2 ? 9.9 : i < 4 ? 9.4 : 8.9] : null,
  }));

  // Projecting entrance (抱厦): the seventh visible roof, with its own raised gable.
  const porchZ = z + 7.95;
  v.box(x, 7.06, porchZ, 9.4, 0.35, 5.65, P.redDark);
  for (const xx of [-3.9, -1.3, 1.3, 3.9]) {
    v.box(x + xx, 8.69, porchZ + 2.15, 0.43, 3.15, 0.43, P.vermilion);
    v.box(x + xx, 7.25, porchZ + 2.15, 0.61, 0.28, 0.61, P.ivory);
    bracket(v, x + xx, 9.9, porchZ + 2.15, 0, 1);
  }
  v.box(x, 10.07, porchZ + 2.15, 9.2, 0.43, 0.38, P.jadeDark);
  roof(v, x, porchZ, 10.54, 8, 11.1, 2.35, { top: true, axis: true });
  // Stair-step gable face and white verge on the entrance facing the courtyard.
  for (let i = -11; i <= 11; i++) {
    const xx = i * 0.3, hh = 1.66 * (1 - Math.abs(i) / 12);
    v.box(x + xx, 10.86 + hh / 2, porchZ + 3.73, 0.31, hh, 0.17, P.vermilion);
    v.box(x + xx, 10.89 + hh, porchZ + 3.84, 0.34, 0.18, 0.21, P.ivory);
  }
  plaque(group, '滕王閣', [x, 29.79, z + 6.08], 5.4, 1.24);
  plaque(group, '西江第一樓', [x, 26.25, z + 5.83], 4.4, 0.91);
  plaque(group, '瑰偉絕特', [x, 9.58, porchZ + 2.42], 3.55, 0.89);

  for (const sx of [-1, 1]) {
    // Two open covered galleries join the podium to the lower lateral pavilions.
    const corridorX = x + sx * 17.3;
    v.box(corridorX, 4.0, z, 12.4, 0.34, 4.45, P.stone);
    for (let k = -4; k <= 4; k++) for (const side of [-1, 1]) {
      const xx = corridorX + k * 1.36;
      v.box(xx, 5.4, z + side * 1.71, 0.24, 2.9, 0.24, P.vermilion);
      bracket(v, xx, 6.35, z + side * 1.71, 0, side);
    }
    balustrade(v, corridorX, z, 4.18, 12.3, 3.75, false);
    roof(v, corridorX, z, 6.83, 14.3, 5.8, 1.37);
    wing(v, group, x + sx * 24, z, sx === -1 ? '壓江' : '挹翠');
  }
  for (const yy of [10.2, 18.4, 26.4]) for (const xx of [-6.5, 6.5]) lantern(v, x + xx, yy, z + 6.38);

  v.build(group, '滕王阁');
  return { group, voxels: v, origin: ORIGIN };
}
