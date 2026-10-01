import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar, DIMENSIONS } from './car.js';
import './style.css';

const icons={
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2.4 8.2M3 4v6h6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon:'<path d="M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  camera:'<path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  rotate:'<path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6M4 16a8 8 0 0 0 14 2l3-3m0 6v-6h-6"/>',
  bulb:'<path d="M8 18h8m-7 3h6M8 15a7 7 0 1 1 8 0v3H8Z"/>',
  cross:'<path d="m6 6 12 12M6 18 18 6"/>',
  move:'<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  ruler:'<path d="m3 16 13-13 5 5L8 21ZM12 7l3 3m-7 1 3 3m-7 1 3 3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
const logo='<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M12 6a15 15 0 1 0 12 0" fill="none" stroke="currentColor" stroke-width="3"/><path d="m18 2-9 17 9 10 9-10Z" fill="currentColor"/></svg>';
const presetList=[
  {id:'front3',label:'前侧 ¾',key:'1',pos:[-5.65,2.32,6.05],file:'01_front_three_quarter.jpg'},
  {id:'front',label:'正前',key:'2',pos:[-7.1,1.23,0],file:'05_front.jpg'},
  {id:'side',label:'正侧',key:'3',pos:[0,.93,8.25],file:'03_side_profile.jpg'},
  {id:'rear3',label:'后侧 ¾',key:'4',pos:[5.8,2.20,6.05],file:'04_rear_three_quarter.jpg'},
  {id:'rear',label:'车尾',key:'5',pos:[7.1,1.24,0],file:'02_rear.jpg'},
];
const features=[
  {num:'01',name:'低伏，蓄势。',en:'SCULPTED AERODYNAMICS',description:'宽体轮拱与下压式车头，勾勒贴地的车身姿态。前部导流开口、机盖风道与碳纤维前铲共同构成清晰的空气动力学层次。',view:'front3'},
  {num:'02',name:'每一寸，都有力量。',en:'PERFORMANCE IN DETAIL',description:'大尺寸多辐轮圈、穿孔制动盘与黄色卡钳。轮组藏于饱满的轮拱之下，侧裙和斜向侧部风道延续整车的流动线条。',view:'side'},
  {num:'03',name:'让气流，成为助力。',en:'RACING REAR WING',description:'大型固定式碳纤维尾翼，配合镂空支架与侧向端板。后部扩散器和纵向导流鳍，呈现 Racing 版本鲜明的赛道特征。',view:'rear3'},
];

document.querySelector('#app').innerHTML=`
  <header class="site-header">
    <a class="brand" href="#" aria-label="DENZA Z 首页">${logo}<span>DENZA<small>腾 势</small></span></a>
    <div class="header-rule"></div><span class="header-edition">Z <span>/</span> RACING</span>
    <nav aria-label="主导航"><button class="nav-link active" id="explore-nav">车型探索</button><button class="nav-link" id="details-nav">设计细节</button><button class="nav-link" id="reference-nav">参考影像 ${icon('image')}</button></nav>
    <div class="header-meta"><span class="status-dot"></span>INTERACTIVE STUDIO<span class="edition-year">2026</span></div>
  </header>
  <main>
    <section class="stage" aria-label="腾势 Z 三维交互展厅">
      <div class="watermark" aria-hidden="true">Z</div>
      <div id="canvas-host"></div>
      <div class="stage-heading">
        <div class="eyebrow"><span></span>THE RACING EDITION</div>
        <h1>DENZA <i>Z</i></h1>
        <div class="title-caption"><span>为赛道而生。</span><span class="tag">2026</span></div>
      </div>
      <aside class="config-panel" aria-label="展厅设置">
        <div class="panel-heading"><span>专属视界</span><span class="micro">CONFIGURE</span></div>
        <div class="paint-heading"><span>车身涂装</span><span id="paint-name">竞速蓝</span></div>
        <div class="swatches" role="group" aria-label="车漆颜色">
          <button class="swatch active" data-color="#0835d7" data-name="竞速蓝" style="--swatch:#124bf1" aria-label="竞速蓝" aria-pressed="true"></button>
          <button class="swatch" data-color="#bbc6cb" data-name="液态银" style="--swatch:#b8c4ca" aria-label="液态银" aria-pressed="false"></button>
          <button class="swatch" data-color="#161b24" data-name="曜石黑" style="--swatch:#242a32" aria-label="曜石黑" aria-pressed="false"></button>
        </div>
        <div class="panel-divider"></div>
        <button class="setting-row" id="lights-toggle" aria-pressed="true"><span>${icon('bulb')}车灯</span><span class="switch on"></span></button>
        <button class="setting-row" id="rotate-toggle" aria-pressed="false"><span>${icon('rotate')}自动环绕</span><span class="switch"></span></button>
        <button class="setting-row" id="dimensions-toggle" aria-pressed="false"><span>${icon('ruler')}尺寸标尺</span><span class="switch"></span></button>
        <div class="studio-switch" role="group" aria-label="展厅光照"><button data-theme="light" class="active" aria-pressed="true">${icon('sun')}光域</button><button data-theme="dark" aria-pressed="false">${icon('moon')}夜幕</button></div>
      </aside>
      <div class="canvas-toolbar"><button id="capture" title="保存车辆图片" aria-label="保存车辆图片">${icon('camera')}</button><button id="fullscreen" title="全屏展厅" aria-label="全屏展厅">${icon('expand')}</button></div>
      <div class="stage-index"><span class="index-line"></span><span id="view-index">01</span><span class="index-total">/ 05</span></div>
      <div class="view-bar"><span class="view-label">观察视角</span><div class="view-buttons" role="group" aria-label="预设视角">${presetList.map(p=>`<button data-view="${p.id}" class="${p.id==='front3'?'active':''}" aria-pressed="${p.id==='front3'}"><span>${p.label}</span><kbd>${p.key}</kbd></button>`).join('')}</div><button id="reset" class="reset-button" title="复位视角 (R)" aria-label="复位视角">${icon('reset')}</button></div>
      <div class="stage-bottom"><span><b class="live-dot"></b>LIVE 3D <span class="slash">/</span> <span id="studio-label">LIGHT STUDIO</span> <span class="fps-reading" id="fps-reading"></span></span><span class="interaction-hint">${icon('move')}拖动旋转 <i>·</i> 滚轮缩放 <i>·</i> 双击复位</span><span class="stage-code">Z — 026 / R</span></div>
      <div id="loading"><div class="loading-mark">Z</div><span>正在点亮展厅</span><div class="loading-bar"></div></div>
      <div id="toast" role="status" aria-live="polite"></div>
      <div class="feature-card" id="feature-card" hidden><button class="feature-close" id="feature-close" aria-label="关闭设计细节">${icon('cross')}</button><div class="feature-top"><span id="feature-num">01</span><span id="feature-en"></span></div><h2 id="feature-title"></h2><p id="feature-description"></p><div class="feature-footer"><div id="feature-dots">${features.map((_,i)=>`<button data-feature="${i}" aria-label="设计细节 ${i+1}"></button>`).join('')}</div><button id="next-feature">下一细节 ${icon('arrow')}</button></div></div>
    </section>
    <footer class="spec-strip"><div class="spec-intro"><span class="racing-slash">//</span><div>源于设计，忠于驾驭。<small>DENZA Z · RACING DESIGN STUDY</small></div></div><div class="spec"><span>车长 <em>LENGTH</em></span><div>4,870 <small>mm</small></div></div><div class="spec"><span>车宽 <em>WIDTH</em></span><div>1,990 <small>mm</small></div></div><div class="spec"><span>车高 <em>HEIGHT</em></span><div>1,350 <small>mm</small></div></div><div class="spec"><span>轴距 <em>WHEELBASE</em></span><div>2,780 <small>mm</small></div></div><button id="about-button" aria-label="查看作品说明">${icon('info')}</button></footer>
  </main>
  <dialog id="reference-dialog"><div class="dialog-top"><div><span class="eyebrow">DESIGN REFERENCES</span><h2>从每个角度，认识 Z。</h2></div><button class="dialog-close" aria-label="关闭参考影像">${icon('cross')}</button></div><div class="reference-frame"><img id="reference-image" src="./references/01_front_three_quarter.jpg" alt="腾势 Z 前侧四分之三参考图"/></div><div class="reference-bottom"><div class="reference-tabs">${presetList.map(p=>`<button data-reference="${p.id}" class="${p.id==='front3'?'active':''}">${p.label}</button>`).join('')}</div><span>原始素材 · 5 个视角</span></div><p class="reference-note">基于所提供图片构建的程序化外观模型。用于造型观察，不代表官方量产配置或工业 CAD 数据。</p></dialog>
  <dialog id="about-dialog"><div class="dialog-top"><div><span class="eyebrow">ABOUT THIS STUDY</span><h2>一场关于形态的探索。</h2></div><button class="dialog-close" aria-label="关闭作品说明">${icon('cross')}</button></div><p>以五张参考图为依据，通过代码构建的腾势 Z 2026 Racing 赛道版外观设计展示。主体由连续车身曲面、独立轮组、座舱与空气动力学套件组成。</p><p>页面尺寸为任务提供的参考值。外观为近似重建，后视镜与尾翼等附件可能超出主体尺寸；不代表官方车型、最终配置或精密工程模型。</p><div class="shortcut-grid"><span>旋转视角</span><b>拖动 / 单指滑动</b><span>缩放</span><b>滚轮 / 双指捏合</b><span>预设视角</span><b>1 — 5</b><span>复位</span><b>R / 双击</b><span>自动环绕</span><b>空格</b><span>车灯</span><b>L</b></div></dialog>
  <dialog id="capture-dialog"><div class="dialog-top"><div><span class="eyebrow">YOUR PERSPECTIVE</span><h2>定格这一刻。</h2></div><button class="dialog-close" aria-label="关闭车辆图片">${icon('cross')}</button></div><img id="capture-image" alt="车辆视图预览"/><div class="capture-footer"><span>当前视角 · PNG 原图</span><a id="capture-download" download="DENZA-Z-Racing.png">下载图片 ${icon('arrow')}</a></div></dialog>
`;

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const host=$('#canvas-host'),stage=$('.stage');
let renderer;
try {
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:true});
} catch(error) {
  $('#loading').innerHTML='<div class="loading-mark">Z</div><strong>当前浏览器无法启用 3D 展厅</strong><span>请开启硬件加速，或使用支持 WebGL 2 的新版 Chrome / Edge。</span>';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.8));
renderer.setClearColor(0xd2d7d9,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;
renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','可拖动旋转的腾势 Z 三维模型');renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xd4d9db,14,36);
const camera=new THREE.PerspectiveCamera(31,1,.05,70);
const target=new THREE.Vector3(0,.56,0);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=4.2;controls.maxDistance=13.7;controls.maxPolarAngle=Math.PI/2-.025;controls.minPolarAngle=.19;controls.autoRotateSpeed=.60;controls.zoomSpeed=.7;controls.rotateSpeed=.6;
const pmrem=new THREE.PMREMGenerator(renderer);
const environmentRoom=new RoomEnvironment();
const env=pmrem.fromScene(environmentRoom,.04);scene.environment=env.texture;scene.environmentIntensity=.97;environmentRoom.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xf0f8ff,0x8b9299,1.25));
const key=new THREE.DirectionalLight(0xffffff,2.65);key.position.set(-3.2,6.5,4.5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=3.8;key.shadow.camera.bottom=-3.8;key.shadow.camera.near=.2;key.shadow.camera.far=16;key.shadow.normalBias=.018;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key);
const rim=new THREE.DirectionalLight(0xcce4ff,1.85);rim.position.set(3,4,-4);scene.add(rim);
const fill=new THREE.DirectionalLight(0xffffff,.80);fill.position.set(-4,2,-5);scene.add(fill);
const vehicle=createCar();scene.add(vehicle.car);

const floorMat=new THREE.MeshStandardMaterial({color:0x9faab1,roughness:.77,metalness:.12});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=512;shadowCanvas.height=256;
const shadowCtx=shadowCanvas.getContext('2d');const gradient=shadowCtx.createRadialGradient(256,128,15,256,128,128);gradient.addColorStop(0,'rgba(4,8,15,0.57)');gradient.addColorStop(.56,'rgba(4,8,15,0.35)');gradient.addColorStop(1,'rgba(4,8,15,0)');shadowCtx.save();shadowCtx.translate(-256,0);shadowCtx.scale(2,1);shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,512,256);shadowCtx.restore();
const contact=new THREE.Mesh(new THREE.PlaneGeometry(6.3,3.10),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,opacity:.86}));contact.rotation.x=-Math.PI/2;contact.position.y=.0005;scene.add(contact);
const ringMat=new THREE.MeshBasicMaterial({color:0x8a949a,transparent:true,opacity:.18,depthWrite:false});
const floorRing=new THREE.Mesh(new THREE.RingGeometry(3.42,3.424,160),ringMat);floorRing.rotation.x=-Math.PI/2;floorRing.position.y=.001;scene.add(floorRing);
const groundMarkers=new THREE.Group();scene.add(groundMarkers);
for(let i=0;i<48;i++){
  const a=i*Math.PI/24,major=i%6===0;
  const tick=new THREE.Mesh(new THREE.PlaneGeometry(major?.09:.032,.008),ringMat);tick.rotation.x=-Math.PI/2;tick.rotation.z=-a;tick.position.set(Math.cos(a)*3.43,.0015,Math.sin(a)*3.43);groundMarkers.add(tick);
}

// Optional true-scale measurements, rendered in world space so they stay attached on orbit.
const measurement=new THREE.Group();measurement.visible=false;scene.add(measurement);
const measureMaterial=new THREE.LineBasicMaterial({color:0x53636b,transparent:true,opacity:.84});
function measureLine(a,b){measurement.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),measureMaterial));}
function measureLabel(text,position){
  const c=document.createElement('canvas');c.width=512;c.height=112;const ctx=c.getContext('2d');ctx.fillStyle='#e7ebed';ctx.fillRect(0,0,512,112);ctx.fillStyle='#25343c';ctx.font='500 39px Arial';ctx.textAlign='center';ctx.fillText(text,256,70);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,sizeAttenuation:true}));sprite.position.set(...position);sprite.scale.set(.95,.208,1);measurement.add(sprite);
}
measureLine([-2.435,.026,1.32],[2.435,.026,1.32]);
for(const x of [-2.435,2.435]){measureLine([x,.025,1.2],[x,.025,1.43]);measureLine([x,.025,.96],[x,.025,1.4]);}
measureLabel('4,870 mm', [0,.09,1.40]);
measureLine([-1.39,.025,-1.30],[1.39,.025,-1.30]);for(const x of [-1.39,1.39])measureLine([x,.025,-1.41],[x,.025,-.98]);measureLabel('2,780 mm', [0,.09,-1.41]);
measureLine([2.72,.026,-.995],[2.72,.026,.995]);for(const z of [-.995,.995])measureLine([2.60,.026,z],[2.84,.026,z]);measureLabel('1,990 mm',[2.86,.12,0]);

let isDark=false,lightsOn=true,activeView='front3',cameraTween=null,featureIndex=0,toastTimer,firstFrame=true;
let frameTimes=[],lastFrame=performance.now(),lastStats=lastFrame;
let visible=true;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
function updatePressed(button,value){button.setAttribute('aria-pressed',String(value));button.querySelector('.switch')?.classList.toggle('on',value);}
function setOrbit(value){controls.autoRotate=value;updatePressed($('#rotate-toggle'),value);}
function viewPosition(preset){
  const p=new THREE.Vector3(...preset.pos);const aspect=host.clientWidth/host.clientHeight;
  const fit=preset.id==='side'?1.23:(preset.id==='front'||preset.id==='rear'?1.0:1.08);
  if(aspect<fit)p.sub(target).multiplyScalar(fit/aspect).add(target);
  return p;
}
function setView(id,instant=false){
  const preset=presetList.find(p=>p.id===id)||presetList[0];activeView=preset.id;setOrbit(false);
  $$('[data-view]').forEach(b=>{const selected=b.dataset.view===preset.id;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  $('#view-index').textContent=String(presetList.indexOf(preset)+1).padStart(2,'0');
  const end=viewPosition(preset);
  if(instant||matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(end);controls.target.copy(target);cameraTween=null;renderer.domElement.dataset.cameraMotion='idle';controls.update();}
  else {cameraTween={start:performance.now(),from:camera.position.clone(),to:end,fromTarget:controls.target.clone()};renderer.domElement.dataset.cameraMotion='moving';}
}
function reset(){setView('front3');toast('已复位至前侧 ¾ 视角');}
controls.addEventListener('start',()=>{cameraTween=null;renderer.domElement.dataset.cameraMotion='idle';setOrbit(false);activeView='free';$$('[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});$('#view-index').textContent='自由';});
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#reset').addEventListener('click',reset);renderer.domElement.addEventListener('dblclick',reset);
$$('.swatch').forEach(b=>b.addEventListener('click',()=>{vehicle.setPaint(b.dataset.color);$('#paint-name').textContent=b.dataset.name;$$('.swatch').forEach(other=>{other.classList.toggle('active',other===b);other.setAttribute('aria-pressed',String(other===b));});}));
$('#lights-toggle').addEventListener('click',()=>{lightsOn=!lightsOn;vehicle.setLights(lightsOn);updatePressed($('#lights-toggle'),lightsOn);});
$('#rotate-toggle').addEventListener('click',()=>{cameraTween=null;setOrbit(!controls.autoRotate);});
$('#dimensions-toggle').addEventListener('click',()=>{measurement.visible=!measurement.visible;updatePressed($('#dimensions-toggle'),measurement.visible);});
function theme(dark){
  isDark=dark;stage.classList.toggle('dark',dark);scene.fog.color.set(dark?0x1e252d:0xd4d9db);floorMat.color.set(dark?0x252d37:0x9faab1);
  scene.environmentIntensity=dark?.74:.97;renderer.toneMappingExposure=dark?.87:.94;key.intensity=dark?2.25:2.65;rim.intensity=dark?2.65:1.85;fill.intensity=dark?.50:.80;ringMat.color.set(dark?0x8d9aa8:0x8a949a);ringMat.opacity=dark?.15:.18;
  measureMaterial.color.set(dark?0xd7ebfa:0x53636b);$('#studio-label').textContent=dark?'NIGHT STUDIO':'LIGHT STUDIO';
  $$('[data-theme]').forEach(b=>{const on=(b.dataset.theme==='dark')===dark;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});renderer.shadowMap.needsUpdate=true;
}
$$('[data-theme]').forEach(b=>b.addEventListener('click',()=>theme(b.dataset.theme==='dark')));
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{toast('此窗口暂不支持全屏，请放大浏览器窗口');}});
$('#capture').addEventListener('click',()=>{
  renderer.render(scene,camera);
  try{
    const output=document.createElement('canvas');output.width=renderer.domElement.width;output.height=renderer.domElement.height;
    const ctx=output.getContext('2d');ctx.fillStyle=isDark?'#1e252d':'#d4d9db';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(renderer.domElement,0,0);
    const url=output.toDataURL('image/png');
    $('#capture-image').src=url;$('#capture-download').href=url;$('#capture-download').download=`DENZA-Z-Racing-${activeView}.png`;
    $('#capture-dialog').showModal();
  }catch{toast('图片生成失败，请重试');}
});
function openReference(id='front3'){
  selectReference(id);$('#reference-dialog').showModal();
}
function selectReference(id){const p=presetList.find(p=>p.id===id);$('#reference-image').src=`./references/${p.file}`;$('#reference-image').alt=`腾势 Z ${p.label}参考图`;$$('[data-reference]').forEach(b=>b.classList.toggle('active',b.dataset.reference===id));setView(id);}
$('#reference-nav').addEventListener('click',()=>openReference(activeView==='free'?'front3':activeView));
$$('[data-reference]').forEach(b=>b.addEventListener('click',()=>selectReference(b.dataset.reference)));
$$('dialog').forEach(dialog=>{dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
function showFeature(i){featureIndex=i%features.length;const f=features[featureIndex];$('#feature-card').hidden=false;stage.classList.add('show-feature');$('#feature-num').textContent=f.num;$('#feature-en').textContent=f.en;$('#feature-title').textContent=f.name;$('#feature-description').textContent=f.description;$$('[data-feature]').forEach(b=>b.classList.toggle('active',Number(b.dataset.feature)===featureIndex));$('#details-nav').classList.add('active');$('#explore-nav').classList.remove('active');setView(f.view);}
function closeFeature(){$('#feature-card').hidden=true;stage.classList.remove('show-feature');$('#details-nav').classList.remove('active');$('#explore-nav').classList.add('active');}
$('#details-nav').addEventListener('click',()=>showFeature(0));$('#next-feature').addEventListener('click',()=>showFeature(featureIndex+1));$('#feature-close').addEventListener('click',closeFeature);$$('[data-feature]').forEach(b=>b.addEventListener('click',()=>showFeature(Number(b.dataset.feature))));
$('#explore-nav').addEventListener('click',closeFeature);$('.brand').addEventListener('click',e=>{e.preventDefault();closeFeature();reset();});
document.addEventListener('keydown',e=>{
  if($$('dialog').some(d=>d.open)||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  const number=Number(e.key);if(number>=1&&number<=5)setView(presetList[number-1].id);
  if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='l')$('#lights-toggle').click();
  if(e.code==='Space'&&!['BUTTON','A'].includes(document.activeElement.tagName)){e.preventDefault();$('#rotate-toggle').click();}
});
function resize(){
  const w=host.clientWidth,h=host.clientHeight,previousAspect=camera.aspect;renderer.setSize(w,h);camera.aspect=w/h;
  if(w<=640)camera.setViewOffset(w,h,0,-h*.12,w,h);else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  controls.maxDistance=camera.aspect<1?24:13.7;
  if(activeView!=='free')setView(activeView,true);
  else{
    const factor=Math.max(1,1.1/camera.aspect)/Math.max(1,1.1/previousAspect);
    camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();
  }
}
new ResizeObserver(resize).observe(host);resize();setView('front3',true);renderer.shadowMap.needsUpdate=true;
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;lastFrame=performance.now();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('图形连接中断，正在恢复…');});
renderer.domElement.addEventListener('webglcontextrestored',()=>{renderer.shadowMap.needsUpdate=true;toast('3D 展厅已恢复');});
const diagnostic={ready:false,dimensions:DIMENSIONS,renderer:'Three.js r180',frameRate:0,drawCalls:0,triangles:0,activeView:'front3',wheelCenters:vehicle.wheelGroups.map(w=>w.position.toArray())};
Object.defineProperty(window,'__DENZA_STUDIO__',{value:diagnostic,writable:false});
function animate(now){
  requestAnimationFrame(animate);if(!visible||now-lastFrame<1000/60-.8)return;
  const dt=now-lastFrame;lastFrame=now;if(dt>0)frameTimes.push(dt);
  if(cameraTween){const t=THREE.MathUtils.clamp((now-cameraTween.start)/850,0,1);const k=t*t*(3-2*t);camera.position.lerpVectors(cameraTween.from,cameraTween.to,k);controls.target.lerpVectors(cameraTween.fromTarget,target,k);if(t===1){cameraTween=null;renderer.domElement.dataset.cameraMotion='idle';}}
  controls.update();renderer.render(scene,camera);
  if(firstFrame){firstFrame=false;diagnostic.ready=true;requestAnimationFrame(()=>{$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').remove(),650);});}
  if(now-lastStats>1000){
    diagnostic.frameRate=Math.round(1000/(frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length)));diagnostic.drawCalls=renderer.info.render.calls;diagnostic.triangles=renderer.info.render.triangles;diagnostic.activeView=activeView;diagnostic.theme=isDark?'dark':'light';diagnostic.lights=lightsOn;diagnostic.autoRotate=controls.autoRotate;diagnostic.measurements=measurement.visible;diagnostic.paint=vehicle.materials.paint.color.getHexString();
    $('#fps-reading').textContent=`${diagnostic.frameRate} FPS`;
    renderer.domElement.dataset.diagnostics=JSON.stringify(diagnostic);
    frameTimes=[];lastStats=now;
  }
}
requestAnimationFrame(animate);
