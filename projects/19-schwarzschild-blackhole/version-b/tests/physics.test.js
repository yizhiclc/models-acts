import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITICAL_IMPACT, diskFluxFactor, diskTemperature, frequencyShift, rk4, traceVacuum, blackbodyXYZ } from '../src/physics.js';

test('ISCO zero torque and nonnegative disk flux', () => {
  assert.equal(diskFluxFactor(6), 0);
  assert.equal(diskFluxFactor(5), 0);
  for (let r = 6.01; r < 200; r += .17) assert.ok(diskFluxFactor(r) > 0);
});
test('Novikov-Thorne flux peaks near 9.55 gravitational radii', () => {
  let peakR = 6, peak = 0;
  for (let r = 6; r < 20; r += .01) {
    if (diskFluxFactor(r) > peak) { peak = diskFluxFactor(r); peakR = r; }
  }
  assert.ok(Math.abs(peakR - 9.55) < .03, String(peakR));
});
test('outer disk recovers Newtonian r^-3 flux', () => {
  const r = 1e8;
  assert.ok(Math.abs(diskFluxFactor(r) / (3 / (8 * Math.PI * r ** 3)) - 1) < .001);
});
test('temperature scales as accretion rate to the quarter power', () => {
  assert.ok(Math.abs(diskTemperature(10, 1.6) / diskTemperature(10, .1) - 2) < 1e-10);
});
test('photon sphere is a fixed point at r=3M', () => {
  const [u, p] = rk4(1 / 3, 0, .02);
  assert.ok(Math.abs(u - 1 / 3) < 1e-15);
  assert.ok(Math.abs(p) < 1e-15);
});
test('capture versus escape straddles b=3 sqrt(3)', () => {
  const inside = traceVacuum(CRITICAL_IMPACT * .999);
  const outside = traceVacuum(CRITICAL_IMPACT * 1.001);
  assert.equal(inside.captured, true);
  assert.equal(outside.captured, false);
  assert.ok(outside.maxResidual < 1e-6, String(outside.maxResidual));
});
test('weak field approaches Einstein deflection 4M/b', () => {
  const b = 1000, observer = 1e7;
  const ray = traceVacuum(b, .002, observer);
  const deflection = ray.phi + b / observer - Math.PI;
  assert.ok(Math.abs(deflection / (4 / b) - 1) < .005, String(deflection));
});
test('RK4 geodesic energy residual improves with smaller steps', () => {
  const coarse = traceVacuum(5.3, .04);
  const fine = traceVacuum(5.3, .01);
  assert.ok(fine.maxResidual < coarse.maxResidual / 30, JSON.stringify({ coarse, fine }));
});
test('frequency shift includes circular emitter time dilation', () => {
  const r = 10, obs = 58;
  assert.ok(Math.abs(frequencyShift(r, 0, obs) - Math.sqrt(.7) / Math.sqrt(1 - 2 / obs)) < 1e-12);
  assert.ok(frequencyShift(r, 4, obs) > frequencyShift(r, -4, obs));
});
test('Planck radiance increases in all visible tristimulus channels', () => {
  const cool = blackbodyXYZ(6000), hot = blackbodyXYZ(20000);
  for (let i = 0; i < 3; i++) assert.ok(hot[i] > cool[i] && cool[i] > 0);
});
