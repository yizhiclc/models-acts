import * as THREE from 'three';
import { RiverReflection } from './river-reflection.js';
import { Voxels, random } from './voxels.js';
import { WATER, LAND, bankAt } from './landscape.js';

const waterShader = {
  uniforms: {
    color: { value: new THREE.Color('#709a90') },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uDusk: { value: 1 },
    uNight: { value: 0 },
    uWarm: { value: new THREE.Color('#edc193') },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vMirror;
    varying vec3 vWorld;
    void main() {
      vMirror = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform vec3 uWarm;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDusk;
    uniform float uNight;
    varying vec4 vMirror;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 world = vWorld.xz;
      vec2 cell = floor(world * vec2(0.74, 2.15));
      float n = hash(cell);
      vec2 uv = vMirror.xy / vMirror.w;
      float wave = sin(world.y * 1.8 + uTime * 0.56) * 0.00085;
      wave += sin(world.y * 4.0 - uTime * 0.33 + world.x * 0.2) * 0.0005;
      uv.x += wave;
      uv.y += sin(world.x * 1.2 + uTime * 0.5) * 0.00035;
      vec3 reflected = texture2D(tDiffuse, uv).rgb;
      float depth = smoothstep(-36.0, 40.0, world.y);
      vec3 base = mix(color * 1.09, color * 0.83, depth);
      vec3 result = mix(base, reflected, 0.49);
      float shimmer = step(0.87, n) * (0.55 + 0.45 * sin(uTime * 0.65 + n * 21.0));
      vec2 local = fract(world * vec2(0.74, 2.15));
      shimmer *= step(0.14, local.x) * step(local.x, 0.9) * step(0.58, local.y) * step(local.y, 0.8);
      result += vec3(0.18, 0.21, 0.18) * shimmer * (1.0 - uNight * 0.65);
      // Broken ribbons of sunset light, aligned with the westward river.
      float ribbon = exp(-pow((world.x + 34.0 + world.y * 0.11) / (7.0 + depth * 5.0), 2.0));
      float glint = step(0.53, hash(vec2(cell.y, 7.0))) * step(0.47, local.y) * step(local.y, 0.7);
      result = mix(result, uWarm, ribbon * (0.10 + glint * 0.20) * uDusk * (1.0 - uNight));
      gl_FragColor = vec4(result, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

const TIMES = [
  { hour: 15, top: '#a9c3cb', middle: '#cedbd0', bottom: '#e4ddc3', sun: '#fff2c4', water: '#77a59b', key: '#fff0cf', power: 3.0, hemi: 2.6 },
  { hour: 17.67, top: '#b2b3c5', middle: '#efbd9d', bottom: '#e6d7b6', sun: '#ffe5a0', water: '#659d9c', key: '#ffd09c', power: 3.1, hemi: 1.65 },
  { hour: 18.5, top: '#7d839f', middle: '#d4a293', bottom: '#c8b9a8', sun: '#f4b077', water: '#678b89', key: '#ecad86', power: 1.7, hemi: 1.9 },
  { hour: 20, top: '#172d41', middle: '#4a5c72', bottom: '#8b999b', sun: '#dce4d6', water: '#355568', key: '#8cabc9', power: 0.3, hemi: 1.7 },
];

function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
function cssColor(color) { return `#${color.getHexString()}`; }

export function createAtmosphere(scene, renderer) {
  const gradient = document.createElement('canvas');
  gradient.width = 32;
  gradient.height = 512;
  const ctx = gradient.getContext('2d');
  const background = new THREE.CanvasTexture(gradient);
  background.colorSpace = THREE.SRGBColorSpace;
  scene.background = background;
  scene.fog = new THREE.Fog('#e9c7a8', 125, 280);

  const hemi = new THREE.HemisphereLight('#e0eced', '#aa927b', 2.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffd09c', 3.5);
  key.position.set(-43, 55, 28);
  key.target.position.set(0, 1, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -87, right: 87, top: 81, bottom: -77, near: 1, far: 205 });
  key.shadow.bias = -0.00023;
  key.shadow.normalBias = 0.11;
  key.shadow.radius = 2.3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#cbdde5', 0.9);
  fill.position.set(34, 30, -38);
  scene.add(fill);

  const warmLights = [[5, 8, 0], [5, 16, -3], [5, 24, -4], [-1, 3, 14], [11, 3, 14]].map(([x, y, z]) => {
    const light = new THREE.PointLight('#ffa855', 0, 11, 2);
    light.position.set(x, y, z);
    scene.add(light);
    return light;
  });

  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = sunCanvas.height = 48;
  const sunCtx = sunCanvas.getContext('2d');
  sunCtx.fillStyle = '#ffffff';
  for (let x = 0; x < 24; x++) for (let y = 0; y < 24; y++) {
    if ((x - 11.5) ** 2 + (y - 11.5) ** 2 < 121) sunCtx.fillRect(x * 2, y * 2, 2, 2);
  }
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  sunTex.magFilter = THREE.NearestFilter;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: '#ffe4a1', fog: false, toneMapped: false, depthWrite: false }));
  sun.scale.set(10.5, 10.5, 1);
  sun.position.set(-48, 11, -37);
  scene.add(sun);

  const clouds = new THREE.Group(), cloudVoxels = new Voxels(99), rng = random(47);
  [[-50, 12, -29, 17], [-27, 19, -46, 18], [16, 20, -45, 18], [40, 14, -34, 12]].forEach(([x, y, z, w]) => {
    for (let layer = 0; layer < 3; layer++) {
      const ww = w * (1 - layer * 0.24);
      for (let j = 0; j < 4; j++) cloudVoxels.box(x + (rng() - 0.5) * ww * 0.2,
        y + layer * 0.53, z + j * 0.45, ww - j * 1.6, 0.46, 0.5, '#fff0da');
    }
  });
  cloudVoxels.build(clouds, '流霞');
  clouds.children.forEach(mesh => {
    mesh.material.dispose();
    mesh.material = new THREE.MeshBasicMaterial({ color: '#f8d8bb', transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false });
    mesh.castShadow = mesh.receiveShadow = false;
  });
  scene.add(clouds);

  const water = new RiverReflection(new THREE.PlaneGeometry(WATER.width, WATER.depth), waterShader);
  water.name = '赣江 · 实时平面倒影';
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER.x, WATER.y, WATER.z);
  scene.add(water);

  const ripples = new THREE.Group(), rippleVoxels = new Voxels(510);
  for (let i = 0; i < 690; i++) {
    const x = WATER.x - WATER.width / 2 + 2 + rng() * (WATER.width - 4);
    const z = WATER.z - WATER.depth / 2 + 2 + rng() * (WATER.depth - 4);
    if (z > LAND.back && z < LAND.front && x > bankAt(z) - 1 && x < LAND.right + 1) continue;
    const warm = Math.abs(x + 36 + z * 0.1) < 8 && rng() > 0.5;
    rippleVoxels.box(x, WATER.y + 0.033, z, 0.6 + rng() * 2.7, 0.012, 0.07 + rng() * 0.07,
      warm ? '#edd1a0' : rng() > 0.5 ? '#b3cebc' : '#d0d8bc', 'matte', 0.1);
  }
  rippleVoxels.build(ripples, '碎金与水纹');
  ripples.children.forEach(mesh => {
    mesh.material.dispose();
    mesh.material = new THREE.MeshBasicMaterial({ vertexColors: false, transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false });
    mesh.castShadow = mesh.receiveShadow = false;
  });
  scene.add(ripples);

  let night = 0;
  let lastHour = -1;
  function setTime(hour) {
    if (Math.abs(lastHour - hour) < 0.002) return night;
    lastHour = hour;
    const next = TIMES.findIndex(e => e.hour >= hour);
    const b = TIMES[next < 0 ? TIMES.length - 1 : next];
    const a = TIMES[Math.max(0, next - 1)];
    const t = a === b ? 0 : THREE.MathUtils.clamp((hour - a.hour) / (b.hour - a.hour), 0, 1);
    const col = field => lerpColor(a[field], b[field], t);
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, cssColor(col('top')));
    grad.addColorStop(0.62, cssColor(col('middle')));
    grad.addColorStop(1, cssColor(col('bottom')));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 512);
    background.needsUpdate = true;
    scene.fog.color.copy(col('middle'));
    key.color.copy(col('key'));
    key.intensity = THREE.MathUtils.lerp(a.power, b.power, t);
    key.position.y = THREE.MathUtils.mapLinear(hour, 15, 20, 77, 22);
    hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
    night = THREE.MathUtils.smoothstep(hour, 18.1, 20);
    hemi.color.copy(lerpColor('#e0eced', '#a2bce0', night));
    fill.intensity = 0.9 + night * 0.55;
    warmLights.forEach(l => { l.intensity = night * 18; });
    sun.position.y = hour > 18.65 ? 8 + (hour - 18.65) * 3 : THREE.MathUtils.mapLinear(hour, 15, 18.65, 24, 5.5);
    sun.material.color.copy(col('sun'));
    sun.material.opacity = hour > 18.3 && hour < 18.8 ? Math.abs(hour - 18.55) * 4 : 1;
    sun.scale.setScalar(hour > 18.65 ? 5.3 : 10.5);
    water.material.uniforms.color.value.copy(col('water'));
    water.material.uniforms.uNight.value = night;
    water.material.uniforms.uDusk.value = 1 - THREE.MathUtils.smoothstep(Math.abs(hour - 17.5), 0.5, 2.5);
    clouds.children.forEach(mesh => {
      mesh.material.color.copy(lerpColor('#ffdfbf', '#9da9be', night));
      mesh.material.opacity = 0.39 - night * 0.2;
    });
    ripples.children.forEach(mesh => { mesh.material.opacity = 0.46 - night * 0.29; });
    renderer.shadowMap.needsUpdate = true;
    return night;
  }
  setTime(17.67);
  return {
    setTime,
    water,
    update(time) {
      water.material.uniforms.uTime.value = time;
      clouds.position.x = Math.sin(time * 0.015) * 1.8;
      ripples.position.x = Math.sin(time * 0.16) * 0.18;
      ripples.position.z = Math.sin(time * 0.21) * 0.07;
    },
    dispose() {
      water.getRenderTarget().dispose();
      background.dispose();
      sunTex.dispose();
    },
  };
}
