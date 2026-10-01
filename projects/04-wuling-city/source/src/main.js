import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { buildWorld, VIEWS, LANDMARKS } from "./world.js";
import { clamp } from "./grid.js";

const $ = (id) => document.getElementById(id);
const state = {
  ready: false,
  view: 0,
  flying: false,
  touring: false,
  clean: false,
  map: false,
  time: "day",
  quality: 0,
  errors: [],
  mode: "orbit",
};
let renderer,
  camera,
  scene,
  controls,
  world,
  light,
  hemi,
  fill,
  transition = null,
  lastTime = 0,
  time = 0,
  fpsFrames = 0,
  fpsTime = 0,
  uiTime = 0,
  tourTime = 0,
  night = 0,
  audio = null,
  soundOn = false;
const keys = new Set(),
  direction = new THREE.Vector3(),
  right = new THREE.Vector3(),
  up = new THREE.Vector3(0, 1, 0),
  look = new THREE.Vector3(),
  projected = new THREE.Vector3();
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = {
  day: {
    sky: "#bbd7d1",
    fog: "#adc9bd",
    fogNear: 185,
    fogFar: 435,
    sun: "#fff0cb",
    intensity: 2.8,
    ambient: 1.65,
    water: "#3f9887",
    exposure: 1.06,
    sunPos: [-80, 130, 60],
    night: 0,
  },
  sunset: {
    sky: "#dec7ae",
    fog: "#c5bda0",
    fogNear: 130,
    fogFar: 350,
    sun: "#ffc484",
    intensity: 3.3,
    ambient: 1.45,
    water: "#68977f",
    exposure: 1.06,
    sunPos: [-120, 60, 35],
    night: 0.22,
  },
  night: {
    sky: "#102f40",
    fog: "#143b4a",
    fogNear: 200,
    fogFar: 435,
    sun: "#9bcddd",
    intensity: 1.35,
    ambient: 1.05,
    water: "#164d59",
    exposure: 1.08,
    sunPos: [60, 110, -70],
    night: 1,
  },
};
const labelElements = LANDMARKS.map((m, i) => {
  const e = document.createElement("button");
  e.className = "landmark";
  e.textContent = m.name;
  e.setAttribute("aria-label", `前往${m.name}`);
  e.addEventListener("click", () => goToView(m.view));
  $("landmarks").append(e);
  return e;
});
let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3800);
}
function fail(error) {
  state.errors.push(String(error));
  $("loading").style.display = "none";
  $("error").hidden = false;
  $("error-text").textContent =
    "请使用支持 WebGL 2 的现代浏览器，并启用硬件加速。错误信息：" +
    error.message;
  console.error(error);
}
window.addEventListener("error", (e) => {
  state.errors.push(e.message);
  if (!state.ready) fail(e.error || new Error(e.message));
});
window.addEventListener("unhandledrejection", (e) => {
  state.errors.push(String(e.reason));
  if (!state.ready)
    fail(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
});

function resize() {
  if (!renderer) return;
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function applyQuality() {
  const q = state.quality;
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, q === 0 ? 1.6 : q === 1 ? 1.15 : 0.8),
  );
  renderer.shadowMap.enabled = q < 2;
  light.shadow.mapSize.set(q === 0 ? 2048 : 1024, q === 0 ? 2048 : 1024);
  light.shadow.map?.dispose();
  light.shadow.map = null;
  renderer.shadowMap.needsUpdate = true;
  resize();
  $("quality").innerHTML = ["精致", "均衡", "流畅"][q] + " <span>⌄</span>";
}
function setTime(value) {
  state.time = value;
  const s = settings[value];
  scene.background.set(s.sky);
  scene.fog.color.set(s.fog);
  scene.fog.near = state.map ? 1000 : s.fogNear;
  scene.fog.far = state.map ? 2000 : s.fogFar;
  light.color.set(s.sun);
  light.intensity = s.intensity;
  hemi.intensity = s.ambient;
  fill.intensity = value === "night" ? 0.35 : 0.6;
  light.position.set(...s.sunPos);
  renderer.toneMappingExposure = s.exposure;
  world.materials.glow.emissiveIntensity = 0.5 + s.night * 2.8;
  world.materials.window.emissiveIntensity = 0.04 + s.night * 1.5;
  world.luminaries.forEach((l) => (l.intensity = s.night * 17));
  world.waterUniforms.uTint.value.set(s.water);
  world.waterUniforms.uSun.value.set(s.sun);
  night = s.night;
  renderer.shadowMap.needsUpdate = true;
  document.body.classList.toggle("night", value === "night");
  document.querySelectorAll("[data-time]").forEach((e) => {
    e.classList.toggle("selected", e.dataset.time === value);
    e.setAttribute("aria-pressed", e.dataset.time === value);
  });
}
function viewPosition(v) {
  const p = new THREE.Vector3(...v.position);
  if (innerWidth < 760 && state.view === 0) {
    const t = new THREE.Vector3(...v.target);
    p.sub(t).multiplyScalar(1.1).add(t);
  }
  return p;
}
function moveCamera(position, target, duration = 2.5) {
  transition = {
    from: camera.position.clone(),
    fromTarget: controls.target.clone(),
    to: position.clone(),
    toTarget: target.clone(),
    t: 0,
    duration: reduced ? 0.05 : duration,
  };
}
function stopTour() {
  state.touring = false;
  $("tour").setAttribute("aria-pressed", "false");
  $("tour").innerHTML = "<span>▷</span> 自动巡游";
}
function goToView(index, automatic = false) {
  if (!state.ready) return;
  if (!automatic) stopTour();
  if (state.flying) toggleFlight(false);
  state.view = index;
  state.map = false;
  scene.fog.near = settings[state.time].fogNear;
  scene.fog.far = settings[state.time].fogFar;
  document.body.classList.toggle("detail", index !== 0);
  const v = VIEWS[index];
  moveCamera(viewPosition(v), new THREE.Vector3(...v.target));
  $("view-index").textContent = `0${index + 1} / 05`;
  $("view-title").textContent = v.title;
  $("view-description").textContent = v.text;
  $("view-type").textContent = v.type;
  document.querySelectorAll(".destination").forEach((e, i) => {
    e.classList.toggle("active", i === index);
    e.setAttribute("aria-pressed", i === index);
  });
  if (innerWidth < 760)
    document
      .querySelector(`.destination[data-view="${index}"]`)
      .scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "nearest",
        inline: "center",
      });
}
function toggleMap() {
  if (!state.ready) return;
  if (state.map) {
    goToView(state.view);
    return;
  }
  stopTour();
  toggleFlight(false);
  state.map = true;
  document.body.classList.add("detail");
  scene.fog.near = 1000;
  scene.fog.far = 2000;
  moveCamera(new THREE.Vector3(-15, 305, 20), new THREE.Vector3(-15, 0, 8), 2);
  $("view-title").textContent = "主城平面";
  $("view-description").textContent =
    "西侧街区、南北水道、方兴街横轴与东侧天师桩阵列。按 M 返回观景。";
  $("view-type").textContent = "主城 · 俯瞰";
  toast("主城平面视图 · 拖动调整 · M 返回");
}
let yaw = 0,
  pitch = 0,
  dragging = false,
  lastPointer = null;
function syncAngles() {
  camera.getWorldDirection(direction);
  yaw = Math.atan2(-direction.x, -direction.z);
  pitch = Math.asin(clamp(direction.y, -0.999, 0.999));
}
function toggleFlight(force) {
  if (!state.ready) return;
  const enabled = force ?? !state.flying;
  if (enabled === state.flying) return;
  stopTour();
  transition = null;
  state.flying = enabled;
  state.mode = enabled ? "flight" : "orbit";
  controls.enabled = !enabled;
  document.body.classList.toggle("flying", enabled);
  $("fly").setAttribute("aria-pressed", String(enabled));
  $("fly").innerHTML = enabled
    ? "返回观景 <kbd>F</kbd>"
    : "自由飞行 <kbd>F</kbd>";
  $("crosshair").hidden = !enabled;
  $("flight-pad").hidden = !enabled || innerWidth > 760;
  keys.clear();
  if (enabled) {
    if (state.map) {
      state.map = false;
      scene.fog.near = settings[state.time].fogNear;
      scene.fog.far = settings[state.time].fogFar;
      document.body.classList.toggle("detail", state.view !== 0);
      $("view-title").textContent = VIEWS[state.view].title;
      $("view-description").textContent = VIEWS[state.view].text;
      $("view-type").textContent = VIEWS[state.view].type;
    }
    syncAngles();
    $("world").focus({ preventScroll: true });
    $("controls-hint").innerHTML =
      '<kbd>W A S D</kbd> 移动 <span class="divider">/</span> <kbd>Q E</kbd> 升降 <span class="divider">/</span> <kbd>拖动</kbd> 看向';
    toast("自由飞行 · WASD 移动，Q/E 升降，Shift 加速，拖动转向，F 返回");
  } else {
    camera.getWorldDirection(direction);
    controls.target.copy(camera.position).addScaledVector(direction, 25);
    controls.update();
    $("controls-hint").innerHTML =
      '<kbd>拖动</kbd> 环视 <span class="divider">/</span> <kbd>滚轮</kbd> 远近 <span class="divider">/</span> <kbd>右键</kbd> 平移';
  }
}
function enterCity() {
  if (!state.ready) return;
  stopTour();
  state.map = false;
  toggleFlight(true);
  camera.position.set(17, 6.2, 5);
  camera.lookAt(-16, 7, 5);
  syncAngles();
}
function toggleClean() {
  state.clean = !state.clean;
  document.body.classList.toggle("clean", state.clean);
  $("restore-ui").hidden = !state.clean;
}
function makeMinimap() {
  const svg = $("minimap");
  const shapes = world.footprints
    .map((f) => {
      const x = (f.x + 108) * 1.25,
        y = (f.z + 82) * 0.8;
      return `<rect x="${x - f.w * 0.625}" y="${y - f.d * 0.4}" width="${f.w * 1.25}" height="${f.d * 0.8}" fill="${f.kind === "tower" ? "#4f8975" : "#76927c55"}" stroke="#708f7899" stroke-width=".55"/>`;
    })
    .join("");
  svg.innerHTML = `<defs><pattern id="map-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="currentColor" stroke-opacity=".1"/></pattern></defs><rect width="240" height="138" fill="url(#map-grid)"/><path class="map-water" d="M94 4h11v114h-4v14h-9zM15 120h143v7H15zM222 0h18v138h-18z"/><path d="M42 6h118v104l-25 8H42Z" fill="#8ba58b1a" stroke="#70887966"/>${shapes}<path class="map-road" d="M25 70H218M92 7v120"/><g id="map-camera"><path d="m0-5 4 9-4-2-4 2z"/></g><text x="225" y="15">N</text><path d="m228 20-3 7h6z" fill="currentColor"/>`;
  const wrap = document.querySelector(".map-wrap");
  wrap.setAttribute("role", "button");
  wrap.setAttribute("tabindex", "0");
  wrap.setAttribute("aria-label", "查看主城平面图");
  wrap.querySelector("span").textContent = "俯瞰主城 · M";
  wrap.addEventListener("click", toggleMap);
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMap();
    }
  });
}
function updateUI() {
  $("altitude").textContent = `高度 ${Math.round(camera.position.y)} m`;
  const w = innerWidth,
    h = innerHeight;
  LANDMARKS.forEach((m, i) => {
    const el = labelElements[i];
    projected.set(...m.p).project(camera);
    const x = (projected.x * 0.5 + 0.5) * w,
      y = (-projected.y * 0.5 + 0.5) * h;
    const inTitle =
      state.view === 0 &&
      !state.map &&
      x < (w < 760 ? 230 : 350) &&
      y > h * 0.15 &&
      y < h * 0.69;
    const inCard = w > 760 && x > w - 250 && y > h * 0.23 && y < h * 0.74;
    const show =
      projected.z < 1 &&
      projected.z > 0 &&
      x > 45 &&
      x < w - 65 &&
      y > 100 &&
      y < h - 175 &&
      !inTitle &&
      !inCard &&
      !state.flying &&
      (m.mapOnly ? state.map : !state.map);
    el.style.opacity = show ? "1" : "0";
    el.style.pointerEvents = show ? "auto" : "none";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.setAttribute("aria-hidden", String(!show));
    el.tabIndex = show ? 0 : -1;
  });
  camera.getWorldDirection(direction);
  const rotation = (Math.atan2(direction.x, -direction.z) * 180) / Math.PI;
  $("map-camera")?.setAttribute(
    "transform",
    `translate(${clamp((camera.position.x + 108) * 1.25, 5, 232)} ${clamp((camera.position.z + 82) * 0.8, 5, 133)}) rotate(${rotation})`,
  );
}
function updateFlight(dt) {
  const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 28 : 9) * dt;
  camera.getWorldDirection(direction);
  right.crossVectors(direction, up).normalize();
  look.set(0, 0, 0);
  if (keys.has("KeyW") || keys.has("ArrowUp")) look.add(direction);
  if (keys.has("KeyS") || keys.has("ArrowDown")) look.sub(direction);
  if (keys.has("KeyD") || keys.has("ArrowRight")) look.add(right);
  if (keys.has("KeyA") || keys.has("ArrowLeft")) look.sub(right);
  if (keys.has("KeyE") || keys.has("Space")) look.y += 1;
  if (keys.has("KeyQ")) look.y -= 1;
  if (look.lengthSq() > 0)
    camera.position.addScaledVector(look.normalize(), speed);
  camera.position.x = clamp(camera.position.x, -150, 145);
  camera.position.z = clamp(camera.position.z, -135, 145);
  camera.position.y = clamp(camera.position.y, 2.2, 190);
  camera.rotation.order = "YXZ";
  camera.rotation.set(pitch, yaw, 0);
  controls.target.copy(camera.position).addScaledVector(direction, 25);
}
function animate(now) {
  requestAnimationFrame(animate);
  const wallDt = (now - lastTime) / 1000,
    dt = Math.min(wallDt, 0.05);
  lastTime = now;
  if (document.hidden) return;
  time += dt;
  if (transition) {
    transition.t += dt;
    const t = clamp(transition.t / transition.duration, 0, 1),
      s = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, s);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, s);
    camera.lookAt(controls.target);
    if (t >= 1) transition = null;
  }
  if (state.flying) updateFlight(dt);
  else controls.update();
  if (state.touring) {
    tourTime += dt;
    if (tourTime > 10) {
      tourTime = 0;
      goToView((state.view + 1) % VIEWS.length, true);
    }
  }
  world.update(time, night);
  renderer.render(scene, camera);
  fpsFrames++;
  fpsTime += wallDt;
  uiTime += dt;
  if (fpsTime >= 1) {
    $("fps").textContent = Math.round(fpsFrames / fpsTime) + " FPS";
    state.fps = Math.round(fpsFrames / fpsTime);
    fpsTime = 0;
    fpsFrames = 0;
  }
  if (uiTime > 0.12) {
    updateUI();
    uiTime = 0;
  }
}
function setupInput() {
  document
    .querySelectorAll("[data-view]")
    .forEach((e) =>
      e.addEventListener("click", () => goToView(Number(e.dataset.view))),
    );
  document
    .querySelectorAll("[data-time]")
    .forEach((e) => e.addEventListener("click", () => setTime(e.dataset.time)));
  $("explore").addEventListener("click", enterCity);
  $("fly").addEventListener("click", () => toggleFlight());
  $("hide-ui").addEventListener("click", toggleClean);
  $("restore-ui").addEventListener("click", toggleClean);
  $("tour").addEventListener("click", () => {
    if (state.touring) {
      stopTour();
      return;
    }
    if (state.flying) toggleFlight(false);
    state.touring = true;
    tourTime = 0;
    $("tour").setAttribute("aria-pressed", "true");
    $("tour").innerHTML = "<span>Ⅱ</span> 暂停巡游";
    goToView(state.view, true);
    toast("自动巡游已开启，每个观景点停留约 10 秒");
  });
  $("quality").addEventListener("click", () => {
    state.quality = (state.quality + 1) % 3;
    applyQuality();
    toast("渲染画质：" + ["精致", "均衡", "流畅"][state.quality]);
  });
  $("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("当前浏览器窗口不支持全屏，可在独立浏览器中打开。");
    }
  });
  controls.addEventListener("start", () => {
    transition = null;
    stopTour();
  });
  $("world").addEventListener("pointerdown", (e) => {
    if (!state.flying) return;
    dragging = true;
    lastPointer = [e.clientX, e.clientY];
    $("world").setPointerCapture(e.pointerId);
  });
  $("world").addEventListener("pointermove", (e) => {
    if (!state.flying || !dragging) return;
    yaw -= (e.clientX - lastPointer[0]) * 0.004;
    pitch = clamp(pitch - (e.clientY - lastPointer[1]) * 0.004, -1.48, 1.48);
    lastPointer = [e.clientX, e.clientY];
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("world").addEventListener(event, () => {
      dragging = false;
      lastPointer = null;
    });
  $("world").addEventListener("contextmenu", (e) => e.preventDefault());
  document.querySelectorAll("[data-key]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      keys.add(b.dataset.key);
      b.setPointerCapture(e.pointerId);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(ev, () => keys.delete(b.dataset.key));
  });
  window.addEventListener("keydown", (e) => {
    if ($("modal").open) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (
      state.flying &&
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyQ",
        "KeyE",
        "Space",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
    }
    if (e.code.startsWith("Shift")) keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyF") toggleFlight();
    if (e.code === "KeyH") toggleClean();
    if (e.code === "KeyM") toggleMap();
    if (e.code === "KeyR") goToView(0);
    if (e.code === "Escape" && state.flying) toggleFlight(false);
    if (
      e.code.startsWith("Digit") &&
      Number(e.code.slice(-1)) >= 1 &&
      Number(e.code.slice(-1)) <= 5
    )
      goToView(Number(e.code.slice(-1)) - 1);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    dragging = false;
  });
  document.addEventListener("visibilitychange", () => {
    keys.clear();
    lastTime = performance.now();
  });
  window.addEventListener("resize", resize);
  $("help").addEventListener("click", () => openModal("help"));
  $("info").addEventListener("click", () => openModal("info"));
  $("close-modal").addEventListener("click", () => $("modal").close());
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) {
      const r = $("modal").getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $("modal").close();
    }
  });
  $("sound").addEventListener("click", toggleSound);
}
function openModal(kind) {
  keys.clear();
  stopTour();
  const isHelp = kind === "help";
  $("modal-content").innerHTML = isHelp
    ? `<div class="dialog-kicker">A SMALL GUIDE TO WULING</div><h2>自在游览</h2><p>先从空中俯瞰，再进入街巷。所有观景点都可以自由旋转、缩放。</p><div class="help-list"><span><kbd>拖动</kbd> 环视 / 飞行转向</span><span><kbd>滚轮</kbd> 拉近与推远</span><span><kbd>右键</kbd> 平移视点</span><span><kbd>1—5</kbd> 切换观景点</span><span><kbd>F</kbd> 自由飞行 / 返回</span><span><kbd>WASD</kbd> 飞行移动</span><span><kbd>Q / E</kbd> 下降 / 上升</span><span><kbd>Shift</kbd> 加快飞行</span><span><kbd>M</kbd> 主城平面图</span><span><kbd>H</kbd> 隐藏 / 显示界面</span><span><kbd>R</kbd> 回到全景</span><span><kbd>Esc</kbd> 退出飞行 / 弹窗</span></div><p>触屏：单指旋转，双指缩放与平移。进入飞行后，用屏幕方向键移动、拖动场景转向。飞行模式允许穿越建筑，便于近距离观察构造。</p>`
    : `<div class="dialog-kicker">WULING / VOXEL FIELD NOTES</div><h2>山水之间，万象新生</h2><p>基于《明日方舟：终末地》武陵城公开城景、城区平面图及你圈定的主城范围制作的独立体素演绎。保留街区与水系的组织关系；尺度与建筑为适合实时游览的艺术化重构，并非游戏地图的逐点复刻。</p><p>所有静态实体均对齐 <b>0.2 m / voxel</b> 网格。${world.stats.solidRuns.toLocaleString()} 个连续体素实体经批量网格化绘制；水面、舟船与水轮实时运动。项目运行不依赖外部 CDN。</p><ul class="reference-list"><li><a href="https://www.gamersky.com/handbook/202512/2061596.shtml" target="_blank" rel="noopener">↗ 官方武陵城地区介绍 · 游民星空转载</a></li><li><a href="https://forum.gamer.com.tw/C.php?bsn=74604&snA=1578" target="_blank" rel="noopener">↗ 武陵城平面图 · 巴哈姆特社区</a></li><li><a href="./references/user-scope.png" target="_blank" rel="noopener">↗ 本次建设范围 · 用户圈定图</a></li><li><a href="./REFERENCES.md" target="_blank" rel="noopener">↗ 完整参考与空间对应说明</a></li></ul><p>同人创作。原作名称与世界观归其权利人所有。模型、界面和程序均为本项目创建。</p>`;
  $("modal").showModal();
}
async function toggleSound() {
  try {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      audio = new Context();
      const size = audio.sampleRate * 4,
        buffer = audio.createBuffer(2, size, audio.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        let prev = 0;
        for (let i = 0; i < size; i++) {
          prev = (prev + (Math.random() * 2 - 1) * 0.018) / 1.019;
          data[i] = prev * 3.5;
        }
      }
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 750;
      const gain = audio.createGain();
      gain.gain.value = 0.18;
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start();
    }
    soundOn = !soundOn;
    if (soundOn) await audio.resume();
    else await audio.suspend();
    $("sound").setAttribute("aria-pressed", String(soundOn));
    $("sound").setAttribute(
      "aria-label",
      soundOn ? "关闭环境音" : "开启环境音",
    );
    toast(soundOn ? "环境音已开启 · 风与水的程序合成声景" : "环境音已关闭");
  } catch {
    toast("当前浏览器无法播放环境音。");
  }
}
async function init() {
  renderer = new THREE.WebGLRenderer({
    canvas: $("world"),
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(settings.day.sky);
  scene.fog = new THREE.Fog(settings.day.fog, 140, 365);
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.2, 700);
  camera.position.set(...VIEWS[0].position);
  camera.lookAt(...VIEWS[0].target);
  controls = new OrbitControls(camera, $("world"));
  controls.target.set(...VIEWS[0].target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 5;
  controls.maxDistance = 310;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = 0.035;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 0.85;
  hemi = new THREE.HemisphereLight("#e8f2d9", "#667861", 2.2);
  scene.add(hemi);
  light = new THREE.DirectionalLight("#fff0cb", 3.1);
  light.position.set(-80, 130, 60);
  light.target.position.set(-15, 0, -15);
  scene.add(light, light.target);
  light.castShadow = true;
  light.shadow.camera.left = -150;
  light.shadow.camera.right = 150;
  light.shadow.camera.top = 150;
  light.shadow.camera.bottom = -150;
  light.shadow.camera.near = 5;
  light.shadow.camera.far = 420;
  light.shadow.bias = -0.00025;
  light.shadow.normalBias = 0.15;
  light.shadow.radius = 2;
  fill = new THREE.DirectionalLight("#bcd9c5", 0.6);
  fill.position.set(70, 30, 70);
  scene.add(fill);
  $("loading-detail").textContent = "正在构筑主城街巷与水系…";
  await new Promise((r) => setTimeout(r, 40));
  world = buildWorld(scene);
  makeMinimap();
  applyQuality();
  setTime("day");
  setupInput();
  state.ready = true;
  state.solidRuns = world.stats.solidRuns;
  state.voxelSize = 0.2;
  state.mode = "orbit";
  camera.position.copy(viewPosition(VIEWS[0]));
  controls.update();
  // Read-only diagnostics for reproducible headless development checks.
  window.wuling = {
    getSnapshot: () => ({
      ...state,
      camera: camera.position.toArray(),
      target: controls.target.toArray(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      renderedFrames: renderer.info.render.frame,
      worldBounds: world.stats.bounds,
      soundOn,
    }),
  };
  $("world").addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    state.ready = false;
    fail(new Error("WebGL 上下文已丢失，请关闭其他占用显卡的页面后重新加载。"));
  });
  $("loading").style.opacity = "0";
  setTimeout(() => ($("loading").style.display = "none"), 750);
  lastTime = performance.now();
  requestAnimationFrame(animate);
}
init().catch(fail);
