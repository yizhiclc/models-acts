import test from 'node:test';
import assert from 'node:assert/strict';
import {
  horizon, isco, circularOrbit, makeFluxTable, launch, constants, traceReference,
  frequencyShift, temperatureScale,
} from '../src/physics.mjs';

test('Kerr horizon is symmetric in spin and tends to Schwarzschild at a*=0', () => {
  assert.equal(horizon(0), 2);
  assert.ok(Math.abs(horizon(.94) - horizon(-.94)) < 1e-14);
  assert.ok(horizon(.998) > 1);
});

test('ISCO moves inward for prograde and outward for retrograde disk orbits', () => {
  assert.ok(Math.abs(isco(0) - 6) < 1e-12);
  assert.ok(Math.abs(isco(.94) - 2.023593104700402) < 1e-12);
  assert.ok(Math.abs(isco(-.94) - 8.830752019186427) < 1e-12);
  assert.ok(isco(.94) < isco(0) && isco(-.94) > isco(0));
});

test('Circular orbit constants are finite outside the ISCO', () => {
  for (const a of [-.998, 0, .94]) {
    const r = isco(a) * 1.2;
    const orbit = circularOrbit(r, a);
    for (const value of Object.values(orbit)) assert.ok(Number.isFinite(value));
    assert.ok(orbit.omega > 0 && orbit.energy > 0 && orbit.ut > 1);
  }
});

test('Kerr Hamiltonian launch satisfies null constraint', () => {
  for (const a of [-.94, 0, .94]) {
    const state = launch([50, 20, 22], [.2, -.1, -.9], a);
    const c = constants(state, a);
    assert.ok(Math.abs(c.h) < 1e-12, `a=${a}: H=${c.h}`);
    assert.ok(Number.isFinite(c.lz) && Number.isFinite(c.carter));
  }
});

test('RK4 reference traces preserve Kerr constants at practical integration step', () => {
  for (const a of [-.94, 0, .94]) {
    const state = launch([50, 20, 22], [.2, -.1, -.9], a);
    const result = traceReference(state, a, .04, { disk: false, maxSteps: 160 });
    assert.equal(result.kind, 'sky');
    assert.ok(result.maxH < 2e-8, `a=${a}: H=${result.maxH}`);
    assert.ok(result.maxLz < 2e-8, `a=${a}: Lz=${result.maxLz}`);
    assert.ok(result.maxCarter < 2e-5, `a=${a}: Q=${result.maxCarter}`);
  }
});

test('Kerr Novikov-Thorne flux starts at zero torque and has a positive peak', () => {
  for (const a of [-.94, 0, .94]) {
    const table = makeFluxTable(a);
    assert.ok(Math.abs(table.data[0]) < 1e-12);
    assert.ok(table.peak > 0);
    assert.ok(table.inner > horizon(a));
    assert.ok(table.data[(2047 * 4) + 1] > 0);
  }
});

test('Frequency shift responds to disk rotation direction', () => {
  const observerLapse = Math.sqrt(1 - 2 / 62);
  const blueSide = frequencyShift(8, -4, observerLapse, .94);
  const redSide = frequencyShift(8, 4, observerLapse, .94);
  assert.ok(blueSide > redSide);
});

test('Temperature scaling retains mass and accretion-rate laws', () => {
  assert.ok(Math.abs(temperatureScale(4e8, 1e-4) / temperatureScale(1e8, 1e-4) - .5) < 1e-12);
  assert.ok(Math.abs(temperatureScale(1e8, 16e-4) / temperatureScale(1e8, 1e-4) - 2) < 1e-12);
});
