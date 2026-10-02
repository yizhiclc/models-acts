import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Vec3, Quaternion } from 'cannon-es';
import { Simulation, PRESETS } from '../src/physics.js';
import { ReplayTimeline, REPLAY_TICK } from '../src/replay.js';

const results = [], started = performance.now();
async function test(name, fn) {
  const start = performance.now();
  try { await fn(); results.push({ name, passed: true, ms: Math.round(performance.now() - start) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
function stateOf(sim) {
  const body = b => [...b.position.toArray(), b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w,
    ...b.velocity.toArray(), ...b.angularVelocity.toArray()];
  return { time: sim.time, broken: sim.brokenCount, detached: sim.detachedCount, impulse: sim.wallImpulse,
    bodies: [...sim.pieces.map(p => body(p.body)), body(sim.projectile)],
    supported: sim.pieces.map(p => p.supported), stresses: sim.pieces.map(p => p.stress),
    bonds: sim.bonds.map(b => b.broken), contact: sim.firstContact };
}
function worldSignature(sim) {
  return JSON.stringify({ state: stateOf(sim), ticks: sim.ticks, worldTime: sim.world.time,
    constraints: sim.world.constraints.map(c => c.id), events: sim.events, history: sim.history,
    sleep: sim.world.bodies.map(b => b.sleepState) });
}

const sim = new Simulation(PRESETS.local), tape = new ReplayTimeline(sim), compact = new ReplayTimeline(sim, { maxFrames: 32 });
const saved = new Map([[0, stateOf(sim)]]);
await test('Recording begins at the intact zero frame and captures the real simulation', () => {
  assert.equal(tape.frames.length, 1); assert.equal(tape.duration, 0); assert.equal(tape.state, sim);
  sim.launch();
  for (let i = 1; i <= 180; i++) {
    sim.advance(); tape.capture(); compact.capture();
    if ([1, 24, 31, 40, 60, 120, 179, 180].includes(i)) saved.set(i, stateOf(sim));
  }
  assert.equal(tape.frames.length, 181); assert.equal(tape.latestTick, 180);
  assert(sim.firstContact); assert(sim.brokenCount > 0);
});

await test('Seeking restores poses, rotations, velocities, stress, bonds and telemetry without touching the world', () => {
  const unchanged = worldSignature(sim);
  for (const tick of [120, 0, 179, 24, 60, 1, 40, 31]) {
    tape.seek(tick); const actual = stateOf(tape.state), expected = saved.get(tick);
    assert.equal(actual.time, expected.time); assert.equal(actual.broken, expected.broken);
    assert.equal(actual.detached, expected.detached); assert.equal(actual.impulse, expected.impulse);
    assert.deepEqual(actual.supported, expected.supported); assert.deepEqual(actual.bonds, expected.bonds);
    assert.deepEqual(actual.contact, expected.contact);
    for (let i = 0; i < actual.bodies.length; i++) for (let j = 0; j < actual.bodies[i].length; j++) {
      assert(Math.abs(actual.bodies[i][j] - expected.bodies[i][j]) < 2e-6, `tick ${tick}, body ${i}, component ${j}`);
    }
    for (let i = 0; i < actual.stresses.length; i++) assert(Math.abs(actual.stresses[i] - expected.stresses[i]) < 1e-6);
    assert.equal(worldSignature(sim), unchanged);
  }
});

await test('Rewinding before impact hides future cracks, contact records and future trajectories', () => {
  tape.seek(24); assert.equal(tape.state.firstContact, null); assert.equal(tape.state.brokenCount, 0);
  assert.equal(tape.snapshot().events.length, 0); assert(tape.history().every(h => h.time <= tape.time));
  for (const trail of tape.trailSamples()) {
    if (trail.id !== 'ball') assert.equal(trail.points.length, 0);
    else {
      assert(trail.points.length > 0);
      assert.deepEqual(trail.points.at(-1), tape.state.projectile.position.toArray());
    }
  }
  tape.seek(0); assert.equal(tape.state.launched, false); assert.equal(tape.state.wallImpulse, 0);
  assert(tape.state.pieces.every(p => p.supported));
});

await test('Replay single-step reaches the recorded endpoint without advancing physics', () => {
  tape.seek(178); const before = worldSignature(sim);
  assert.equal(tape.step(), true); assert.equal(tape.cursorTick, 179);
  assert.equal(tape.step(), false); assert.equal(tape.cursorTick, 180);
  assert.equal(tape.step(), false); assert.equal(tape.state, sim);
  assert.equal(worldSignature(sim), before);
  tape.seek(-100); assert.equal(tape.cursorTick, 0);
  tape.seek(999999); assert.equal(tape.cursorTick, 180);
});

await test('Continuing after repeated replay produces the same physical result as uninterrupted simulation', () => {
  const control = new Simulation(PRESETS.local); control.launch();
  for (let i = 0; i < 240; i++) control.advance();
  for (let i = 180; i < 240; i++) { sim.advance(); tape.capture(); }
  assert.deepEqual(stateOf(sim), stateOf(control));
  assert.equal(tape.latestTick, 240); assert.equal(tape.frames[0].tick, 0);
});

await test('Bounded pose storage retains the beginning, latest frame and discrete fracture history', () => {
  assert(compact.stride > 1); assert(compact.frames.length <= 32);
  assert.equal(compact.frames[0].tick, 0); assert.equal(compact.latestTick, 180);
  for (const tick of [0, 24, 31, 40, 60, 120, 179]) {
    compact.seek(tick);
    assert.equal(compact.state.brokenCount, saved.get(tick).broken);
    assert.deepEqual(compact.state.bonds.map(b => b.broken), saved.get(tick).bonds);
    assert.deepEqual(compact.state.pieces.map(p => p.supported), saved.get(tick).supported);
    const q = compact.state.projectile.quaternion;
    assert(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-12);
  }
});

await test('Long recordings remain seekable from zero, even beyond the old 60-second telemetry window', () => {
  // Synthetic linear motion isolates storage/seek behavior; this is not a long physical stress test.
  const body = () => ({ mass: 1, position: new Vec3(), quaternion: new Quaternion(), velocity: new Vec3(1, 0, 0), angularVelocity: new Vec3() });
  const fixture = { params: {}, pieces: [{ id: 0, fixed: true, body: body(), bonds: [], supported: true, stress: 0 }],
    bonds: [], projectile: body(), ticks: 0, time: 0, wallImpulse: 0, peakImpulse: 0, stepImpulse: 0,
    maxStress: 0, substeps: 2, brokenCount: 0, detachedCount: 0, events: [], history: [], firstContact: null };
  const long = new ReplayTimeline(fixture, { maxFrames: 32 });
  for (let i = 1; i <= 20000; i++) {
    fixture.ticks = i; fixture.time = i * REPLAY_TICK; fixture.projectile.position.x = fixture.time; long.capture();
  }
  assert.equal(long.latestTick, 20000); assert.equal(long.frames[0].tick, 0); assert(long.frames.length <= 32);
  for (const tick of [0, 31, 7200, 18001, 19999]) {
    long.seek(tick); assert(Math.abs(long.state.projectile.position.x - tick * REPLAY_TICK) < 2e-5);
  }
});

await test('A new experiment discards the previous recording and fragment trail identities', () => {
  const fresh = new ReplayTimeline(new Simulation(PRESETS.miss));
  assert.equal(fresh.duration, 0); assert.equal(fresh.frames.length, 1); assert.equal(fresh.tracked.length, 1);
  assert.equal(fresh.state.brokenCount, 0); assert.equal(fresh.snapshot().events.length, 0);
});

const report = { generatedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  passed: results.filter(r => r.passed).length, total: results.length, elapsedMs: Math.round(performance.now() - started), results };
await fs.writeFile(new URL('./replay-results.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${report.passed}/${report.total} replay tests passed (${(report.elapsedMs / 1000).toFixed(1)} s).`);
if (report.passed !== report.total) process.exitCode = 1;
