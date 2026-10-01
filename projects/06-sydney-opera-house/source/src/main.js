import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterials } from './materials.js';
import { buildArchitecture } from './architecture.js';
import { buildWater, buildSky, buildHarbour, buildBoats } from './harbour.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const canvas = $('#scene');
const errorPanel = $('#error');
$('#reload').addEventListener('click', () => location.reload());

function showError(error) {
  console.error(error);
  errorPanel.hidden = false;
  $('#loader').classList.add('done');
  $('#error-message').textContent = '浏览器未能完成三维渲染。请使用支持 WebGL 2 的新版 Chrome / Edge 并启用硬件加速。' + (error && error.message ? '（' + error.message + '）' : '');
}

let toastTimer;
function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2500);
}

async function start() {
  const compact = () => innerWidth < 740;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact() ? 1.55 : 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc5d5ca, .00074);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .6, 13000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .065;
  controls.minDistance = 85; controls.maxDistance = innerWidth<innerHeight?900:640;
  controls.minPolarAngle = .16; controls.maxPolarAngle = Math.PI * .48;
  controls.panSpeed = .65; controls.rotateSpeed = .5; controls.zoomSpeed = .8;
  controls.autoRotateSpeed = .24;
  controls.screenSpacePanning = false;
  controls.listenToKeyEvents(canvas);
  const ambient = new THREE.HemisphereLight(0xd9e7e0, 0x697264, 2.0); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe2b5, 3.7);
  sun.position.set(-180,190,100); sun.target.position.set(0,10,0); scene.add(sun,sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera, {left:-130,right:130,top:140,bottom:-130,near:20,far:650});
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .065; sun.shadow.radius = 2;
  const fill = new THREE.DirectionalLight(0xc0dce0,.65);fill.position.set(130,90,-160);scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.42;room.dispose();pmrem.dispose();

  const m = createMaterials();
  const sky = buildSky(); scene.add(sky);
  const water = buildWater(renderer,compact());scene.add(water);
  // Leave one paint before constructing the detailed, material-batched model.
  await new Promise(resolve => requestAnimationFrame(resolve));
  const architecture = buildArchitecture(m);scene.add(architecture);
  const surroundings = buildHarbour(m);scene.add(surroundings);
  const boats = buildBoats(m);scene.add(boats.group);
  // A small number of real light sources supports the lit foyers at blue hour.
  const floodlights = [];
  for (const x of [-33,28]) {
    const light = new THREE.PointLight(0xffd395,0,108,1.45);light.position.set(x,20,48);scene.add(light);floodlights.push(light);
  }

  const views = {
    harbour:{ position:[218,84,239], target:[0,22,8], caption:'从海港，读懂建筑。' },
    steps:{ position:[8,40,225], target:[0,25,16], caption:'拾级而上，风帆舒展。' },
    water:{ position:[-242,37,105], target:[-3,25,-1], caption:'水与石之间，起伏的韵律。' },
    aerial:{ position:[169,262,178], target:[0,8,13], caption:'在高处，看见球面的秩序。' },
  };
  let activeView = 'harbour', transition = null;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let motion = !reduceMotion, worldTime = 0;
  $('#motion-toggle').setAttribute('aria-pressed',String(motion));
  let labelsOn = false, focusMode = false, activeLight = 'golden', lightTransition = null;
  const toVector = a => new THREE.Vector3(...a);
  function destination(name) {
    const v = views[name], target=toVector(v.target), position=toVector(v.position);
    // Keep the full monument in portrait view without changing its proportions.
    const fit = innerWidth / innerHeight < 1 ? Math.min(2.4, 1.03 / (innerWidth / innerHeight)) : 1;
    position.sub(target).multiplyScalar(fit).add(target);
    return {position,target};
  }
  function setView(name, instant=false) {
    activeView=name;const d=destination(name);
    controls.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false');
    $$('.views button').forEach(b=>{const selected=b.dataset.view===name;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    $('#view-description').textContent=views[name].caption;
    if(instant||reduceMotion){camera.position.copy(d.position);controls.target.copy(d.target);controls.update();transition=null;}
    else transition={from:camera.position.clone(),fromTarget:controls.target.clone(),...d,start:performance.now()};
  }
  setView('harbour',true);
  const presets = {
    day:{zenith:0x7bafc6,horizon:0xd5e5dd,fog:0xb9d4d3,water:0x246a70,sun:0xfff0d3,ambient:0xe1f1f2,ground:0x727d6d,intensity:3.3,hemi:2.2,fill:.8,exposure:1.0,position:[-150,265,125],night:0,emission:0},
    golden:{zenith:0x86b2bd,horizon:0xeee1c0,fog:0xcad7ca,water:0x21656a,sun:0xffd49c,ambient:0xe0e8db,ground:0x7c7863,intensity:3.4,hemi:1.65,fill:.62,exposure:1.01,position:[-220,168,120],night:0,emission:.018},
    blue:{zenith:0x17334c,horizon:0x889b9c,fog:0x526e7c,water:0x194658,sun:0xabc9e1,ambient:0x91a6c7,ground:0x42566c,intensity:.68,hemi:1.35,fill:.65,exposure:1.04,position:[-135,210,-50],night:1,emission:.46},
  };
  function currentLighting() {
    const u=sky.material.uniforms,w=water.material.uniforms;
    return {zenith:u.zenith.value.clone(),horizon:u.horizon.value.clone(),fog:scene.fog.color.clone(),water:w.waterColor.value.clone(),sun:sun.color.clone(),ambient:ambient.color.clone(),ground:ambient.groundColor.clone(),intensity:sun.intensity,hemi:ambient.intensity,fill:fill.intensity,exposure:renderer.toneMappingExposure,position:sun.position.clone(),night:u.night.value,emission:m.glass.emissiveIntensity};
  }
  function applyLight(state) {
    const u=sky.material.uniforms,w=water.material.uniforms;
    for (const [name,value] of [['zenith',state.zenith],['horizon',state.horizon]])u[name].value.copy(value);
    u.sun.value.copy(state.position).normalize();u.sunTint.value.copy(state.sun);u.cloudTint.value.copy(state.horizon);u.night.value=state.night;
    scene.fog.color.copy(state.fog);w.waterColor.value.copy(state.water);w.sunColor.value.copy(state.sun);w.sunDirection.value.copy(state.position).normalize();
    sun.color.copy(state.sun);sun.position.copy(state.position);sun.intensity=state.intensity;
    ambient.color.copy(state.ambient);ambient.groundColor.copy(state.ground);ambient.intensity=state.hemi;fill.intensity=state.fill;renderer.toneMappingExposure=state.exposure;
    m.glass.emissiveIntensity=state.emission;m.glassWarm.emissiveIntensity=state.emission*1.7;m.lamp.emissiveIntensity=.3+state.night*3;
    floodlights.forEach(l=>l.intensity=state.night*140);
  }
  function setLight(name,instant=false) {
    activeLight=name;const p=presets[name],end={...p};
    for(const key of ['zenith','horizon','fog','water','sun','ambient','ground'])end[key]=new THREE.Color(p[key]);
    end.position=toVector(p.position);
    $$('.light-presets button').forEach(b=>{const on=b.dataset.light===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    document.body.classList.toggle('night',name==='blue');
    if(instant||reduceMotion){applyLight(end);lightTransition=null;}else lightTransition={from:currentLighting(),end,start:performance.now()};
  }
  setLight('golden',true);

  const markers = [
    {title:'音乐厅',en:'CONCERT HALL',point:toVector([-24,67.5,-21])},
    {title:'琼·萨瑟兰剧院',en:'JOAN SUTHERLAND THEATRE',point:toVector([24,58,-11])},
    {title:'贝尼朗餐厅',en:'BENNELONG',point:toVector([-54,29.5,94])},
    {title:'纪念性台阶',en:'THE MONUMENTAL STEPS',point:toVector([-10,6.1,101])},
  ];
  markers.forEach(marker=>{
    marker.el=document.createElement('div');marker.el.className='label';marker.el.innerHTML=marker.title+'<small>'+marker.en+'</small>';$('#labels').appendChild(marker.el);
  });
  const raycaster=new THREE.Raycaster();let labelFrame=0;
  function updateLabels() {
    if(!labelsOn)return;
    // Occlusion tests run at a lower rate; the annotation positions follow the
    // camera each frame. Labels never reveal a hidden hall through the roof.
    const check=labelFrame++%12===0;
    for(const marker of markers) {
      const p=marker.point.clone().project(camera);
      if(check){
        const dir=marker.point.clone().sub(camera.position),distance=dir.length();raycaster.set(camera.position,dir.normalize());raycaster.far=distance-1.7;
        marker.visible=raycaster.intersectObject(architecture,true).length===0;
      }
      const visible=marker.visible!==false&&p.z>-1&&p.z<1&&Math.abs(p.x)<.93&&Math.abs(p.y)<.88;
      marker.el.style.display=visible?'block':'none';
      marker.el.style.transform='translate('+((p.x*.5+.5)*innerWidth)+'px,'+((-p.y*.5+.5)*innerHeight-38)+'px) translate(-50%,-100%)';
    }
  }
  function toggleAuto() {controls.autoRotate=!controls.autoRotate;transition=null;$('#auto-rotate').setAttribute('aria-pressed',String(controls.autoRotate));}
  function toggleLabels() {labelsOn=!labelsOn;$('#labels-toggle').setAttribute('aria-pressed',String(labelsOn));$('#labels').setAttribute('aria-hidden',String(!labelsOn));markers.forEach(marker=>marker.el.style.display=labelsOn?'block':'none');}
  function toggleFocus(value) {focusMode=typeof value==='boolean'?value:!focusMode;$('#experience').classList.toggle('focus',focusMode);$('#focus-mode').setAttribute('aria-pressed',String(focusMode));}
  $$('.views button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $$('.light-presets button').forEach(b=>b.addEventListener('click',()=>setLight(b.dataset.light)));
  $('#auto-rotate').addEventListener('click',toggleAuto);
  $('#labels-toggle').addEventListener('click',toggleLabels);
  $('#motion-toggle').addEventListener('click',()=>{motion=!motion;$('#motion-toggle').setAttribute('aria-pressed',String(motion));});
  $('#reset').addEventListener('click',()=>{setView('harbour');toast('已恢复海港全景');});
  $('#brand-home').addEventListener('click',e=>{e.preventDefault();setView('harbour');});
  $('#focus-mode').addEventListener('click',()=>toggleFocus());$('#exit-focus').addEventListener('click',()=>toggleFocus(false));
  const dialog=$('#about-dialog');
  $('#about-open').addEventListener('click',()=>dialog.showModal());$('#about-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $('#capture').addEventListener('click',()=>{
    try{renderer.render(scene,camera);canvas.toBlob(blob=>{if(!blob){toast('留影失败，请重试');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Sydney-Opera-House-'+activeLight+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已保存当前建筑画面');},'image/png');}catch(error){toast('此浏览器暂不支持留影');console.error(error);}
  });
  controls.addEventListener('start',()=>{
    transition=null;controls.autoRotate=false;$('#auto-rotate').setAttribute('aria-pressed','false');
    activeView=null;$$('.views button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});$('#view-description').textContent='自由观察，发现新的角度。';
  });
  window.addEventListener('keydown',event=>{
    if(dialog.open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
    if(event.key.toLowerCase()==='r'){event.preventDefault();setView('harbour');}
    if(event.key.toLowerCase()==='h'){event.preventDefault();toggleFocus();}
    if(event.key==='Escape')toggleFocus(false);
    if(event.code==='Space' && !['BUTTON','A'].includes(document.activeElement.tagName)){event.preventDefault();toggleAuto();}
    if(['1','2','3','4'].includes(event.key))setView(Object.keys(views)[Number(event.key)-1]);
  });
  let resizeTimer;
  window.addEventListener('resize',()=>{
    renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    controls.maxDistance=innerWidth<innerHeight?900:640;
    clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(activeView)setView(activeView,true);},160);
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();running=false;showError(new Error('WebGL 上下文已中断，请重新加载页面'));});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  let previous=performance.now(),running=true,frames=0,fps=0,frameWindow=0;
  const panMin=new THREE.Vector3(-110,3,-125),panMax=new THREE.Vector3(110,55,130);
  function animate(now) {
    if(!running)return;
    requestAnimationFrame(animate);
    const wallDelta=Math.max((now-previous)/1000,0),dt=Math.min(wallDelta,.05);previous=now;
    if(document.hidden)return;
    if(transition){
      const t=Math.min((now-transition.start)/1400,1),smooth=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.position,smooth);controls.target.lerpVectors(transition.fromTarget,transition.target,smooth);
      if(t===1)transition=null;
    }
    if(lightTransition){
      const t=Math.min((now-lightTransition.start)/1300,1),k=t*t*(3-2*t),state={};
      for(const key of Object.keys(lightTransition.end)){
        const from=lightTransition.from[key],end=lightTransition.end[key];
        state[key]=typeof end==='number'?THREE.MathUtils.lerp(from,end,k):from.clone().lerp(end,k);
      }
      applyLight(state);if(t===1)lightTransition=null;
    }
    const before=controls.target.clone();controls.target.clamp(panMin,panMax);camera.position.add(controls.target.clone().sub(before));
    controls.update(dt);
    if(motion)worldTime+=dt;
    water.material.uniforms.time.value=worldTime*.33;boats.update(worldTime);
    updateLabels();renderer.render(scene,camera);
    frames++;frameWindow+=wallDelta;if(frameWindow>1){fps=Math.round(frames/frameWindow);frames=0;frameWindow=0;canvas.dataset.renderStats=JSON.stringify({fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,view:activeView,light:activeLight,camera:camera.position.toArray(),target:controls.target.toArray(),autoRotate:controls.autoRotate,motion,labels:labelsOn,ready:true});}
  }
  requestAnimationFrame(animate);
  requestAnimationFrame(()=>{$('#loader').classList.add('done');setTimeout(()=>$('#loader').hidden=true,900);});
  // Read-only diagnostics are useful for reproducible geometry/performance QA.
  window.__BENNELONG__={get status(){return {ready:true,threeRevision:THREE.REVISION,shells:architecture.userData.shellCount,view:activeView,light:activeLight,autoRotate:controls.autoRotate,motion,labels:labelsOn,focus:focusMode,fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray(),target:controls.target.toArray()};}};
}
start().catch(showError);
