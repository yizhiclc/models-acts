/** One lattice cell is exactly 0.2 metres. Geometry is stored as integer cell bounds. */
export const VOXEL_SIZE = 0.2;
export const snap = (value) => Math.round(value / VOXEL_SIZE) * VOXEL_SIZE;
export function cellBounds(x, y, z, width, height, depth) {
  const x0 = Math.round((x - width / 2) / VOXEL_SIZE);
  const y0 = Math.round(y / VOXEL_SIZE);
  const z0 = Math.round((z - depth / 2) / VOXEL_SIZE);
  return [
    x0,
    y0,
    z0,
    x0 + Math.max(1, Math.round(width / VOXEL_SIZE)),
    y0 + Math.max(1, Math.round(height / VOXEL_SIZE)),
    z0 + Math.max(1, Math.round(depth / VOXEL_SIZE)),
  ];
}
export function randomGenerator(seed = 20260925) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
