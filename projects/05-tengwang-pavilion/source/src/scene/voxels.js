import * as THREE from 'three';

export const palette = {
  vermilion: '#a1422e', redLight: '#bf5939', redDark: '#692f28',
  wood: '#4c3430', gold: '#d4ad6a', goldLight: '#e7c98f',
  jade: '#477b6b', jadeLight: '#6c9680', jadeDark: '#305b54',
  blue: '#315967', stone: '#c3c1ab', ivory: '#e3d7bb',
  stoneDark: '#999f91', ink: '#253e3f',
};

export function random(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** A handful of draw calls for tens of thousands of individually coloured blocks. */
export class Voxels {
  constructor(seed = 29) {
    this.buckets = new Map();
    this.rng = random(seed);
    this.count = 0;
    this.materials = {};
    this.meshes = [];
  }

  box(x, y, z, w, h, d, color, type = 'matte', variation = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const c = new THREE.Color(color);
    if (variation) c.multiplyScalar(1 + (this.rng() - 0.5) * variation);
    if (!this.buckets.has(type)) this.buckets.set(type, []);
    this.buckets.get(type).push({ x, y, z, w, h, d, color: c });
    this.count++;
  }

  cube(x, y, z, size, color, type = 'matte', variation = 0.1) {
    this.box(x, y, z, size, size, size, color, type, variation);
  }

  // Axis-aligned stepped beams retain the voxel silhouette even on diagonals.
  line(a, b, size, color, type = 'matte', step = size * 0.65) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.cube(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t, size, color, type, 0);
    }
  }

  build(parent, name = '体素') {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    for (const [type, blocks] of this.buckets) {
      const material = new THREE.MeshStandardMaterial({
        roughness: type === 'roof' ? 0.72 : 0.93,
        metalness: type === 'gold' ? 0.17 : 0,
        emissive: type === 'glow' ? '#ffb84d' : '#000000',
        emissiveIntensity: type === 'glow' ? 0.8 : 0,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
      mesh.name = `${name} · ${type} (${blocks.length})`;
      blocks.forEach((block, i) => {
        matrix.makeScale(block.w, block.h, block.d);
        matrix.setPosition(block.x, block.y, block.z);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, block.color);
      });
      mesh.castShadow = type !== 'glow' && type !== 'ground';
      mesh.receiveShadow = type !== 'glow';
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      this.materials[type] = material;
      this.meshes.push(mesh);
    }
    this.buckets.clear();
    return this;
  }
}

export function plaque(parent, text, position, width, height, rotation = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#173f43';
  ctx.fillRect(0, 0, 768, 224);
  ctx.strokeStyle = '#c9a259';
  ctx.lineWidth = 9;
  ctx.strokeRect(12, 12, 744, 200);
  ctx.lineWidth = 2;
  ctx.strokeRect(23, 23, 722, 178);
  ctx.font = 'bold 138px "STKaiti", "KaiTi", "SimSun", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1d391';
  ctx.fillText(text, 384, 120, 678);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
  mesh.position.set(...position);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}
