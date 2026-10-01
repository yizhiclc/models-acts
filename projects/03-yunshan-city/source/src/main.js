import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Atmosphere } from './sky.js';
import { Navigation } from './navigation.js';
import { DISTRICTS, RIVER, PILGRIMAGE } from './plan.js';
import { clamp, lerp } from './math.js';

const $=id=>document.getElementById(id),canvas=$('scene');
let renderer,world,nav,atmosphere,scene,camera;
const state={hours:9.33,timePlaying:true,cycle:1200,clouds:true,ui:true,ready:false,elapsed:0,fps:60,quality:'auto'};
let toastTimer=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3100);}
function error(message){$('loading').hidden=true;$('error').hidden=false;$('errorText').textContent=message;}
window.addEventListener('error',event=>{if(!state.ready)error(event.message);});
window.addEventListener('unhandledrejection',event=>{console.error(event.reason);if(!state.ready)error(String(event.reason?.message||event.reason));});

function updateMode(){
 ['homeBtn','walkBtn','flyBtn'].forEach((id,i)=>$(id).classList.toggle('active',nav.mode===['orbit','walk','fly'][i]));
 $('walkPanel').hidden=nav.mode!=='walk';$('ui').classList.toggle('walk-active',nav.mode==='walk');
 $('walkPlay').textContent=nav.autowalk?'Ⅱ':'▶';$('walkPlay').setAttribute('aria-label',nav.autowalk?'暂停行走':'继续行走');
 $('startBtn').innerHTML=nav.mode==='walk'?(nav.autowalk?'停步看山 <span>Ⅱ</span>':'继续行游 <span>↗</span>'):'循山入城 <span>↗</span>';
 $('hint').innerHTML=nav.mode==='orbit'?'拖动环顾 <i>·</i> 滚轮远近 <i>·</i> 右键平移 <span>H 隐藏界面</span>':nav.mode==='walk'?'拖动环顾 <i>·</i> W / S 前后 <i>·</i> 空格停步 <span>H 隐藏界面</span>':'拖动转向 <i>·</i> WASD 飞行 <i>·</i> Q / E 升降 <span>Shift 加速</span>';
 if(nav.mode!=='orbit')$('landmarkLabels').style.opacity='0';else $('landmarkLabels').style.opacity='1';
}
function toggleWalk(){if(nav.mode!=='walk')nav.startWalk();else{nav.autowalk=!nav.autowalk;updateMode();}}
function toggleTime(){state.timePlaying=!state.timePlaying;$('timePlay').textContent=state.timePlaying?'Ⅱ':'▶';$('timePlay').title=state.timePlaying?'暂停昼夜循环':'继续昼夜循环';$('timePlay').setAttribute('aria-label',$('timePlay').title);}
function toggleUI(){state.ui=!state.ui;$('ui').hidden=!state.ui;$('showUI').hidden=state.ui;}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器未开放全屏，可使用浏览器全屏模式。');}}

function wireUI(){
 $('homeBtn').onclick=()=>nav.home();$('walkBtn').onclick=()=>{nav.setMode('walk');updateMode();};$('flyBtn').onclick=()=>{nav.setMode('fly');toast('拖动转向，WASD 飞行，Q / E 升降，Shift 加速。');};
 $('startBtn').onclick=toggleWalk;$('walkPlay').onclick=toggleWalk;$('resetLook').onclick=()=>{nav.lookYaw=0;nav.lookPitch=0;};
 $('walkSpeed').onchange=e=>nav.speed=Number(e.target.value);$('walkProgress').oninput=e=>nav.seek(Number(e.target.value)/1000);
 $('timeRange').oninput=e=>{state.hours=Number(e.target.value)%24;updateTime();};
 $('timePlay').onclick=toggleTime;$('cycleSpeed').onchange=e=>state.cycle=Number(e.target.value);
 document.querySelectorAll('[data-hour]').forEach(button=>button.onclick=()=>{state.hours=Number(button.dataset.hour);updateTime();});
 $('cloudBtn').onclick=()=>{state.clouds=!state.clouds;world.setClouds(state.clouds);$('cloudBtn').classList.toggle('on',state.clouds);$('cloudBtn').setAttribute('aria-pressed',String(state.clouds));};
 $('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 $('fullscreenBtn').onclick=fullscreen;$('showUI').onclick=toggleUI;
 $('photoBtn').onclick=()=>{renderer.render(scene,camera);canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`云山巨城-${String(Math.floor(state.hours)).padStart(2,'0')}时.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('山河已入画。');},'image/png');};
 $('collapseRoute').onclick=()=>{$('journey').hidden=true;$('expandRoute').hidden=false;};
 $('expandRoute').onclick=()=>{$('journey').hidden=false;$('expandRoute').hidden=true;if(innerWidth<700&&nav.mode==='walk'){$('journey').style.display='block';}};
 $('mapToggle').onclick=()=>{$('mapWrap').hidden=!$('mapWrap').hidden;$('mapArrow').textContent=$('mapWrap').hidden?'+':'−';$('mapToggle').setAttribute('aria-expanded',String(!$('mapWrap').hidden));};
 $('map').onclick=e=>{const r=$('map').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*1120-560,z=(e.clientY-r.top)/r.height*950-570;let nearest=0,d=Infinity;nav.stops.forEach((s,i)=>{const n=PILGRIMAGE[s.node],dd=Math.hypot(x-n[0],z-n[2]);if(dd<d){d=dd;nearest=i;}});nav.jumpTo(nearest);toast('已抵达 · '+nav.stops[nearest].name);};
 nav.stops.forEach((s,i)=>{const li=document.createElement('li'),button=document.createElement('button');button.className='stop-btn';button.innerHTML=`<span class="stop-number">${s.tag}</span><span class="stop-name">${s.name}</span><span class="stop-arrow">↗</span>`;button.title=`抵达${s.name} · 快捷键 ${i+1}`;button.onclick=()=>{nav.jumpTo(i);toast(s.name+' · '+s.text);};li.appendChild(button);$('stopList').appendChild(li);});
 addEventListener('keydown',e=>{
  if($('helpDialog').open)return;
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  if(e.code==='KeyH')toggleUI();if(e.code==='KeyF')fullscreen();if(e.code==='Digit0')nav.home();
  if(/^Digit[1-6]$/.test(e.code)){nav.jumpTo(Number(e.code.slice(-1))-1);e.preventDefault();}
  if(e.code==='Space'){if(nav.mode==='walk')toggleWalk();else toggleTime();e.preventDefault();}
  if(e.code==='Escape'){nav.home();}
 });
 // Return focus to the scene after an action so keyboard travel stays available.
 document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(!$('helpDialog').open)requestAnimationFrame(()=>b.blur());}));
 const qualityLabel=document.createElement('p');qualityLabel.className='quality-control';qualityLabel.innerHTML='画质 <select id="quality" aria-label="画质"><option value="auto">自动平衡</option><option value="high">精致光影</option><option value="fast">流畅游览</option></select>';$('helpDialog').appendChild(qualityLabel);
 $('quality').onchange=e=>{state.quality=e.target.value;applyQuality(state.quality==='fast'?0:1);};
}

function updateTime(){
 const h=Math.floor(state.hours)%24,m=Math.floor((state.hours-h)*60);$('timeText').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
 $('phaseText').textContent=h<5?'深夜':h<7?'破晓':h<11?'晨光':h<15?'日中':h<17?'斜阳':h<19?'暮色':'月夜';$('timeIcon').textContent=h>=6&&h<18?'☀':'☾';
 if(document.activeElement!==$('timeRange'))$('timeRange').value=state.hours;
 $('weatherText').textContent=h>=6&&h<18?'山晴 · 云缓行':'月明 · 万家灯';
}

const labels=[];
function createLabels(){
 const landmarks=[{name:'听瀑天阙',pos:[-6,222,-230],primary:true},{name:'揽月亭',pos:[148,407,-455],primary:false},{name:'长风关',pos:[-408,251,-250]},{name:'松风禅院',pos:[-217,343,-467]},{name:'望川城',pos:[392,179,-1]}];
 landmarks.forEach(l=>{const el=document.createElement('span');el.className='landmark-label'+(l.primary?' primary':'');el.textContent=l.name;$('landmarkLabels').appendChild(el);labels.push({el,pos:new THREE.Vector3(...l.pos)});});
}
function updateLabels(){if(nav.mode!=='orbit')return;const p=new THREE.Vector3();for(const l of labels){p.copy(l.pos).project(camera);const d=camera.position.distanceTo(l.pos),x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight,visible=p.z<1&&p.z>-1&&x>20&&x<innerWidth-210&&y>120&&y<innerHeight-155&&d>220;l.el.style.opacity=visible?String(clamp((d-220)/200,0,1)):'0';l.el.style.left=x+'px';l.el.style.top=y+'px';}}

let mapBase,mapContext;
function prepareMap(){
 mapBase=document.createElement('canvas');mapBase.width=360;mapBase.height=300;const ctx=mapBase.getContext('2d'),image=ctx.createImageData(360,300);
 for(let y=0;y<300;y++)for(let x=0;x<360;x++){const wx=x/360*1120-560,wz=y/300*950-570,h=world.field.sample(wx,wz),i=(y*360+x)*4,v=Math.floor(h/25),contour=h%25<2;image.data[i]=29+v*2+(contour?6:0);image.data[i+1]=59+v*2+(contour?7:0);image.data[i+2]=51+v+(contour?4:0);image.data[i+3]=255;}
 ctx.putImageData(image,0,0);
 const tx=x=>(x+560)/1120*360,tz=z=>(z+570)/950*300;
 const draw=(nodes,col,width)=>{ctx.beginPath();nodes.forEach((n,i)=>i===0?ctx.moveTo(tx(n[0]),tz(n[2])):ctx.lineTo(tx(n[0]),tz(n[2])));ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();};
 draw(RIVER,'#7daca7',6);world.plan.roads.filter(r=>r.kind!=='door').forEach(r=>draw(r.nodes,'#829a7055',.8));draw(PILGRIMAGE,'#d8bd85',1.8);
 for(const d of DISTRICTS){const n=d.nodes[Math.floor(d.nodes.length/2)];ctx.fillStyle='#c6cba3';ctx.fillRect(tx(n[0])-1.5,tz(n[2])-1.5,3,3);}
 nav.stops.forEach(s=>{const n=PILGRIMAGE[s.node];ctx.beginPath();ctx.arc(tx(n[0]),tz(n[2]),2.7,0,Math.PI*2);ctx.fillStyle='#e5d2a1';ctx.fill();});
 mapContext=$('map').getContext('2d');
}
function updateMap(){if(!mapContext||$('mapWrap').hidden||!state.ui)return;mapContext.clearRect(0,0,360,300);mapContext.drawImage(mapBase,0,0);const x=(camera.position.x+560)/1120*360,z=(camera.position.z+570)/950*300,dir=new THREE.Vector3();camera.getWorldDirection(dir);const angle=Math.atan2(dir.x,-dir.z);mapContext.save();mapContext.translate(clamp(x,5,355),clamp(z,5,295));mapContext.rotate(angle);mapContext.beginPath();mapContext.moveTo(0,-8);mapContext.lineTo(5,6);mapContext.lineTo(0,3);mapContext.lineTo(-5,6);mapContext.closePath();mapContext.fillStyle='#ffe3a8';mapContext.shadowColor='#f2d7a3';mapContext.shadowBlur=9;mapContext.fill();mapContext.restore();}

function applyQuality(level){renderer.setPixelRatio(level?Math.min(devicePixelRatio,1.6):Math.min(devicePixelRatio,1));renderer.shadowMap.enabled=!!level;renderer.shadowMap.needsUpdate=true;world?.batch.meshes.forEach(m=>m.material.needsUpdate=true);world?.terrain.material&&(world.terrain.material.needsUpdate=true);}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}

async function init(){
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});}catch(e){error('请使用支持 WebGL 2 的现代浏览器，并开启硬件加速。'+e.message);return;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.25,6500);
 atmosphere=new Atmosphere(scene);
 world=await buildWorld(scene,(p,message)=>{$('loadBar').style.width=(p*100)+'%';$('loadText').textContent=message;});
 nav=new Navigation(camera,canvas,world.field,updateMode);wireUI();createLabels();prepareMap();updateMode();updateTime();addEventListener('resize',resize);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();error('图形上下文已中断，请重新加载场景。');});
 $('sceneStats').textContent=`九片城区 · ${world.stats.buildings} 座建筑与院落 · ${Math.round(nav.length).toLocaleString()} m 连续登临之路 · ${world.stats.voxels.toLocaleString()} 个合并体素构件`;
 $('loadBar').style.width='100%';$('loadText').textContent='山河已就，等君入画';
 atmosphere.update(state.hours,camera);world.update(0,1,atmosphere.skyColor);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
 state.ready=true;document.body.dataset.ready='true';
 setTimeout(()=>{$('loading').classList.add('leaving');setTimeout(()=>$('loading').hidden=true,950);},300);
 let last=performance.now(),uiClock=0,shadowClock=0,frameSum=0,frameCount=0,qualityChecked=false;
 function frame(now){
  requestAnimationFrame(frame);if(document.hidden){last=now;return;}
  const rawDt=(now-last)/1000,dt=Math.min(rawDt,.06);last=now;state.elapsed+=dt;
  if(state.timePlaying)state.hours=(state.hours+dt*24/state.cycle)%24;
  nav.update(dt,state.elapsed);const light=atmosphere.update(state.hours,camera);world.update(state.elapsed,light.day,atmosphere.skyColor);
  renderer.toneMappingExposure=lerp(1.05,1.02,light.day);
  shadowClock+=dt;if(shadowClock>.8){renderer.shadowMap.needsUpdate=true;shadowClock=0;}
  renderer.render(scene,camera);uiClock+=dt;
  if(uiClock>.13){updateTime();updateLabels();updateMap();$('altitudeText').textContent='海拔 '+Math.round(camera.position.y)+' m';if(nav.mode==='walk'){const i=nav.currentStop(),s=nav.stops[i];$('stopTag').textContent=s.tag+' / '+s.name;$('stopPoem').textContent=s.text;$('walkMeters').textContent=Math.round(nav.distance)+' m / '+Math.round(nav.length)+' m';if(document.activeElement!==$('walkProgress'))$('walkProgress').value=nav.distance/nav.length*1000;document.querySelectorAll('.stop-btn').forEach((b,j)=>b.classList.toggle('active',i===j));}uiClock=0;}
  if(state.elapsed>3&&state.elapsed<9){frameSum+=rawDt;frameCount++;}
  if(state.elapsed>=9&&!qualityChecked){qualityChecked=true;state.fps=frameCount/frameSum;if(state.fps<25&&state.quality==='auto'){applyQuality(0);$('sceneStats').textContent+=' · 已适配流畅画质';}}
 }
 requestAnimationFrame(frame);
 // Readable state for diagnostics; interaction remains entirely through the UI.
 globalThis.yunshan={get stats(){return {...world.stats,routeMeters:nav.length,mode:nav.mode,hour:state.hours,fps:state.fps};}};
}
init();
