import './style.css';
import './cinema-ui.css';
import { EngineControl } from './engine-control.js';
import './flight-control.css';
import { Simulation, BUILD, DEFAULTS, CONSTANTS, DT, PHASE_NAMES, toCSV, toEngineCSV, clamp } from './physics.js';
import { FlightScene } from './scene.js';
import { FIELD_COUNTS } from './effects.js';
import { LaunchAudio } from './sound.js';
import {PLUME_MODEL} from './plume-model.js';

const icons = {
  arrow: '<path d="M4 9h10M10 5l4 4-4 4"/>', pause: '<path d="M6 4v10M12 4v10"/>', play: '<path d="M5 3l10 6-10 6z"/>',
  reset: '<path d="M4 6a6 6 0 1 1-1 6M4 2v4H0"/>', download: '<path d="M9 2v9M5 8l4 4 4-4M3 13v3h12v-3"/>', close: '<path d="M4 4l10 10M14 4L4 14"/>',
  camera: '<path d="M2 6h4l1-2h4l1 2h4v9H2z"/><circle cx="9" cy="10" r="2.5"/>',
  logo: '<path d="M4 23L13 3l10 20M7 17h12M8 22l5-10 5 10"/><path d="M2 12a12 6-25 0 1 22-2"/>'
};
const icon = name => `<svg viewBox="0 0 ${name === 'logo' ? '26 26' : '18 18'}" aria-hidden="true">${icons[name]}</svg>`;
const sound = new LaunchAudio();
const cameras = [['launch','发射全景'],['follow','上升跟拍'],['entry','再入俯视'],['landing','着陆特写'],['inspect','箭体检视'],['pad','塔下仰拍'],['range','场区航拍'],['telephoto','远距追踪'],['separation','两级分离'],['upper','二级跟拍']];
const particleCount = Object.values(FIELD_COUNTS).reduce((sum,n)=>sum+n,0).toLocaleString('en-US');
const fields = { plume: '一级喷流', upperPlume:'二级喷流', steam: '喷水蒸汽', reentry: '再入热场', explosion: '一级爆炸', upperExplosion:'二级爆炸', dust: '地面扬尘' };
const stages = [['DELUGE','喷水 / 撤离'],['IGNITION','点火'],['BUILDUP','推力建立'],['ASCENT','上升'],['MECO','MECO'],['SEPARATION','分离'],['FLIP','转向'],['BOOSTBACK','返场'],['COAST','滑行'],['ENTRY','再入'],['LANDING','着陆点火'],['CONTACT','触地判定']];
document.querySelector('#app').innerHTML = `
<header class="topbar"><div class="brand"><div class="brand-symbol">${icon('logo')}</div><div><div class="brand-name">ASTRA</div><div class="brand-sub">FLIGHT DYNAMICS / MISSION CONTROL</div></div></div>
<nav class="nav" aria-label="工作区"><button class="active" data-tab="mission">任务控制</button><button data-tab="physics">动力学</button><button data-tab="history">运行记录</button></nav>
<div class="top-right"><div class="webgpu wait" id="gpu-status"><i class="dot"></i><span>INITIALIZING GPU</span></div><button class="text-button" id="export-top">导出数据 ${icon('download')}</button></div></header>
<main class="workspace"><aside class="sidebar"><div class="eyebrow">STARSHIP / INTEGRATED FLIGHT TEST</div><h1 class="mission-title">STARSHIP<br><span>FLIGHT CONTROL</span></h1><p class="mission-description">SUPER HEAVY 33 / SHIP 3 + 3<br>3D RIGID BODY · EARTH COASTAL RANGE</p><div class="small-rule"></div>
<div class="section-heading">任务配置 <span class="tiny" id="run-number">RUN 001</span></div><div class="preset"><select id="preset" aria-label="任务预设"><option value="nominal">01 · 标准回收</option><option value="late">02 · 延迟点火 / 坠毁</option><option value="short">03 · 短行程 / 同速对照</option><option value="custom">04 · 自定义实验</option></select></div>
<div class="param"><div class="param-header"><label for="ignition"><span class="param-index">01</span>着陆点火高度</label><span class="param-value"><b id="ignition-value">12,000</b> m</span></div><input id="ignition" type="range" min="80" max="30000" step="20" value="12000"><div class="param-range"><span>80 m</span><span>30,000 m</span></div></div>
<div class="param"><div class="param-header"><label for="stroke"><span class="param-index">02</span>塔架缓冲行程</label><span class="param-value"><b id="stroke-value">2.20</b> m</span></div><input id="stroke" type="range" min="0.08" max="3" step="0.02" value="2.2"><div class="param-range"><span>0.08 m</span><span>3.00 m</span></div></div>
<div class="param"><div class="param-header"><label for="fins"><span class="param-index">03</span>栅格舵控制启用高度</label><span class="param-value"><b id="fins-value">45.0</b> km</span></div><input id="fins" type="range" min="10000" max="55000" step="500" value="45000"><div class="param-range"><span>10 km</span><span>55 km</span></div><div class="param-note">修改参数后重新运行，可在记录中比较结果。</div></div>
<div class="config-lock" id="config-lock"></div><div class="actions"><button class="launch-btn" id="toggle" disabled><span>开始任务</span>${icon('arrow')}</button><button class="icon-btn" id="restart" title="重新开始 · R" aria-label="重新开始" disabled>${icon('reset')}</button></div>
<button class="engine-panel-shortcut" id="engine-sidebar-toggle">发动机故障试验 · 任意时刻关机 ↗</button><div class="playback"><span>仿真速度</span><div class="speeds"><button data-speed="1" class="active">1×</button><button data-speed="4">4×</button><button data-speed="16">16×</button></div></div>
<div class="groundtrack"><header><span>GROUND TRACK / 地面投影</span><span>+N ↑</span></header><canvas id="groundtrack" width="440" height="210"></canvas><footer><span id="downrange">E 0.0 km / N 0.0 km</span></footer></div><div class="flight-note"><div class="check">● <span id="system-note">等待 GPU 初始化</span></div><p>F = m·a / I·ω̇ = τ − ω × Iω<br>油门、故障和回收均写入飞行记录。</p><div class="hint-code">SPACE 暂停 / R 重置 / 1–9 / 0 机位 / F 沉浸</div></div></aside>
<section class="viewport" id="viewport" aria-label="交互三维飞行场景"><div class="view-top"><div><div class="mission-status"><i class="dot"></i><span id="phase-code">PRE-LAUNCH / SYSTEMS READY</span></div><div class="view-title" id="phase-title">静候点火</div><div class="view-sub" id="phase-sub">LC–01 海岸发射场 → CATCH–02 回收塔</div></div><div class="mission-clock"><div class="clock-label">MISSION ELAPSED TIME</div><div class="clock" id="clock">T−00:08.0</div><div class="run-chip">33 + 6 RAPTOR / SIMULATION</div></div></div><div class="scale-marker">≈124 m / REPRESENTATIVE STACK</div><div class="object-tag">26.00° N &nbsp; 97.15° W<br><span style="font-size:6px;line-height:2">EARTH / VIRTUAL COASTAL RANGE</span></div>
<div class="heat-note" id="heat-note" hidden><div class="heat-caption">箭体气动热流 <span>示意分布</span></div><div class="heat-ramp"></div><div class="heat-ticks"><span>0</span><span>10</span><span>20</span><span>30</span><span>≥40 kW/m²</span></div><div class="heat-values"><b id="heat-value">参考热流 0.00 kW/m²</b><span id="heat-temperature">平衡温度 288 K</span></div><div id="heat-status">当前无明显气动加热</div><small>固定色标 · 假彩色，不是可见火焰</small></div><div class="view-tools"><button id="engine-panel-toggle" aria-expanded="false" aria-controls="engine-console">发动机控制</button><button id="heat-toggle" aria-pressed="false" title="增强显示计算热流；不改变物理">热流着色 关</button><button id="sound-toggle" aria-pressed="false" title="程序合成音效 · 默认关闭">音效 关</button><button id="immersive" aria-pressed="false" title="沉浸观察 · F / Escape">沉浸观察 ↗</button></div><div class="immersive-player"><button id="cinema-toggle">开始任务</button><button id="cinema-reset" title="重新开始">${icon("reset")}</button><span>SPACE 暂停 · 1–9 / 0 机位 · ESC 返回</span></div><div class="view-bottom"><div><div class="cameras">${cameras.map(([key,label])=>`<button data-camera="${key}" class="${key==='launch'?'active':''}" title="${label}">${icon('camera')}${label}</button>`).join('')}</div><div class="camera-help">左键旋转 &nbsp;·&nbsp; 滚轮缩放 &nbsp;·&nbsp; 右键平移 &nbsp;·&nbsp; 双击复位机位</div></div><label class="auto-camera"><input type="checkbox" id="auto-camera" checked>自动机位</label></div>
<div class="result-card" id="result-card"></div><div class="drawer" id="drawer"></div><div class="loading" id="loading"><div class="spinner"></div><strong>正在建立试验场</strong><p>初始化 WebGPU、编译七套计算着色器。<br>所有结构、材质与场效果均由代码生成。</p></div></section>
<aside class="telemetry"><div class="section-heading">飞行遥测 <span class="live-label"><i class="dot"></i><span id="live-label">STANDBY</span></span></div>
<div class="metric-name">参考高度 <span>ALTITUDE</span></div><div class="big-metric"><span id="altitude">0.000</span><small>km</small></div><canvas class="alt-chart" id="alt-chart" width="410" height="104"></canvas>
<div class="metric-name">垂直速度 <span>VERTICAL VELOCITY</span></div><div class="big-metric" style="font-size:27px"><span id="vertical-speed">0.0</span><small>m/s</small></div>
<div class="metric-row"><div><div class="metric-name">当前推力</div><div class="metric-value"><span id="thrust">0.0</span> <small>MN</small></div></div><div><div class="metric-name">总质量</div><div class="metric-value"><span id="mass">55.50</span> <small>t</small></div></div><div><div class="metric-name">剩余推进剂</div><div class="metric-value"><span id="fuel">43.00</span> <small>t</small></div><div class="fuel-track"><div id="fuel-bar"></div></div></div><div><div class="metric-name">马赫数</div><div class="metric-value"><span id="mach">0.00</span> <small>Ma</small></div></div></div>
<div class="propulsion-summary"><div><span>一级 / 二级工作台数</span><b id="engine-count">0 / 0 <small>OF 33 / 6</small></b></div><div><span>当前推重比</span><b id="twr">0.00</b></div><div><span>净垂直加速度</span><b><span id="net-accel" style="font:inherit;color:inherit;display:inline">0.00</span> <small>m/s²</small></b></div><div><span>姿态倾角</span><b id="total-tilt">0.0°</b></div></div><div class="attitude"><div class="attitude-compass"><svg id="attitude-needle" viewBox="0 0 14 38"><path d="M7 1l4 8v21H3V9zM3 26l-2 9 6-3 6 3-2-9"/></svg></div><div><div class="attitude-label">姿态角</div><div class="attitude-value"><span id="angle">0.0</span>°</div></div><div><div class="attitude-label">角速度</div><div class="attitude-value"><span id="omega">0.00</span>°/s</div></div></div>
<div class="upper-telemetry"><div class="section-heading">二级遥测 <span id="upper-status" class="tiny">ATTACHED</span></div><div class="upper-readings"><span>高度 <b id="upper-altitude">—</b> km</span><span>推力 <b id="upper-thrust">—</b> MN</span><span>速度 <b id="upper-speed">—</b> km/s</span><span>余量 <b id="upper-fuel">18.0</b> t</span></div><button id="track-upper">跟拍二级 ↗</button></div><div class="field-list"><div class="section-heading">GPU 持久场 <span class="tiny">07 STORAGE SETS</span></div>${Object.entries(fields).map(([n,label])=>`<div class="field" id="field-${n}"><span>${label}</span><div class="field-bar"><i></i></div><strong>0.00</strong></div>`).join('')}<div class="field-foot"><span>${particleCount} PARTICLES</span><span id="gpu-steps">0 STEPS</span></div></div>
<div class="telemetry-export"><button id="export-json">JSON ${icon('download')}</button><button id="export-csv">CSV ${icon('download')}</button></div></aside>
<footer class="timeline"><div class="timeline-header"><span>飞行序列 <span style="margin-left:12px;font:8px var(--mono);color:#93a387">FLIGHT SEQUENCE</span></span><span class="timeline-progress" id="sequence-note">120 Hz PHYSICS / 30 Hz COMPUTE</span></div><div class="stage-list">${stages.map(([key,label])=>`<div class="stage" data-stage="${key}"><div class="stage-dot"></div><div>${label}</div><div class="stage-time">—</div></div>`).join('')}</div></footer></main><div class="toast" id="toast" role="status"></div>`;

const $ = id => document.getElementById(id), fmt = (n, digits=2) => Number.isFinite(n) ? n.toLocaleString('en-US', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
let config = { ...DEFAULTS }, sim = new Simulation(config), scene, ready = false, speed = 1, accumulator = 0, lastFrame = 0, lastUI = 0, runNumber = 1, logged = false, drawerTab = 'mission', toastTimer;
const engineControl=new EngineControl($('viewport'),{getSimulation:()=>sim,notify:toast});
$('engine-panel-toggle').onclick=$('engine-sidebar-toggle').onclick=()=>engineControl.setOpen(engineControl.element.hidden);
let history = [];
try { history = JSON.parse(localStorage.getItem('astra-history-v3') || '[]').slice(-8); } catch { /* file:// policies can disable persistence; in-memory history remains available. */ }
const number = (id, value, digits) => { $(id).textContent = fmt(value, digits); };
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200); }
function syncInputs() {
  $('ignition').value = config.landingIgnition; $('stroke').value = config.stroke; $('fins').value = config.finDeployAltitude;
  number('ignition-value', config.landingIgnition, 0); number('stroke-value', config.stroke, 2); number('fins-value', config.finDeployAltitude / 1000, 1);
  ['ignition','stroke','fins'].forEach(id => { const el = $(id); el.style.setProperty('--progress', `${(el.value - el.min) / (el.max - el.min) * 100}%`); });
}
function restart(newConfig = config) {
  config = { ...newConfig }; sim = new Simulation(config); accumulator = 0; runNumber++; logged = false;
  if (ready) { scene.reset(); sim.gpuEvidence.backend = 'WebGPU'; }
  $('run-number').textContent = `RUN ${String(runNumber).padStart(3,'0')}`;
  $('result-card').classList.remove('visible'); syncInputs(); updateUI(true);
}
const tailDuration = () => sim.phase === 'CRASHED' ? sim.touchdown.blastDuration * 1.6 : 8;
const finished = () => sim.missionComplete && sim.t - sim.terminalAt > tailDuration()
  && (!sim.upper?.touchdown || sim.t-sim.upper.touchdown.t>sim.upper.touchdown.blastDuration*1.6);
function toggle() {
  if (!ready) return;
  if (finished() && !sim.running) { restart(); sim.start(); }
  else if (sim.running) sim.pause();
  else sim.start();
  accumulator = 0; updateUI(true);
}
function saveRun() {
  if (logged || !sim.terminal) return;
  logged = true;
  history.push({ id: Date.now(), number: runNumber, config: { ...sim.config }, engineCommands:sim.engineCommands,scheduledCommands:sim.schedules,attitudeCommands:sim.events.filter(e=>e.type==='attitude-control'),result: sim.phase, touchdown: sim.touchdown, maxAltitude: sim.maxAltitude, propellantUsed: sim.config.initialFuel - sim.propellant });
  history = history.slice(-8); try { localStorage.setItem('astra-history-v3', JSON.stringify(history)); } catch { /* See persistence note above. */ }
  if (drawerTab === 'history') renderDrawer();
}
function tick() {
  if (!sim.step(DT)) return;
  scene.physicsStep(sim, DT);
  if (sim.tick % 4 === 0) scene.effects.step(sim, DT * 4);
  if (sim.terminal) saveRun();
  if (finished()) sim.pause();
}
function chart() {
  const canvas = $('alt-chart'), c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  c.clearRect(0,0,w,h); c.strokeStyle = '#294154'; c.lineWidth=1;
  for (let y=10;y<h;y+=30) { c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke(); }
  const points = sim.samples, n=points.length, maxH=Math.max(1000,sim.maxAltitude*1.15), timeSpan=Math.max(180,sim.t);
  c.beginPath();c.moveTo(0,h-4);
  for(let i=0;i<n;i+=Math.max(1,Math.floor(n/240))) c.lineTo(points[i].t/timeSpan*w,h-5-points[i].altitude/maxH*(h-14));
  const endX=sim.t/timeSpan*w,endY=h-5-sim.altitude/maxH*(h-14);c.lineTo(endX,endY);c.lineTo(endX,h);c.closePath();
  const fill=c.createLinearGradient(0,0,0,h);fill.addColorStop(0,'#60bed530');fill.addColorStop(1,'#60bed500');c.fillStyle=fill;c.fill();
  c.beginPath();for(let i=0;i<n;i+=Math.max(1,Math.floor(n/240))) { const x=points[i].t/timeSpan*w,y=h-5-points[i].altitude/maxH*(h-14);if(i===0)c.moveTo(x,y);else c.lineTo(x,y); }
  c.lineTo(endX,endY);c.strokeStyle='#6dc3dc';c.lineWidth=2;c.stroke();c.beginPath();c.arc(endX,endY,3,0,Math.PI*2);c.fillStyle='#e8ab6b';c.fill();
}
function updateUI(force=false) {
  const started=sim.phase!=='STANDBY';
  $('cinema-toggle').textContent=sim.running?'暂停任务':started?(finished()?'再次运行':'继续任务'):'开始任务';
  $('toggle').innerHTML=`<span>${sim.running?'暂停任务':started?(finished()?'再次运行':'继续任务'):'开始任务'}</span>${icon(sim.running?'pause':started?'play':'arrow')}`;
  ['ignition','stroke','fins'].forEach(id=>$(id).disabled=started && !finished());
  $('config-lock').textContent=started&&!finished()?'参数已锁定 · 重置后可修改':'';
  $('live-label').textContent=sim.running?'LIVE':started?'PAUSED':'STANDBY';
  $('system-note').textContent=sim.terminal?(sim.phase==='LANDED'?'回收完成 · 数据已记录':'触地失败 · 数据已记录'):sim.running?'两级动力与七场同步演化中':started?'所有仿真状态已冻结':'全部系统已就绪';
  $('phase-title').textContent=sim.phase==='STANDBY'?'静候点火':PHASE_NAMES[sim.phase];
  $('phase-code').textContent=sim.phase==='STANDBY'?'PRE-LAUNCH / SYSTEMS READY':`${sim.phase} / ${sim.running?'FLIGHT IN PROGRESS':'SIMULATION PAUSED'}`;
  $('phase-sub').textContent=sim.phase==='ENTRY'?'气动热流 · 速度与密度耦合':sim.phase==='FLIP'?'冷气推进器驱动 · 返场姿态机动':sim.phase==='BOOSTBACK'?'反向推力消除下程速度':sim.phase==='ASCENT'?'俯仰起始 → 顺速度方向重力转弯':'LC–01 海岸发射场 → CATCH–02 回收塔';
  $('heat-value').textContent=`参考热流 ${fmt(sim.heatFlux/1000,2)} kW/m²`;
  $('heat-temperature').textContent=`平衡温度 ${fmt(sim.skinTemperature,0)} K`;
  $('heat-status').textContent=sim.phase==='CRASHED'?'箭体已损毁，无可显示表面':sim.heatFlux<1?'当前无明显气动加热，蓝色表示低热流':`${PHASE_NAMES[sim.phase]} · 迎风区域加权显示`;
  const t=sim.t-8, abs=Math.abs(t), minutes=Math.floor(abs/60), seconds=abs%60;
  $('clock').textContent=`T${t<0?'−':'+'}${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;
  number('altitude',sim.altitude/1000,3);number('vertical-speed',sim.vy,1);number('thrust',sim.thrust/1e6,2);number('mass',sim.mass/1000,2);number('fuel',sim.propellant/1000,2);number('mach',sim.mach,2);
  document.body.classList.toggle('space-view',(scene?.mode==='upper'?(sim.upper?.altitude||sim.altitude):sim.altitude)>30000);
  $('upper-status').textContent=sim.upper?.phase||'ATTACHED';number('upper-altitude',(sim.upper?.altitude||sim.altitude)/1000,1);number('upper-thrust',(sim.upper?.thrust||0)/1e6,2);number('upper-speed',(sim.upper?.speed||sim.speed)/1000,2);number('upper-fuel',sim.fuel.upper/1000,2);
  $('engine-count').innerHTML=`${sim.engines.filter(e=>e.thrust>1000).length} / ${sim.upperEngines.filter(e=>e.thrust>1000).length} <small>OF 33 / 6</small>`;
  number('twr',sim.thrust/(sim.mass*sim.gravity),2);number('net-accel',sim.ay,2);$('total-tilt').textContent=(sim.tilt*180/Math.PI).toFixed(1)+'°';
  number('angle',sim.theta*180/Math.PI,1);number('omega',sim.omega*180/Math.PI,2);$('attitude-needle').style.transform=`rotate(${-sim.theta}rad)`;
  $('fuel-bar').style.width=`${sim.propellant/sim.config.initialFuel*100}%`;
  for(const name of Object.keys(fields)) { const f=sim.fields[name],el=$(`field-${name}`);el.querySelector('i').style.width=`${clamp(f.intensity/(name==='explosion'?12:1.2),0,1)*100}%`;el.querySelector('strong').textContent=f.intensity.toFixed(2);el.classList.toggle('active',f.intensity>.01); }
  $('gpu-steps').textContent=`${scene?.effects.dispatches.plume||0} STEPS`;
  const phaseEvents=sim.events.filter(e=>e.type==='phase'), currentIndex=stages.findIndex(([p])=>p===sim.phase);
  document.querySelectorAll('[data-stage]').forEach(el=>{const key=el.dataset.stage,e=phaseEvents.find(e=>e.phase===key);el.classList.toggle('done',!!e);el.classList.toggle('active',key===sim.phase||(key==='CONTACT'&&sim.terminal));el.querySelector('.stage-time').textContent=e?`${(e.t-8).toFixed(1)} s`:'—';});
  document.querySelectorAll('[data-camera]').forEach(el=>el.classList.toggle('active',el.dataset.camera===scene?.mode));
  if(sim.terminal){ const td=sim.touchdown;$('result-card').classList.add('visible');$('result-card').classList.toggle('crashed',!td.success);$('result-card').innerHTML=`<div class="eyebrow">${td.success?'MISSION ACCOMPLISHED':'TOUCHDOWN / IMPACT ANALYSIS'}</div><div class="result-title">${td.success?'回收塔捕获成功':'回收未完成'}</div><div class="result-detail">触地 ${fmt(Math.abs(td.vy),2)} m/s · 行程 ${fmt(td.strokeRequired,2)} / ${fmt(td.stroke,2)} m<br>${td.success?'缓冲容量充足 · 载荷在限值内':td.reasons.join(' / ')}<br>${td.success?`吸收冲量 ${fmt(td.netImpulse/1000,1)} kN·s`:`爆炸能量 ${fmt(td.explosionEnergy/1e9,2)} GJ`}</div>`; }
  engineControl.update();chart();drawGroundTrack(); if(drawerTab==='physics') updateDebug();
}
function drawGroundTrack(){
 const c=$('groundtrack').getContext('2d'),w=c.canvas.width,h=c.canvas.height;
 const extent=Math.max(4200,Math.abs(sim.x)*1.2,Math.abs(sim.z)*2),scale=(w-28)/extent,px=x=>20+x*scale,py=z=>h*.57-z*scale;
 c.fillStyle='#0c2232';c.fillRect(0,0,w,h);c.fillStyle='#17353a';c.fillRect(0,0,Math.min(w,px(3400)),h);c.strokeStyle='#2b6478';c.lineWidth=1;c.beginPath();c.moveTo(px(3400),0);c.lineTo(px(3400),h);c.stroke();
 c.strokeStyle='#284352';c.lineWidth=.6;for(let x=20;x<w;x+=44){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=18;y<h;y+=35){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
 c.strokeStyle='#efa75e';c.lineWidth=1.8;c.beginPath();for(let i=0;i<sim.samples.length;i+=Math.max(1,Math.floor(sim.samples.length/250))){const p=sim.samples[i];i?c.lineTo(px(p.x),py(p.z)):c.moveTo(px(p.x),py(p.z));}c.lineTo(px(sim.x),py(sim.z));c.stroke();
 for(const [x,color,label] of [[0,'#71cde3','LC-01'],[CONSTANTS.landingX,'#88d0a5','CATCH']]){c.fillStyle=color;c.fillRect(px(x)-3,py(0)-3,6,6);c.font='12px monospace';c.fillText(label,px(x)+5,py(0)+17);}
 c.fillStyle='#f0ce9a';c.beginPath();c.arc(px(sim.x),py(sim.z),4,0,6.29);c.fill();c.fillStyle='#588fa8';c.font='12px monospace';c.fillText((extent/1000).toFixed(1)+' km',w-80,h-8);$('downrange').textContent=`E ${(sim.x/1000).toFixed(2)} km / N ${(sim.z/1000).toFixed(2)} km`;
}
const debugGroups = [
 ['三维刚体 / 姿态与惯量',[['z','横向位置 Z','m'],['vz','横向速度 Z','m/s'],...['X','Y','Z','W'].map(a=>['quat'+a,'四元数 '+a,'']),...['X','Y','Z'].flatMap(a=>[['omega'+a,'体轴角速度 '+a,'rad/s'],['alpha'+a,'体轴角加速度 '+a,'rad/s²'],['inertia'+a,'对角惯量 '+a,'kg·m²'],['rotationStep'+a,'本步转动向量 '+a,'rad']])]],
 ['三轴力矩来源 / 物理步',[...['X','Y','Z'].flatMap(a=>[['stepEngineTorque'+a,'发动机力矩 '+a,'N·m'],['torqueImbalance'+a,'零摆角偏心力矩 '+a,'N·m'],['appliedAeroTorque'+a,'气动力矩 '+a,'N·m'],['stepRCSTorque'+a,'冷气力矩 '+a,'N·m'],['stepFinTorque'+a,'栅格舵力矩 '+a,'N·m'],['torqueTotal'+a,'净力矩 '+a,'N·m'],['gyroTorque'+a,'陀螺耦合 '+a,'N·m'],['padReactionTorque'+a,'发射架反力矩 '+a,'N·m']])]],
 ['逐台发动机 / 命令与燃料',[...[...Array.from({length:33},(_,i)=>'B'+(i+1)),...Array.from({length:6},(_,i)=>'S'+(i+1))].flatMap(id=>[[id+'_enabled',id+' 允许工作',''],[id+'_thrust',id+' 推力','N'],[id+'_gimbalX',id+' 喷口 X','rad'],[id+'_gimbalZ',id+' 喷口 Z','rad'],[id+'_fuelUsed',id+' 主机消耗','kg']])]],
 ['二级动力 / 共用账本',[['upperAltitude','二级高度','m'],['upperSpeed','二级速度','m/s'],['upperThrust','二级推力','N'],['upperTheta','二级姿态','rad'],['upperOmega','二级角速度','rad/s'],['upperThetaIntegral','二级累计体轴 ∫ωZ dt','rad'],['upperMass','二级质量','kg'],['upperInertia','二级转动惯量','kg·m²'],['fuelUpperMain','二级主机消耗','kg'],['fuelUpperRCS','二级控制消耗','kg']]],
 ['刚体状态 · SI',[['x','水平位置','m'],['y','质心高度','m'],['vx','水平速度','m/s'],['vy','垂直速度','m/s'],['theta','投影俯仰角','rad'],['omega','角速度','rad/s'],['alpha','角加速度','rad/s²'],['thetaIntegral','累计体轴 ∫ωZ dt','rad'],['inertia','转动惯量','kg·m²'],['mass','当前质量','kg'],['propellant','两级剩余推进剂合计','kg'],['boosterPropellant','一级储量','kg'],['upperPropellant','二级储量','kg'],['flightPathAngle','速度方向角','rad'],['angleOfAttack','攻角','rad'],['landingTargetX','回收区中心','m'],['predictedLandingX','弹道预测落点','m']]],
 ['平动力学 / 实际受力',[['integrationMass','本步积分质量','kg'],...['X','Y','Z'].flatMap(a=>[['stepThrustWorld'+a,'推力分量 '+a,'N'],['stepDragWorld'+a,'气动力分量 '+a,'N'],['stepGravity'+a,'重力加速度 '+a,'m/s²']]),['ax','净加速度 X','m/s²'],['ay','净加速度 Y','m/s²'],['az','净加速度 Z','m/s²']]],
 ['执行机构 / 燃料',[['thrust','主发动机推力','N'],['throttle','当前节流',''],['gimbal','喷口摆角','rad'],['torqueGimbal','喷口控制力矩','N·m'],['torqueRCS','冷气控制力矩','N·m'],['torqueFins','栅格舵力矩','N·m'],['fuelMain','主发动机消耗','kg'],['fuelRCS','冷气推进器消耗','kg'],['fuelFins','栅格舵泵消耗','kg'],['fuelGimbal','喷口伺服消耗','kg'],['fuelExplosion','爆炸燃烧消耗','kg'],['fuelDispersed','破裂抛散损失','kg']]],
 ['气动 / 热流',[['rho','大气密度','kg/m³'],['mach','马赫数',''],['cd','跨声速 Cd',''],['q','动压','Pa'],['area','有效迎风面积','m²'],['drag','气动阻力','N'],['heatFlux','热流指标','W/m²'],['skinTemperature','平衡温度指标','K'],['nozzleExpansion','喷流膨胀系数',''],['plumeHalfAngle','喷流半张角','rad'],['nozzlePressureRatio','喷口 / 环境压比',''],['machCellContrast','马赫环强度',''],['machCellSpacing','马赫环间距','m']]]
];
function renderDrawer() {
  const d=$('drawer');d.classList.toggle('open',drawerTab!=='mission');
  document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===drawerTab));
  if(drawerTab==='mission')return;
  d.innerHTML=`<div class="drawer-header"><div><div class="drawer-title">${drawerTab==='physics'?'动力学观测':'运行记录'}</div><div class="drawer-sub">${drawerTab==='physics'?'LIVE TELEMETRY / 120 Hz':'COMPARATIVE FLIGHT ARCHIVE'}</div></div><button class="drawer-close" aria-label="关闭面板">${icon('close')}</button></div>`;
  d.querySelector('.drawer-close').onclick=()=>{drawerTab='mission';renderDrawer();};
  if(drawerTab==='physics'){
    d.insertAdjacentHTML('beforeend',`<p>三维刚体由逐台发动机推力、偏心力矩、气动力、栅格舵和冷气推进器驱动。自动驾驶只给执行机构目标，姿态始终从三轴角速度积分。120 Hz 积分、30 Hz 机体遥测与 10 Hz 逐台引擎时间序列、参数、触发事件与触地能量可导出。</p><div class="formula">I·ω̇ = τ − ω × (I·ω) → quaternion<br>q̇ ∝ √ρ · |v|³ &nbsp; / &nbsp; E₍buffer₎ = (F − mg) · s</div>${debugGroups.map(([title,rows])=>`<div class="data-group"><h3>${title}</h3>${rows.map(([key,label,unit])=>`<div class="data-line"><span>${label}</span><b data-debug="${key}" data-unit="${unit}">—</b></div>`).join('')}</div>`).join('')}<div class="data-group"><h3>七场触发 / 当前强度</h3>${Object.entries(fields).map(([key,label])=>`<div class="data-line"><span>${label}</span><b data-field-debug="${key}">—</b></div>`).join('')}</div><div class="data-group" id="impact-debug"></div><div class="telemetry-export"><button id="drawer-json">导出 JSON ${icon('download')}</button><button id="drawer-csv">导出 CSV ${icon('download')}</button></div>`);
    $('drawer-json').onclick=()=>download('json');$('drawer-csv').onclick=()=>download('csv');updateDebug();
  }else{
    d.insertAdjacentHTML('beforeend',history.length?`<p>最近 8 次完成的运行。参数在每次起飞时固化，故障操作单独记录；恢复配置后可重复实验。</p>${[...history].reverse().map(r=>`<div class="run-card"><div class="run-card-top"><span>RUN ${String(r.number).padStart(3,'0')}</span><span class="result ${r.result==='CRASHED'?'crash':''}">${PHASE_NAMES[r.result]}</span></div><div class="run-config">点火 ${fmt(r.config.landingIgnition,0)} m · 行程 ${fmt(r.config.stroke,2)} m<br>栅格舵 ${fmt(r.config.finDeployAltitude/1000,1)} km</div><div class="run-metrics">触地速度 ${fmt(Math.abs(r.touchdown.vy),2)} m/s<br>所需缓冲 ${fmt(r.touchdown.strokeRequired,3)} m<br>触地动能 ${fmt(r.touchdown.kineticEnergy/1e6,3)} MJ<br>峰值高度 ${fmt(r.maxAltitude/1000,2)} km<br>发动机操作 ${r.engineCommands?.length||0} 次 · 高度计划 ${r.scheduledCommands?.length||0} 条</div><button data-restore="${r.id}">使用这组参数重新试验 ↗</button></div>`).join('')}`:'<div class="empty-history">试验记录尚为空。<br>完成标准回收后，再试试延迟点火，或缩短缓冲行程。</div>');
    d.querySelectorAll('[data-restore]').forEach(el=>el.onclick=()=>{const run=history.find(r=>r.id===Number(el.dataset.restore));restart(run.config);drawerTab='mission';renderDrawer();toast('已恢复参数，点击开始任务。');});
  }
}
function updateDebug() {
  const s=sim.snapshot();
  document.querySelectorAll('[data-debug]').forEach(el=>{const value=s[el.dataset.debug];el.textContent=`${Math.abs(value)>=1e6?value.toExponential(4):fmt(value,Math.abs(value)<1?5:3)} ${el.dataset.unit}`;});
  document.querySelectorAll('[data-field-debug]').forEach(el=>{const f=sim.fields[el.dataset.fieldDebug];el.textContent=`${f.triggerAt===null?'未触发':`${f.triggerAt.toFixed(3)} s`} / ${f.intensity.toFixed(4)}`;});
  if($('impact-debug')){const t=sim.touchdown;$('impact-debug').innerHTML='<h3>触地缓冲 / 爆炸账本</h3>'+(t?[['触地瞬间动能',t.kineticEnergy/1e6,'MJ'],['剩余推进剂',t.propellant,'kg'],['缓冲能量容量',t.capacity/1e6,'MJ'],['所需缓冲行程',t.strokeRequired,'m'],['净吸收冲量',t.netImpulse/1000,'kN·s'],['地面支撑冲量',t.groundImpulse/1000,'kN·s'],['停止时间估计',t.stoppingTime,'s'],['化学能（参与系数 0.12）',t.chemicalEnergy/1e9,'GJ'],['实际爆炸能量',t.explosionEnergy/1e9,'GJ'],['GPU 爆炸尺度',t.blastScale,''],['GPU 爆炸半径',t.blastRadius,'m'],['GPU 碎片射程参数',t.debrisRange,'m']].map(([l,value,u])=>`<div class="data-line"><span>${l}</span><b>${fmt(value,3)} ${u}</b></div>`).join(''):'<p>等待首次触地。缓冲变量、姿态、支撑载荷和落点共同参与判定。</p>');}
}
function fileDownload(content,filename,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function download(format) {
  const exportingSim=sim, wasRunning=sim.running;sim.pause();accumulator=0;updateUI(true);
  try{
    if(ready) exportingSim.gpuEvidence=await scene.effects.evidence();
    const data=exportingSim.exportData(), suffix=`run-${String(runNumber).padStart(3,'0')}-${data.result.toLowerCase()}`;
    data.visualization={build:BUILD,thermalGain:scene?.effects.u.thermalGain.value,thermalMode:$('heat-toggle').getAttribute('aria-pressed')==='true'?'surface-heatmap-and-enhanced-field':'subtle',thermalSurface:scene?.thermal.metadata(),plumeModel:PLUME_MODEL,exhaustEnvelopes:scene?[...scene.cinematic.boosterExhausts,...scene.cinematic.upperExhausts].map((e,i)=>({engine:exportingSim.allEngines()[i].id,length:e.length.value,intensity:e.power.value,halfAngle:e.angle.value,machSpacing:e.spacing.value,machContrast:e.contrast.value})):[],sourceAssets:'procedurally-generated'};
    if(format==='json')fileDownload(JSON.stringify(data,null,0),`astra-${suffix}.json`,'application/json');
    else{fileDownload(toCSV(data),`astra-${suffix}.csv`,'text/csv;charset=utf-8');fileDownload(toEngineCSV(data),`astra-${suffix}-engines.csv`,'text/csv;charset=utf-8');const {samples,engineTimeline,...metadata}=data;metadata.engineTimeline={columns:engineTimeline.columns,timeseries:`astra-${suffix}-engines.csv`};fileDownload(JSON.stringify(metadata,null,2),`astra-${suffix}-metadata.json`,'application/json');}
    toast(format==='json'?'已导出完整时间序列、事件与 GPU 读回证据。':'已导出机体 CSV、逐台引擎 CSV 和元数据 JSON。');
  }catch(error){toast(`导出失败：${error.message}`);}finally{if(wasRunning&&sim===exportingSim)sim.start();updateUI(true);}
}
function setImmersive(value){
 document.body.classList.toggle('immersive',value);$('immersive').textContent=value?'退出沉浸 ↙':'沉浸观察 ↗';$('immersive').setAttribute('aria-pressed',String(value));
 requestAnimationFrame(()=>scene?.resize());
}
$('immersive').onclick=()=>setImmersive(!document.body.classList.contains('immersive'));
$('heat-toggle').onclick=()=>{if(!ready)return;const enabled=$('heat-toggle').getAttribute('aria-pressed')!=='true';scene.thermal.setEnabled(enabled);scene.effects.u.thermalGain.value=enabled?1:.065;$('heat-toggle').setAttribute('aria-pressed',String(enabled));$('heat-toggle').textContent=enabled?'热流着色 开':'热流着色 关';$('heat-note').hidden=!enabled;scene.update(sim);scene.render(sim);updateUI(true);toast(enabled?'箭体热流图已开启，颜色对应右上角固定色标。':'已恢复自然观感。');};
$('sound-toggle').onclick=async()=>{try{await sound.toggle();$('sound-toggle').textContent=sound.enabled?'音效 开':'音效 关';$('sound-toggle').setAttribute('aria-pressed',String(sound.enabled));}catch(e){toast('浏览器暂不能启用音效：'+e.message);}};
$('track-upper').onclick=()=>{if(ready){scene.setCamera('upper',sim);scene.autoCamera=false;$('auto-camera').checked=false;updateUI(true);}};
$('cinema-toggle').onclick=toggle;$('cinema-reset').onclick=()=>restart();
$('toggle').onclick=toggle;$('restart').onclick=()=>restart();$('export-top').onclick=()=>download('json');$('export-json').onclick=()=>download('json');$('export-csv').onclick=()=>download('csv');
$('preset').onchange=()=>{const kind=$('preset').value;if(kind==='custom')return;restart({...DEFAULTS,...(kind==='late'?{landingIgnition:80}:kind==='short'?{stroke:0.08}:{})});toast('新参数已载入，点击开始任务。');};
for(const [id,key] of [['ignition','landingIgnition'],['stroke','stroke'],['fins','finDeployAltitude']])$(id).oninput=()=>{config[key]=Number($(id).value);$('preset').value='custom';syncInputs();if(sim.phase==='STANDBY'){sim=new Simulation(config);if(ready)sim.gpuEvidence.backend='WebGPU';updateUI(true);}};
document.querySelectorAll('[data-speed]').forEach(el=>el.onclick=()=>{speed=Number(el.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',b===el));});
document.querySelectorAll('[data-camera]').forEach(el=>el.onclick=()=>{if(ready){scene.setCamera(el.dataset.camera,sim);scene.autoCamera=false;$('auto-camera').checked=false;updateUI(true);}});
$('auto-camera').onchange=()=>{if(scene)scene.autoCamera=$('auto-camera').checked;};
$('viewport').ondblclick=e=>{if(ready&&e.target===scene.renderer.domElement)scene.setCamera('launch',sim);};
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{drawerTab=el.dataset.tab;renderDrawer();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(!engineControl.element.hidden)engineControl.setOpen(false);else setImmersive(false);}if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.code==='KeyR')restart();if(e.code==='KeyF')setImmersive(!document.body.classList.contains('immersive'));if(/^Digit[0-9]$/.test(e.code)&&ready){const mode=cameras[e.key==='0'?9:Number(e.key)-1][0];scene.setCamera(mode,sim);scene.autoCamera=false;$('auto-camera').checked=false;}});
syncInputs();

let fatalError=null;
function renderDiagnostics(){return {build:BUILD,userAgent:navigator.userAgent,localFile:location.protocol==='file:',pixelRatio:devicePixelRatio,webgpu:!!navigator.gpu,ready,renderHealth:scene?.renderHealth||null,gpuErrors:scene?.gpuErrors||[],error:fatalError?.message||null};}
window.astraDiagnostics=renderDiagnostics;
function showRenderFailure(error){
 if(fatalError)return;
 fatalError=error instanceof Error?error:new Error(String(error));ready=false;sim.pause();sound.context?.suspend();console.error(fatalError);
 $('toggle').disabled=true;$('restart').disabled=true;$('cinema-toggle').disabled=true;$('cinema-reset').disabled=true;
 $('gpu-status').classList.remove('wait');$('gpu-status').classList.add('error');$('gpu-status').querySelector('span').textContent='WEBGPU / RENDER FAILED';
 $('system-note').textContent='画面未通过渲染检查 · 仿真已冻结';
 let panel=$('loading');if(!panel){panel=document.createElement('div');panel.id='loading';panel.className='loading';$('viewport').append(panel);}
 panel.innerHTML='<strong>三维画面未能正常绘制</strong><p class="render-error-detail"></p><p>仿真已停止。可导出浏览器与图形错误信息，供兼容性排查。</p><div class="render-error-actions"><button id="retry-render">重新加载</button><button id="render-diagnostics">导出诊断</button></div>';
 panel.querySelector('.render-error-detail').textContent=fatalError.message;
 $('retry-render').onclick=()=>location.reload();$('render-diagnostics').onclick=()=>fileDownload(JSON.stringify(renderDiagnostics(),null,2),'astra-render-diagnostics.json','application/json');
}
async function initialize(){
 try{
  scene=new FlightScene($('viewport'));scene.onFailure=showRenderFailure;await scene.init(sim);if(fatalError)throw fatalError;ready=true;sim.gpuEvidence.backend='WebGPU';
  $('loading').remove();$('gpu-status').classList.remove('wait');$('gpu-status').querySelector('span').textContent='WEBGPU / ONLINE';$('toggle').disabled=false;$('restart').disabled=false;updateUI(true);
  // Read-only state and deterministic stepping hooks support repeatable integration / GPU QA.
  window.astra={get simulation(){return sim;},get scene(){return scene;},get ready(){return ready;},get sound(){return sound;},pause:()=>sim.pause(),start:()=>sim.start(),reset:restart,setSpeed:n=>{speed=n;},setCamera:mode=>scene.setCamera(mode,sim),
    advance:seconds=>{sim.start();const steps=Math.round(seconds/DT);for(let i=0;i<steps;i++)tick();sim.pause();scene.update(sim);scene.render(sim);updateUI(true);return {t:sim.t,phase:sim.phase,touchdown:sim.touchdown};},
    gpuEvidence:()=>scene.effects.evidence(),diagnostics:renderDiagnostics,exportData:()=>sim.exportData(),render:()=>{scene.update(sim);scene.render(sim);updateUI(true);}};
  requestAnimationFrame(frame);
 }catch(error){showRenderFailure(error);}
}
function frame(now){
 if(!ready)return;
 const elapsed=lastFrame?Math.min(0.1,(now-lastFrame)/1000):0;lastFrame=now;
 try{
  if(sim.running){accumulator+=elapsed*speed;let n=0;while(accumulator>=DT&&n<200){tick();accumulator-=DT;n++;if(!sim.running){accumulator=0;break;}}}
  scene.update(sim);scene.render(sim);sound.update(sim,scene.camera);
  if(now-lastUI>100){updateUI();lastUI=now;}
  requestAnimationFrame(frame);
 }catch(error){showRenderFailure(error);}
}
initialize();

