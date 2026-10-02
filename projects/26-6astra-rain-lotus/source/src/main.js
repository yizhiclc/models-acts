import './style.css';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPlants,updatePlants } from './plants.js';
import { createEnvironment,createSky } from './environment.js';
import { PondGPU } from './gpu.js';
import { LeafWater } from './leaf-water.js';
import { createWater,createRain } from './water.js';
import { PondPost } from './post.js';
import { FIXED_DT,RESOLUTION,SIZE,diameterToVolume } from './config.js';

const $=s=>document.querySelector(s);
const settings={rain:.35,wind:.5,paused:false,single:false,quality:false};
const diagnostics={ready:false,frames:0,errors:[],fps:0,simulationTime:0,slowFrames:0};
let renderer;
function showError(error){
  console.error(error);diagnostics.errors.push(String(error.message||error));
  $('#loading').hidden=true;$('#error').hidden=false;$('#error-detail').textContent=error.message||String(error);
  renderer?.setAnimationLoop(null);
}
$('#retry').onclick=()=>location.reload();
window.addEventListener('error',e=>{if(diagnostics.ready)showError(e.error||e.message);});
window.addEventListener('unhandledrejection',e=>showError(e.reason));
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3400);}
const presets={
  overview:{position:[4.35,3.45,6.85],target:[-.2,.05,-.1],focus:7.5,aperture:.7},
  water:{position:[2.5,.39,3.7],target:[-.35,.15,-.6],focus:3.1,aperture:1.2},
  leaf:{position:[-.04,.79,2.71],target:[-.7,.185,1.85],focus:1.2,aperture:3.6},
  top:{position:[.05,8.7,.12],target:[0,0,0],focus:8.7,aperture:.35}
};
const lerp=(a,b,t)=>a+(b-a)*t;
function halton(i,b){let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;}

async function start(){
  if(!window.isSecureContext)throw new Error('当前页面不是安全上下文。请先运行 npm run dev，再打开终端给出的 localhost 地址。');
  if(!navigator.gpu)throw new Error('浏览器未提供 WebGPU 接口。');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('无法获得 WebGPU 适配器，请检查显卡驱动与浏览器硬件加速。');
  renderer=new THREE.WebGPURenderer({canvas:$('#scene'),antialias:false,powerPreference:'high-performance'});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend||!renderer.backend.device)throw new Error('WebGPU 初始化未成功，不能运行 GPU 波场。');
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const device=renderer.backend.device;
  device.addEventListener('uncapturederror',e=>showError(new Error(`GPU 运行错误：${e.error.message}`)));
  device.lost.then(info=>showError(new Error(`GPU 设备连接已中断：${info.message||info.reason}。可重新加载恢复。`)));
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.035,100);
  camera.position.fromArray(presets.overview.position);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.fromArray(presets.overview.target);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=.4;controls.maxDistance=18;controls.maxPolarAngle=Math.PI*.487;controls.minPolarAngle=.015;controls.panSpeed=.5;controls.rotateSpeed=.48;controls.zoomSpeed=.7;
  controls.update();
  const environment=createEnvironment(scene),plants=createPlants(scene);
  // A dedicated underwater layer makes refraction affordable and excludes canopies.
  environment.bed.layers.enable(1);environment.watergrass.layers.enable(1);
  scene.traverse(o=>{if(o.isLight||o.geometry?.type==='TubeGeometry')o.layers.enable(1);});
  $('#loading-status').textContent='正在计算阴天天空与水面光照…';
  const sky=await createSky(renderer,scene);
  const simulation=new PondGPU(renderer,plants.leaves,plants.stems);await simulation.init();
  const leafWater=new LeafWater(scene,plants.leaves,(...args)=>simulation.addDrop(...args),sky.sky);
  const rain=createRain(scene,simulation),water=createWater(renderer,scene,simulation),post=new PondPost(renderer,camera);
  // Lens framebuffer copies belong to the main view only. Keeping microscopic
  // beads out of the planar camera also avoids recursive screen-space lenses.
  leafWater.mesh.layers.set(2);
  water.mirror.reflector.getVirtualCamera(camera).layers.set(0);
  let width=innerWidth,height=innerHeight,pixelRatio=1,transition=null,lastMove=performance.now(),samples=0,currentView='overview';
  let lastTime=performance.now(),accumulator=0,readClock=0,maskClock=0,statsClock=0,frameCount=0,elapsedFrames=0;
  function resize(){
    width=innerWidth;height=innerHeight;pixelRatio=Math.min(devicePixelRatio,settings.quality?1.75:1.25);
    renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    water.resize(width*pixelRatio,height*pixelRatio,settings.quality);post.resize(Math.round(width*pixelRatio),Math.round(height*pixelRatio));samples=0;lastMove=performance.now();
  }
  resize();window.addEventListener('resize',resize);
  controls.addEventListener('change',()=>{lastMove=performance.now();samples=0;});
  controls.addEventListener('start',()=>{transition=null;});
  function setView(name,immediate=false){
    const view=presets[name];currentView=name;
    transition={position:new THREE.Vector3(...view.position),target:new THREE.Vector3(...view.target),focus:view.focus,aperture:view.aperture};
    if(immediate){camera.position.copy(transition.position);controls.target.copy(transition.target);post.focus.value=view.focus;post.aperture.value=view.aperture;transition=null;controls.update();}
    document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});samples=0;
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#reset').onclick=()=>setView('overview');
  function syncControls(){
    $('#rain').style.setProperty('--fill',`${settings.rain*100}%`);$('#wind').style.setProperty('--fill',`${settings.wind/3*100}%`);
    $('#rain-value').textContent=`${Math.round(settings.rain*100)}%`;$('#wind-value').textContent=`${settings.wind.toFixed(1)} m/s`;
    $('#weather-label').textContent=settings.paused?'雨歇':settings.rain<.16?'零星':settings.rain<.46?'细雨':settings.rain<.75?'阵雨':'骤雨';
    $('#pause').setAttribute('aria-pressed',settings.paused);$('#pause-label').textContent=settings.paused?'继续降雨':'暂停降雨';$('#pause-symbol').textContent=settings.paused?'▷':'Ⅱ';
    $('#drop').classList.toggle('active',settings.single);$('#drop').textContent=settings.single?'落下一滴':'单滴观察';
    $('#mode-hint').textContent=settings.single?'点击开阔水面，观察单滴传播与反射。':settings.paused?'旧涟漪仍在传播；无风时会逐渐平静。':'停雨后，涟漪仍会继续传播。';
  }
  $('#rain').oninput=e=>{settings.rain=Number(e.target.value)/100;syncControls();};
  $('#wind').oninput=e=>{settings.wind=Number(e.target.value)/10;syncControls();};
  function toggleRain(){settings.paused=!settings.paused;settings.single=false;syncControls();}
  $('#pause').onclick=toggleRain;
  function manualDrop(x=-.03,z=2.15){
    leafWater.falling.push({position:new THREE.Vector3(x,.85,z),vx:0,vy:-1.2,vz:0,volume:diameterToVolume(.004)});
  }
  $('#drop').onclick=()=>{settings.single=true;settings.paused=true;settings.wind=0;$('#wind').value=0;syncControls();manualDrop();toast('点击开阔水面落雨；旧波场会保留。');};
  $('#quality').onclick=()=>{settings.quality=!settings.quality;$('#quality').setAttribute('aria-pressed',settings.quality);$('#quality').innerHTML=settings.quality?'精细画质 <span>✓</span>':'精细画质 <span>↗</span>';resize();toast(settings.quality?'视角静止后开始多帧累积。':'已切换至实时画质。');};
  $('#collapse').onclick=()=>{const hidden=!$('#controls-body').hidden;$('#controls-body').hidden=hidden;$('#collapse').textContent=hidden?'＋':'−';$('#collapse').setAttribute('aria-expanded',!hidden);$('#collapse').setAttribute('aria-label',hidden?'展开天气控制':'收起天气控制');};
  $('#info-toggle').onclick=()=>{$('#info').hidden=!$('#info').hidden;$('#info-toggle').setAttribute('aria-expanded',!$('#info').hidden);};
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'){e.preventDefault();toggleRain();}if(e.key.toLowerCase()==='r')setView('overview');if(e.key==='Escape')$('#info').hidden=true;});
  let pointerStart=null;const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
  $('#scene').addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});
  $('#scene').addEventListener('pointerup',e=>{
    if(!settings.single||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;
    raycaster.setFromCamera(new THREE.Vector2(e.clientX/width*2-1,1-e.clientY/height*2),camera);
    if(raycaster.ray.intersectPlane(plane,hit)&&Math.abs(hit.x)<3.85&&Math.abs(hit.z)<3.85){
      const x=Math.floor((hit.x/SIZE+.5)*RESOLUTION),z=Math.floor((hit.z/SIZE+.5)*RESOLUTION),i=(z*RESOLUTION+x)*2;
      if(simulation.maskData[i]||simulation.maskData[i+1]){toast('选一处没有荷叶遮挡的水面。');return;}manualDrop(hit.x,hit.z);
    }
  });
  syncControls();
  // Read-only counters plus explicit test hooks. No wave readback occurs in normal rendering.
  window.__pond={diagnostics,settings,simulation,leafWater,plants,camera,controls,renderer,scene,environment,rain,water,post,setView,manualDrop,snapshot:()=>simulation.snapshot(),clear:()=>simulation.clear(),syncControls,freeze:false,renderOnly:false};
  $('#loading-status').textContent='正在编译反射、折射与雨丝着色器…';
  simulation.step(settings);simulation.encodeSurface();
  post.focus.value=presets.overview.focus;post.aperture.value=presets.overview.aperture;
  function renderFrame(now){
    if(document.hidden){lastTime=now;return;}
    const wallDt=Math.min((now-lastTime)/1000,.15);lastTime=now;
    const dt=Math.min(wallDt,4*FIXED_DT);if(wallDt>4*FIXED_DT+.006)diagnostics.slowFrames++;
    if(transition){
      const t=1-Math.exp(-wallDt*3.8);camera.position.lerp(transition.position,t);controls.target.lerp(transition.target,t);
      post.focus.value=lerp(post.focus.value,transition.focus,t);post.aperture.value=lerp(post.aperture.value,transition.aperture,t);
      if(camera.position.distanceTo(transition.position)<.003){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null;}
    }
    controls.update();camera.position.y=Math.max(.075,camera.position.y);
    if(!window.__pond.freeze){
      updatePlants(plants,simulation.time,dt,settings.wind);leafWater.update(dt,settings.wind);simulation.updateLeaves();
      maskClock+=dt;if(maskClock>.2){simulation.updateMask();maskClock=0;}
      if(!window.__pond.renderOnly){accumulator+=dt;let substeps=0;while(accumulator>=FIXED_DT&&substeps<4){simulation.step(settings);accumulator-=FIXED_DT;substeps++;}simulation.encodeSurface();}
      readClock+=wallDt;if(readClock>.09){simulation.readEvents((...args)=>leafWater.addHit(...args)).catch(showError);readClock=0;}
    }
    rain.wind.value.set(settings.wind*.7,settings.wind*.22);
    scene.fog.density=.029+settings.rain*.036;water.roughness.value=.08+settings.rain*.27;
    const steady=settings.quality&&now-lastMove>420&&!transition;
    if(steady){const jitter=diagnostics.frames%128+1;camera.setViewOffset(width,height,halton(jitter,2)-.5,halton(jitter,3)-.5,width,height);samples=Math.min(samples+1,128);}else{camera.clearViewOffset();samples=0;}
    // The underwater pass uses the same camera, giving view-dependent parallax.
    camera.layers.set(1);
    renderer.setRenderTarget(water.refractionRT);renderer.render(scene,camera);
    camera.layers.set(0);camera.layers.enable(2);
    renderer.setRenderTarget(post.sceneTarget);renderer.render(scene,camera);post.render(samples,steady);
    camera.clearViewOffset();
    diagnostics.frames++;diagnostics.simulationTime=simulation.time;elapsedFrames+=wallDt;frameCount++;statsClock+=wallDt;
    if(statsClock>.8){
      diagnostics.fps=Math.round(frameCount/Math.max(.001,elapsedFrames));frameCount=0;elapsedFrames=0;statsClock=0;
      $('#runtime-stats').textContent=`WebGPU · 512² 波场 · ${diagnostics.fps} fps · ${leafWater.count} 颗水珠`;
      $('#quality-state').textContent=settings.quality?steady?`多帧累积 ${samples}/128 · 动态像素抑制历史`:'相机移动中 · 实时渲染':'实时平面反射 · 屏幕空间折射';
    }
    if(!diagnostics.ready){diagnostics.ready=true;$('#loading').classList.add('done');setTimeout(()=>$('#loading').hidden=true,1000);}
  }
  renderer.setAnimationLoop(now=>{try{renderFrame(now);}catch(e){showError(e);}});
}
start().catch(showError);
