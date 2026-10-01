import * as THREE from "../vendor/three.module.js";
import { cellBounds, VOXEL_SIZE } from "./grid.js";

// Run-length solids: a cuboid encodes adjacent, equal-colour 0.2 m cells.
// Meshing a solid emits six outer quads instead of allocating its interior cells.
// Spatial batches keep draw calls low while allowing frustum culling.
export class VoxelBatch {
  constructor() {
    this.chunks = new Map();
    this.count = 0;
    this.bounds = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
  }
  box(x, y, z, w, h, d, color, material = "stone") {
    if (![x, y, z, w, h, d].every(Number.isFinite) || Math.min(w, h, d) <= 0)
      throw new Error("Invalid voxel solid");
    const b = cellBounds(x, y, z, w, h, d);
    const key = `${Math.floor(x / 32)},${Math.floor(z / 32)},${material}`;
    if (!this.chunks.has(key)) this.chunks.set(key, { material, boxes: [] });
    this.chunks.get(key).boxes.push({ b, color });
    this.count++;
    for (let i = 0; i < 3; i++) {
      this.bounds[i] = Math.min(this.bounds[i], b[i]);
      this.bounds[i + 3] = Math.max(this.bounds[i + 3], b[i + 3]);
    }
  }
  mesh(materials) {
    const group = new THREE.Group();
    group.name = "Voxel city · 0.2 m lattice";
    const faces = [
      { n: [1, 0, 0], q: [1, 5, 7, 3], s: 0.83 },
      { n: [-1, 0, 0], q: [4, 0, 2, 6], s: 0.73 },
      { n: [0, 1, 0], q: [2, 3, 7, 6], s: 1 },
      { n: [0, -1, 0], q: [4, 5, 1, 0], s: 0.56 },
      { n: [0, 0, 1], q: [5, 4, 6, 7], s: 0.87 },
      { n: [0, 0, -1], q: [0, 1, 3, 2], s: 0.78 },
    ];
    const colors = new Map();
    for (const chunk of this.chunks.values()) {
      const n = chunk.boxes.length,
        positions = new Float32Array(n * 72),
        normals = new Float32Array(n * 72),
        colours = new Float32Array(n * 72),
        indices = new Uint32Array(n * 36);
      let v = 0,
        idx = 0;
      for (const { b, color } of chunk.boxes) {
        let c = colors.get(color);
        if (!c) {
          c = new THREE.Color(color);
          colors.set(color, c);
        }
        const points = [];
        for (let k = 0; k < 8; k++)
          points.push([
            (k & 1 ? b[3] : b[0]) * VOXEL_SIZE,
            (k & 2 ? b[4] : b[1]) * VOXEL_SIZE,
            (k & 4 ? b[5] : b[2]) * VOXEL_SIZE,
          ]);
        for (const f of faces) {
          const first = v;
          for (const k of f.q) {
            positions.set(points[k], v * 3);
            normals.set(f.n, v * 3);
            colours.set([c.r * f.s, c.g * f.s, c.b * f.s], v * 3);
            v++;
          }
          indices.set(
            [first, first + 2, first + 1, first, first + 3, first + 2],
            idx,
          );
          idx += 6;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(
        geo,
        materials[chunk.material] || materials.stone,
      );
      mesh.castShadow = chunk.material !== "glow";
      mesh.receiveShadow = chunk.material !== "glow";
      group.add(mesh);
    }
    return group;
  }
}
