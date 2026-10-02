import { Simulation, DEFAULTS, PRESETS, cleanParams, WALL } from './physics.js';
import { SceneView } from './scene.js';
import { ReplayTimeline, REPLAY_TICK } from './replay.js';

const $ = id => document.getElementById(id);
const keys = Object.keys(DEFAULTS);
let applied = { ...DEFAULTS }, running = false, replaying = false, sim, view, timeline, dirty = false, selected = null;
let lastFrame = 0, accumulator = 0, lastUI = 0, experimentNumber = 1, toastTimer;
const records = [];
const format = (number, digits = 0) => Number(number).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 3200);
}

function inputParams() {
  return cleanParams(Object.fromEntries(keys.map(k => [k, $(k).value])));
}

function updateDraft() {
  let p;
  try { p = inputParams(); } catch { $('pending-note').textContent = '请输入有效的碎块分布种子'; return; }
  for (const k of keys) {
    const control = $(k), output = $(`${k}-value`);
    if (output) output.textContent = format(p[k], ['mass', 'speed'].includes(k) ? 0 : 2);
    if (control.type === 'range') control.style.setProperty('--value', `${100 * (p[k] - Number(control.min)) / (Number(control.max) - Number(control.min))}%`);
  }
  $('energy-preview').innerHTML = `${format(0.5 * p.mass * p.speed ** 2 / 1000, 1)} <small>kJ</small>`;
  $('target-dot').style.left = `${(p.hitX + 5) * 10}%`;
  $('target-dot').style.top = `${100 - p.hitY / 5.5 * 100}%`;
  $('target-pad').setAttribute('aria-valuetext', `水平 ${p.hitX} 米，高度 ${p.hitY} 米`);
  const mayMiss = Math.abs(p.hitX) - p.radius > WALL.width / 2 || p.hitY - p.radius > WALL.height + WALL.base;
  $('aim-note').textContent = mayMiss ? '当前瞄准墙外：将检验未命中时墙体保持完整。' : '橙色标记为预计首次接触时的球心。';
  dirty = keys.some(k => p[k] !== applied[k]);
  $('pending-note').innerHTML = `<span class="state-dot"></span>${dirty ? '参数已修改 · 应用后生效' : '参数已应用 · 可重复实验'}`;
  $('pending-note').classList.toggle('pending', dirty);
}

function writeParams(params) {
  for (const k of keys) $(k).value = params[k];
  updateDraft();
}

function reset(params = applied, count = true) {
  running = false; replaying = false; accumulator = 0; selected = null;
  applied = cleanParams(params); sim = new Simulation(applied);
  timeline = new ReplayTimeline(sim);
  view.load(sim, timeline); $('selected-piece').hidden = true;
  if (count) experimentNumber++;
  $('experiment-number').textContent = String(experimentNumber).padStart(3, '0');
  $('bond-total').textContent = `/ ${sim.bonds.length}`;
  $('scene-info').textContent = `${sim.pieces.length} 碎块 · 重力 9.81 m/s²`;
  $('performance-note').hidden = true;
  writeParams(applied); updateUI();
}

function toggleRunning() {
  if (running) { running = false; accumulator = 0; updateUI(); return; }
  if (timeline.isPast) { replaying = true; running = true; accumulator = 0; updateUI(); return; }
  if (sim.fault) return toast(sim.fault);
  if (!sim.launched && dirty) return toast('请先点击「应用参数并重置」，让修改后的参数生效。');
  if (!sim.launched) sim.launch();
  replaying = false; running = true; accumulator = 0; updateUI();
}

function seekReplay(tick) {
  running = false; accumulator = 0;
  timeline.seek(tick); replaying = timeline.isPast;
  $('performance-note').hidden = true; updateUI();
}

function advanceFrame() {
  if (replaying && timeline.isPast) {
    if (!timeline.step()) { running = false; replaying = false; accumulator = 0; }
  } else {
    sim.advance(); timeline.capture();
    if (sim.fault) { running = false; toast(sim.fault); }
  }
}

function selectPiece(id) { selected = id; $('selected-piece').hidden = id === null; updatePieceInfo(); }
function updatePieceInfo() {
  if (selected === null) return;
  const state = timeline.state;
  if (selected === 'projectile') {
    const b = state.projectile;
    $('piece-id').textContent = '· IMPACTOR';
    $('piece-support').textContent = '撞击体 · 实际物理状态';
    const entries = [['质量', `${format(applied.mass)} kg`], ['半径', `${format(applied.radius, 2)} m`],
      ['水平速度 X', `${format(b.velocity.x, 3)} m/s`], ['竖直速度 Y', `${format(b.velocity.y, 3)} m/s`],
      ['法向速度 Z', `${format(b.velocity.z, 3)} m/s`], ['中心高度', `${format(b.position.y, 3)} m`]];
    $('piece-values').innerHTML = entries.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    return;
  }
  const p = state.pieces[selected], b = p.body;
  $('piece-id').textContent = String(p.id + 1).padStart(3, '0');
  $('piece-support').textContent = p.fixed ? '基座固定单元' : p.supported ? '仍与基座相连' : '已脱离基座支撑';
  const entries = [
    ['材料质量', `${format(p.materialMass, 1)} kg`],
    ['运动速度', `${format(b.velocity.length(), 2)} m/s`],
    ['角速度', `${format(b.angularVelocity.length(), 2)} rad/s`],
    ['存续连接', `${p.bonds.filter(id => !state.bonds[id].broken).length} / ${p.bonds.length}`],
    ['受力比值', format(p.stress, 3)],
    ['中心高度', `${format(b.position.y, 2)} m`],
  ];
  $('piece-values').innerHTML = entries.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}

function updateUI() {
  if (!sim) return;
  const state = timeline.state, past = timeline.isPast;
  $('launch-button').querySelector('span').textContent = running ? '暂停' : past ? '播放回放' : sim.launched ? '继续模拟' : '开始撞击';
  $('launch-button').querySelector('svg').innerHTML = running ? '<path d="M4 2h3v12H4zm5 0h3v12H9z" fill="currentColor"/>' : '<path d="m4 2 10 6-10 6V2Z" fill="currentColor"/>';
  $('status-text').textContent = past ? (running ? '正在回放' : '回放已暂停') : sim.fault ? '数值保护暂停' : running ? (sim.firstContact ? '碰撞后的运动' : '接近墙体') : sim.launched ? '已暂停 · 最新时刻' : '就绪';
  $('running-dot').style.background = running ? '#efb478' : '#90aaa6';
  $('metric-time').innerHTML = `${format(state.time, 3)} <small>s</small>`;
  $('metric-impulse').innerHTML = `${format(state.wallImpulse)} <small>N·s</small>`;
  $('metric-broken').textContent = state.brokenCount;
  $('metric-detached').innerHTML = `${state.detachedCount} <small>/ ${sim.pieces.length}</small>`;
  $('contact-time').textContent = state.firstContact ? `首撞 ${format(state.firstContact.time, 3)} s` : '尚未接触墙体';
  $('record-button').disabled = !sim.launched;
  const slider = $('timeline-range');
  slider.max = Math.max(1, timeline.latestTick); slider.value = timeline.cursorTick;
  slider.disabled = timeline.latestTick === 0;
  slider.style.setProperty('--value', `${timeline.latestTick ? timeline.cursorTick / timeline.latestTick * 100 : 0}%`);
  slider.setAttribute('aria-valuetext', `${format(timeline.time, 3)} 秒，共已记录 ${format(timeline.duration, 3)} 秒`);
  $('timeline-current').textContent = `${format(timeline.time, 3)} s`;
  $('timeline-duration').textContent = `${format(timeline.duration, 3)} s`;
  $('timeline-mode').textContent = past ? '回放' : running ? '记录中' : '最新';
  $('timeline-mode').classList.toggle('is-replay', past);
  $('replay-start').disabled = timeline.latestTick === 0;
  $('replay-latest').disabled = !past;
  $('timeline-hint').textContent = timeline.latestTick === 0 ? '开始撞击后自动记录 · 拖动回看整个过程' :
    past ? '拖动定位 · 播放或单步回看 · 回到最新可继续模拟' :
    running ? '正在记录 · 拖动时间轴会暂停' : '从头回放或拖动回看 · 继续模拟会延长记录';
  if (timeline.stride > 1) $('timeline-hint').textContent += ' · 长记录已降低姿态采样密度';
  $('timeline-contact').hidden = !sim.firstContact;
  if (sim.firstContact) {
    $('timeline-contact').style.left = `${Math.min(100, sim.firstContact.time / timeline.duration * 100)}%`;
    $('timeline-contact').title = `首次接触 ${format(sim.firstContact.time, 3)} s`;
  }
  updatePieceInfo(); drawChart();
}

function drawChart() {
  const canvas = $('impulse-chart'), rect = canvas.getBoundingClientRect(); if (!rect.width) return;
  const ratio = Math.min(devicePixelRatio, 2), w = rect.width, h = rect.height;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#2a3c49'; ctx.lineWidth = 1;
  for (const y of [0.3, 0.65, 0.98]) { ctx.beginPath(); ctx.moveTo(0, y * h); ctx.lineTo(w, y * h); ctx.stroke(); }
  const state = timeline.state, history = timeline.history(), duration = Math.max(state.time, 2), max = Math.max(1, ...history.map(p => p.impulse));
  ctx.beginPath(); ctx.moveTo(0, h - 1);
  for (const p of history) ctx.lineTo(p.time / duration * w, h - 1 - p.impulse / max * (h - 9));
  ctx.strokeStyle = '#d9a76f'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.lineTo((history.at(-1)?.time || 0) / duration * w, h); ctx.lineTo(0, h); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#e1b27a35'); gradient.addColorStop(1, '#e1b27a00'); ctx.fillStyle = gradient; ctx.fill();
  if (state.firstContact) { ctx.fillStyle = '#e6b77d'; ctx.beginPath(); ctx.arc(state.firstContact.time / duration * w, h - 2, 2, 0, Math.PI * 2); ctx.fill(); }
}

function recordExperiment() {
  if (!sim.launched) return toast('开始撞击后再记录实验。');
  records.unshift({ id: experimentNumber, ...timeline.snapshot() });
  if (records.length > 8) records.pop();
  $('compare-count').textContent = records.length;
  $('comparison-list').innerHTML = records.map((r, index) => `<article class="record-card"><h3>实验 ${String(r.id).padStart(3, '0')}<span>${format(r.time, 2)} s</span></h3><p>半径 ${format(r.params.radius, 2)} m · ${r.params.mass} kg · ${r.params.speed} m/s<br>墙厚 ${format(r.params.thickness, 2)} m · 强度 ${format(r.params.strength, 2)} MPa<br>位置 (${format(r.params.hitX, 2)}, ${format(r.params.hitY, 2)}) · 种子 ${r.params.seed}</p><div class="record-values"><span>断裂 ${r.broken}</span><span>脱离 ${r.detached}</span></div><p>接触冲量 ${format(r.wallImpulse)} N·s<br>${r.firstContact ? `首次接触 ${format(r.firstContact.time, 3)} s` : '未接触墙体'}</p><button data-record="${index}">载入此组参数</button></article>`).join('');
  $('comparison-list').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { writeParams(records[Number(button.dataset.record)].params); toast('参数已载入，应用后生效。'); }));
  toast('已记录当前模拟时刻的结果。');
}

function exportData() {
  const data = { application: '破壁 / Fracture Lab', version: '1.1.0', createdAt: new Date().toISOString(),
    notes: 'Simplified bonded 3D Voronoi polyhedra with closest-surface sphere contacts and welded internal features. Not calibrated structural engineering analysis.',
    engine: 'cannon-es 0.20.0', fixedTick: REPLAY_TICK, wall: WALL, current: timeline.snapshot(),
    viewingReplay: timeline.isPast, latest: sim.snapshot(), history: timeline.history(), comparisons: records };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `breakwall-${String(experimentNumber).padStart(3, '0')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出参数、接触记录与每次连接断裂。');
}

function frame(now) {
  const elapsed = Math.min((now - (lastFrame || now)) / 1000, 0.1); lastFrame = now;
  let budgetHit = false;
  if (running && !document.hidden) {
    accumulator += elapsed * Number($('time-scale').value);
    const start = performance.now();
    while (accumulator >= REPLAY_TICK) {
      accumulator -= REPLAY_TICK; advanceFrame();
      if (!running) break;
      if (performance.now() - start > 12) { budgetHit = true; break; }
    }
    if (accumulator > 0.12) accumulator = 0.12;
  }
  if (now - lastUI > 90) { updateUI(); $('performance-note').hidden = !(!replaying && budgetHit && accumulator > 0.07); lastUI = now; }
  view.render(); requestAnimationFrame(frame);
}

try {
  view = new SceneView($('scene'), selectPiece); reset(DEFAULTS, false);
  for (const key of keys) $(key).addEventListener('input', updateDraft);
  $('preset').addEventListener('change', e => writeParams(PRESETS[e.target.value]));
  $('apply-button').addEventListener('click', () => { try { reset(inputParams()); toast('已应用参数，实验回到初始状态。'); } catch (error) { toast(error.message); } });
  $('launch-button').addEventListener('click', toggleRunning);
  $('reset-button').addEventListener('click', () => { reset(); toast('已使用当前生效参数重置，种子保持不变。'); });
  $('step-button').addEventListener('click', () => {
    if (!sim.launched && dirty) return toast('请先应用修改后的参数。');
    running = false; accumulator = 0; replaying = timeline.isPast;
    if (!replaying) { if (sim.fault) return toast(sim.fault); sim.launch(); }
    advanceFrame(); updateUI();
  });
  $('timeline-range').addEventListener('pointerdown', () => { running = false; accumulator = 0; updateUI(); });
  $('timeline-range').addEventListener('input', e => seekReplay(e.target.value));
  $('replay-start').addEventListener('click', () => {
    if (!timeline.latestTick) return;
    timeline.seek(0); replaying = true; running = true; accumulator = 0; updateUI();
  });
  $('replay-latest').addEventListener('click', () => seekReplay(timeline.latestTick));
  $('time-scale').addEventListener('change', () => accumulator = 0);
  for (const mode of ['perspective', 'front', 'side']) $(`view-${mode}`).addEventListener('click', () => {
    view.setView(mode); document.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('active', b.id === `view-${mode}`));
  });
  $('home-view').addEventListener('click', () => $('view-perspective').click());
  $('stress-view').addEventListener('change', e => { view.stress = e.target.checked; $('stress-legend').hidden = !view.stress; });
  $('trajectory-view').addEventListener('change', e => view.showTrails = e.target.checked);
  $('mesh-view').addEventListener('change', e => view.showEdges = e.target.checked);
  $('close-piece').addEventListener('click', () => { view.selected = null; selectPiece(null); });
  $('help-button').addEventListener('click', () => { if (running) { running = false; updateUI(); } $('help-dialog').showModal(); });
  $('help-dialog').addEventListener('click', e => { if (e.target === $('help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  $('export-button').addEventListener('click', exportData);
  $('record-button').addEventListener('click', recordExperiment);
  for (const tab of ['parameters', 'comparison']) $(`${tab}-tab`).addEventListener('click', () => {
    for (const name of ['parameters', 'comparison']) {
      $(`${name}-panel`).hidden = name !== tab; $(`${name}-tab`).classList.toggle('active', name === tab); $(`${name}-tab`).setAttribute('aria-selected', name === tab);
    }
  });
  $('target-pad').addEventListener('pointerdown', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    $('hitX').value = (Math.round(((e.clientX - rect.left) / rect.width * 10 - 5) * 20) / 20).toFixed(2);
    $('hitY').value = (Math.round((1 - (e.clientY - rect.top) / rect.height) * 5.5 * 20) / 20).toFixed(2); updateDraft();
  });
  $('target-pad').addEventListener('keydown', e => {
    const moves = { ArrowLeft: ['hitX', -0.05], ArrowRight: ['hitX', 0.05], ArrowUp: ['hitY', 0.05], ArrowDown: ['hitY', -0.05] };
    if (moves[e.key]) { e.preventDefault(); const [id, delta] = moves[e.key]; $(id).value = Number($(id).value) + delta; updateDraft(); }
  });
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.id === 'target-pad' || $('help-dialog').open) return;
    if (e.code === 'Space') { e.preventDefault(); toggleRunning(); }
    if (e.code === 'KeyN') $('step-button').click();
    if (e.code === 'KeyR') $('reset-button').click();
  });
  document.addEventListener('visibilitychange', () => { lastFrame = 0; accumulator = 0; if (document.hidden) { running = false; updateUI(); } });
  $('loading').hidden = true;
  // Deliberately small, read-only debugging interface for repeatable browser verification.
  window.breakwall = Object.freeze({ getState: () => ({ running, dirty, selected, replaying: timeline.isPast,
    latestTime: timeline.duration, ...timeline.snapshot() }), getDraft: inputParams });
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error); $('loading').hidden = true; $('error-panel').hidden = false;
  $('error-text').textContent = `请使用支持 WebGL 2 的新版浏览器，并启用硬件加速。${error.message}`;
}
