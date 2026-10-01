import assert from 'node:assert/strict';
import { DIMENSIONS, widthAt, archBottom, topY, sideZ } from '../src/car.js';

const { length, width, wheelbase, tireRadius, track } = DIMENSIONS;
assert.equal(wheelbase, 2.78);
assert.equal(tireRadius - 0.356, 0, 'Tire contact must be on Y=0');
assert.equal(track, 1.664);
let samples = 0, minClearance = Infinity;
for (let i = 0; i <= 2000; i++) {
  const x = -length / 2 + length * i / 2000;
  const w = widthAt(x), low = archBottom(x), high = topY(x, w);
  assert(Number.isFinite(w) && w > 0 && w < width / 2 + .01);
  assert(Number.isFinite(low) && low > 0 && low < high, `Invalid side surface at X=${x}`);
  for (let k = 0; k <= 10; k++) {
    const z = w * k / 10;
    assert(Number.isFinite(topY(x, z)));
    assert(Math.abs(topY(x, z) - topY(x, -z)) < 1e-9, 'Body must be laterally symmetric');
    assert(Number.isFinite(sideZ(x, low + (high - low) * k / 10)));
  }
  samples++;
}
for (const axle of [-wheelbase / 2, wheelbase / 2]) {
  for (let i = 0; i <= 100; i++) {
    const dx = (i / 50 - 1) * tireRadius;
    const tireY = tireRadius + Math.sqrt(Math.max(0, tireRadius ** 2 - dx ** 2));
    const clearance = archBottom(axle + dx) - tireY;
    assert(clearance >= .0419, 'Wheel arch must clear the full tire envelope');
    minClearance = Math.min(minClearance, clearance);
  }
}
console.log(JSON.stringify({ result: 'PASS', longitudinalSamples: samples, archSamples: 202, minimumVerticalArchClearanceMm: Math.round(minClearance * 1000), groundY: 0, wheelbaseMm: wheelbase * 1000 }, null, 2));
