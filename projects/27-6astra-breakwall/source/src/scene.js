import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WALL } from './physics.js';

function concreteTexture() {
  const size = 192, data = new Uint8Array(size * size * 4);
  let v = 9481;
  for (let i = 0; i < size * size; i++) {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
    const g = 205 + (v >>> 26) * 0.7;
    data.set([g, g, g, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function cellMeshGeometry(piece, thickness) {
  const pos = [], normals = [], uvs = [], geometry = new THREE.BufferGeometry();
  const { vertices, faces } = piece.geometry;
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const face = faces[faceIndex], start = pos.length / 3;
    for (let k = 1; k < face.length - 1; k++) {
      const tri = [vertices[face[0]], vertices[face[k]], vertices[face[k + 1]]];
      const ab = new THREE.Vector3().subVectors(tri[1], tri[0]);
      const ac = new THREE.Vector3().subVectors(tri[2], tri[0]);
      const normal = ab.cross(ac).normalize();
      for (let ti = 0; ti < tri.length; ti++) {
        const v = tri[ti];
        pos.push(v.x, v.y, v.z); normals.push(normal.x, normal.y, normal.z);
        const wi = face[ti === 0 ? 0 : k + ti - 1], wv = piece.worldVertices[wi];
        if (piece.faceKinds[faceIndex] === 0) uvs.push(wv[0] * 1.8, wv[1] * 1.8);
        else uvs.push((wv[0] + wv[2] * 0.8) * 4, (wv[1] + wv[2] * 0.6) * 4);
      }
    }
    geometry.addGroup(start, pos.length / 3 - start, piece.faceKinds[faceIndex]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

function labelSprite(text, color = '#9cb7c5', size = 0.22) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.font = '500 36px "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(size * 512 / 96, size, 1);
  return sprite;
}

export class SceneView {
  constructor(element, select) {
    this.element = element; this.select = select; this.meshes = []; this.dynamic = new THREE.Group();
    this.stress = false; this.showEdges = false; this.showTrails = true; this.trails = new Map();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    element.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#22323e');
    this.scene.fog = new THREE.Fog('#22323e', 20, 56);
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.06, 130);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.085;
    this.controls.minDistance = 1.3; this.controls.maxDistance = 36;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.target.set(0, 1.5, 0.4);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.scene.add(new THREE.HemisphereLight('#d6edf3', '#293138', 2.1));
    const key = new THREE.DirectionalLight('#fff3de', 4.0); key.position.set(-4, 10, 7); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -9; key.shadow.camera.right = 9;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -9; key.shadow.camera.far = 35;
    key.shadow.normalBias = 0.025; key.shadow.bias = -0.00015; key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#83b8d2', 2.5); rim.position.set(5, 6, -7); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ color: '#223440', roughness: 0.91, metalness: 0.08 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.006; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(60, 60, '#435562', '#344953'); grid.position.y = 0.002;
    grid.material.transparent = true; grid.material.opacity = 0.3; grid.material.depthWrite = false; this.scene.add(grid);
    const fineGrid = new THREE.GridHelper(14, 28, '#435c68', '#3b535f'); fineGrid.position.y = 0.004;
    fineGrid.material.transparent = true; fineGrid.material.opacity = 0.25; fineGrid.material.depthWrite = false; this.scene.add(fineGrid);
    const origin = new THREE.AxesHelper(0.65); origin.position.set(-4.2, 0.018, 0); origin.material.transparent = true; origin.material.opacity = 0.6; this.scene.add(origin);
    this.scene.add(this.dynamic);
    this.texture = concreteTexture();
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2(); this.pointerStart = null;
    this.renderer.domElement.addEventListener('pointerdown', e => this.pointerStart = [e.clientX, e.clientY]);
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (e.button !== 0 || !this.pointerStart || Math.hypot(e.clientX - this.pointerStart[0], e.clientY - this.pointerStart[1]) > 4) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.set(2 * (e.clientX - rect.left) / rect.width - 1, 1 - 2 * (e.clientY - rect.top) / rect.height);
      this.ray.setFromCamera(this.mouse, this.camera);
      const hit = this.ray.intersectObjects([...this.meshes, this.ball], false)[0];
      this.selected = hit ? hit.object.userData.id : null; this.select(this.selected);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(element);
    this.setView('perspective');
  }

  resize() {
    const w = this.element.clientWidth, h = this.element.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  clear() {
    this.dynamic.traverse(obj => {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) if (mat) {
        if (mat.map && mat.map !== this.texture) mat.map.dispose();
        mat.dispose();
      }
    });
    this.dynamic.clear(); this.meshes = []; this.trails.clear(); this.selected = null; this.lastTick = -1;
  }

  load(sim, timeline) {
    this.clear(); this.sim = sim; this.timeline = timeline;
    sim.pieces.forEach(piece => {
      const face = new THREE.MeshStandardMaterial({ color: '#c8d3d0', roughness: 0.93,
        map: this.texture, bumpMap: this.texture, bumpScale: 0.006 });
      const side = new THREE.MeshStandardMaterial({ color: '#97a4a1', roughness: 1, map: this.texture, bumpMap: this.texture, bumpScale: 0.05 });
      const mesh = new THREE.Mesh(cellMeshGeometry(piece, sim.params.thickness), [face, side]);
      mesh.userData = { id: piece.id, color: face.color.clone() }; mesh.castShadow = true; mesh.receiveShadow = true;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 18), new THREE.LineBasicMaterial({ color: '#273f4b', transparent: true, opacity: 0.33 }));
      edge.visible = this.showEdges; mesh.add(edge); mesh.userData.edge = edge;
      this.meshes.push(mesh); this.dynamic.add(mesh);
    });
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(WALL.width + 0.28, WALL.base, sim.params.thickness + 0.26),
      new THREE.MeshStandardMaterial({ color: '#728387', roughness: 0.54, metalness: 0.5 }));
    foundation.position.y = WALL.base / 2; foundation.castShadow = true; foundation.receiveShadow = true; this.dynamic.add(foundation);
    const boltGeometry = new THREE.CylinderGeometry(0.033, 0.033, 0.015, 6);
    const boltMaterial = new THREE.MeshStandardMaterial({ color: '#bcc7c8', metalness: 0.8, roughness: 0.28 });
    for (let x = -3; x <= 3.01; x += 0.6) for (const sign of [-1, 1]) {
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial); bolt.position.set(x, WALL.base + 0.009, sign * (sim.params.thickness / 2 + 0.07));
      this.dynamic.add(bolt);
    }
    const radius = sim.params.radius;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshStandardMaterial({ color: '#b86735', metalness: 0.76, roughness: 0.29 }));
    this.ball.castShadow = true; this.ball.receiveShadow = true;
    this.ball.userData.id = 'projectile';
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.998, radius * 0.017, 8, 64), new THREE.MeshStandardMaterial({ color: '#edc294', metalness: 0.72, roughness: 0.3 }));
    band.rotation.x = Math.PI / 2; this.ball.add(band);
    this.dynamic.add(this.ball);
    this.target = new THREE.Group();
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 80 }, (_, k) => new THREE.Vector3(Math.cos(k / 80 * Math.PI * 2) * radius, Math.sin(k / 80 * Math.PI * 2) * radius, 0))),
      new THREE.LineBasicMaterial({ color: '#ffbf79', transparent: true, opacity: 0.75 }));
    this.target.add(ring);
    const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, 0, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.12, 0)]), new THREE.LineBasicMaterial({ color: '#ffcf99' }));
    this.target.add(cross); this.target.position.set(sim.params.hitX, sim.params.hitY, sim.params.thickness / 2 + 0.017); this.dynamic.add(this.target);
    const trajectory = [];
    const duration = sim.flightTime;
    for (let i = 0; i <= 40; i++) {
      const t = duration * i / 40;
      trajectory.push(new THREE.Vector3(sim.params.hitX, sim.launchHeight - 0.5 * 9.81 * t * t, sim.launchZ - sim.params.speed * t));
    }
    this.aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trajectory), new THREE.LineDashedMaterial({ color: '#ddb078', dashSize: 0.1, gapSize: 0.13, transparent: true, opacity: 0.37 }));
    this.aimLine.computeLineDistances(); this.dynamic.add(this.aimLine);
    const widthLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3.2, 0.019, 0.92), new THREE.Vector3(3.2, 0.019, 0.92),
      new THREE.Vector3(-3.2, 0.019, 0.8), new THREE.Vector3(-3.2, 0.019, 1.04),
      new THREE.Vector3(3.2, 0.019, 0.8), new THREE.Vector3(3.2, 0.019, 1.04)]), new THREE.LineBasicMaterial({ color: '#799dab', transparent: true, opacity: 0.5 }));
    this.dynamic.add(widthLine);
    const dimension = labelSprite('6.40 m'); dimension.position.set(0, 0.055, 1.1); this.dynamic.add(dimension);
    const fixedLabel = labelSprite('FIXED BASE', '#6f96a7', 0.17); fixedLabel.position.set(3.2, 0.2, 0.65); this.dynamic.add(fixedLabel);
    this.contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd498' }));
    this.contactMarker.visible = false; this.dynamic.add(this.contactMarker);
    this.addTrail('ball', '#e5b27a', 0.6);
    this.sync();
  }

  addTrail(id, color, opacity) {
    const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(900 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    line.frustumCulled = false; this.trails.set(id, { positions, count: 0, line }); this.dynamic.add(line);
  }

  syncTrails() {
    if (!this.timeline || this.timeline.cursorTick === this.lastTick) return;
    this.lastTick = this.timeline.cursorTick;
    for (const { id, points } of this.timeline.trailSamples()) {
      if (!this.trails.has(id)) this.addTrail(id, '#83bcb5', 0.43);
      const trail = this.trails.get(id);
      trail.count = points.length;
      for (let i = 0; i < points.length; i++) trail.positions.set(points[i], i * 3);
      trail.line.geometry.attributes.position.needsUpdate = true;
      trail.line.geometry.setDrawRange(0, trail.count);
    }
  }

  sync() {
    const sim = this.timeline?.state ?? this.sim; if (!sim) return;
    this.syncTrails();
    this.meshes.forEach((mesh, id) => {
      const p = sim.pieces[id]; mesh.position.copy(p.body.position); mesh.quaternion.copy(p.body.quaternion);
      const mat = mesh.material[0];
      if (this.stress) {
        const ratio = Math.min(p.stress, 1);
        mat.color.setHSL(0.5 - ratio * 0.45, 0.32 + ratio * 0.32, 0.55);
        if (!p.supported && p.bonds.every(b => sim.bonds[b].broken)) mat.color.set('#72858b');
      } else mat.color.copy(mesh.userData.color);
      mat.emissive.set(this.selected === id ? '#735023' : '#000000');
      mat.emissiveIntensity = this.selected === id ? 0.55 : 0;
      mesh.userData.edge.visible = this.showEdges || this.selected === id;
    });
    this.ball.position.copy(sim.projectile.position); this.ball.quaternion.copy(sim.projectile.quaternion);
    this.target.visible = !sim.firstContact;
    this.aimLine.visible = !sim.launched && this.showTrails;
    for (const trail of this.trails.values()) trail.line.visible = this.showTrails;
    if (sim.firstContact) { this.contactMarker.position.fromArray(sim.firstContact.point); this.contactMarker.visible = this.showTrails; }
    else this.contactMarker.visible = false;
  }

  setView(mode) {
    const mobile = this.element.clientWidth < 650;
    this.controls.target.set(0, 1.55, 0.6);
    if (mode === 'front') this.camera.position.set(0, 2.7, mobile ? 15.4 : 14.5);
    else if (mode === 'side') this.camera.position.set(mobile ? 15.3 : 13.8, 4.5, 0.3);
    else this.camera.position.set(mobile ? 9.6 : 8.3, mobile ? 6.4 : 5.4, mobile ? 12.3 : 10.8);
    this.controls.update();
  }

  render() { this.sync(); this.controls.update(); this.renderer.render(this.scene, this.camera); }
}
