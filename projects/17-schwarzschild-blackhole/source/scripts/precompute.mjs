import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { TABLE, BC, B6, impactAt, rk4, turningPoint, tortoise, invariant } from '../src/physics.mjs';

const root = new URL('../', import.meta.url);
await mkdir(new URL('data/', root), { recursive: true });
const { width, height, phiMax } = TABLE;
const radial = new Float32Array(width * height * 2);
const meta = new Float32Array(width * 4);
const dPhi = phiMax / (height - 1);
let maxInvariantError = 0;
const start = performance.now();

for (let x = 0; x < width; x++) {
  const b = impactAt(x);
  const turn = turningPoint(b);
  meta[x * 4] = turn ? turn.phi : -1;
  meta[x * 4 + 1] = turn ? turn.delay : 0;
  meta[x * 4 + 2] = turn ? tortoise(turn.r) : 0;
  meta[x * 4 + 3] = turn ? turn.u : 0.5;
  let y = [0, 1 / b, 0];
  let phi = 0;
  const uLimit = b < B6 ? 1 / 6 : turn.u;
  let stopped = false;
  for (let j = 0; j < height; j++) {
    const target = j * dPhi;
    while (!stopped && phi < target - 1e-14) {
      let h = Math.min(dPhi / 3, target - phi);
      if (turn && b >= B6) h = Math.min(h, turn.phi - phi);
      if (h < 1e-13) {
        if (turn && b >= B6 && turn.phi - phi < 1e-13) {
          y = [turn.u, 0, turn.delay];
          stopped = true;
        }
        phi = target;
        break;
      }
      const next = rk4(y, b, h);
      if (next[0] >= uLimit || next[1] <= 0) {
        let lo = 0, hi = h;
        for (let k = 0; k < 28; k++) {
          const mid = (lo + hi) / 2;
          if (rk4(y, b, mid)[0] < uLimit) lo = mid;
          else hi = mid;
        }
        y = turn && b >= B6 ? [turn.u, 0, turn.delay] : rk4(y, b, (lo + hi) / 2);
        y[0] = uLimit;
        stopped = true;
      } else {
        y = next;
      }
      phi += h;
      if (!stopped) maxInvariantError = Math.max(maxInvariantError, Math.abs(invariant(y, b)));
    }
    const offset = 2 * (j * width + x);
    radial[offset] = y[0];
    radial[offset + 1] = y[2];
  }
  if (x % 512 === 0) console.log(`Geodesics: ${x}/${width}`);
}

const bytes = Buffer.concat([Buffer.from(radial.buffer), Buffer.from(meta.buffer)]);
const compressed = deflateSync(bytes, { level: 9 });
const hash = createHash('sha256').update(bytes).digest('hex');
const manifest = {
  ...TABLE,
  format: 'little-endian float32, RG radial then RGBA periapsis',
  radialFloats: radial.length,
  metaFloats: meta.length,
  criticalImpact: BC,
  sha256: hash,
  maxInvariantError,
  data: compressed.toString('base64'),
};
await writeFile(new URL('data/geodesics.json', root), JSON.stringify(manifest));

// The CIE table is vendored and checked into the deliverable for offline rebuilds.
const csv = await readFile(new URL('data/CIE_xyz_1931_2deg.csv', root), 'utf8');
const cie = csv.trim().split(/\r?\n/).map(row => row.split(',').map(Number));
const count = 2048, tMin = 200, tMax = 2e6;
const colors = new Float32Array(count * 4);
const hPlanck = 6.62607015e-34, c = 299792458, k = 1.380649e-23;
function spectrum(t) {
  const xyz = [0, 0, 0];
  for (const [nm, x, y, z] of cie) {
    const wavelength = nm * 1e-9;
    const exponent = hPlanck * c / (wavelength * k * t);
    const radiance = 2 * hPlanck * c * c / wavelength ** 5 / Math.expm1(exponent) * 1e-9;
    xyz[0] += radiance * x; xyz[1] += radiance * y; xyz[2] += radiance * z;
  }
  return xyz;
}
const normalization = spectrum(10000)[1];
for (let i = 0; i < count; i++) {
  const t = tMin * (tMax / tMin) ** (i / (count - 1));
  const [x, y, z] = spectrum(t).map(v => v / normalization);
  colors[i * 4] = Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z);
  colors[i * 4 + 1] = Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z);
  colors[i * 4 + 2] = Math.max(0, 0.0557 * x - 0.2040 * y + 1.0570 * z);
  colors[i * 4 + 3] = 1;
}
await writeFile(new URL('data/blackbody.json', root), JSON.stringify({
  count, tMin, tMax,
  data: deflateSync(Buffer.from(colors.buffer), { level: 9 }).toString('base64'),
}));
console.log(JSON.stringify({
  seconds: (performance.now() - start) / 1000,
  rawBytes: bytes.length, compressedBytes: compressed.length, sha256: hash, maxInvariantError,
}, null, 2));
