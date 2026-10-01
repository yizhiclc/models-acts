import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const root = new URL('../', import.meta.url);
const csv = await readFile(new URL('data/CIE_xyz_1931_2deg.csv', root), 'utf8');
const cie = csv.trim().split(/\r?\n/).map(row => row.split(',').map(Number));
const count = 2048, tMin = 200, tMax = 2e6;
const colors = new Float32Array(count * 4);
function spectrum(t) {
  const xyz = [0, 0, 0];
  for (const [nm, x, y, z] of cie) {
    const wavelength = nm * 1e-9;
    const exponent = 6.62607015e-34 * 299792458 / (wavelength * 1.380649e-23 * t);
    const radiance = 2 * 6.62607015e-34 * 299792458 ** 2 / wavelength ** 5 / Math.expm1(exponent) * 1e-9;
    xyz[0] += radiance * x; xyz[1] += radiance * y; xyz[2] += radiance * z;
  }
  return xyz;
}
const normalization = spectrum(10000)[1];
for (let i = 0; i < count; i++) {
  const t = tMin * (tMax / tMin) ** (i / (count - 1));
  const [x, y, z] = spectrum(t).map(v => v / normalization);
  colors.set([Math.max(0, 3.2406*x-1.5372*y-.4986*z), Math.max(0, -.9689*x+1.8758*y+.0415*z), Math.max(0, .0557*x-.204*x+1.057*z), 1], i*4);
}
await writeFile(new URL('data/blackbody.json', root), JSON.stringify({
  count, tMin, tMax, data: deflateSync(Buffer.from(colors.buffer), { level: 9 }).toString('base64'),
}));
console.log('Rebuilt CIE/Planck spectral table. The Kerr flux table is evaluated at runtime.');
