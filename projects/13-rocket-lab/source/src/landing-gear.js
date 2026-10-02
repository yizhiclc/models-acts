import * as THREE from 'three/webgpu';
import { CONSTANTS, clamp } from './physics.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0), Z = v(0, 0, 1);
const HINGE_RADIUS = 2.10, HINGE_Y = -12.80;
const FOOT_RADIUS = 8.7, PAD_HEIGHT = 0.34;
// The circular landing deck is 0.35 m above the physics reference plane.
const DECK_Y = 0.36;
const DROP = CONSTANTS.contactHeight - DECK_Y - PAD_HEIGHT / 2 + HINGE_Y;
const ARM_LENGTH = Math.hypot(FOOT_RADIUS - HINGE_RADIUS, DROP);
const DEPLOY_ANGLE = Math.atan2(FOOT_RADIUS - HINGE_RADIUS, -DROP);
const DEPLOY_SECONDS = 2.8;

function fairingGeometry(length) {
  // A tapered shell over the main spar, with a broad root and a narrow tip.
  const vertices = [];
  for (const x of [-0.085, 0.085]) {
    vertices.push(x, 0.30, -0.46, x, 0.30, 0.46,
      x, length - 0.45, 0.18, x, length - 0.45, -0.18);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6,
    2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function span(mesh, start, end) {
  const direction = end.clone().sub(start);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
}

// Display kinematics only. This mechanism never writes rigid-body attitude,
// forces, fuel or the touchdown verdict; the CPU impulse model supplies settlement.
export class LandingGear {
  constructor(w) {
    this.assemblies = [];
    for (let i = 0; i < 4; i++) {
      const azimuth = Math.PI / 4 + i * Math.PI / 2;
      const root = new THREE.Group(); root.name = `Landing gear ${i + 1}`;
      root.position.set(Math.cos(azimuth) * HINGE_RADIUS, HINGE_Y, Math.sin(azimuth) * HINGE_RADIUS);
      root.rotation.y = -azimuth; w.rocket.add(root);
      const arm = new THREE.Group(); arm.name = 'Upward-stowed main arm'; root.add(arm);
      const pad = new THREE.Group(); pad.name = 'Folding landing shoe';
      pad.position.y = ARM_LENGTH; arm.add(pad);

      w.box(root, 0.20, 0.66, 0.92, -0.12, 0, 0, 'dark');
      const hinge = w.cylinder(root, 0.22, 0.22, 1.05, 0, 0, 0, 'metal', 24);
      hinge.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const cap = w.cylinder(root, 0.125, 0.125, 0.055, 0, 0, side * 0.55, 'metal', 6);
        cap.rotation.x = Math.PI / 2;
      }
      const fairing = new THREE.Mesh(fairingGeometry(ARM_LENGTH), w.materials.shell);
      fairing.castShadow = fairing.receiveShadow = true; arm.add(fairing);
      w.rod(arm, v(0, 0, 0), v(0, ARM_LENGTH, 0), 0.10, 'dark');
      for (const side of [-1, 1]) {
        w.rod(arm, v(0, 0.3, side * 0.47), v(0, ARM_LENGTH - 0.45, side * 0.19), 0.048, 'metal');
      }
      for (let y = 0.65; y < ARM_LENGTH - 0.6; y += 1.15) {
        const width = 0.46 - 0.28 * y / ARM_LENGTH;
        w.box(arm, 0.025, 0.045, width * 2, 0.10, y, 0, 'metal');
        for (const side of [-1, 1]) {
          const bolt = w.cylinder(arm, 0.033, 0.033, 0.026, 0.12, y, side * width * 0.78, 'metal', 6);
          bolt.rotation.z = Math.PI / 2;
        }
      }
      const ankle = w.cylinder(arm, 0.14, 0.14, 0.80, 0, ARM_LENGTH, 0, 'metal', 20);
      ankle.rotation.x = Math.PI / 2;
      w.box(pad, 2.0, PAD_HEIGHT, 1.05, 0, 0, 0, 'dark');
      w.box(pad, 1.85, 0.035, 0.90, 0, 0.185, 0, 'metal');
      for (const x of [-0.72, 0, 0.72]) w.box(pad, 0.08, 0.055, 0.82, x, 0.205, 0, 'metal');
      for (const x of [-0.79, 0.79]) for (const z of [-0.36, 0.36]) {
        w.cylinder(pad, 0.045, 0.045, 0.035, x, 0.215, z, 'metal', 6);
      }

      const braces = [];
      const bracePin = w.cylinder(arm, 0.13, 0.13, 1.28, 0, ARM_LENGTH * 0.70, 0, 'metal', 16);
      bracePin.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const anchor = v(-0.025, 2.15, side * 0.56);
        const attachment = v(0, ARM_LENGTH * 0.70, side * 0.56);
        w.box(root, 0.16, 0.34, 0.22, -0.09, anchor.y, anchor.z, 'metal');
        const segments = [0.105, 0.079, 0.052].map((radius, index) => {
          const mesh = w.cylinder(root, radius, radius, 1, 0, 0, 0, index ? 'metal' : 'dark', 16);
          mesh.name = `Telescopic brace ${side} / stage ${index + 1}`;
          return mesh;
        });
        const collars = [0.122, 0.095].map(radius => w.cylinder(root, radius, radius, 1, 0, 0, 0, 'metal', 16));
        const extended = attachment.clone().applyAxisAngle(Z, -DEPLOY_ANGLE).distanceTo(anchor);
        // Three overlapping fixed-length sleeves, with both ends always on their pins.
        braces.push({ anchor, attachment, segments, collars, sleeveLength: extended / 3 + 0.30 });
      }
      this.assemblies.push({ root, arm, pad, braces, azimuth });
    }
    this.reset();
  }

  batch(batchStatic) {
    let saved = 0;
    for (const { root, arm, pad, braces } of this.assemblies) {
      saved += batchStatic(pad);
      saved += batchStatic(arm, new Set([pad]));
      saved += batchStatic(root, new Set([arm, ...braces.flatMap(b => [...b.segments, ...b.collars])]));
    }
    return saved;
  }

  reset() {
    this.deployedAt = null; this.progress = 0;
    this.update({ t: 0, events: [], touchdown: null, theta: 0, y: CONSTANTS.contactHeight });
  }

  update(sim) {
    // Resolve from the recorded event, even if deterministic stepping skipped rendering
    // the whole deployment interval. Wall-clock time never enters the mechanism.
    if (this.deployedAt === null) this.deployedAt = sim.events.find(e => e.type === 'landing-ignition')?.t ?? null;
    const fraction = this.deployedAt === null ? 0 : clamp((sim.t - this.deployedAt) / DEPLOY_SECONDS, 0, 1);
    this.progress = fraction * fraction * (3 - 2 * fraction);
    for (const gear of this.assemblies) {
      const { root, arm, pad, braces, azimuth } = gear;
      let angle = DEPLOY_ANGLE * this.progress;
      if (sim.touchdown?.success && this.progress === 1) {
        // Keep a rigid main arm: settlement crushes the telescopic support and
        // splays the shoe outwards. Solve its contact plane, including body tilt.
        const attitude=new THREE.Quaternion().fromArray(sim.attitude||[0,0,0,1]);
        const a = UP.clone().applyQuaternion(attitude).y, b = v(Math.cos(azimuth),0,Math.sin(azimuth)).applyQuaternion(attitude).y;
        const target = (DECK_Y + PAD_HEIGHT / 2 - sim.y - HINGE_Y * a - HINGE_RADIUS * b) / ARM_LENGTH;
        angle = Math.acos(clamp(target / Math.hypot(a, b), -1, 1)) + Math.atan2(b, a);
      }
      arm.rotation.z = -angle;
      // The pad folds edge-on against the hull and is horizontal when extended.
      pad.rotation.set(0, 0, angle + (1 - this.progress) * Math.PI / 2);
      if (sim.touchdown?.success && this.progress === 1) {
        const bodyRotation = new THREE.Quaternion().fromArray(sim.attitude||[0,0,0,1]);
        pad.quaternion.copy(arm.quaternion).invert()
          .multiply(root.quaternion.clone().invert()).multiply(bodyRotation.invert()).multiply(root.quaternion);
      }
      for (const brace of braces) {
        const tip = brace.attachment.clone().applyQuaternion(arm.quaternion);
        const direction = tip.clone().sub(brace.anchor), length = direction.length();
        direction.normalize();
        const sleeve = Math.min(brace.sleeveLength, length);
        const at = distance => brace.anchor.clone().addScaledVector(direction, distance);
        for (let i = 0; i < 3; i++) {
          const start = (length - sleeve) * i / 2;
          span(brace.segments[i], at(start), at(start + sleeve));
          if (i < 2) span(brace.collars[i], at(start + sleeve - 0.065), at(start + sleeve));
        }
      }
    }
  }
}
