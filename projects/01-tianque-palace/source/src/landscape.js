import * as THREE from 'three';

// A continuous landscape surrounds the engineered moat. All planting and roads
// sample the same height field so trunks, stones and paths sit on the terrain.
const G = 2.5, STEP = 24, MIN_X = -2208, MIN_Z = -2304, NX = 184, NZ = 180;
const smooth = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(0, 1, x - ix), fz = smooth(0, 1, z - iz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), fx), THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz);
}
const peaks = [
  [-1180, -1180, 330, 440, 470], [-850, -775, 180, 380, 360], [-550, -1010, 310, 300, 400],
  [-170, -1370, 460, 390, 440], [230, -1270, 395, 330, 440], [625, -1020, 330, 380, 360],
  [1060, -1250, 470, 430, 430], [1430, -720, 270, 450, 380], [-1070, 50, 145, 470, 600],
  [-1280, 790, 110, 420, 500], [1260, 320, 180, 410, 500], [1590, 1180, 130, 470, 440],
];
const riverX = z => 580 + Math.sin(z * 0.0034) * 96 + Math.sin(z * 0.0068 + 0.4) * 33;
const riverWidth = z => 39 + 13 * Math.sin(z * 0.004 + 1.4) + 7 * Math.sin(z * 0.009);

export function buildLandscape(scene, { add, waterMaterial }) {
  let landscapeSeed = 86371;
  const rand = () => { landscapeSeed = (landscapeSeed * 1664525 + 1013904223) >>> 0; return landscapeSeed / 4294967296; };
  const choose = values => values[Math.floor(rand() * values.length)];
  const paths = [], waterCourses = [];
  const curve = points => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.25);
  const feeder = curve([[328, 322], [382, 322], [448, 338], [530, 372], [riverX(392), 392]]).getPoints(75);
  const distance = (x, z, points) => {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
    return best;
  };
  const waterDistance = (x, z) => Math.min(Math.abs(x - riverX(z)) - riverWidth(z), distance(x, z, feeder) - 8);
  function rawHeight(x, z) {
    const edge = Math.max(Math.abs(x) - 343, Math.abs(z) - 433);
    if (edge <= 3) return G;
    let ridge = 0, sum = 0;
    const warpX = (noise(x * 0.0032 + 17, z * 0.0032) - 0.5) * 120;
    const warpZ = (noise(x * 0.0034, z * 0.0034 + 29) - 0.5) * 110;
    for (const [px, pz, height, rx, rz] of peaks) {
      const value = height * Math.exp(-1.8 * (((x + warpX - px) / rx) ** 2 + ((z + warpZ - pz) / rz) ** 2));
      ridge = Math.max(ridge, value); sum += value;
    }
    const texture = (noise(x * 0.012, z * 0.012) - 0.5) * 18 + (noise(x * 0.038, z * 0.038) - 0.5) * 5;
    const ridges = (noise(x * 0.008, z * 0.014 + 8) - 0.5) * ridge * 0.13;
    let y = G + smooth(8, 190, edge) * (ridge + sum * 0.17 + ridges + texture * (0.18 + ridge * 0.004));
    // Quiet, level glades support the six existing roadside pavilions.
    for (const pz of [270, 30, -207]) {
      const pad = Math.hypot((Math.abs(x) - 413) * 1.1, z - pz);
      y = THREE.MathUtils.lerp(G, y, smooth(42, 82, pad));
    }
    const wet = waterDistance(x, z);
    y = THREE.MathUtils.lerp(0.05, y, smooth(-3, 38 + ridge * 0.18, wet));
    return Math.round(y * 4) / 4;
  }
  const heights = new Float32Array((NX + 1) * (NZ + 1));
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) heights[iz * (NX + 1) + ix] = rawHeight(MIN_X + ix * STEP, MIN_Z + iz * STEP);
  function heightAt(x, z) {
    const gx = (x - MIN_X) / STEP, gz = (z - MIN_Z) / STEP;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return rawHeight(x, z);
    const a = heights[iz * (NX + 1) + ix], b = heights[iz * (NX + 1) + ix + 1];
    const c = heights[(iz + 1) * (NX + 1) + ix], d = heights[(iz + 1) * (NX + 1) + ix + 1];
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }
  const positions = [], colors = [], tint = new THREE.Color();
  const grass = new THREE.Color(0x637452), forest = new THREE.Color(0x3e5746), rock = new THREE.Color(0x7f8470), bank = new THREE.Color(0x9c9775);
  function triangle(a, b, c, color) { for (const point of [a, b, c]) { positions.push(...point); colors.push(color.r, color.g, color.b); } }
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x = MIN_X + ix * STEP, z = MIN_Z + iz * STEP;
    if (x >= -336 && x + STEP <= 336 && z >= -432 && z + STEP <= 432) continue;
    const a = [x, heights[iz * (NX + 1) + ix], z], b = [x + STEP, heights[iz * (NX + 1) + ix + 1], z];
    const c = [x, heights[(iz + 1) * (NX + 1) + ix], z + STEP], d = [x + STEP, heights[(iz + 1) * (NX + 1) + ix + 1], z + STEP];
    const elevation = (a[1] + b[1] + c[1] + d[1]) / 4, slope = (Math.abs(a[1] - b[1]) + Math.abs(a[1] - c[1])) / STEP;
    tint.copy(grass).lerp(forest, smooth(16, 155, elevation)).lerp(rock, smooth(0.65, 1.3, slope) * smooth(90, 220, elevation));
    const wet = waterDistance(x + STEP / 2, z + STEP / 2);
    tint.lerp(bank, 1 - smooth(5, 25, wet)).multiplyScalar(0.94 + noise(x * 0.009, z * 0.009) * 0.12);
    triangle(a, c, b, tint); triangle(b, c, d, tint);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, flatShading: true }));
  terrain.name = 'continuous-landscape'; terrain.receiveShadow = true; scene.add(terrain);

  function ribbon(points, widthAt, material, elevation, colored = false) {
    const p = [], col = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], tangent = b.clone().sub(a).normalize();
      const cross = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const corners = [a.clone().addScaledVector(cross, -widthAt(i)), a.clone().addScaledVector(cross, widthAt(i)), b.clone().addScaledVector(cross, -widthAt(i + 1)), b.clone().addScaledVector(cross, widthAt(i + 1))];
      corners.forEach(v => { v.y = elevation(v.x, v.z); });
      const shade = 0.94 + noise(a.x * 0.045, a.z * 0.045) * 0.12;
      for (const index of [0, 1, 2, 2, 1, 3]) { p.push(...corners[index].toArray()); if (colored) col.push(shade, shade * 0.985, shade * 0.95); }
    }
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    if (colored) geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, material); mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  // The winding river has a real recessed bed, sandy banks and a moat inlet.
  const riverMaterial = waterMaterial.clone(); riverMaterial.color.setHex(0x497b6d);
  riverMaterial.onBeforeCompile = waterMaterial.onBeforeCompile;
  const river = Array.from({ length: 376 }, (_, i) => { const z = -2304 + i * 11.52; return new THREE.Vector3(riverX(z), 0, z); });
  ribbon(river, i => riverWidth(river[i].z) + 6, riverMaterial, () => 1.45);
  ribbon(feeder, () => 9, riverMaterial, () => 1.45); waterCourses.push(river, feeder);
  function path(points, width, paved = false) {
    const samples = curve(points).getPoints(Math.max(40, points.length * 15));
    const material = new THREE.MeshStandardMaterial({ color: paved ? 0xb4ad8d : 0x96937c, roughness: 1, vertexColors: true });
    ribbon(samples, () => width * 0.61, new THREE.MeshStandardMaterial({ color: 0x81886b, roughness: 1 }), (x, z) => heightAt(x, z) + 0.12);
    ribbon(samples, () => width / 2, material, (x, z) => heightAt(x, z) + 0.21, true);
    paths.push({ samples, width });
  }
  path([[0, 459], [0, 570], [-12, 710], [-65, 900], [-165, 1160], [-265, 1540], [-410, 1970]], 32, true);
  for (const s of [-1, 1]) {
    path([[s * 83, 459], [s * 220, 454], [s * 341, 453], [s * 370, 388], [s * 382, 322], [s * 388, 270], [s * 374, 150], [s * 392, 30], [s * 370, -90], [s * 391, -207], [s * 368, -350], [s * 250, -452], [0, -455]], 7);
    for (const pz of [270, 30, -207]) path([[s * 388, pz], [s * 399, pz + 3], [s * 413, pz]], 5);
  }
  // Timber footbridge takes the eastern promenade over the natural inlet.
  for (let i = -6; i <= 6; i++) {
    const y = 3.3 + (1 - Math.abs(i) / 6) * 0.7;
    add(0x8d7651, 382, y, 322 + i * 1.8, 8, 0.4, 1.86);
    for (const s of [-1, 1]) {
      add(0x5f5038, 382 + s * 3.7, y + 1.4, 322 + i * 1.8, 0.4, 2.5, 0.4);
      add(0xa18b5c, 382 + s * 3.7, y + 2.2, 322 + i * 1.8, 0.45, 0.4, 2.1);
    }
  }
  const pathDistance = (x, z) => Math.min(...paths.map(p => distance(x, z, p.samples) - p.width / 2));
  function available(x, z, margin = 0) {
    return !(Math.abs(x) < 351 && Math.abs(z) < 440) && waterDistance(x, z) > 16 + margin
      && pathDistance(x, z) > 4 + margin && ![270, 30, -207].some(pz => Math.abs(Math.abs(x) - 413) < 26 + margin && Math.abs(z - pz) < 34 + margin);
  }
  const roots = [], bins = new Map();
  function dress(tree) {
    let outsideTrees = 0, wildFlowers = 0;
    for (let i = 0; i < 5300; i++) {
      const x = -1430 + rand() * 2860, z = -1570 + rand() * 3190, y = heightAt(x, z);
      const cluster = noise(x * 0.009 + 31, z * 0.009) + 0.2 * noise(x * 0.027, z * 0.027);
      if (cluster < 0.51 || y > 310 || !available(x, z, 7)) continue;
      // Open meadows frame the south gate instead of a rectangular tree grid.
      if (z > 445 && z < 620 && Math.abs(x) < 325 && rand() < 0.82) continue;
      const scale = 0.85 + rand() * 1.35, spacing = 11 + scale * 3, bx = Math.floor(x / 24), bz = Math.floor(z / 24);
      let crowded = false;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const p of bins.get(`${bx + dx},${bz + dz}`) || []) if (Math.hypot(p.x - x, p.z - z) < spacing) crowded = true;
      if (crowded) continue;
      const p = { x, z, y }; roots.push(p); const key = `${bx},${bz}`;
      if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p);
      tree(x, z, scale, y > 24 || rand() < 0.45, y < 30 && rand() < 0.19, y); outsideTrees++;
    }
    for (let i = 0; i < 1580; i++) {
      const x = -840 + rand() * 1740, z = -730 + rand() * 1900;
      if (!available(x, z, 1) || heightAt(x, z) > 115) continue;
      const y = heightAt(x, z), color = choose([0x637348, 0x77844d, 0x8a9158, 0x4e6a43]);
      for (let j = 0; j < 4; j++) add(color, x + (rand() - 0.5) * 4, y + 0.4 + rand() * 0.25, z + (rand() - 0.5) * 4, 0.22 + rand() * 0.3, 0.9 + rand() * 0.6, 0.3);
      if (i % 2 === 0) for (let j = 0; j < 8; j++) {
        const px = x + (rand() - 0.5) * 7, pz = z + (rand() - 0.5) * 7, floor = heightAt(px, pz);
        add(0x5e7744, px, floor + 0.55, pz, 0.13, 1.05, 0.13);
        add(choose([0xccbd82, 0xdfce98, 0xad8e75, 0xc19796]), px, floor + 1.12, pz, 0.65, 0.32, 0.65); wildFlowers++;
      }
    }
    for (let i = 0; i < 290; i++) {
      const z = -1260 + rand() * 2540, edge = riverWidth(z) + 12 + rand() * 13, x = riverX(z) + (rand() < 0.5 ? -edge : edge), y = heightAt(x, z);
      if (y < 1.4 || pathDistance(x, z) < 4) continue;
      for (let j = 0; j < 5; j++) { const h = 1.3 + rand() * 1.7; add(choose([0x788352, 0x898953, 0x5b764d]), x + (rand() - 0.5) * 2, y + h / 2, z + (rand() - 0.5) * 2, 0.2, h, 0.2); }
    }
    for (let i = 0; i < 145; i++) {
      const x = -970 + rand() * 1960, z = -960 + rand() * 2000;
      if (!available(x, z, 0) || heightAt(x, z) > 190) continue;
      const size = 2 + rand() * 5, y = heightAt(x, z);
      for (let j = 0; j < 3; j++) add(choose([0x858b7a, 0x6b7968, 0x969782]), x + (rand() - 0.5) * size, y + size * (0.14 + j * 0.13), z + (rand() - 0.5) * size, size * (1 - j * 0.2), size * 0.45, size * 0.8, 'matte', rand() * Math.PI);
    }
    return { outsideTrees, wildFlowers };
  }
  return { heightAt, waterDistance, pathDistance, dress, roots, terrainTriangles: positions.length / 9, riverLength: 4320 };
}
