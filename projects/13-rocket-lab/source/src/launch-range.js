import * as THREE from 'three/webgpu';
import { uniform, positionWorld, normalGeometry, positionGeometry, cameraViewMatrix, uv, sin, cos, vec3, vec4, mix, float, mx_noise_float } from 'three/tsl';
import { rng } from './surfaces.js';
import { clamp } from './physics.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// A fictional desert test range. Reference photos inform scale and engineering
// vocabulary; every mesh, marking and surface is generated locally.
export class LaunchRange {
  constructor(w) {
    this.w = w; this.time = uniform(0); this.water = uniform(0); this.wetness = uniform(0);
    const m = w.materials;
    m.cladding = new THREE.MeshStandardMaterial({ color: '#a2afb1', roughness: 0.71, metalness: 0.30, map: w.maps.steel });
    m.trim = new THREE.MeshStandardMaterial({ color: '#324952', roughness: 0.57, metalness: 0.55 });
    m.insulation = new THREE.MeshStandardMaterial({ color: '#dddcd0', roughness: 0.68, metalness: 0.15 });
    m.earth = new THREE.MeshStandardMaterial({ color: '#92846b', roughness: 1, map: w.maps.sand });
    m.beacon = new THREE.MeshBasicNodeMaterial({ color: '#ff3823' });
    m.beacon.colorNode = vec3(2.8, 0.055, 0.006).mul(sin(this.time.mul(3.2)).smoothstep(0.65, 0.90).mul(0.85).add(0.15));
    this.static = new THREE.Group(); this.static.name = 'Expanded launch range'; w.scene.add(this.static);
    this.roads(); this.lightningProtection(); this.integrationHall(); this.waterTower();
    this.tankFarm(); this.operations(); this.perimeter(); this.apronDetails(); this.waterSystems();
  }

  road(x1, z1, x2, z2, width = 14) {
    const w = this.w, length = Math.hypot(x2 - x1, z2 - z1), angle = Math.atan2(z2 - z1, x2 - x1);
    const road = new THREE.Group(); road.position.set((x1 + x2) / 2, -0.64, (z1 + z2) / 2); road.rotation.y = -angle;
    this.static.add(road);
    w.box(road, length, 0.18, width + 4, 0, -0.13, 0, 'concrete');
    w.box(road, length, 0.12, width, 0, 0, 0, 'road');
    for (const side of [-1, 1]) w.box(road, length, 0.018, 0.14, 0, 0.07, side * (width / 2 - 0.6), 'line');
    for (let x = -length / 2 + 5; x < length / 2 - 5; x += 18) w.box(road, 7, 0.018, 0.18, x, 0.074, 0, 'line');
  }

  roads() {
    const w = this.w, s = this.static;
    w.box(s, 400, 0.35, 480, 0, -0.84, -25, 'concrete');
    for (const x of [-175, 175]) this.road(x, -230, x, 205, 12);
    for (const z of [-230, 205]) this.road(-175, z, 175, z, 12);
    this.road(90, 205, 90, 850, 18); this.road(-175, -160, -390, -500, 22);
    this.road(175, -160, 470, -675, 14); this.road(175, 175, 420, 175, 14);
    // The heavy transporter route has two parallel load-bearing concrete strips.
    for (const x of [-425, -406]) w.box(s, 9, 0.20, 650, x, -0.54, -850, 'pale');
    for (let z = 230; z < 820; z += 45) {
      for (const x of [78, 102]) { w.rod(s, v(x, -0.5, z), v(x, 1.15, z), 0.09, 'shell'); w.box(s, 0.22, 0.18, 0.12, x, 0.95, z + 0.1, 'orange'); }
    }
  }

  lightningProtection() {
    const w = this.w;
    this.masts = [];
    for (const [x, z, height] of [[-88, -94, 100], [85, -96, 94], [-96, 104, 96], [90, 94, 101]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); this.static.add(g); this.masts.push(g);
      w.box(g, 9, 1.1, 9, 0, -0.1, 0, 'concrete');
      const point = (i, y) => { const a = i * Math.PI * 2 / 3, r = 3.2 - y / height * 1.9; return v(Math.cos(a) * r, y, Math.sin(a) * r); };
      for (let y = 1; y < height - 14; y += 6) for (let i = 0; i < 3; i++) {
        const next = Math.min(y + 6, height - 14);
        w.rod(g, point(i, y), point(i, next), 0.14, 'metal');
        w.rod(g, point(i, y), point(i + 1, y), 0.085, 'steel');
        w.rod(g, point(i, y), point(i + 1, next), 0.061, 'steel');
        w.rod(g, point(i + 1, y), point(i, next), 0.061, 'steel');
      }
      w.cylinder(g, 0.48, 0.65, 14, 0, height - 7, 0, 'insulation', 24);
      w.rod(g, v(0, height, 0), v(0, height + 5, 0), 0.075, 'metal');
      w.cylinder(g, 0.23, 0.23, 0.35, 0, height + 0.4, 0, 'beacon', 12);
      const outward = v(x, 0, z).normalize();
      for (const side of [-1, 1]) {
        const end = outward.clone().multiplyScalar(82).add(v(side * outward.z * 35, 0, -side * outward.x * 35));
        const a = v(0, height - 16, 0), b = end.clone().multiplyScalar(0.5); b.y = height * 0.35;
        const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, end), 32, 0.027, 5, false), w.materials.steel);
        g.add(cable); w.box(g, 2.2, 0.7, 2.2, end.x, -0.12, end.z, 'concrete');
      }
    }
  }

  integrationHall() {
    const w = this.w, g = new THREE.Group(); g.position.set(-395, 0, -500); this.static.add(g);
    w.box(g, 215, 0.7, 210, 0, -0.7, 0, 'concrete');
    w.box(g, 92, 78, 112, -32, 38.4, 0, 'cladding');
    w.box(g, 90, 1.2, 110, -32, 78, 0, 'insulation');
    w.box(g, 92, 6, 113, -32, 67, 0, 'trim');
    w.box(g, 92, 1, 113, -32, 16, 0, 'trim');
    w.box(g, 80, 25, 104, 54, 11.9, -4, 'cladding');
    w.box(g, 82, 1, 106, 54, 25, -4, 'insulation');
    for (let x = -76; x < 13; x += 3.0) w.box(g, 0.075, 62, 0.12, x, 32, 56.10, 'metal');
    for (let z = -54; z < 55; z += 3.0) w.box(g, 0.12, 76, 0.075, -78.08, 38, z, 'metal');
    for (const x of [-58, -10]) {
      w.box(g, 33, 58, 0.25, x, 29, 56.2, 'trim');
      w.box(g, 30, 56, 0.28, x, 28.1, 56.38, 'metal');
      for (let y = 3; y < 56; y += 3) w.box(g, 30, 0.075, 0.18, x, y, 56.56, 'dark');
      for (const side of [-1, 1]) w.box(g, 0.8, 58, 0.7, x + side * 16.8, 29, 56.6, 'insulation');
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(47, 8), w.label('A S T R A', 1024, 192, '#e7e7db', '#324952'));
    sign.position.set(-32, 67.2, 56.58); g.add(sign);
    const subtitle = new THREE.Mesh(new THREE.PlaneGeometry(39, 2.2), w.label('FLIGHT VEHICLE INTEGRATION', 1024, 96, '#465761'));
    subtitle.position.set(-32, 74.6, 56.62); g.add(subtitle);
    for (let x = 24; x < 90; x += 9) for (const y of [5, 12, 19]) w.box(g, 6, 2.8, 0.15, x, y, 48.15, 'glass');
    for (let i = 0; i < 6; i++) { w.box(g, 7, 2.4, 10, -64 + i * 13, 80, -30, 'metal'); for (let k = 0; k < 8; k++) w.box(g, 6.6, 0.10, 0.22, -64 + i * 13, 81.3, -34 + k, 'dark'); }
    for (const x of [-83, 19]) for (const z of [-48, 48]) w.rod(g, v(x, 1, z), v(x, 18, z), 0.18, 'metal');
    // Exterior overhead crane and transporter parking bays establish scale.
    for (const x of [-75, 75]) for (const z of [84, 130]) w.box(g, 0.8, 24, 0.8, x, 11.5, z, 'steel');
    for (const z of [84, 130]) w.box(g, 152, 1.4, 1.8, 0, 24, z, 'orange');
    w.box(g, 8, 1.8, 50, 28, 25, 107, 'steel');
    w.rod(g, v(28, 24, 108), v(28, 13, 108), 0.065, 'metal');
    w.box(g, 2.5, 2.5, 1.4, 28, 12, 108, 'orange');
    for (let x = -65; x < 84; x += 18) w.box(g, 0.18, 0.02, 22, x, -0.32, 160, 'line');
  }

  waterTower() {
    const w = this.w, g = new THREE.Group(); g.position.set(157, 0, -157); this.static.add(g);
    w.box(g, 28, 1.0, 28, 0, -0.4, 0, 'concrete');
    for (const x of [-6, 6]) for (const z of [-6, 6]) w.rod(g, v(x, 0, z), v(x * 0.64, 66, z * 0.64), 0.38, 'insulation');
    for (let y = 8; y < 60; y += 12) for (const side of [-1, 1]) {
      w.rod(g, v(-5.5, y, side * 5.5), v(5.5, y + 12, side * 5.5), 0.10, 'steel');
      w.rod(g, v(side * 5.5, y, -5.5), v(side * 5.5, y + 12, 5.5), 0.10, 'steel');
    }
    const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), w.materials.insulation);
    tank.scale.set(13.5, 8.5, 13.5); tank.position.y = 68; tank.castShadow = true; g.add(tank);
    w.cylinder(g, 12.8, 9.2, 5.4, 0, 62.7, 0, 'insulation', 48);
    w.ring(g, 13.52, 0.085, 0, 68, 0, 'metal'); w.ring(g, 11.0, 0.12, 0, 73, 0, 'orange');
    w.rod(g, v(0, 0, 0), v(0, 64, 0), 0.7, 'metal');
    for (const x of [-0.5, 0.5]) w.rod(g, v(x, 1, 6.5), v(x, 64, 6.5), 0.045, 'metal');
    for (let y = 1; y < 63; y += 0.6) w.rod(g, v(-0.5, y, 6.5), v(0.5, y, 6.5), 0.035, 'metal');
    const label = new THREE.Mesh(new THREE.PlaneGeometry(14, 2), w.label('DELUGE  /  W–01', 1024, 128, '#4c666b'));
    label.position.set(0, 69, 13.25); g.add(label);
    // Flanged water main, on concrete sleepers, to the existing pad manifolds.
    w.rod(this.static, v(157, 1, -157), v(24, 1, -157), 0.65, 'metal');
    w.rod(this.static, v(24, 1, -157), v(24, 1, -30), 0.65, 'metal');
    w.rod(this.static, v(24, 1, -30), v(-8, 1, -30), 0.48, 'metal');
    for(const x of [-8,8]) { w.rod(this.static,v(x,1,-30),v(x,1,-26),.30,'metal');w.rod(this.static,v(x,1,-26),v(x,.8,-26),.30,'metal'); }
    for (let z = -151; z < -31; z += 12) {
      w.box(this.static, 2, 1.1, 0.7, 24, -0.05, z, 'concrete');
      const flange = w.cylinder(this.static, 0.85, 0.85, 0.14, 24, 1, z, 'steel', 24); flange.rotation.x = Math.PI / 2;
    }
  }

  tankFarm() {
    const w = this.w, g = new THREE.Group(); g.position.set(-147, 0, -139); this.static.add(g);
    w.box(g, 73, 0.5, 101, 0, -0.5, 0, 'concrete');
    for (let i = 0; i < 3; i++) {
      const z = -32 + i * 31;
      const tank = w.cylinder(g, 5.1, 5.1, 38, 0, 7.0, z, 'insulation', 48); tank.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(5.1, 32, 20), w.materials.insulation); cap.scale.x = 0.36; cap.position.set(side * 19, 7, z); g.add(cap);
        w.box(g, 2, 3, 10, side * 12, 1.4, z, 'concrete');
      }
      for (const x of [-12, 0, 12]) { const band = w.ring(g, 5.13, 0.06, x, 7, z, 'metal'); band.rotation.z = Math.PI / 2; }
      w.rod(g, v(18, 7, z), v(28, 7, z), 0.22, 'metal'); w.rod(g, v(28, 7, z), v(28, 1, z), 0.22, 'metal');
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.2), w.label(i === 1 ? 'LOX  /  CRYOGENIC' : 'GN₂  /  PRESSURANT', 1024, 128, '#59666a'));
      badge.position.set(0, 7.4, z + 5.13); g.add(badge);
    }
    for (const z of [-42, 42]) w.box(g, 77, 0.9, 0.45, 0, 0, z, 'concrete');
    for (const x of [-38, 38]) w.box(g, 0.45, 0.9, 84, x, 0, 0, 'concrete');
    w.rod(this.static, v(-120, 1.1, -139), v(-80, 1.1, -139), 0.25, 'orange');
    w.rod(this.static, v(-80, 1.1, -139), v(-80, 1.1, -50), 0.25, 'orange');
  }

  operations() {
    const w = this.w, g = new THREE.Group(); g.position.set(330, 0, 148); this.static.add(g);
    w.box(g, 130, 0.4, 98, 0, -0.6, 0, 'concrete');
    w.box(g, 90, 14, 40, 0, 6.5, -17, 'cladding'); w.box(g, 94, 0.8, 44, 0, 14, -17, 'trim');
    for (let x = -40; x < 45; x += 6) for (const y of [3.3, 8.8]) w.box(g, 4.4, 2.3, 0.12, x, y, 3.1, 'glass');
    for (let x = -40; x < 44; x += 5) w.box(g, 0.13, 0.02, 14, x, -0.38, 29, 'line');
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.8), w.label('RANGE OPERATIONS', 1024, 128, '#f2e9d6', '#324952'));
    badge.position.set(0, 12, 3.2); g.add(badge);
    for (const x of [-29, 29]) {
      w.cylinder(g, 1.1, 2.2, 6, x, 17.3, -14, 'metal', 20);
      const dish = new THREE.Group(); dish.position.set(x, 21, -14); dish.rotation.x = -0.65; dish.rotation.z = x > 0 ? -0.25 : 0.25; g.add(dish);
      const profile = Array.from({ length: 24 }, (_, i) => { const r = i / 23 * 5.4; return new THREE.Vector2(r, r * r / 15); });
      const reflector = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), new THREE.MeshStandardMaterial({ color: '#d6dace', roughness: 0.4, metalness: 0.45, side: THREE.DoubleSide })); dish.add(reflector);
      for (let a = 0; a < 6.2; a += Math.PI * 2 / 3) w.rod(dish, v(Math.cos(a) * 5.2, 1.8, Math.sin(a) * 5.2), v(0, 4.2, 0), 0.07, 'metal');
      w.cylinder(dish, 0.24, 0.24, 0.8, 0, 4.1, 0, 'dark', 16);
    }
    // Remote empty maintenance pad, beyond the active launch corridor.
    w.cylinder(this.static, 47, 48, 0.35, 440, -0.6, -700, 'concrete', 64);
    w.ring(this.static, 29, 0.2, 440, -0.39, -700, 'pale');
    for (const x of [416, 464]) w.box(this.static, 1.6, 34, 1.6, x, 16.4, -700, 'steel');
    w.box(this.static, 50, 2.4, 3, 440, 34, -700, 'orange');
  }

  perimeter() {
    const w = this.w, g = this.static;
    const fenceTexture = document.createElement('canvas'); fenceTexture.width = fenceTexture.height = 128;
    const c = fenceTexture.getContext('2d'); c.strokeStyle = '#829096'; c.lineWidth = 1.5;
    for (let x = -128; x < 256; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 128, 128); c.moveTo(x, 128); c.lineTo(x + 128, 0); c.stroke(); }
    const map = new THREE.CanvasTexture(fenceTexture); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(3, 1);
    const material = new THREE.MeshStandardMaterial({map, transparent: false, alphaTest: 0.35, roughness: 0.63, metalness: 0.5, side: THREE.DoubleSide});
    const segment = (x, z, angle) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2.5), material); mesh.position.set(x, 0.8, z); mesh.rotation.y = angle; g.add(mesh);
      const dx = Math.cos(angle) * 4, dz = -Math.sin(angle) * 4;
      w.rod(g, v(x + dx, -0.6, z + dz), v(x + dx, 2.3, z + dz), 0.055, 'metal');
      w.rod(g, v(x - dx, 2.12, z - dz), v(x + dx, 2.12, z + dz), 0.032, 'metal');
    };
    for (let x = -208; x < 208; x += 8) { segment(x, -267, 0); if (x < 72 || x > 112) segment(x, 214, 0); }
    for (let z = -263; z < 212; z += 8) { segment(-212, z, Math.PI / 2); segment(212, z, Math.PI / 2); }
    w.box(g, 9, 3.6, 7, 116, 1.3, 216, 'insulation'); w.box(g, 9.5, 0.3, 7.5, 116, 3.25, 216, 'trim');
    w.box(g, 5, 1.1, 0.1, 116, 2, 219.55, 'glass');
    for (const x of [76, 108]) { w.box(g, 0.5, 2.4, 0.5, x, 0.6, 220, 'orange'); w.rod(g, v(x, 1.5, 220), v(90, 1.5, 220), 0.085, 'shell'); }
  }

  apronDetails() {
    const w = this.w, g = this.static;
    // Small drain channels, bolted covers, skid equipment and human-scale markings.
    for (const z of [-114, 118]) for (let x = -132; x < 142; x += 10) {
      w.box(g, 8.8, 0.07, 0.7, x, -0.62, z, 'dark');
      for (let k = -4; k <= 4; k += 0.45) w.box(g, 0.055, 0.03, 0.6, x + k, -0.57, z, 'metal');
    }
    for (let i = 0; i < 8; i++) {
      const x = -124 + (i % 4) * 8, z = 132 + Math.floor(i / 4) * 8;
      w.box(g, 5.4, 2.3, 3.5, x, 0.55, z, i % 2 ? 'trim' : 'insulation');
      w.box(g, 5.7, 0.16, 3.8, x, -0.49, z, 'metal');
      for (let k = -2; k <= 2; k += 0.5) w.box(g, 0.06, 1.8, 0.08, x + k, 0.55, z + 1.8, 'metal');
    }
    for (const x of [-140, 138]) for (let z = -195; z <= 178; z += 64) {
      w.rod(g, v(x, -0.5, z), v(x, 14, z), 0.12, 'metal');
      w.box(g, 3.2, 0.4, 0.8, x, 14, z, 'trim');
      for (const dx of [-0.95, 0.95]) w.box(g, 0.8, 0.1, 0.5, x + dx, 13.76, z, 'lamp');
    }
    const random = rng(9762), geometry = new THREE.IcosahedronGeometry(1, 0);
    const shrubs = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({color: '#686b48', roughness: 1}), 4500), o = new THREE.Object3D();
    for (let i = 0; i < shrubs.count; i++) {
      const a = random() * Math.PI * 2, radius = 260 + random() * 1050;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const roadClear = Math.abs(x - 90) < 19 && z > 190;
      o.position.set(x, -0.96, z); const size = roadClear ? 0 : 0.28 + random() * 0.85;
      o.scale.set(size * 1.3, size * 0.43, size); o.rotation.set(0, random() * 6.28, 0); o.updateMatrix(); shrubs.setMatrixAt(i, o.matrix);
    }
    shrubs.receiveShadow = true; g.add(shrubs);
  }

  waterSystems() {
    const w = this.w;
    this.waterJets = new THREE.Group(); this.waterJets.name = 'Analytic deluge water columns'; w.scene.add(this.waterJets);
    const jetMaterial = new THREE.MeshPhysicalNodeMaterial({color: '#d8e9ee', roughness: 0.2, metalness: 0.08, transparent: true, depthWrite: false, side: THREE.DoubleSide});
    const ripple = sin(uv().x.mul(90).sub(this.time.mul(33))).mul(0.15).add(0.85);
    jetMaterial.opacityNode = this.water.mul(ripple).mul(0.22);
    jetMaterial.positionNode = positionGeometry.add(normalGeometry.mul(sin(uv().x.mul(71).sub(this.time.mul(29))).mul(0.02)));
    for (const sign of [-1, 1]) for (let z = -20; z <= 20; z += 5) {
      const path = new THREE.QuadraticBezierCurve3(v(sign * 6.4, 1.52, z), v(sign * 3.4, 6.0, z), v(sign * 0.8, 0.6, z));
      this.waterJets.add(new THREE.Mesh(new THREE.TubeGeometry(path, 32, 0.085, 7, false), jetMaterial));
    }
    this.wetDeck = new THREE.Mesh(new THREE.RingGeometry(4.6, 26, 96), new THREE.MeshPhysicalNodeMaterial({color: '#43535a', roughness: 0.18, metalness: 0.15, clearcoat: 1, transparent: true, depthWrite: false}));
    const puddles = mx_noise_float(positionWorld.xz.mul(0.32)).mul(0.4).add(0.55).clamp(0, 1);
    this.wetDeck.material.opacityNode = this.wetness.mul(puddles).mul(0.55);
    this.wetDeck.rotation.x = -Math.PI / 2; this.wetDeck.position.y = 0.357; w.scene.add(this.wetDeck);
    // A retention basin and the wet pad share the simulation clock; no real-time animation.
    const g = new THREE.Group(); g.position.set(-138, 0, 162); this.static.add(g);
    w.box(g, 49, 0.3, 36, 0, -0.86, 0, 'concrete');
    for (const x of [-24, 24]) w.box(g, 0.7, 1.7, 36, x, -0.04, 0, 'concrete');
    for (const z of [-18, 18]) w.box(g, 48, 1.7, 0.7, 0, -0.04, z, 'concrete');
    const material = new THREE.MeshPhysicalNodeMaterial({color: '#577b80', metalness: 0.2, roughness: 0.14, clearcoat: 1});
    const waterNormal=vec3(sin(positionWorld.x.mul(1.7).add(this.time.mul(0.85))).mul(0.055), 1, cos(positionWorld.z.mul(1.3).sub(this.time.mul(0.64))).mul(0.055)).normalize();
    material.normalNode = cameraViewMatrix.mul(vec4(waterNormal,0)).xyz;
    this.basin = new THREE.Mesh(new THREE.PlaneGeometry(47.2, 35.2), material); this.basin.rotation.x = -Math.PI / 2; this.basin.position.set(-138, -0.4, 162); w.scene.add(this.basin);
  }

  update(sim) {
    this.time.value = sim.t;
    this.water.value = sim.t > 0.5 && sim.t < 12 ? clamp((sim.t - 0.5) / 0.8, 0, 1) * clamp((12 - sim.t) / 0.55, 0, 1) : 0;
    this.waterJets.visible = this.water.value > 0.001;
    this.wetness.value = clamp((sim.t - 0.5) / 8, 0, 1) * Math.exp(-Math.max(0, sim.t - 14) / 95);
  }
}
