import { Vec3, Quaternion } from 'cannon-es';

export const REPLAY_TICK = 1 / 120;
const BODY_STRIDE = 14; // position, quaternion, linear/angular velocity, stress
const EPSILON = 1e-8;

function displayBody(body) {
  return { mass: body.mass, position: new Vec3(), quaternion: new Quaternion(),
    velocity: new Vec3(), angularVelocity: new Vec3() };
}

// A display-only recording. Seeking never restores or mutates the solver's world.
// Keeping the live world untouched also preserves contact caches and continuation.
export class ReplayTimeline {
  constructor(simulation, { maxBytes = 64 * 1024 * 1024, maxFrames } = {}) {
    this.sim = simulation;
    this.frames = [];
    this.stride = 1;
    this.cursorTick = 0;
    this.revision = 0;
    this.bytesPerFrame = (simulation.pieces.length + 1) * BODY_STRIDE * 4;
    this.maxFrames = Math.max(4, maxFrames ?? Math.floor(maxBytes / this.bytesPerFrame));
    this.tracked = [{ id: 'ball', bodyIndex: simulation.pieces.length, startTick: 0 }];
    this.view = {
      params: simulation.params,
      pieces: simulation.pieces.map(p => ({ id: p.id, fixed: p.fixed, materialMass: p.materialMass,
        bonds: p.bonds, supported: true, stress: 0, body: displayBody(p.body) })),
      bonds: simulation.bonds.map(b => ({ id: b.id, a: b.a, b: b.b, broken: false })),
      projectile: displayBody(simulation.projectile),
    };
    this.capture();
  }

  get latestTick() { return this.frames.at(-1)?.tick ?? 0; }
  get duration() { return this.latestTick * REPLAY_TICK; }
  get time() { return this.cursorTick * REPLAY_TICK; }
  get isPast() { return this.cursorTick < this.latestTick; }
  get state() { return this.isPast ? this.view : this.sim; }

  capture() {
    const sim = this.sim;
    if (this.frames.length && sim.ticks === this.latestTick) return;
    const data = new Float32Array((sim.pieces.length + 1) * BODY_STRIDE);
    for (let i = 0; i <= sim.pieces.length; i++) {
      const p = sim.pieces[i], body = p ? p.body : sim.projectile, offset = i * BODY_STRIDE;
      data.set([body.position.x, body.position.y, body.position.z,
        body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        body.velocity.x, body.velocity.y, body.velocity.z,
        body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z, p?.stress ?? 0], offset);
      if (p && this.tracked.length < 7 && !p.supported && body.velocity.length() > 0.8 && !this.tracked.some(t => t.id === p.id)) {
        this.tracked.push({ id: p.id, bodyIndex: i, startTick: sim.ticks });
      }
    }
    const frame = { tick: sim.ticks, data, wallImpulse: sim.wallImpulse, peakImpulse: sim.peakImpulse,
      stepImpulse: sim.stepImpulse, maxStress: sim.maxStress, substeps: sim.substeps,
      history: { time: sim.time, impulse: sim.stepImpulse, broken: sim.brokenCount, detached: sim.detachedCount,
        velocity: sim.projectile.velocity.length(), position: sim.projectile.position.toArray(), velocityVector: sim.projectile.velocity.toArray() } };
    // The last, non-key frame is provisional. Always retain zero and the exact latest tick.
    if (this.frames.length > 1 && this.latestTick % this.stride !== 0) this.frames.pop();
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) {
      this.stride *= 2;
      this.frames = this.frames.filter(f => f.tick % this.stride === 0 || f === frame);
    }
    this.cursorTick = sim.ticks;
    this.revision++;
  }

  seek(tick) {
    this.cursorTick = Math.max(0, Math.min(this.latestTick, Math.round(Number(tick) || 0)));
    if (!this.isPast) return this.sim;
    const { left, right } = this.bracket(this.cursorTick);
    const alpha = left.tick === right.tick ? 0 : (this.cursorTick - left.tick) / (right.tick - left.tick);
    const a = left.data, b = right.data, state = this.view;
    for (let i = 0; i <= state.pieces.length; i++) {
      const piece = state.pieces[i], body = piece ? piece.body : state.projectile, o = i * BODY_STRIDE;
      const value = j => a[o + j] + (b[o + j] - a[o + j]) * alpha;
      body.position.set(value(0), value(1), value(2));
      body.velocity.set(value(7), value(8), value(9));
      body.angularVelocity.set(value(10), value(11), value(12));
      const qa = new Quaternion(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
      const qb = new Quaternion(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
      qa.normalize(); qb.normalize(); qa.slerp(qb, alpha, body.quaternion); body.quaternion.normalize();
      if (piece) piece.stress = a[o + 13];
    }
    Object.assign(state, { time: this.time, ticks: this.cursorTick, launched: this.cursorTick > 0,
      wallImpulse: left.wallImpulse, peakImpulse: left.peakImpulse, stepImpulse: left.stepImpulse,
      maxStress: left.maxStress, substeps: left.substeps, fault: null,
      firstContact: this.sim.firstContact?.time <= this.time + EPSILON ? this.sim.firstContact : null });
    // Preserve all discrete break events even after old poses have been decimated.
    state.brokenCount = 0;
    for (const bond of state.bonds) {
      bond.broken = this.sim.bonds[bond.id].brokenAt <= this.time + EPSILON;
      if (bond.broken) state.brokenCount++;
    }
    const reached = new Set(), queue = [];
    for (const p of state.pieces) if (p.fixed) { reached.add(p.id); queue.push(p.id); }
    while (queue.length) {
      const id = queue.pop();
      for (const bid of state.pieces[id].bonds) {
        const bond = state.bonds[bid]; if (bond.broken) continue;
        const next = bond.a === id ? bond.b : bond.a;
        if (!reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    state.detachedCount = 0;
    for (const p of state.pieces) { p.supported = reached.has(p.id); if (!p.supported) state.detachedCount++; }
    return state;
  }

  bracket(tick) {
    let low = 0, high = this.frames.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.frames[mid].tick <= tick) low = mid; else high = mid - 1;
    }
    const left = this.frames[low];
    return { left, right: left.tick === tick ? left : (this.frames[low + 1] ?? left) };
  }

  step() {
    if (this.isPast) this.seek(this.cursorTick + 1);
    return this.isPast;
  }

  history() {
    if (!this.isPast) return this.sim.history;
    return this.frames.filter(f => f.tick <= this.cursorTick).map(f => f.history);
  }

  // Ordered trail samples stop at the cursor. No future debris or post-impact path leaks backwards.
  trailSamples(maxPoints = 900) {
    const end = this.bracket(this.cursorTick).left;
    const sampleStride = Math.max(2, this.stride), samples = [];
    let index = this.frames.indexOf(end);
    while (index >= 0 && samples.length < maxPoints - 1) {
      const frame = this.frames[index--];
      if (frame.tick % sampleStride === 0) samples.push(frame);
    }
    samples.reverse();
    return this.tracked.map(trail => {
      const points = [];
      for (const frame of samples) if (frame.tick >= trail.startTick) {
        const o = trail.bodyIndex * BODY_STRIDE;
        points.push([frame.data[o], frame.data[o + 1], frame.data[o + 2]]);
      }
      if (this.cursorTick >= trail.startTick && samples.at(-1)?.tick !== this.cursorTick) {
        const body = trail.id === 'ball' ? this.state.projectile : this.state.pieces[trail.id].body;
        points.push(body.position.toArray());
      }
      return { id: trail.id, points };
    });
  }

  snapshot() {
    const s = this.state;
    if (!this.isPast) return this.sim.snapshot();
    return { params: { ...s.params }, time: s.time, fragments: s.pieces.length, bonds: s.bonds.length,
      broken: s.brokenCount, detached: s.detachedCount, firstContact: s.firstContact,
      wallImpulse: s.wallImpulse, peakImpulse: s.peakImpulse,
      projectile: { position: s.projectile.position.toArray(), velocity: s.projectile.velocity.toArray() },
      fault: s.fault, events: this.sim.events.filter(e => e.time <= s.time + EPSILON) };
  }
}
