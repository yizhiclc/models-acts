import './style.css';
import * as THREE from 'three/webgpu';
import { color, uniform, mix, positionWorld, smoothstep } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGarden } from './garden.js';
import { WaterSimulation, PARTICLE_COUNT } from './simulation.js';
import { createWater } from './water-render.js';

const $=id=>document.getElementById(id);
const loading=$('loading'),errorPanel=$('error');
let failure=false;
function fail(error){
  if(failure)return;failure=true;console.error(error);
  loading.classList.add('done');errorPanel.classList.remove('hidden');
  $('error-message').textContent=error?.message||String(error);
  $('gpu-status').textContent='WebGPU 未就绪';
  if(window.__fountain)window.__fountain.error=error?.message||String(error);
}
$('retry').addEventListener('click',()=>location.reload());
window.addEventListener('unhandledrejection',event=>fail(event.reason));
window.addEventListener('error',event=>fail(event.error||event.message));

async function main(){
  if(!navigator.gpu)throw new Error('当前浏览器或打开方式没有提供 WebGPU。请使用支持 WebGPU 的浏览器，并启用图形硬件加速。');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw new Error('无法取得 WebGPU 图形适配器。请检查浏览器硬件加速和显卡驱动，或换用支持 WebGPU 的设备。');
  const renderer=new THREE.WebGPURenderer({antialias:true,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend)throw new Error('未能启动原生 WebGPU；此场景的水流计算需要 WebGPU compute。');
  renderer.backend.device.addEventListener('uncapturederror',event=>{console.error('WebGPU:',event.error.message);fail(new Error(event.error.message));});
  renderer.backend.device.lost.then(info=>fail(new Error(`WebGPU 设备已断开：${info.message||info.reason}。请刷新页面。`)));
  $('scene').appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','古典庭园喷泉三维画面');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc4d4d5);scene.fog=new THREE.FogExp2(0xc0c9b7,.010);
  const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,160);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;
  controls.minDistance=2.0;controls.maxDistance=36;controls.maxPolarAngle=Math.PI*.485;controls.minPolarAngle=.10;controls.panSpeed=.65;
  const views={wide:{pos:[10.8,9.2,17.2],target:[0,1.5,0]},bowl:{pos:[4.0,4.25,5.5],target:[0,2.85,0]},water:{pos:[3.9,1.05,4.5],target:[0,1.35,0]}};
  let cameraMove=null;
  function setCamera(name,instant=false){
    const preset=views[name];if(!preset)return;
    const position=new THREE.Vector3(...preset.pos);const target=new THREE.Vector3(...preset.target);
    if(innerWidth<600&&name==='wide')position.multiplyScalar(1.18);
    if(instant){camera.position.copy(position);controls.target.copy(target);controls.update();cameraMove=null;}
    else cameraMove={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),toTarget:target,start:performance.now()};
    document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.toggle('active',b.dataset.camera===name);b.setAttribute('aria-pressed',String(b.dataset.camera===name));});
  }
  setCamera('wide',true);controls.addEventListener('start',()=>cameraMove=null);
  $('loading-text').textContent='雕琢石材，种下树木…';
  const garden=createGarden(scene);
  const sunLight=new THREE.DirectionalLight(0xffe4b6,3.0);sunLight.position.set(-8,10,-11);sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-17;sunLight.shadow.camera.right=17;sunLight.shadow.camera.top=17;sunLight.shadow.camera.bottom=-17;sunLight.shadow.camera.near=.5;sunLight.shadow.camera.far=55;sunLight.shadow.bias=-.00025;sunLight.shadow.normalBias=.04;sunLight.shadow.radius=2;
  scene.add(sunLight);
  const hemi=new THREE.HemisphereLight(0xe5f1f3,0x76774b,1.35);scene.add(hemi);
  const skyTop=uniform(new THREE.Color(0x8faebe)),skyBottom=uniform(new THREE.Color(0xe0dfc5));
  const skyMat=new THREE.MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});
  skyMat.colorNode=mix(skyBottom,skyTop,smoothstep(-.03,.65,positionWorld.normalize().y));
  const sky=new THREE.Mesh(new THREE.SphereGeometry(110,32,18),skyMat);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
  $('loading-text').textContent='接通水流，计算第一道涟漪…';
  const sim=new WaterSimulation(renderer);let power=.68,wind=.6,timeOfDay=.375,paused=false;
  await sim.init(power,wind);
  const water=createWater(scene,sim);
  // Warm-up uses exactly the same stateful compute steps as the running scene.
  // No CPU-authored particle trajectories or pre-baked water animation.
  for(let j=0;j<6;j++){for(let i=0;i<60;i++)sim.step(power,wind);await renderer.backend.device.queue.onSubmittedWorkDone();}
  let displayedTime=timeOfDay;
  const palette={dayTop:new THREE.Color(0x88b6cf),dayLow:new THREE.Color(0xd9e1cb),duskTop:new THREE.Color(0x7f9fac),duskLow:new THREE.Color(0xefc6a1),nightTop:new THREE.Color(0x091928),nightLow:new THREE.Color(0x203640)};
  function lighting(value){
    const hour=13.5+value*8;
    const night=THREE.MathUtils.smoothstep(hour,18.3,20.8),sunset=THREE.MathUtils.smoothstep(hour,16.3,19.0);
    const daylight=1-night;
    const sunElevation=THREE.MathUtils.lerp(.92,.02,Math.min(1,value/.82));
    sunLight.position.set(-13,sunElevation*17+1.0,-8);
    sunLight.color.set(0xffedcc).lerp(new THREE.Color(0xff9956),sunset);sunLight.intensity=(2.6-sunset*.7)*daylight;
    hemi.intensity=1.12*daylight+.34;hemi.color.set(0xd8e9ef).lerp(new THREE.Color(0x8095c6),night);hemi.groundColor.set(0x7e7959).lerp(new THREE.Color(0x243a42),night);
    skyTop.value.copy(palette.dayTop).lerp(palette.duskTop,sunset).lerp(palette.nightTop,night);
    skyBottom.value.copy(palette.dayLow).lerp(palette.duskLow,sunset).lerp(palette.nightLow,night);
    scene.fog.color.copy(skyBottom.value);water.day.value=daylight;water.night.value=night;water.sun.value.copy(sunLight.position).normalize();
    garden.underwater.forEach(({light,mat},i)=>{light.intensity=night*(i<6?2.0:i===6?3.0:2.4);if(mat)mat.emissiveIntensity=night*1.6;});
    renderer.toneMappingExposure=1.0+night*.15;
    document.body.classList.toggle('night',night>.65);
  }
  function labelTime(){const h=13.5+timeOfDay*8;const hours=Math.floor(h),mins=Math.round((h-hours)*60);$('time-value').textContent=`${String(hours+Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;$('scene-state').textContent=`${h<17.3?'午后':h<19.4?'黄昏':'夜晚'} · ${wind<.15?'静风':wind<1.8?'轻风':'微风'}`;}
  function rangeFill(input){input.style.setProperty('--fill',`${(+input.value- +input.min)/(+input.max- +input.min)*100}%`);}
  document.querySelectorAll('input[type=range]').forEach(input=>{rangeFill(input);input.addEventListener('input',()=>rangeFill(input));});
  $('power').addEventListener('input',e=>{power=+e.target.value/100;$('power-value').textContent=`${e.target.value}%`;});
  $('wind').addEventListener('input',e=>{wind=+e.target.value*.03;$('wind-value').textContent=`${wind.toFixed(1)} m/s`;labelTime();});
  $('daytime').addEventListener('input',e=>{timeOfDay=+e.target.value/100;labelTime();});
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{$('daytime').value=button.dataset.time;$('daytime').dispatchEvent(new Event('input'));}));
  document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>setCamera(button.dataset.camera)));
  $('reset').addEventListener('click',()=>setCamera('wide'));
  function togglePause(){paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'继续水流':'暂停水流');$('gpu-status').textContent=paused?'水流已暂停':`WEBGPU · ${PARTICLE_COUNT.toLocaleString('en-US')}`;}
  $('pause').addEventListener('click',togglePause);
  $('panel-toggle').addEventListener('click',()=>{const c=$('controls').classList.toggle('collapsed');$('panel-toggle').setAttribute('aria-expanded',String(!c));$('panel-toggle').setAttribute('aria-label',c?'展开环境控制':'收起环境控制');});
  if(innerWidth<600){$('controls').classList.add('collapsed');$('panel-toggle').setAttribute('aria-expanded','false');}
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'){e.preventDefault();togglePause();}if(e.key.toLowerCase()==='r')setCamera('wide');if(['1','2','3'].includes(e.key))setCamera(['wide','bowl','water'][+e.key-1]);});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);water.refractionTarget.setSize(Math.round(innerWidth*.8),Math.round(innerHeight*.8));});
  let previous=performance.now(),accumulator=0,fpsStart=previous,frames=0,frameMs=16;
  document.addEventListener('visibilitychange',()=>{previous=performance.now();accumulator=0;});
  lighting(timeOfDay);labelTime();water.clock.value=sim.time;
  function render(){
    water.objects.forEach(o=>o.visible=false);
    renderer.setRenderTarget(water.refractionTarget);renderer.render(scene,camera);
    water.objects.forEach(o=>o.visible=true);
    renderer.setRenderTarget(null);renderer.render(scene,camera);
  }
  window.__fountain={renderer,scene,camera,controls,sim,water,setCamera,snapshot:()=>sim.snapshot(),error:null,ready:false,version:THREE.REVISION,particleCapacity:PARTICLE_COUNT};
  // Optional, user-invoked readback for reproducible GPU validation. Absent in
  // the normal experience; append ?diagnostics=1 to expose this inspection UI.
  if(new URLSearchParams(location.search).has('diagnostics')){
    const inspect=document.createElement('button');inspect.id='inspect-gpu';inspect.textContent='读取 GPU 状态';inspect.style.cssText='position:absolute;left:38px;top:190px;background:#f7f5ed;border:1px solid #7b947c;padding:8px;z-index:8';
    const output=document.createElement('pre');output.id='gpu-report';output.style.cssText='position:absolute;left:38px;top:225px;max-width:450px;max-height:320px;overflow:auto;font-size:11px;background:#f7f5eddd;padding:12px;z-index:8';
    inspect.addEventListener('click',async()=>{const result=await sim.snapshot();output.textContent=JSON.stringify({power,wind,...result},null,2);console.info('GPU_SNAPSHOT',JSON.stringify(result));});
    $('app').append(inspect,output);
  }
  await renderer.compileAsync(scene,camera);
  render();
  if(failure)return;
  loading.classList.add('done');$('gpu-status').textContent=`WEBGPU · ${PARTICLE_COUNT.toLocaleString('en-US')}`;window.__fountain.ready=true;
  renderer.setAnimationLoop(()=>{
    if(failure)return;
    const now=performance.now(),delta=Math.min((now-previous)/1000,.05);previous=now;
    if(document.hidden)return;
    if(!paused){accumulator+=delta;let steps=0;while(accumulator>=sim.dt&&steps<6){sim.step(power,wind);accumulator-=sim.dt;steps++;}water.clock.value=sim.time;}
    displayedTime=THREE.MathUtils.damp(displayedTime,timeOfDay,4,delta);lighting(displayedTime);
    if(cameraMove){const t=THREE.MathUtils.clamp((now-cameraMove.start)/1250,0,1),ease=t*t*(3-2*t);camera.position.lerpVectors(cameraMove.from,cameraMove.to,ease);controls.target.lerpVectors(cameraMove.fromTarget,cameraMove.toTarget,ease);if(t===1)cameraMove=null;}
    controls.update();render();
    frames++;frameMs=frameMs*.96+delta*1000*.04;
    if(now-fpsStart>900){$('fps').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS`;fpsStart=now;frames=0;}
  });
}
main().catch(fail);
