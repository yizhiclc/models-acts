import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwaySimulation, trackPoint, carPose, TRACK, TRACK_LENGTH, STRAIGHT, ARC, STATION_DISTANCE, INITIAL_DISTANCE, BASE_SPEED, CAR_SPACING, DWELL_SECONDS } from '../src/simulation.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);

test('loop closes with continuous position and tangent at all four joints', () => {
  for (const d of [0, STRAIGHT, STRAIGHT + ARC, 2 * STRAIGHT + ARC, TRACK_LENGTH]) {
    const before = trackPoint(d - 1e-6), after = trackPoint(d + 1e-6);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 3e-6);
    assert.ok(Math.hypot(after.tx - before.tx, after.tz - before.tz) < 1e-6);
  }
  assert.deepEqual(trackPoint(0), trackPoint(TRACK_LENGTH));
});

test('arc length parametrization keeps speed constant on straights and turns', () => {
  for (let d = 0; d < TRACK_LENGTH; d += .11) {
    const p = trackPoint(d), next = trackPoint(d + .01);
    near(Math.hypot(next.x - p.x, next.z - p.z), .01, 2e-8);
    near(Math.hypot(p.tx, p.tz), 1);
  }
});

test('the three cars keep route spacing and take different headings in a turn', () => {
  const sim = new RailwaySimulation(); sim.distance = STRAIGHT + ARC / 2;
  const poses = sim.poses;
  for (let i = 0; i < 3; i++) {
    const expected = carPose(sim.distance - CAR_SPACING * i);
    near(poses[i].x, expected.x); near(poses[i].z, expected.z);
    if (i > 0) {
      const centerDistance = Math.hypot(poses[i].x - poses[i-1].x, poses[i].z - poses[i-1].z);
      assert.ok(centerDistance > 2.08 && centerDistance < 2.13, 'car bodies retain a physical gap');
      assert.ok(Math.abs(poses[i].angle - poses[i-1].angle) > .25, 'cars must not share one rigid heading');
    }
  }
});

test('first arrival stops exactly at the station for two simulation seconds', () => {
  const sim = new RailwaySimulation();
  const travelTime = (TRACK_LENGTH - INITIAL_DISTANCE + STATION_DISTANCE) / BASE_SPEED;
  sim.advance(travelTime);
  near(sim.distance, STATION_DISTANCE); near(sim.dwellRemaining, DWELL_SECONDS); assert.equal(sim.stops, 1);
  sim.advance(1.5); near(sim.distance, STATION_DISTANCE); near(sim.dwellRemaining, .5);
  sim.advance(.5); near(sim.dwellRemaining, 0); near(sim.distance, STATION_DISTANCE);
  sim.advance(.1); near(sim.distance, STATION_DISTANCE + BASE_SPEED * .1);
});

test('pause freezes both train position and the dwell countdown', () => {
  const sim = new RailwaySimulation(); sim.distance = STATION_DISTANCE - .1; sim.advance(.1 / BASE_SPEED);
  sim.playing = false;
  const frozen = JSON.stringify(sim);
  sim.advance(100); assert.equal(JSON.stringify(sim), frozen);
  sim.playing = true; sim.advance(.6); near(sim.dwellRemaining, 1.4);
});

test('large steps cannot skip station events or apply speed to dwell duration', () => {
  const sim = new RailwaySimulation(); sim.setSpeed(2);
  const firstTravel = (TRACK_LENGTH - INITIAL_DISTANCE + STATION_DISTANCE) / (BASE_SPEED * 2);
  const loopTime = TRACK_LENGTH / (BASE_SPEED * 2) + DWELL_SECONDS;
  sim.advance(firstTravel + DWELL_SECONDS + loopTime * 2 + .4);
  assert.equal(sim.stops, 3); near(sim.dwellRemaining, 0); near(sim.distance, STATION_DISTANCE + .4 * BASE_SPEED * 2, 1e-6);
});

test('reset restores a deterministic starting train, speed, timer and running state', () => {
  const sim = new RailwaySimulation(); sim.setSpeed(.4); sim.advance(300); sim.playing = false; sim.reset();
  assert.deepEqual(sim, new RailwaySimulation());
});

test('invalid settings and time cannot corrupt simulation state', () => {
  const sim = new RailwaySimulation(); const before = JSON.stringify(sim);
  for (const speed of [0, 3, NaN, Infinity]) assert.throws(() => sim.setSpeed(speed), RangeError);
  for (const seconds of [-1, NaN, Infinity]) assert.throws(() => sim.advance(seconds), RangeError);
  assert.equal(JSON.stringify(sim), before);
});
