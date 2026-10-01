import './style.css';
import { createDiorama } from './scene.js';
import { RailwaySimulation, TRACK_LENGTH } from './simulation.js';

const icons = {
  train: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M8 8h8M8 3v5m8-5v5M8 18l-3 3m11-3 3 3M7 20h10"/><circle cx="8.5" cy="14" r=".7"/><circle cx="15.5" cy="14" r=".7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2.8 8.5M3 4v6h6"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6m-3-3v6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6"/>',
  orbit: '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><path d="m18 3 2 3-3 1"/><circle cx="12" cy="12" r="2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="identity"><div class="brand-mark">${icon('train')}</div><div><h1>松溪小镇<span class="title-dot">.</span></h1><p>PINE CREEK · 桌面微缩铁路</p></div></div>
    <div class="header-right"><div class="scene-time">${icon('sun')}<span id="time-text">傍晚 <i>17:42</i></span></div><div class="theme-switch" role="group" aria-label="场景昼夜"><button id="day-btn" class="active" aria-pressed="true">${icon('sun')}<span>白天</span></button><button id="night-btn" aria-pressed="false">${icon('moon')}<span>夜晚</span></button></div></div>
  </header>
  <main class="stage" id="stage" aria-label="可旋转和缩放的铁路小镇沙盘">
    <div id="scene" class="scene"><canvas id="town-canvas" aria-label="松溪小镇三维沙盘，拖动旋转，滚轮缩放" tabindex="0"></canvas></div>
    <div class="scene-caption"><span class="eyebrow">一方小镇，一程慢时光</span><h2>沿着松溪，<br>再兜一圈。</h2><p>暖灯亮起前，下一站是家。</p></div>
    <div class="edition"><span class="edition-line"></span>微缩风景 / NO. 001</div>
    <div class="scene-label" id="station-label"><span></span>松溪站</div>
    <div class="scene-label" id="river-label"><span></span>松溪</div>
    <div class="view-controls"><button id="zoom-in" title="放大沙盘" aria-label="放大沙盘">${icon('zoomIn')}</button><button id="zoom-out" title="缩小沙盘" aria-label="缩小沙盘">${icon('zoomOut')}</button><span></span><button id="view-reset" title="恢复初始视角" aria-label="恢复初始视角">${icon('orbit')}</button></div>
    <div class="view-hint">${icon('orbit')}<span>拖动旋转</span><i>·</i><span>滚轮缩放</span></div>
    <div class="scene-key"><span><i class="key-track"></i>环镇铁路</span><span><i class="key-river"></i>松溪河</span><span><i class="key-village"></i>小镇街区</span></div>
    <div class="error-panel" id="error-panel" hidden><strong>暂时无法呈现沙盘</strong><p>请使用支持 WebGL 的现代浏览器，并开启浏览器硬件加速。</p></div>
  </main>
  <footer class="bottom-panel">
    <div class="route-info"><span class="route-number">01</span><div><span class="micro-label">PINE CREEK LINE</span><h3>松溪环镇线</h3><p>一列火车 · 一座小镇 · 往复之间</p></div></div>
    <div class="transport"><button id="play-btn" class="play-btn" aria-label="暂停列车">${icon('pause')}</button><div class="transport-text"><strong id="run-state">列车运行中</strong><span id="station-state" role="status" aria-live="polite">下一站：松溪站</span></div></div>
    <div class="speed-control"><div><label for="speed">运行速度</label><output id="speed-value" for="speed">1.00<span>×</span></output></div><input id="speed" type="range" min="0.25" max="2" step="0.05" value="1" aria-label="列车速度倍率"/><div class="range-labels"><span>慢慢来</span><span>赶趟儿</span></div></div>
    <div class="station-info"><span class="micro-label">松溪站 · 停留约 2 秒</span><div><span id="status-dot" class="status-dot"></span><strong id="arrival-state">环镇巡游</strong></div><span id="lap-count">第 01 圈旅程</span></div>
    <button id="reset-btn" class="reset-btn">${icon('reset')}<span>复位</span></button>
  </footer>
`;

const sim = new RailwaySimulation();
const $ = (id) => document.getElementById(id);
let town;
let night = false;
let lastState = '';
let dwellLabel = '';
function updateUI() {
  const stateKey = `${sim.playing}:${sim.dwellRemaining > 0}:${sim.distanceToStation < 7}:${sim.laps}`;
  if (stateKey !== lastState) {
    $('play-btn').innerHTML = icon(sim.playing ? 'pause' : 'play');
    $('play-btn').setAttribute('aria-label', sim.playing ? '暂停列车' : '运行列车');
    $('play-btn').classList.toggle('paused', !sim.playing);
    $('run-state').textContent = sim.playing ? (sim.dwellRemaining > 0 ? '列车停站中' : '列车运行中') : '列车已暂停';
    $('station-state').textContent = !sim.playing && sim.dwellRemaining > 0 ? '停站计时已暂停' : '下一站：松溪站';
    $('status-dot').classList.toggle('stopped', !sim.playing || sim.dwellRemaining > 0);
    $('lap-count').textContent = `第 ${String(sim.laps + 1).padStart(2, '0')} 圈旅程`;
    lastState = stateKey;
  }
  const label = sim.dwellRemaining > 0 ? `到站停留 ${sim.dwellRemaining.toFixed(1)}s` : sim.distanceToStation < 7 ? '即将到站' : '环镇巡游';
  if (label !== dwellLabel) { $('arrival-state').textContent = label; dwellLabel = label; }
}
function setPlaying(playing) { sim.playing = playing; updateUI(); }
function setSpeed(speed) {
  sim.setSpeed(speed);
  $('speed').value = sim.speed;
  $('speed-value').innerHTML = `${sim.speed.toFixed(2)}<span>×</span>`;
  $('speed').style.setProperty('--progress', `${((sim.speed - .25) / 1.75) * 100}%`);
}
function setNight(value) {
  night = value;
  town?.setNight(night);
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  $('day-btn').classList.toggle('active', !night);
  $('night-btn').classList.toggle('active', night);
  $('day-btn').setAttribute('aria-pressed', String(!night));
  $('night-btn').setAttribute('aria-pressed', String(night));
  $('time-text').innerHTML = night ? '夜晚 <i>20:16</i>' : '傍晚 <i>17:42</i>';
  document.querySelector('.scene-time .icon').outerHTML = icon(night ? 'moon' : 'sun');
}
function reset() { sim.reset(); setSpeed(1); setNight(false); town?.resetCamera(); updateUI(); }
$('play-btn').addEventListener('click', () => setPlaying(!sim.playing));
$('speed').addEventListener('input', event => setSpeed(Number(event.target.value)));
$('day-btn').addEventListener('click', () => setNight(false));
$('night-btn').addEventListener('click', () => setNight(true));
$('reset-btn').addEventListener('click', reset);
$('view-reset').addEventListener('click', () => town?.resetCamera());
$('zoom-in').addEventListener('click', () => town?.zoom(1.15));
$('zoom-out').addEventListener('click', () => town?.zoom(1 / 1.15));
$('town-canvas').addEventListener('keydown', event => {
  if (event.code === 'Space') { event.preventDefault(); setPlaying(!sim.playing); }
  if (event.code === 'KeyR') reset();
  if (event.code === 'KeyN') setNight(!night);
  if (event.key === '+' || event.key === '=') town?.zoom(1.15);
  if (event.key === '-') town?.zoom(1 / 1.15);
  if (event.key.startsWith('Arrow')) { event.preventDefault(); town?.rotate(event.key); }
});

try {
  town = createDiorama($('town-canvas'), sim, { station: $('station-label'), river: $('river-label') }, updateUI);
  setSpeed(1); updateUI();
} catch (error) {
  $('error-panel').hidden = false;
  $('play-btn').disabled = true;
  console.error('沙盘初始化失败', error);
}

const readState = () => ({ playing: sim.playing, speed: sim.speed, night, distance: sim.distance, dwellRemaining: sim.dwellRemaining, stops: sim.stops, laps: sim.laps, routeLength: TRACK_LENGTH, cars: sim.poses, camera: town?.cameraState(), render: town?.stats() });
// Optional browser agent support uses exactly the visible controls and their validation.
if (document.modelContext?.registerTool) {
  const lifetime = new AbortController();
  const tools = [
    { name: 'read_railway_state', description: '读取松溪铁路的运行、速度、停站和昼夜状态。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => readState() },
    { name: 'configure_railway', description: '调整列车运行或暂停、速度与昼夜，和页面按钮使用相同状态。', inputSchema: { type: 'object', properties: { playing: { type: 'boolean' }, speed: { type: 'number', minimum: .25, maximum: 2 }, night: { type: 'boolean' } }, additionalProperties: false }, execute(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['playing', 'speed', 'night'].includes(k))) throw new TypeError('无效的设置。');
      if ('playing' in input && typeof input.playing !== 'boolean' || 'night' in input && typeof input.night !== 'boolean' || 'speed' in input && (!Number.isFinite(input.speed) || input.speed < .25 || input.speed > 2)) throw new RangeError('无效的设置值。');
      if ('playing' in input) setPlaying(input.playing);
      if ('speed' in input) setSpeed(input.speed);
      if ('night' in input) setNight(input.night);
      return readState();
    } },
    { name: 'reset_railway', description: '恢复初始机位、列车位置、默认速度和傍晚场景，并开始运行。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: () => { reset(); return readState(); } },
  ];
  for (const tool of tools) { try { Promise.resolve(document.modelContext.registerTool({ ...tool, annotations: { readOnlyHint: false, untrustedContentHint: false, ...tool.annotations } }, { signal: lifetime.signal })).catch(console.warn); } catch (error) { console.warn(error); } }
  window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
}

// Read-only diagnostics for functional verification; no production test controls.
Object.defineProperty(window, '__railway', { value: Object.freeze({ getState: readState }) });
if (import.meta.hot) import.meta.hot.dispose(() => town?.dispose());
