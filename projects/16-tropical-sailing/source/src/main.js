import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Ocean } from './ocean.js';
import { buildShip,Vessel } from './ship.js';
import { buildWorld } from './world.js';
import { bedHeight } from './bathymetry.js';
import './style.css';

const icons={
  logo:'<path d="M18 3v30M16 7 4 27h12V7Zm4 5 11 15H20V12ZM3 32h30l-6 5H9l-6-5ZM7 42q6-4 12 0t12 0"/>',
  wind:'<path d="M3 8h12c5 0 5-6 1-6M3 12h17c4 0 4 6 0 6M3 16h7c5 0 5 6 1 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>',
  expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  play:'<path d="m8 4 12 8-12 8V4Z"/>',
  reset:'<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  bay:'<path d="m2 15 5-7 5 7 4-4 6 6M2 20q4-3 8 0t8 0M17 3v5M14.5 5.5h5"/>',
  ship:'<path d="M12 3v13M10 5 4 14h6V5Zm4 3 6 6h-6V8ZM3 17h18l-4 4H7l-4-4Z"/>',
  water:'<path d="M2 8q4-4 8 0t8 0M2 14q4-4 8 0t8 0M2 20q4-4 8 0t8 0"/>',
  top:'<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="m8 12 4-4 4 4-4 4-4-4Z"/>',
  left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>'
};
const svg=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 ${name==='logo'?'36 46':'24 24'}" aria-hidden="true">${icons[name]}</svg>`;
const app=document.getElementById('app');
app.innerHTML=`
<canvas id="scene" aria-label="可旋转、缩放和平移的热带海湾帆船三维场景"></canvas>
<div class="ui" id="interface">
  <header class="topbar"><div class="brand">${svg('logo','mark')}<div><div class="wordmark">PELAGIC</div><small>海 湾 航 记 · AN OCEAN STUDY</small></div></div>
    <div class="topright"><span class="coordinates">THE WINDWARD ISLES &nbsp; / &nbsp; 18° N · 64° W</span><span class="status"><i></i><span id="gpu-status">WEBGPU</span></span><button class="icon-button" id="about" aria-label="作品与操作说明" title="作品与操作说明">${svg('info')}</button><button class="icon-button" id="hide-ui" aria-label="隐藏界面" title="隐藏界面 · H">${svg('expand')}</button></div>
  </header>
  <section class="intro"><div class="eyebrow">A STUDY OF WIND & WATER</div><h1>信风，向海而行。</h1><p>风掠过帆布，涌浪托起船身。<br>在一片始终变化的海上，慢下来。</p><div class="chapter"><b>01</b> 热带浅湾 &nbsp; / &nbsp; ASTER · 1724</div></section>
  <div class="compass" aria-label="船舶航向"><svg viewBox="0 0 70 70"><circle cx="35" cy="35" r="25" stroke-opacity=".35"/><path d="M35 5v7m0 46v7M5 35h7m46 0h7M14 14l5 5m32 32 5 5M14 56l5-5m32-32 5-5"/><text x="35" y="4" text-anchor="middle" stroke="none" fill="currentColor" font-size="7" font-family="Georgia">N</text><g class="needle" id="needle"><path d="m35 17-5 24 5-4 5 4-5-24Z" fill="#45675b" stroke="none"/><path d="m35 53-5-12 5-4 5 4-5 12Z" fill="#fbf8de" stroke="none"/></g><circle cx="35" cy="35" r="2" fill="#e6e8d6"/></svg><div class="compass-heading" id="heading">336° NNW</div></div>
  <div class="scene-label" id="island-label"><span>Isla Serena</span><small>宁 静 岛 &nbsp; · &nbsp; 珊 瑚 浅 湾</small></div>
  <section class="controls" aria-label="航行与天气控制"><div class="panel-title"><div>${svg('wind')}<strong>掌舵此刻</strong></div><span class="small">THE CONDITIONS</span></div>
    <div class="control"><div class="control-line"><label for="wind">风速<small>WIND</small></label><output id="wind-value" for="wind">8.0<small>m/s</small></output></div><input id="wind" class="slider" type="range" min="0" max="18" step="0.1" value="8" style="--fill:44.4%"/><div class="range-labels"><span>静风</span><span id="wind-description">清劲的信风</span><span>强风</span></div></div>
    <div class="control"><div class="control-line"><label for="speed">航速<small>VESSEL SPEED</small></label><output id="speed-value" for="speed">6.0<small>kn</small></output></div><input id="speed" class="slider" type="range" min="0" max="12" step="0.1" value="6" style="--fill:50%"/><div class="range-labels"><span>停船</span><span>目标航速 · 平滑加减速</span><span>12 kn</span></div></div>
    <div class="control"><div class="control-line"><label for="sun">太阳高度<small>SUN ELEVATION</small></label><output id="sun-value" for="sun">42<small>°</small></output></div><input id="sun" class="slider" type="range" min="5" max="78" step="1" value="42" style="--fill:50.7%"/><div class="range-labels"><span>金色日落</span><span>暖阳下的海湾</span><span>热带正午</span></div></div>
    <div class="helm-row"><span>改变航向</span><div class="helm"><button id="port" aria-label="按住向左转向" title="按住左转 · A">${svg('left')}</button><small>A &nbsp; / &nbsp; D</small><button id="starboard" aria-label="按住向右转向" title="按住右转 · D">${svg('right')}</button></div></div>
  </section>
  <div class="view-dock"><div class="view-caption">FIND YOUR PERSPECTIVE &nbsp; / &nbsp; 观察海的方式</div><div class="presets" role="group" aria-label="预设机位">${[['bay','海湾'],['ship','追船'],['water','水线'],['top','俯瞰']].map(([id,label])=>`<button class="preset ${id==='bay'?'active':''}" data-view="${id}" aria-pressed="${id==='bay'}">${svg(id)}${label}</button>`).join('')}</div><div class="view-actions"><span class="hint">拖动旋转 · 滚轮缩放 · 右键平移</span><button id="follow" class="active" title="跟随帆船" aria-pressed="true">${svg('ship')}<span class="follow-text">跟随</span></button><button id="pause-button" title="暂停模拟 · Space" aria-label="暂停模拟">${svg('pause')}</button><button id="reset" title="复位场景 · R">${svg('reset')}复位</button></div></div>
  <footer class="footer"><div class="telemetry"><span>ASTER <b>40 m</b></span><span>实速 <b id="actual-speed">3.9 kn</b></span><span>浪高 <b id="wave-height">1.6 m</b></span><span class="optional">海深 <b id="depth">28 m</b></span><span class="optional" id="sim-state">实时海洋</span></div><span class="edition">Wind shapes the water. Water carries the story.</span><span id="fps">— FPS</span></footer>
  <div class="toast" id="toast" role="status"></div>
</div>
<button class="hidden-toggle" id="show-ui" aria-label="显示界面">${svg('eye')}</button>
<div class="loader" id="loader" role="status"><div class="loader-inner">${svg('logo','mark')}<h2>PELAGIC</h2><p id="loading-status">正在唤醒海面 · 准备 WebGPU</p><div class="loading-line"></div></div></div>
<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="about-title"><article class="modal-card"><button class="icon-button" id="close-modal" aria-label="关闭说明">${svg('close')}</button><div class="eyebrow">PELAGIC / FIELD NOTES</div><h2 id="about-title">一艘船，与一片活着的海。</h2><p>ASTER 是一艘代码建模的双桅帆船，航行在虚构的热带浅湾。试着调低太阳，让光在浪尖上碎开；停下船，看看航迹如何慢慢散去。</p><div class="modal-grid"><div><h3>风与波</h3><p>48 个多方向谱分量 · 深水色散 · 水平尖峰位移。改变风速时，波相位连续，波幅与帆布受风状态平滑变化。</p></div><div><h3>船与水</h3><p>九点浮力采样读取 GPU 水面，积分计算升沉、横摇与俯仰。船首压力、V 形尾迹与泡沫共同写入持久扰动场。</p></div><div><h3>光与岸</h3><p>水深吸收、菲涅尔天空反射、太阳细碎高光与浅水焦散。近岸破碎、泡沫和湿沙保留上一帧的记忆。</p></div><div><h3>随心观察</h3><p>拖动旋转，滚轮缩放，右键平移。<kbd>A</kbd> <kbd>D</kbd> 按住转向，<kbd>空格</kbd> 暂停，<kbd>R</kbd> 复位，<kbd>H</kbd> 隐藏界面。</p></div></div><p class="fineprint">这是一项实时图形与近似物理实验。采用解析谱叠加与有限差分尾流，并非流体 CFD。海底透视与焦散为程序化近似；详见项目 README 的参数、验证记录和限制。经纬度与船名仅为虚构叙事。</p></article></div>`;

let renderer,scene,camera,controls,ocean,vessel,world,sunLight;
let time=0,wind=8,targetWind=8,sunAngle=42,targetSun=42,paused=false,follow=true,ready=false;
let lastNow=0,accumulator=0,fpsAvg=60,lastUi=0,tween=null,toastTimer=null;
let currentView='bay',fatal=false;const gpuErrors=[];
const verifyMode=new URLSearchParams(location.search).has('verify');let lastStats=0;
const sun=uniform(new THREE.Vector3());
const $=id=>document.getElementById(id);
const viewPresets={bay:{position:[76,36,108],target:[6,14,-18]},ship:{position:[51,27,64],target:[0,12,0]},water:{position:[40,5,58],target:[-2,8,0]},top:{position:[27,151,103],target:[3,0,-30]}};

async function init() {
  try {
    if(!window.isSecureContext)throw new Error('WebGPU 需要安全上下文。请通过 localhost 或 HTTPS 打开；单文件也可尝试在最新版 Chrome / Edge 中直接打开。');
    if(!navigator.gpu)throw new Error('当前浏览器未提供 WebGPU。请使用最新版 Chrome 或 Edge，并开启硬件加速。');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw new Error('没有可用的 WebGPU 适配器。请检查浏览器硬件加速与显卡驱动。');
    renderer=new THREE.WebGPURenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'high-performance',forceWebGL:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    await renderer.init();
    if(!renderer.backend.isWebGPUBackend)throw new Error('此作品需要原生 WebGPU 计算，当前后端未能启用。');
    renderer.backend.device.addEventListener('uncapturederror',event=>{gpuErrors.push(event.error.message);console.error('GPU validation:',event.error.message);if(!ready||gpuErrors.length===1)fail(new Error(event.error.message));});
    renderer.backend.device.lost.then(info=>{if(info.reason!=='destroyed')fail(new Error('GPU 设备连接中断，请重新打开页面。'+info.message));});
    $('loading-status').textContent='正在铺开海湾 · 生成帆船与海底';
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.5,14000);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=20;controls.maxDistance=850;controls.maxPolarAngle=Math.PI*.493;controls.minPolarAngle=.05;controls.enablePan=true;
    controls.addEventListener('start',()=>{follow=false;tween=null;updateFollow();document.querySelectorAll('.preset').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});
    scene.add(new THREE.HemisphereLight(0xd2eaf5,0x879572,2.1));
    sunLight=new THREE.DirectionalLight(0xffedcb,3.4);sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-125;sunLight.shadow.camera.right=125;sunLight.shadow.camera.top=125;sunLight.shadow.camera.bottom=-125;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=460;sunLight.shadow.bias=-.0004;sunLight.shadow.normalBias=.09;scene.add(sunLight,sunLight.target);
    ocean=new Ocean(renderer,scene,sun);const model=buildShip(scene,ocean.wind,ocean.time);vessel=new Vessel(model);vessel.targetSpeed=6*.514444;world=buildWorld(scene,ocean,sun);
    setView('bay',true);updateSun();
    $('loading-status').textContent='正在编译海浪与尾流计算着色器';
    ocean.step(1/60,0,vessel,wind);ocean.sample(vessel.points,1/30);
    await renderer.compileAsync(scene,camera);await renderer.renderAsync(scene,camera);
    // Surface the asynchronous WebGPU validation queue before dismissing loading.
    await renderer.backend.device.queue.onSubmittedWorkDone();
    if(fatal)return;
    ready=true;$('loader').classList.add('done');setTimeout(()=>$('loader').hidden=true,800);
    lastNow=performance.now();requestAnimationFrame(animate);
    window.__PELAGIC__={
      get state(){return {ready,time,wind,targetWind,sunAngle,paused,follow,view:currentView,boat:{x:vessel.x,z:vessel.z,heave:vessel.heave,pitch:vessel.pitch,roll:vessel.roll,heading:vessel.heading,yawRate:vessel.yawRate,speed:vessel.speed,targetSpeed:vessel.targetSpeed},fps:fpsAvg,gpuErrors:[...gpuErrors],readbacks:ocean.reads,queryError:ocean.queryError};},
      fieldStats:()=>ocean.stats(), renderer, ocean, vessel, setView,
      setParameters(values){if(values.wind!==undefined){$('wind').value=values.wind;$('wind').dispatchEvent(new Event('input'));}if(values.speed!==undefined){$('speed').value=values.speed;$('speed').dispatchEvent(new Event('input'));}if(values.sun!==undefined){$('sun').value=values.sun;$('sun').dispatchEvent(new Event('input'));}},
      reset, setPaused(value){paused=Boolean(value);updatePause();},
      capture:()=>renderer.domElement.toDataURL('image/png')
    };
  } catch(error){console.error(error);fail(error);}
}

function updateSun() {
  const elev=THREE.MathUtils.degToRad(sunAngle),az=-1.07;
  sun.value.set(Math.cos(elev)*Math.sin(az),Math.sin(elev),Math.cos(elev)*Math.cos(az));
  sunLight.position.copy(sun.value).multiplyScalar(240).add(new THREE.Vector3(vessel.x,0,vessel.z));
  sunLight.target.position.set(vessel.x,0,vessel.z);
  const sunset=1-THREE.MathUtils.smoothstep(sunAngle,7,40);sunLight.color.setRGB(1,.94-sunset*.28,.78-sunset*.40);sunLight.intensity=3.1-sunset*.8;
}
function animate(now) {
  if(fatal)return;
  requestAnimationFrame(animate);
  const elapsed=Math.min((now-lastNow)/1000,.067);lastNow=now;
  if(document.hidden){accumulator=0;return;}
  fpsAvg=THREE.MathUtils.lerp(fpsAvg,1/Math.max(.001,elapsed),.035);
  const before=new THREE.Vector3(vessel.x,0,vessel.z);
  if(!paused) {
    accumulator+=elapsed;
    while(accumulator>=1/60) {
      const dt=1/60;time+=dt;wind=THREE.MathUtils.lerp(wind,targetWind,1-Math.exp(-dt*.7));
      vessel.update(dt,ocean.latest,wind);ocean.step(dt,time,vessel,wind);accumulator-=dt;
    }
    ocean.sample(vessel.points,time);
  }
  sunAngle=THREE.MathUtils.lerp(sunAngle,targetSun,1-Math.exp(-elapsed*4));updateSun();
  if(follow&&!tween){const delta=new THREE.Vector3(vessel.x,0,vessel.z).sub(before);camera.position.add(delta);controls.target.add(delta);}
  if(tween) {
    tween.progress=Math.min(1,tween.progress+elapsed/1.15);const t=tween.progress*tween.progress*(3-2*tween.progress);
    const b=new THREE.Vector3(vessel.x,0,vessel.z);camera.position.lerpVectors(tween.from,tween.to.clone().add(b),t);controls.target.lerpVectors(tween.targetFrom,tween.targetTo.clone().add(b),t);
    if(tween.progress>=1)tween=null;
  }
  controls.update();
  camera.position.y=Math.max(camera.position.y,1.7);
  world.sky.position.copy(camera.position);
  try {renderer.render(scene,camera);} catch(error){fail(error);}
  if(now-lastUi>400){lastUi=now;updateTelemetry();app.dataset.simulation=JSON.stringify(window.__PELAGIC__?.state);}
  if(verifyMode&&now-lastStats>4000){lastStats=now;ocean.stats().then(stats=>{app.dataset.field=JSON.stringify({...stats,time});}).catch(error=>{app.dataset.fieldError=String(error);});}
}

function setView(id,immediate=false) {
  if(!vessel)return;currentView=id;app.dataset.view=id;const v=viewPresets[id];follow=true;updateFollow();
  const origin=new THREE.Vector3(vessel.x,0,vessel.z);
  const pos=new THREE.Vector3(...v.position),target=new THREE.Vector3(...v.target);
  if(innerWidth<680&&id==='bay'){pos.set(105,62,152);target.set(12,13,-7);}
  if(immediate){camera.position.copy(pos).add(origin);controls.target.copy(target).add(origin);controls.update();tween=null;}
  else tween={from:camera.position.clone(),to:pos,targetFrom:controls.target.clone(),targetTo:target,progress:0};
  document.querySelectorAll('.preset').forEach(b=>{const active=b.dataset.view===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('island-label').style.opacity=id==='bay'?'1':'0';
}
function reset() {if(!vessel)return;ocean.reset();vessel.reset();vessel.targetSpeed=Number($('speed').value)*.514444;vessel.helm=0;setView('bay');toast('已回到海湾起点');}
function updateFollow(){$('follow').classList.toggle('active',follow);$('follow').setAttribute('aria-pressed',String(follow));}
function updatePause(){$('pause-button').innerHTML=svg(paused?'play':'pause');$('pause-button').setAttribute('aria-label',paused?'继续模拟':'暂停模拟');$('sim-state').textContent=paused?'模拟已暂停':'实时海洋';}
function updateTelemetry() {
  const degrees=(THREE.MathUtils.radToDeg(vessel.heading)+360)%360;
  $('needle').style.transform=`rotate(${degrees}deg)`;$('heading').textContent=`${Math.round(degrees).toString().padStart(3,'0')}° ${['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees/45)%8]}`;
  $('actual-speed').textContent=(vessel.speed/.514444).toFixed(1)+' kn';$('wave-height').textContent=(4*.48*(.055+Math.pow(wind/9,1.65))).toFixed(1)+' m';
  $('fps').textContent=Math.round(fpsAvg)+' FPS';
  $('depth').textContent=(-bedHeight(vessel.x,vessel.z)).toFixed(1)+' m';
  if(ocean.queryError){$('gpu-status').textContent='采样异常';$('sim-state').textContent='GPU 采样失败';}
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2100);}
function fail(error) {
  if(fatal)return;fatal=true;ready=false;
  const loader=$('loader');loader.hidden=false;loader.classList.remove('done');loader.classList.add('failed');
  const inner=loader.querySelector('.loader-inner');inner.innerHTML=`${svg('logo','mark')}<h2>海湾还在等待风起</h2><p>此作品需要 WebGPU。请使用最新版 Chrome 或 Edge，<br>并开启浏览器的硬件加速。<br>也可在项目目录运行 npm install 与 npm run dev，<br>再打开终端给出的 localhost 地址。</p><pre id="error-detail"></pre><button id="retry">重新尝试</button>`;
  $('error-detail').textContent=String(error.message||error);$('retry').onclick=()=>location.reload();
  window.__PELAGIC_ERROR__=String(error.message||error);
}

for(const name of ['wind','speed','sun'])$(name).addEventListener('input',event=>{
  const value=Number(event.target.value),min=Number(event.target.min),max=Number(event.target.max);event.target.style.setProperty('--fill',((value-min)/(max-min)*100)+'%');
  $(`${name}-value`).innerHTML=(name==='sun'?value:value.toFixed(1))+`<small>${name==='wind'?'m/s':name==='speed'?'kn':'°'}</small>`;
  if(name==='wind'){targetWind=value;$('wind-description').textContent=value<2?'平静的海风':value<6?'柔和的微风':value<11?'清劲的信风':'强劲的季风';}
  if(name==='speed'&&vessel)vessel.targetSpeed=value*.514444;
  if(name==='sun')targetSun=value;
});
document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('follow').onclick=()=>{follow=!follow;updateFollow();toast(follow?'镜头跟随帆船':'自由观察海湾');};
$('pause-button').onclick=()=>{paused=!paused;updatePause();};$('reset').onclick=reset;
const captureButton=document.createElement('button');captureButton.id='capture';captureButton.title='保存当前场景为 PNG';captureButton.setAttribute('aria-label','保存场景留影');captureButton.innerHTML=svg('camera')+'<span class="capture-text">留影</span>';document.querySelector('.view-actions').insertBefore(captureButton,$('reset'));
const photoModal=document.createElement('div');photoModal.className='modal';photoModal.id='photo-modal';photoModal.setAttribute('role','dialog');photoModal.setAttribute('aria-label','海湾留影预览');
photoModal.innerHTML='<article class="photo-card"><img id="photo-preview" alt="当前海湾场景留影"/><div class="photo-actions"><span>PELAGIC · 此刻的海</span><a id="photo-download" download="海湾航记-留影.png">下载 PNG</a><button id="photo-close">返回海湾</button></div></article>';
document.body.appendChild(photoModal);let photoURL=null;
$('photo-close').onclick=()=>photoModal.classList.remove('open');photoModal.onclick=e=>{if(e.target===photoModal)photoModal.classList.remove('open');};
captureButton.onclick=()=>{
  if(!ready)return;renderer.render(scene,camera);
  renderer.domElement.toBlob(blob=>{if(!blob)return;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=URL.createObjectURL(blob);$('photo-preview').src=photoURL;$('photo-download').href=photoURL;photoModal.classList.add('open');$('photo-close').focus();},'image/png');
};
function showAbout(open){$('modal').classList.toggle('open',open);if(open)$('close-modal').focus();else $('about').focus();}
$('about').onclick=()=>showAbout(true);$('close-modal').onclick=()=>showAbout(false);$('modal').onclick=e=>{if(e.target===$('modal'))showAbout(false);};
function hideUi(hide){$('interface').classList.toggle('hidden',hide);$('show-ui').classList.toggle('visible',hide);}
$('hide-ui').onclick=()=>hideUi(true);$('show-ui').onclick=()=>hideUi(false);
for(const [name,direction]of [['port',-1],['starboard',1]]){
  $(name).onpointerdown=e=>{if(vessel){vessel.helm=direction;vessel.targetHeading+=direction*.13;}e.currentTarget.setPointerCapture(e.pointerId);};
  $(name).onpointerup=$(name).onpointercancel=()=>{if(vessel)vessel.helm=0;};
}
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement)return;
  if(e.key==='Escape'){showAbout(false);photoModal.classList.remove('open');}
  if(e.code==='Space'){e.preventDefault();if(!e.repeat){paused=!paused;updatePause();}}
  if(e.code==='KeyA'&&vessel){vessel.helm=-1;if(!e.repeat)vessel.targetHeading-=.13;}if(e.code==='KeyD'&&vessel){vessel.helm=1;if(!e.repeat)vessel.targetHeading+=.13;}
  if(e.code==='KeyR')reset();if(e.code==='KeyH'&&!e.repeat)hideUi(!$('interface').classList.contains('hidden'));
});
window.addEventListener('keyup',e=>{if((e.code==='KeyA'||e.code==='KeyD')&&vessel)vessel.helm=0;});
window.addEventListener('blur',()=>{if(vessel)vessel.helm=0;});
window.addEventListener('resize',()=>{if(!renderer)return;renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
document.addEventListener('visibilitychange',()=>{lastNow=performance.now();accumulator=0;});

init();

