import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { BC, TABLE, rk4, invariant, turningPoint, fluxShape, temperatureScale, redshift, impactAt, impactIndex, sampleTable, observerIntegrals } from '../src/physics.mjs';

test('Schwarzschild critical impact and photon orbit', () => {
  assert.ok(Math.abs(BC - Math.sqrt(27)) < 1e-14);
  const u = 1 / 3;
  assert.ok(Math.abs(3 * u * u - u) < 1e-14);
  assert.ok(Math.abs(invariant([u, 0], BC)) < 1e-14);
  assert.equal(turningPoint(BC * .999), null);
});

test('RK4 preserves null-geodesic first integral', () => {
  for (const b of [3, 5.1, 5.2, 6, 10, 30, 100]) {
    let state = [0, 1 / b, 0];
    for (let i = 0; i < 6000 && state[0] < .48 && state[0] >= 0; i++) {
      state = rk4(state, b, .0005);
      assert.ok(Math.abs(invariant(state, b)) < 1e-9, `b=${b}`);
    }
  }
});

test('Periapsis and weak-field bending agree with Schwarzschild limit', () => {
  assert.ok(Math.abs(turningPoint(Math.sqrt(54)).r - 6) < 1e-10);
  const b = 1000;
  const measured = 2 * turningPoint(b).phi - Math.PI;
  const predicted = 4 / b + 15 * Math.PI / (4 * b * b) + 128 / (3 * b ** 3);
  assert.ok(Math.abs(measured - predicted) < 3e-10);
});

test('Novikov-Thorne zero torque, outer limit and temperature scaling', () => {
  assert.equal(fluxShape(6), 0);
  assert.equal(fluxShape(4), 0);
  assert.ok(fluxShape(10) > 0);
  assert.ok(Math.abs(fluxShape(1e8) * 1e24 - 1) < .001);
  assert.ok(Math.abs(temperatureScale(4e8, 1e-4) / temperatureScale(1e8, 1e-4) - .5) < 1e-12);
  assert.ok(Math.abs(temperatureScale(1e8, 16e-4) / temperatureScale(1e8, 1e-4) - 2) < 1e-12);
});

test('Redshift includes transverse, gravitational and signed Doppler terms', () => {
  assert.ok(Math.abs(redshift(6, 0, 1e15) - Math.SQRT1_2) < 1e-12);
  assert.ok(redshift(10, 5, 62) > redshift(10, -5, 62));
});

test('Lookup impact coordinate is invertible', () => {
  for (const i of [0, 128, 1000, 2048, 3500, 4095]) {
    assert.ok(Math.abs(impactIndex(impactAt(i)) - i) < 1e-5);
  }
});

test('GPU lookup agrees with independent smaller-step integration', async () => {
  const packed = JSON.parse(await readFile(new URL('../data/geodesics.json', import.meta.url), 'utf8'));
  const file = inflateSync(Buffer.from(packed.data, 'base64'));
  const floats = new Float32Array(file.buffer, file.byteOffset, file.byteLength / 4);
  const radial = floats.subarray(0, TABLE.width * TABLE.height * 2);
  const metadata = floats.subarray(radial.length);
  let maxRelative = 0;
  for (const b of [3, 5.19, 5.19616, 6, 7.35, 10, 20, 60, 100]) {
    let exact = [0, 1 / b, 0], phi = 0;
    const end = Math.min(turningPoint(b)?.phi ?? 2, 2);
    for (let j = 1; j <= 15; j++) {
      const p = end * j / 16;
      while (phi < p - 1e-12 && exact[0] < 1 / 6) {
        const h = Math.min(.0002, p - phi);
        exact = rk4(exact, b, h); phi += h;
      }
      if (exact[0] >= 1 / 6) break;
      const approx = sampleTable(radial, metadata, b, p);
      const relative = Math.abs((approx[0] - exact[0]) / exact[0]);
      maxRelative = Math.max(maxRelative, relative);
      assert.ok(relative < 8e-4, `${b}, ${p}: ${relative}`);
    }
  }
  console.log(`Max sampled lookup radial relative error: ${maxRelative}`);
});

test('Finite observer initial angle matches direct integration', () => {
  for (const b of [3, 5.2, 10, 25]) {
    const { phi } = observerIntegrals(b, 62);
    let y = [0, 1 / b, 0], angle = 0;
    while (angle < phi - 1e-14) {
      const h = Math.min(.0001, phi - angle);
      y = rk4(y, b, h); angle += h;
    }
    assert.ok(Math.abs(y[0] - 1 / 62) < 1e-10);
  }
});
