import * as CANNON from 'cannon-es';
import { partition3D } from './geometry.js';
import { installSphereContact } from './contact.js';
import { installCoulombFriction } from './solver.js';
import { cacheConvexCollision } from './collision-cache.js';

export const WALL = Object.freeze({ width: 6.4, height: 3.8, base: 0.18, density: 1750 });
export const DEFAULTS = Object.freeze({ radius: 0.42, mass: 250, speed: 12, hitX: 0, hitY: 2.15, thickness: 0.3, strength: 1.6, seed: 42 });
export const LIMITS = { radius: [0.16, 0.85], mass: [50, 2400], speed: [2, 42], hitX: [-5, 5], hitY: [0.5, 5.2], thickness: [0.16, 0.7], strength: [0.18, 4], seed: [1, 99999] };
export const PRESETS = {
  local: { ...DEFAULTS },
  gentle: { ...DEFAULTS, mass: 80, speed: 3, strength: 3.8 },
  miss: { ...DEFAULTS, hitX: 4.6 },
  through: { ...DEFAULTS, mass: 1600, speed: 32, thickness: 0.22, strength: 0.45 },
  collapse: { ...DEFAULTS, radius: 0.75, mass: 2100, speed: 30, hitY: 1.05, thickness: 0.24, strength: 0.25 },
};

export function cleanParams(input) {
  const p = { ...DEFAULTS };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(input[key] ?? p[key]);
    if (!Number.isFinite(value)) throw new Error(`参数 ${key} 不是有限数值`);
    p[key] = Math.max(min, Math.min(max, value));
  }
  p.seed = Math.round(p.seed);
  return p;
}

export class Simulation {
  constructor(input = {}) {
    this.params = cleanParams(input);
    this.layout = partition3D(this.params.seed, WALL, this.params.thickness);
    this.time = 0;
    this.ticks = 0;
    this.launched = false;
    this.brokenCount = 0;
    this.detachedCount = 0;
    this.events = [];
    this.firstContact = null;
    this.wallImpulse = 0;
    this.stepImpulse = 0;
    this.peakImpulse = 0;
    this.contactCount = 0;
    this.maxStress = 0;
    this.substeps = 1;
    this.fault = null;
    this.history = [];
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
    installCoulombFriction(this.world);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.broadphase.useBoundingBoxes = true;
    this.world.broadphase.axisIndex = 0;
    this.world.solver.iterations = 22;
    this.world.solver.tolerance = 1e-6;
    const material = new CANNON.Material('solid');
    this.world.defaultContactMaterial.friction = 0.62;
    this.world.defaultContactMaterial.restitution = 0.025;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e9;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;
    this.world.defaultContactMaterial.frictionEquationStiffness = 1e8;
    const ground = new CANNON.Body({ mass: 0, material, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.updateAABB();
    ground.kind = 'ground';
    this.world.addBody(ground);
    const base = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(new CANNON.Vec3(WALL.width / 2 + 0.14, WALL.base / 2, this.params.thickness / 2 + 0.13)) });
    cacheConvexCollision(base.shapes[0].convexPolyhedronRepresentation);
    base.position.set(0, WALL.base / 2, 0); base.updateAABB(); base.kind = 'base'; this.world.addBody(base);
    this.pieces = this.layout.cells.map(cell => {
      const geometry = { vertices: cell.localVertices.map(v => new CANNON.Vec3(...v)), faces: cell.faces };
      const shape = new CANNON.ConvexPolyhedron({ vertices: geometry.vertices.map(v => v.scale(0.9995)), faces: geometry.faces });
      cacheConvexCollision(shape);
      const materialMass = cell.volume * WALL.density;
      const body = new CANNON.Body({ mass: cell.fixed ? 0 : materialMass,
        material, shape, position: new CANNON.Vec3(cell.cx, cell.cy, cell.cz), quaternion: new CANNON.Quaternion(...cell.rotation),
        linearDamping: 0.055, angularDamping: 0.13, allowSleep: false });
      // Exact uniform-polyhedron principal moments, replacing the engine's bounding-box estimate.
      if (!cell.fixed) {
        body.inertia.set(...cell.moments.map(v => v * materialMass));
        body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
        body.updateInertiaWorld(true);
      }
      body.kind = 'wall'; body.pieceId = cell.id;
      body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.8;
      this.world.addBody(body);
      const piece = { ...cell, geometry, body, materialMass, supported: true, stress: 0, bonds: [], neighborBonds: new Map() };
      shape.wallData = { piece, simulation: this };
      return piece;
    });
    this.bonds = [];
    for (const edge of this.layout.edges) {
      const a = this.pieces[edge.a], b = this.pieces[edge.b];
      if (a.fixed && b.fixed) continue;
      const constraint = new CANNON.LockConstraint(a.body, b.body, { maxForce: 1e9 });
      // Transmit traction at the shared face, not the midpoint of fragment centres.
      const pivot = new CANNON.Vec3(...edge.midpoint);
      a.body.pointToLocalFrame(pivot, constraint.pivotA);
      b.body.pointToLocalFrame(pivot, constraint.pivotB);
      constraint.collideConnected = false;
      const area = edge.area;
      const forceLimit = this.params.strength * 1e6 * area;
      // Actual 3D shared-face area moments define stiffness and capacity along z, x, y.
      // Small faces are naturally compliant; they cannot attract artificial rigid-joint loads.
      const E = 8e8;
      const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz);
      const momentLimits = edge.sectionModuli.map(v => this.params.strength * 1e6 * v);
      const stiffnesses = [E * area / distance, E * area / distance, E * area / distance,
        ...edge.sectionMoments.map(v => E * v / distance)];
      const normalA = a.body.shapes[0].faceNormals[a.faceNeighbors.indexOf(b.id)].clone();
      const bond = { ...edge, id: this.bonds.length, constraint, forceLimit, momentLimits, stiffnesses, normalA, broken: false, ratio: 0 };
      a.bonds.push(bond.id); b.bonds.push(bond.id); this.bonds.push(bond);
      a.neighborBonds.set(b.id, bond.id); b.neighborBonds.set(a.id, bond.id);
      this.world.addConstraint(constraint);
    }
    const launchDistance = Math.min(4.4, Math.max(1.1, this.params.speed * 0.25));
    this.flightTime = launchDistance / this.params.speed;
    this.launchZ = this.params.thickness / 2 + this.params.radius + launchDistance;
    this.launchHeight = this.params.hitY + 0.5 * 9.81 * this.flightTime ** 2;
    this.projectile = new CANNON.Body({ mass: this.params.mass, material, shape: new CANNON.Sphere(this.params.radius),
      position: new CANNON.Vec3(this.params.hitX, this.launchHeight, this.launchZ), linearDamping: 0.002, angularDamping: 0.08, allowSleep: true });
    this.projectile.kind = 'projectile'; this.projectile.sleepSpeedLimit = 0.08;
    this.world.addBody(this.projectile);
    installSphereContact(this.world);
    this.lastDt = 0;
    this.record();
  }

  launch() {
    if (this.launched) return;
    this.launched = true;
    // Horizontal launch from a calculated height. There is no artificial upward launch velocity.
    this.projectile.velocity.set(0, 0, -this.params.speed);
    this.projectile.wakeUp();
  }

  configureStep(dt) {
    const changed = dt !== this.lastDt;
    this.lastDt = dt;
    for (const bond of this.bonds) if (!bond.broken) {
      const n = this.pieces[bond.a].body.quaternion.vmult(bond.normalA).toArray();
      bond.constraint.equations.forEach((eq, index) => {
        if (changed) eq.setSpookParams(bond.stiffnesses[index], 4, dt);
        // cannon-es 0.20 clamps lambda (impulse), despite the maxForce field name.
        // Bound the traction during the very step that breaks the bond: no unlimited pre-break rebound.
        eq.maxForce = (index < 3 ? bond.forceLimit * (1.5 + 9 * Math.max(0, n[index])) : bond.momentLimits[index - 3]) * dt;
        eq.minForce = -(index < 3 ? bond.forceLimit * (1.5 + 9 * Math.max(0, -n[index])) : bond.momentLimits[index - 3]) * dt;
      });
    }
  }

  advance() {
    if (!this.launched || this.fault) return;
    const tick = 1 / 120;
    const speed = this.relativeContactSpeed(tick);
    const clearance = Math.min(this.params.thickness, this.params.radius, 0.22) * 0.32;
    this.substeps = Math.max(2, Math.ceil(speed * tick / clearance));
    // Work is slowed, never converted to a bigger dt. The public parameter range stays far below this safety stop.
    if (this.substeps > 80) { this.fault = '速度超出数值稳定范围，已暂停。请重置。'; return; }
    const dt = tick / this.substeps;
    this.configureStep(dt);
    this.stepImpulse = 0;
    for (let sub = 0; sub < this.substeps; sub++) this.substep(dt);
    this.ticks++;
    this.time = this.ticks * tick;
    this.peakImpulse = Math.max(this.peakImpulse, this.stepImpulse);
    this.record();
  }

  relativeContactSpeed(tick) {
    // Conservative swept-AABB candidates. Distant airborne rubble must not force the
    // whole wall to use a tiny step; relative speed matters only for possible contacts.
    const bodies = this.world.bodies.filter(b => b.kind !== 'ground');
    const motion = bodies.map(b => {
      if (b.aabbNeedsUpdate) b.updateAABB();
      const spin = b.angularVelocity.length() * b.boundingRadius;
      return { b, spin, dx: (Math.abs(b.velocity.x) + spin) * tick + 0.005,
        dy: (Math.abs(b.velocity.y) + spin) * tick + 0.005,
        dz: (Math.abs(b.velocity.z) + spin) * tick + 0.005 };
    });
    let speed = 0;
    for (let i = 0; i < motion.length; i++) {
      const a = motion[i], ba = a.b, aa = ba.aabb;
      if (ba.mass && aa.lowerBound.y - a.dy <= 0) speed = Math.max(speed, ba.velocity.length() + a.spin);
      for (let j = i + 1; j < motion.length; j++) {
        const b = motion[j], bb = b.b, ab = bb.aabb;
        if (!ba.mass && !bb.mass) continue;
        if (aa.upperBound.x + a.dx < ab.lowerBound.x - b.dx || ab.upperBound.x + b.dx < aa.lowerBound.x - a.dx ||
          aa.upperBound.y + a.dy < ab.lowerBound.y - b.dy || ab.upperBound.y + b.dy < aa.lowerBound.y - a.dy ||
          aa.upperBound.z + a.dz < ab.lowerBound.z - b.dz || ab.upperBound.z + b.dz < aa.lowerBound.z - a.dz) continue;
        if (ba.kind === 'wall' && bb.kind === 'wall') {
          const bondId = this.pieces[ba.pieceId].neighborBonds.get(bb.pieceId);
          if (bondId !== undefined && !this.bonds[bondId].broken) continue;
        }
        const va = ba.velocity, vb = bb.velocity;
        speed = Math.max(speed, Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z) + a.spin + b.spin);
      }
    }
    return speed;
  }

  substep(dt) {
    const incomingVelocity = this.projectile.velocity.toArray();
    this.world.step(dt);
    let contactImpulse = 0;
    for (const contact of this.world.contacts) {
      let wallBody, point;
      if (contact.bi === this.projectile && contact.bj.kind === 'wall') {
        wallBody = contact.bj; point = contact.bj.position.vadd(contact.rj);
      } else if (contact.bj === this.projectile && contact.bi.kind === 'wall') {
        wallBody = contact.bi; point = contact.bi.position.vadd(contact.ri);
      }
      if (!wallBody) continue;
      const impulse = Math.max(0, contact.multiplier * dt);
      if (impulse < 1e-6) continue;
      contactImpulse += impulse; this.contactCount++;
      if (!this.firstContact) {
        const direction = contact.bi === this.projectile ? 1 : -1;
        this.firstContact = { time: this.world.time, point: [point.x, point.y, point.z], pieceId: wallBody.pieceId,
          incomingVelocity, normal: contact.ni.toArray().map(v => v * direction) };
        this.events.push({ type: 'contact', ...this.firstContact });
      }
    }
    this.wallImpulse += contactImpulse; this.stepImpulse += contactImpulse;
    const broken = [];
    this.maxStress = 0;
    for (const piece of this.pieces) piece.stress = 0;
    for (const bond of this.bonds) if (!bond.broken) {
      const eq = bond.constraint.equations;
      const normal = this.pieces[bond.a].body.quaternion.vmult(bond.normalA);
      const fx = eq[0].multiplier, fy = eq[1].multiplier, fz = eq[2].multiplier;
      // Positive reaction on B along the A->B face normal is compression.
      const normalForce = fx * normal.x + fy * normal.y + fz * normal.z;
      const compression = Math.max(0, normalForce), tension = Math.max(0, -normalForce);
      const shear = Math.sqrt(Math.max(0, fx * fx + fy * fy + fz * fz - normalForce * normalForce)) /
        (1.5 * bond.forceLimit + 0.55 * compression);
      const bend = Math.hypot(...eq.slice(3).map((e, i) => e.multiplier / bond.momentLimits[i]));
      const opening = Math.max(0, bend + (tension - compression) / bond.forceLimit);
      bond.ratio = Math.hypot(shear, opening, compression / (10 * bond.forceLimit));
      this.maxStress = Math.max(this.maxStress, bond.ratio);
      this.pieces[bond.a].stress = Math.max(this.pieces[bond.a].stress, bond.ratio);
      this.pieces[bond.b].stress = Math.max(this.pieces[bond.b].stress, bond.ratio);
      if (bond.ratio >= 0.998) broken.push(bond);
    }
    // All decisions use the same solved state. No distance-to-impact filter, timers, or scripted removal.
    for (const bond of broken) {
      bond.broken = true; bond.brokenAt = this.world.time; this.brokenCount++;
      this.world.removeConstraint(bond.constraint);
      this.pieces[bond.a].body.wakeUp(); this.pieces[bond.b].body.wakeUp();
      this.events.push({ type: 'break', time: this.world.time, bond: bond.id,
        point: [...bond.midpoint], stressRatio: bond.ratio, contactImpulse });
    }
    if (broken.length) this.updateSupport();
    for (const body of this.world.bodies) {
      if (!Number.isFinite(body.position.x + body.position.y + body.position.z + body.velocity.lengthSquared())) {
        this.fault = '检测到非有限物理状态，已暂停。请重置。'; break;
      }
    }
  }

  updateSupport() {
    const reached = new Set(), stack = [];
    for (const p of this.pieces) if (p.fixed) { reached.add(p.id); stack.push(p.id); }
    while (stack.length) {
      const id = stack.pop();
      for (const bid of this.pieces[id].bonds) {
        const bond = this.bonds[bid]; if (bond.broken) continue;
        const next = bond.a === id ? bond.b : bond.a;
        if (!reached.has(next)) { reached.add(next); stack.push(next); }
      }
    }
    this.detachedCount = 0;
    for (const p of this.pieces) {
      p.supported = reached.has(p.id);
      // Only independent rubble sleeps. Connected fragments continue transmitting gravity and impacts.
      p.body.allowSleep = !p.supported && p.bonds.every(b => this.bonds[b].broken);
      if (!p.supported) this.detachedCount++;
    }
  }

  record() {
    this.history.push({ time: this.time, impulse: this.stepImpulse, broken: this.brokenCount,
      detached: this.detachedCount, velocity: this.projectile.velocity.length(),
      position: this.projectile.position.toArray(), velocityVector: this.projectile.velocity.toArray() });
    if (this.history.length > 7200) this.history.shift();
  }

  snapshot() {
    return { params: { ...this.params }, time: this.time, fragments: this.pieces.length, bonds: this.bonds.length,
      broken: this.brokenCount, detached: this.detachedCount, firstContact: this.firstContact,
      wallImpulse: this.wallImpulse, peakImpulse: this.peakImpulse,
      projectile: { position: this.projectile.position.toArray(), velocity: this.projectile.velocity.toArray() },
      fault: this.fault, events: this.events.slice() };
  }
}
