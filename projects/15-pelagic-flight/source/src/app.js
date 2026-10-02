/* Application, independent clocks, camera rig, input and bounded Web Audio graph. */
(() => {
  'use strict';
  const P=Pelagic,T=THREE,$=id=>document.getElementById(id),canvas=$('view');
  let renderer;
  function fail(message){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=message;}
  try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){fail('无法创建 WebGL 场景。请使用支持 WebGL 的现代浏览器，并开启浏览器硬件加速。技术信息：'+e.message);return;}
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene();scene.fog=new T.FogExp2(0xa6bebf,.000062);
  const camera=new T.PerspectiveCamera(47,innerWidth/innerHeight,.18,29000);
  const airframe=P.createAircraft();scene.add(airframe);
  const env=P.createEnvironment(scene,renderer);airframe.add(env.heat);
  const optics=P.createOptics(renderer,scene,camera,airframe);
  const state={running:true,rate:1,time:0,distance:0,lapStartTime:0,speed:P.speed,targetSpeed:P.speed,acceleration:0,engineOn:true,thrust:.68,temperature:.79,hour:16+35/60,autoTime:true,weather:0,weatherTarget:0,mode:'follow',director:false,directorTime:0,quality:'auto',sound:false,volume:.35};
  const flight=P.makeFlightState();P.flight(0,0,flight);
  const baseQ=new T.Quaternion(),baseM=new T.Matrix4(),origin=new T.Vector3(),up=new T.Vector3(0,1,0);
  const look=new T.Vector3(),desiredEye=new T.Vector3(),desiredLook=new T.Vector3(),relative=new T.Vector3(),lastPosition=flight.position.clone(),frameMotion=new T.Vector3();
  const fixedEye=new T.Vector3(),fixedLook=new T.Vector3(),right=new T.Vector3();
  const presets={follow:{v:[11.6,3.5,16.4],fov:53},close:{v:[9.7,2.9,10.8],fov:48},high:{v:[1200,950,1850],fov:55}};
  const orbit={yaw:0,phi:0,radius:1};let fixedYaw=0,fixedPitch=0,targetFov=47;
  let toastTimer=0,uiClock=0,firstFrame=true,hiddenUI=false,envShown=true,pixelRatio=Math.min(devicePixelRatio,1.35),fpsFrames=0,fpsTime=0,measuredFps=60,adaptiveWait=0,disposed=false;
  const cloudProbeMats=[];airframe.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms)if(m.isMeshStandardMaterial&&!cloudProbeMats.includes(m))cloudProbeMats.push(m);});
  function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2300);}
  function applyPreset(mode){const p=presets[mode],v=new T.Vector3(...p.v);orbit.radius=v.length();orbit.yaw=Math.atan2(v.x,v.z);orbit.phi=Math.acos(v.y/orbit.radius);targetFov=p.fov;}
  applyPreset('follow');
  function endDirector(announce=false){if(!state.director)return;state.director=false;$('directorButton').setAttribute('aria-pressed','false');if(announce)toast('已接管镜头');}
  function setCamera(mode,user=true){
    if(user)endDirector();state.mode=mode;
    if(mode==='low'){
      const u=(flight.progress+Math.max(245,state.speed*2.6)/P.length)%1;const pass=P.route.getPointAt(u),direction=P.route.getTangentAt(u).normalize();right.crossVectors(direction,up).normalize();
      fixedEye.copy(pass).addScaledVector(right,44).addScaledVector(direction,12);fixedEye.y=5.5;
      fixedLook.copy(pass).addScaledVector(direction,-24);fixedLook.y=Math.max(10,pass.y*.56);
      const d=fixedLook.clone().sub(fixedEye).normalize();fixedYaw=Math.atan2(d.x,-d.z);fixedPitch=Math.asin(d.y);targetFov=54;
    }else applyPreset(mode);
    document.querySelectorAll('[data-camera]').forEach(b=>{const a=b.dataset.camera===mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});
    $('returnFollow').hidden=mode!=='low';$('fixedNote').hidden=mode!=='low';
    $('viewLabel').textContent={follow:'侧后方跟随',close:'近景伴飞',low:'海面固定机位',high:'高处全景'}[mode];
    if(user)toast($('viewLabel').textContent);
  }
  function updateCamera(dt,snap=false){
    baseM.lookAt(origin,flight.forward,up);baseQ.setFromRotationMatrix(baseM);
    if(state.mode==='low'){
      desiredEye.copy(fixedEye);desiredLook.set(Math.sin(fixedYaw)*Math.cos(fixedPitch),Math.sin(fixedPitch),-Math.cos(fixedYaw)*Math.cos(fixedPitch)).multiplyScalar(100).add(fixedEye);
    }else{
      relative.set(orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.yaw),orbit.radius*Math.cos(orbit.phi),orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.yaw)).applyQuaternion(baseQ).multiplyScalar(Math.max(1,Math.pow(1.22/camera.aspect,.68)));
      desiredEye.copy(flight.position).add(relative);
      desiredLook.copy(flight.position).addScaledVector(flight.forward,state.mode==='follow'?2.5:state.mode==='high'?550:.7);desiredLook.y+=state.mode==='high'?0:state.mode==='follow'?1.2:.35;
      frameMotion.copy(flight.position).sub(lastPosition);camera.position.addScaledVector(frameMotion,.96);look.addScaledVector(frameMotion,.99);
    }
    const a=snap?1:1-Math.exp(-dt*(state.mode==='high'?1.35:2.9));camera.position.lerp(desiredEye,a);look.lerp(desiredLook,snap?1:1-Math.exp(-dt*4.2));
    camera.position.y=Math.max(camera.position.y,P.waveHeight(camera.position.x,camera.position.z,state.time)+1.45);
    for(const i of P.islands){if(Math.abs(camera.position.x-i.x)<i.rx*1.4&&Math.abs(camera.position.z-i.z)<i.rz*1.4)camera.position.y=Math.max(camera.position.y,P.islandHeight(i,camera.position.x,camera.position.z)+6);}
    camera.fov=P.mix(camera.fov,targetFov,snap?1:1-Math.exp(-dt*4));camera.updateProjectionMatrix();camera.lookAt(look);lastPosition.copy(flight.position);
  }
  function togglePlay(){state.running=!state.running;updatePlaybackUI();toast(state.running?'继续航行':'飞行已暂停 · 昼夜时钟独立运行');}
  function updatePlaybackUI(){const b=$('playButton');b.querySelector('use').setAttribute('href',state.running?'#i-pause':'#i-play');b.setAttribute('aria-label',state.running?'暂停飞行':'继续飞行');b.title=state.running?'暂停飞行（空格）':'继续飞行（空格）';}
  function restart(){state.time=0;state.distance=0;state.lapStartTime=0;state.speed=state.targetSpeed=P.speed;state.acceleration=0;state.engineOn=true;state.thrust=.68;state.temperature=.79;state.running=true;state.directorTime=0;P.flight(0,0,flight);airframe.position.copy(flight.position);airframe.quaternion.copy(flight.quaternion);lastPosition.copy(flight.position);setCamera('follow',false);updateCamera(0,true);updatePlaybackUI();updateEngineUI();audio.lastDistance=null;toast('从长浪水道重新出发');}
  function updateEngineUI(){
    $('engineButton').setAttribute('aria-pressed',String(state.engineOn));$('engineButton').querySelector('span').textContent=state.engineOn?'发动机 开':'发动机 关';
    $('engineQuick').setAttribute('aria-pressed',String(state.engineOn));$('engineQuick').classList.toggle('active',state.engineOn);$('engineQuick').setAttribute('aria-label',state.engineOn?'关闭发动机':'开启发动机');$('engineQuick').title=(state.engineOn?'关闭发动机':'开启发动机')+'（E）';
    $('flightSpeed').min=P.speedLimits.min;$('flightSpeed').max=P.speedLimits.max;$('flightSpeed').value=state.targetSpeed;$('targetSpeedLabel').textContent=Math.round(state.targetSpeed);$('flightSpeed').setAttribute('aria-valuetext',state.targetSpeed+' 米每秒');
  }
  function toggleEngine(){state.engineOn=!state.engineOn;updateEngineUI();toast(state.engineOn?'发动机启动 · 推力逐渐恢复':'发动机关闭 · 射流消散，进入减速滑行');}
  function setTargetSpeed(speed){state.targetSpeed=P.clamp(Math.round(speed),P.speedLimits.min,P.speedLimits.max);updateEngineUI();}
  function formatHour(h){const n=Math.floor(h*60)%1440;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function formatDuration(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');}
  function toggleTime(){state.autoTime=!state.autoTime;$('timeAuto').setAttribute('aria-pressed',String(state.autoTime));}
  const routeCanvas=$('routeMap'),map=routeCanvas.getContext('2d');
  const mapPoints=Array.from({length:360},(_,i)=>P.route.getPointAt(i/359));
  const mapBounds={left:Math.min(...mapPoints.map(p=>p.x)),right:Math.max(...mapPoints.map(p=>p.x)),top:Math.min(...mapPoints.map(p=>p.z)),bottom:Math.max(...mapPoints.map(p=>p.z))};
  for(const i of P.islands){const r=Math.hypot(i.rx,i.rz);mapBounds.left=Math.min(mapBounds.left,i.x-r);mapBounds.right=Math.max(mapBounds.right,i.x+r);mapBounds.top=Math.min(mapBounds.top,i.z-r);mapBounds.bottom=Math.max(mapBounds.bottom,i.z+r);}
  const mapCX=(mapBounds.left+mapBounds.right)/2,mapCZ=(mapBounds.top+mapBounds.bottom)/2,mapHeight=Math.max(mapBounds.bottom-mapBounds.top,(mapBounds.right-mapBounds.left)*218/400)*1.09,mapWidth=mapHeight*400/218;
  Object.assign(mapBounds,{left:mapCX-mapWidth/2,right:mapCX+mapWidth/2,top:mapCZ-mapHeight/2,bottom:mapCZ+mapHeight/2});
  function mx(x){return 20+(x-mapBounds.left)/(mapBounds.right-mapBounds.left)*400;}
  function my(z){return 4+(z-mapBounds.top)/(mapBounds.bottom-mapBounds.top)*218;}
  const mapRoute=Array.from({length:240},(_,i)=>P.route.getPointAt(i/239));
  const mapBase=document.createElement('canvas');mapBase.width=440;mapBase.height=232;
  function drawBase(){
    const c=mapBase.getContext('2d');c.clearRect(0,0,440,232);c.strokeStyle='rgba(128,179,182,.085)';c.lineWidth=1;
    for(let x=40;x<440;x+=70){c.beginPath();c.moveTo(x,8);c.lineTo(x,220);c.stroke();}for(let y=18;y<232;y+=45){c.beginPath();c.moveTo(8,y);c.lineTo(432,y);c.stroke();}
    for(const island of P.islands){
      c.beginPath();for(let j=0;j<=80;j++){const a=j/80*Math.PI*2,e=.87+.07*Math.sin(a*3+island.seed)+.045*Math.sin(a*7+2)+.018*Math.sin(a*13),xx=Math.cos(a)*island.rx*e,zz=Math.sin(a)*island.rz*e,x=island.x+xx*Math.cos(island.angle)-zz*Math.sin(island.angle),z=island.z+xx*Math.sin(island.angle)+zz*Math.cos(island.angle);if(j===0)c.moveTo(mx(x),my(z));else c.lineTo(mx(x),my(z));}c.fillStyle='rgba(118,159,145,.17)';c.strokeStyle='rgba(143,181,157,.20)';c.fill();c.stroke();
    }
    c.beginPath();mapRoute.forEach((p,i)=>i?c.lineTo(mx(p.x),my(p.z)):c.moveTo(mx(p.x),my(p.z)));c.strokeStyle='rgba(185,211,200,.47)';c.setLineDash([4,5]);c.lineWidth=1.4;c.stroke();c.setLineDash([]);
    c.fillStyle='#d3b17b';c.beginPath();c.arc(mx(0),my(1500),3,0,Math.PI*2);c.fill();
  }
  drawBase();
  function drawMap(){
    map.clearRect(0,0,440,232);map.drawImage(mapBase,0,0);
    const x=mx(flight.position.x),y=my(flight.position.z),angle=Math.atan2(flight.forward.x,-flight.forward.z);
    map.fillStyle='rgba(226,184,123,.08)';map.beginPath();map.arc(x,y,19,0,Math.PI*2);map.fill();map.strokeStyle='rgba(226,184,123,.27)';map.lineWidth=1;map.beginPath();map.arc(x,y,12,0,Math.PI*2);map.stroke();
    map.save();map.translate(x,y);map.rotate(angle);map.beginPath();map.moveTo(0,-7);map.lineTo(4.6,6);map.lineTo(0,3);map.lineTo(-4.6,6);map.closePath();map.fillStyle='#f1c68b';map.fill();map.restore();
  }
  function updateUI(){
    $('heightLabel').textContent=flight.clearance.toFixed(1);$('speedLabel').textContent=state.running?state.speed.toFixed(0):'0';$('distanceLabel').textContent=(flight.progress*P.length/1000).toFixed(2);
    $('engineNote').textContent=!state.engineOn?'停机滑行 · 喷口余热逐渐冷却':state.acceleration>1?'推力上升 · 正在平滑加速':state.acceleration<-1?'收减推力 · 正在平滑减速':'推力稳定 · 低空高速巡航';
    $('clockLabel').textContent=formatHour(state.hour);$('timeOfDay').value=Math.floor(state.hour*60);$('timeOfDay').setAttribute('aria-valuetext',formatHour(state.hour));
    $('phaseLabel').textContent=state.hour<5?'深夜':state.hour<7?'破晓':state.hour<11?'清晨':state.hour<14?'正午':state.hour<17.4?'午后':state.hour<19.2?'暮色':'月夜';
    const sunAngle=(state.hour-6)/12*Math.PI;const marker=$('sunMarker');marker.setAttribute('cx',48-Math.cos(sunAngle)*40);marker.setAttribute('cy',40-Math.sin(sunAngle)*37);marker.style.opacity=state.hour>=6&&state.hour<=18?'1':'.15';
    $('progressFill').style.width=(flight.progress*100).toFixed(2)+'%';document.querySelector('.progress-track').setAttribute('aria-valuenow',(flight.progress*100).toFixed(1));
    $('elapsedLabel').textContent=formatDuration(state.time-state.lapStartTime);$('durationLabel').textContent=formatDuration((1-flight.progress)*P.length/Math.max(1,state.speed));$('durationLabel').title='按当前航速估算的剩余时间';
    const chapter=flight.progress<.20?0:flight.progress<.47?1:flight.progress<.76?2:3;
    $('chapterNumber').textContent='0'+(chapter+1);$('chapterName').textContent=['长浪水道','望潮外海','长风岛链','归海回环'][chapter];
    $('flightStatus').textContent=!state.running?'航行暂停':!state.engineOn?'停机滑行':state.acceleration>1?'加速巡航':state.acceleration<-1?'减速巡航':Math.abs(flight.bank)>.10?'倾侧转弯':flight.forward.y>.006?'缓慢爬升':flight.forward.y<-.006?'平顺下降':'平稳巡航';$('flightDot').style.background=state.running?'#bdd0ad':'#d1ab79';
    $('loopLabel').textContent='第 '+String(Math.floor(state.distance/P.length)+1).padStart(2,'0')+' 圈';
    $('headingLabel').textContent=String(Math.round((Math.atan2(flight.forward.x,-flight.forward.z)*180/Math.PI+360)%360)).padStart(3,'0')+'°';
    drawMap();
  }
  // One graph for the entire lifetime. Toggle/pause only alter gains.
  const audio={ctx:null,master:null,engineGain:null,windGain:null,seaGain:null,pan:null,osc:null,filter:null,lastDistance:null};
  async function initAudio(){
    if(audio.ctx){await audio.ctx.resume();return;}
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){toast('此浏览器不支持 Web Audio');return;}
    const ctx=new AudioContext();audio.ctx=ctx;const master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);audio.master=master;
    const pan=ctx.createStereoPanner();pan.connect(master);audio.pan=pan;
    const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0),random=P.rng(418);let brown=0;
    for(let i=0;i<data.length;i++){brown=(brown+(random()*2-1)*.03)/1.024;data[i]=brown*3.9;}
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
    const wind=ctx.createBiquadFilter();wind.type='lowpass';wind.frequency.value=780;audio.filter=wind;const windGain=ctx.createGain();windGain.gain.value=0;audio.windGain=windGain;source.connect(wind);wind.connect(windGain);windGain.connect(master);
    const sea=ctx.createBiquadFilter();sea.type='lowpass';sea.frequency.value=240;const seaGain=ctx.createGain();seaGain.gain.value=0;audio.seaGain=seaGain;source.connect(sea);sea.connect(seaGain);seaGain.connect(master);
    const osc=ctx.createOscillator();osc.type='triangle';osc.frequency.value=164;const engineGain=ctx.createGain();engineGain.gain.value=0;osc.connect(engineGain);engineGain.connect(pan);audio.osc=osc;audio.engineGain=engineGain;
    source.start();osc.start();await ctx.resume();
  }
  async function toggleSound(){
    try{if(!state.sound)await initAudio();if(!audio.ctx)return;state.sound=!state.sound;$('audioButton').setAttribute('aria-pressed',String(state.sound));$('audioButton').setAttribute('aria-label',state.sound?'静音':'开启声音');$('audioButton').title=state.sound?'静音（M）':'开启声音（M）';$('audioButton').querySelector('use').setAttribute('href',state.sound?'#i-volume':'#i-mute');toast(state.sound?'声音已开启':'声音已静音');}catch(e){toast('音频未能开启：'+e.message);}
  }
  const soundDirection=new T.Vector3(),cameraRight=new T.Vector3();
  function updateAudio(dt){
    if(!audio.ctx)return;const t=audio.ctx.currentTime,dist=camera.position.distanceTo(flight.position),atten=1/(1+Math.pow(dist/53,1.45));
    const active=state.sound&&state.running&&!document.hidden?1:0;audio.master.gain.setTargetAtTime(state.volume*active*.32,t,.12);
    audio.engineGain.gain.setTargetAtTime(.13*atten*state.thrust,t,.13);audio.windGain.gain.setTargetAtTime(.02+(.10+atten*.10)*P.clamp(state.speed/106,0,1.7),t,.18);audio.seaGain.gain.setTargetAtTime(state.mode==='low'?.21:.055,t,.18);
    const radialVelocity=audio.lastDistance===null?0:P.clamp((dist-audio.lastDistance)/Math.max(.001,dt),-130,130);audio.lastDistance=dist;
    const doppler=state.mode==='low'?343/(343+radialVelocity):1;
    audio.osc.frequency.setTargetAtTime((145+state.thrust*48+state.speed*.12)*doppler*(.94+state.rate*.06),t,.10);audio.filter.frequency.setTargetAtTime(550+atten*740+state.weather*200,t,.2);
    soundDirection.copy(flight.position).sub(camera.position).normalize();cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);audio.pan.pan.setTargetAtTime(soundDirection.dot(cameraRight)*.72,t,.12);
  }
  function resize(){renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();optics.resize();}
  resize();window.addEventListener('resize',resize);
  function setQuality(value){state.quality=value;pixelRatio=value==='high'?Math.min(devicePixelRatio,1.85):value==='low'?.8:Math.min(devicePixelRatio,1.35);renderer.shadowMap.enabled=value!=='low';resize();adaptiveWait=0;}
  function setEnvironmentVisible(show){envShown=show;document.body.classList.toggle('env-hidden',!show);$('environment').inert=!show;$('environmentButton').classList.toggle('active',show);$('environmentButton').setAttribute('aria-pressed',String(show));}
  function cinema(){hiddenUI=!hiddenUI;document.body.classList.toggle('cinema',hiddenUI);document.querySelector('.hud').inert=hiddenUI;$('restoreUI').hidden=!hiddenUI;if(hiddenUI)canvas.focus({preventScroll:true});}
  async function fullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(e){toast('浏览器未允许全屏，可使用浏览器的 F11');}}
  $('playButton').addEventListener('click',togglePlay);$('restartButton').addEventListener('click',restart);
  $('speedButton').addEventListener('click',()=>{const speeds=[.5,1,1.5,2];state.rate=speeds[(speeds.indexOf(state.rate)+1)%speeds.length];$('speedButton').innerHTML=state.rate.toFixed(1)+'<span>×</span>';$('speedButton').setAttribute('aria-label','演示速度'+state.rate+'倍');toast('播放倍速 '+state.rate.toFixed(1)+'× · 设定航速保持不变');});
  $('engineButton').addEventListener('click',toggleEngine);$('engineQuick').addEventListener('click',toggleEngine);$('flightSpeed').addEventListener('input',e=>setTargetSpeed(+e.target.value));$('slowerButton').addEventListener('click',()=>setTargetSpeed(state.targetSpeed-15));$('fasterButton').addEventListener('click',()=>setTargetSpeed(state.targetSpeed+15));
  document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>setCamera(b.dataset.camera)));
  $('returnFollow').addEventListener('click',()=>setCamera('follow'));
  document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>{state.weatherTarget=+b.dataset.weather;document.querySelectorAll('[data-weather]').forEach(q=>{q.classList.toggle('active',q===b);q.setAttribute('aria-pressed',String(q===b));});$('weatherNote').textContent=state.weatherTarget?'云层渐聚 · 柔和漫射':'通透天空 · 长浪微风';}));
  $('timeOfDay').addEventListener('input',e=>{state.hour=+e.target.value/60;state.autoTime=false;$('timeAuto').setAttribute('aria-pressed','false');updateUI();});
  $('timeAuto').addEventListener('click',toggleTime);$('audioButton').addEventListener('click',toggleSound);$('volume').addEventListener('input',e=>state.volume=+e.target.value/100);
  $('quality').addEventListener('change',e=>setQuality(e.target.value));$('environmentButton').addEventListener('click',()=>setEnvironmentVisible(!envShown));$('environmentClose').addEventListener('click',()=>setEnvironmentVisible(false));
  $('cinemaButton').addEventListener('click',cinema);$('restoreUI').addEventListener('click',cinema);$('fullscreenButton').addEventListener('click',fullscreen);
  const help=$('helpDialog');$('helpButton').addEventListener('click',()=>help.showModal());$('closeHelp').addEventListener('click',()=>help.close());$('beginButton').addEventListener('click',()=>help.close());$('routeLengthHelp').textContent=(P.length/1000).toFixed(1);
  help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)help.close();}});
  const shots=[['follow',16],['close',14],['high',13],['low',8]];let shot=0;
  $('directorButton').addEventListener('click',()=>{state.director=!state.director;state.directorTime=0;shot=0;$('directorButton').setAttribute('aria-pressed',String(state.director));if(state.director){setCamera('follow',false);toast('自动镜头巡演 · 拖动即可接管');}else toast('已退出镜头巡演');});
  const pointers=new Map();let dragDistance=0;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.classList.add('dragging');endDirector(true);canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId),dx=e.clientX-prev.x,dy=e.clientY-prev.y;
    if(pointers.size===2){const other=Array.from(pointers.entries()).find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(prev.x-other.x,prev.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>0)zoom(before/Math.max(1,after));}
    else if(state.mode==='low'){fixedYaw-=dx*.005;fixedPitch=P.clamp(fixedPitch-dy*.004,-1.25,1.25);}else{orbit.yaw-=dx*.0055;orbit.phi=P.clamp(orbit.phi-dy*.0045,.08,2.83);}
    dragDistance+=Math.abs(dx)+Math.abs(dy);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  });
  function pointerEnd(e){pointers.delete(e.pointerId);if(!pointers.size){canvas.classList.remove('dragging');dragDistance=0;}}
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
  function zoom(factor){endDirector();if(state.mode==='low')targetFov=P.clamp(targetFov*factor,28,82);else orbit.radius=P.clamp(orbit.radius*factor,8.2,2450);}
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(e.deltaY*.001));},{passive:false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
    if(help.open){if(e.key==='Escape')help.close();return;}if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.repeat)return;
    if(e.code==='Space'){e.preventDefault();togglePlay();}else if(['1','2','3','4'].includes(e.key)){setCamera(['follow','close','low','high'][+e.key-1]);}else if(e.key.toLowerCase()==='r')restart();else if(e.key.toLowerCase()==='e')toggleEngine();else if(e.key==='+'||e.key==='=')setTargetSpeed(state.targetSpeed+15);else if(e.key==='-')setTargetSpeed(state.targetSpeed-15);else if(e.key.toLowerCase()==='h')cinema();else if(e.key.toLowerCase()==='f')fullscreen();else if(e.key.toLowerCase()==='m')toggleSound();else if(e.key==='?'||e.key.toLowerCase()==='i')help.showModal();else if(e.key==='Escape'){endDirector();if(hiddenUI)cinema();}
  });
  document.addEventListener('visibilitychange',()=>{if(audio.master&&document.hidden)audio.master.gain.setTargetAtTime(0,audio.ctx.currentTime,.06);previousTime=performance.now();});
  let contextLost=false;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;toast('图形上下文暂时中断，正在等待恢复');});
  canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;toast('图形上下文已恢复');});
  function step(dt,render=true){
    if(disposed||contextLost)return;
    const simDt=state.running?dt*state.rate:0,previousSpeed=state.speed,previousLap=Math.floor(state.distance/P.length);state.time+=simDt;
    const command=state.engineOn?P.clamp((state.targetSpeed-state.speed)*.45,-22,18):(-state.speed*.014-state.speed*state.speed*.000075);
    state.acceleration=P.mix(state.acceleration,command,1-Math.exp(-simDt*1.8));state.speed=P.clamp(state.speed+state.acceleration*simDt,0,P.speedLimits.max);
    const throttle=state.engineOn?P.clamp(.60+(state.targetSpeed-state.speed)*.017,.16,1):0;
    state.thrust=P.mix(state.thrust,throttle,1-Math.exp(-simDt*1.65));state.temperature=P.mix(state.temperature,state.engineOn?.28+state.thrust*.72:0,1-Math.exp(-simDt*(state.engineOn?.24:.073)));
    state.distance+=simDt*(previousSpeed+state.speed)*.5;if(Math.floor(state.distance/P.length)!==previousLap)state.lapStartTime=state.time;
    // Rebase after a week of continuous runtime, at an exact route length only.
    if(state.distance>P.length*100000)state.distance-=P.length*99999;
    if(state.autoTime)state.hour=(state.hour+dt/60)%24;
    state.weather=P.mix(state.weather,state.weatherTarget,1-Math.exp(-dt*.40));
    P.flight(state.distance,state.time,flight,state.speed);flight.speed=state.speed;airframe.position.copy(flight.position);airframe.quaternion.copy(flight.quaternion);
    airframe.userData.glow.opacity=(.13+state.thrust*.67)*state.temperature*(.97+.03*Math.sin(state.time*12.7));airframe.userData.hot.emissiveIntensity=state.temperature*.055;env.heat.material.uniforms.uThrust.value=state.thrust;env.heat.visible=state.thrust>.005;
    if(state.director&&state.running){state.directorTime+=dt;if(state.directorTime>shots[shot][1]){state.directorTime=0;shot=(shot+1)%shots.length;setCamera(shots[shot][0],false);}}
    updateCamera(dt,firstFrame);env.update(state.time,state.hour,state.weather,camera,flight,state.distance);
    flight.clearance=flight.position.y-P.waveHeight(flight.position.x,flight.position.z,state.time)-.98;
    const intensity=P.mix(.14,.58,env.uniforms.uDay.value);for(const m of cloudProbeMats)m.envMapIntensity=intensity;
    const marker=$('airframeMarker');marker.hidden=state.mode!=='high';if(!marker.hidden){const ndc=relative.copy(flight.position).project(camera);marker.style.left=((ndc.x+1)*.5*innerWidth)+'px';marker.style.top=((1-ndc.y)*.5*innerHeight)+'px';marker.hidden=Math.abs(ndc.x)>1||Math.abs(ndc.y)>1||ndc.z>1;}
    updateAudio(dt);uiClock+=dt;if(uiClock>.09||firstFrame){updateUI();uiClock=0;}
    if(render)optics.render(state.time,state.thrust);
    if(firstFrame){firstFrame=false;$('loading').classList.add('finished');setTimeout(()=>$('loading').hidden=true,650);}
  }
  let previousTime=performance.now(),raf=0;
  function animate(now){
    raf=requestAnimationFrame(animate);const dt=Math.max(0,Math.min((now-previousTime)/1000,.10));previousTime=now;
    if(document.hidden||contextLost)return;step(dt);
    fpsFrames++;fpsTime+=dt;adaptiveWait+=dt;
    if(fpsTime>2){measuredFps=fpsFrames/fpsTime;fpsFrames=0;fpsTime=0;}
    if(state.quality==='auto'&&adaptiveWait>7&&measuredFps<31&&pixelRatio>.72){pixelRatio=Math.max(.7,pixelRatio*.85);resize();adaptiveWait=0;}
  }
  if(innerWidth<800)setEnvironmentVisible(false);updateEngineUI();
  step(0);raf=requestAnimationFrame(animate);
  // Read-only state snapshots plus an explicit offline test step; no network telemetry.
  window.__PELAGIC__=Object.freeze({
    snapshot(){const ndc=flight.position.clone().project(camera);return {version:'1.2.0',running:state.running,rate:state.rate,speed:state.speed,targetSpeed:state.targetSpeed,nominalSpeed:P.speed,engineOn:state.engineOn,thrust:state.thrust,temperature:state.temperature,acceleration:state.acceleration,time:state.time,distance:state.distance,progress:flight.progress,hour:state.hour,autoTime:state.autoTime,weather:state.weather,weatherTarget:state.weatherTarget,mode:state.mode,director:state.director,position:flight.position.toArray(),forward:flight.forward.toArray(),quaternion:flight.quaternion.toArray(),bank:flight.bank,clearance:flight.clearance,camera:camera.position.toArray(),targetNDC:ndc.toArray(),sun:env.uniforms.uSunDir.value.toArray(),moon:env.uniforms.uMoonDir.value.toArray(),daylight:env.uniforms.uDay.value,vegetation:{...env.vegetation.stats},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length,pixelRatio,fps:measuredFps},audio:{contexts:audio.ctx?1:0,sound:state.sound,state:audio.ctx?.state||'uninitialized'},routeLength:P.length};},
    advance(seconds,dt=1/30){const n=Math.ceil(seconds/dt);for(let i=0;i<n;i++)step(Math.min(dt,seconds-i*dt),false);optics.render(state.time,state.thrust);return this.snapshot();},
    render(heatStrength=state.thrust){optics.render(state.time,heatStrength);},
    dispose(){disposed=true;cancelAnimationFrame(raf);audio.ctx?.close();env.dispose();optics.dispose();const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material])){ms.add(m);if(m.map)ts.add(m.map);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());renderer.dispose();}
  });
})();
