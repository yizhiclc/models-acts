import {engineLayout} from './vehicle.js';
import './engine-control.css';

// This panel only submits commands. It never writes pose, rates, forces or fuel.
export class EngineControl {
 constructor(container,{getSimulation,notify}){
  this.getSimulation=getSimulation;this.notify=notify;this.definitions=[...engineLayout(),...engineLayout(true)];
  this.element=document.createElement('section');this.element.className='engine-console';this.element.id='engine-console';this.element.hidden=true;this.element.setAttribute('aria-label','发动机故障试验');
  this.element.innerHTML=`<header><div><span>PROPULSION / FAULT INJECTION</span><h2>发动机故障试验</h2></div><button id="engine-close" aria-label="关闭发动机面板">×</button></header>
   <p class="engine-help">在任意飞行阶段选择发动机并关机。偏心推力、喷口补偿和气动作用共同决定后续轨迹。</p>
   <div class="engine-layout"><div class="engine-diagram booster-diagram" aria-label="一级 33 台发动机尾视图"><span class="diagram-axis">+Z ↑　+X →</span><div class="engine-outline"></div>${engineLayout().map(e=>`<button class="diagram-engine" style="left:${95+e.position[0]*21-10}px;top:${99-e.position[2]*21-10}px" data-engine-pick="${e.id}" title="${e.id} · ${e.gimbalLimit?'可摆动':'固定喷口'}">${e.id.slice(1)}<i></i></button>`).join('')}<span class="diagram-caption">SUPER HEAVY · 33 RAPTORS</span></div><div class="engine-diagram ship-diagram" aria-label="二级 6 台发动机尾视图"><div class="engine-outline"></div>${engineLayout(true).map(e=>`<button class="diagram-engine" style="left:${60+e.position[0]*14-10}px;top:${65-e.position[2]*14-10}px" data-engine-pick="${e.id}" title="${e.id} · ${e.kind==='vacuum'?'真空机':'海平面机'}">${e.id}<i></i></button>`).join('')}<span class="diagram-caption">SHIP · 3 SL + 3 VAC</span></div></div>
   <div class="engine-selection"><button data-select-group="inner">内圈 13 台</button><button data-select-group="outer">外圈 20 台</button><button data-select-group="ship">二级 6 台</button><button data-select-group="clear">清除选择</button></div>
   <div class="engine-dynamics"><span>ω X / Y 滚转 / Z · °/s</span><b id="engine-rates">0 / 0 / 0</b><span>偏心力矩 · kN·m</span><b id="engine-moment">0 / 0 / 0</b></div>
   <div class="engine-rows">${this.definitions.map(({id,kind})=>`<div class="engine-row" data-engine-row="${id}"><label><input type="checkbox" data-engine-check="${id}" ${id==='B2'?'checked':''}> <strong>${id}</strong><span>${id.startsWith('S')?(kind==='vacuum'?'二级真空机':'二级海平面机'):'一级 '+(kind==='outer'?'固定喷口':'可摆喷口')}</span></label><button data-engine-switch="${id}" aria-label="关闭 ${id}">关机</button><div class="engine-readout"><span data-engine-status="${id}">待命</span><b data-engine-thrust="${id}">0 kN</b><span data-engine-valve="${id}">阀门 0%</span></div><div class="engine-thrust-track"><i data-engine-bar="${id}"></i></div></div>`).join('')}</div>
   <div class="engine-actions"><button id="engine-cut" class="cut">切断选中发动机</button><button id="engine-restore">允许选中重新点火</button><button id="engine-cut-booster">一级全部关机</button></div>
   <div class="manual-throttles"><h3>油门控制</h3>${['booster','upper'].map(stage=>`<div><label><input data-throttle-manual="${stage}" type="checkbox">${stage==='booster'?'一级':'二级'}手动油门</label><b data-throttle-value="${stage}">自动</b><input data-throttle="${stage}" aria-label="${stage==='booster'?'一级':'二级'}手动油门" type="range" min="0" max="100" value="70" disabled></div>`).join('')}<p>手动值直接送往当前发动机组的阀门；禁用发动机始终不参与。自动制导仍可控制姿态。</p></div>
   <label class="attitude-control"><input id="attitude-control" type="checkbox" checked><span>自动姿控补偿 <small>关闭后保留重力、气动力和残余角动量</small></span></label>
   <details class="engine-schedule"><summary>按高度触发关机</summary><div><input id="engine-altitude" type="number" min="0" max="1000" step="0.1" value="10" aria-label="关机高度 km"><span>km</span><select id="engine-crossing" aria-label="高度方向"><option value="ascending">上升经过</option><option value="descending">下降经过</option></select><button id="engine-schedule-add">设定</button></div><p>对选中的发动机生效，二级使用自身高度。</p><div id="engine-plans"></div><button id="engine-schedule-clear">取消未触发计划</button></details>
   <div class="engine-command-log" id="engine-command-log" role="status"></div><p class="engine-footnote">关机阀门在约 0.25–0.34 s 内关闭，尾流自然消散。恢复按钮解除禁用，仍由当前任务阶段决定是否点火。重置清除全部故障命令。</p>`;
  container.append(this.element);const $=id=>this.element.querySelector('#'+id);
  const submit=(ids,enabled)=>{getSimulation().setEnginesEnabled(ids,enabled);this.update();notify(`${ids.join('、')} ${enabled?'允许任务制导重新点火':'关机指令已提交'}${getSimulation().running?'':' · 恢复仿真后执行'}`);};
  this.element.querySelectorAll('[data-select-group]').forEach(button=>button.onclick=()=>{const group=button.dataset.selectGroup;this.element.querySelectorAll('[data-engine-check]').forEach(el=>{const e=this.definitions.find(e=>e.id===el.dataset.engineCheck);el.checked=group==='inner'?e.stage==='booster'&&e.kind!=='outer':group==='outer'?e.kind==='outer':group==='ship'?e.stage==='upper':false;});this.update();});
  for(const stage of ['booster','upper']){const manual=this.element.querySelector('[data-throttle-manual="'+stage+'"]'),slider=this.element.querySelector('[data-throttle="'+stage+'"]');manual.onchange=()=>{getSimulation().setThrottle(stage,manual.checked?Number(slider.value)/100:null);this.update();};slider.oninput=()=>{getSimulation().setThrottle(stage,Number(slider.value)/100);this.update();};}
  $('engine-close').onclick=()=>this.setOpen(false);
  this.element.querySelectorAll('[data-engine-pick]').forEach(el=>el.onclick=()=>{const check=this.element.querySelector(`[data-engine-check="${el.dataset.enginePick}"]`);check.checked=!check.checked;this.update();});
  this.element.querySelectorAll('[data-engine-check]').forEach(el=>el.onchange=()=>this.update());
  this.element.querySelectorAll('[data-engine-switch]').forEach(el=>el.onclick=()=>{const id=el.dataset.engineSwitch,e=getSimulation().allEngines().find(e=>e.id===id);submit([id],!e.requestedEnabled);});
  $('engine-cut').onclick=()=>submit(this.selected(),false);$('engine-restore').onclick=()=>submit(this.selected(),true);$('engine-cut-booster').onclick=()=>submit(engineLayout().map(e=>e.id),false);
  $('attitude-control').onchange=()=>{getSimulation().setAttitudeControl($('attitude-control').checked);this.update();};
  $('engine-schedule-add').onclick=()=>{try{const value=$('engine-altitude').value;if(!value.trim())throw Error('请输入关机高度');getSimulation().scheduleEngineShutdown(this.selected(),Number(value)*1000,$('engine-crossing').value);this.update();notify('高度关机计划已记录。');}catch(e){notify(e.message);}};
  $('engine-schedule-clear').onclick=()=>{getSimulation().cancelSchedules();this.update();};
 }
 selected(){return [...this.element.querySelectorAll('[data-engine-check]:checked')].map(el=>el.dataset.engineCheck);}
 setOpen(value){this.element.hidden=!value;const button=document.getElementById('engine-panel-toggle');button?.setAttribute('aria-expanded',String(value));this.update();}
 update(){
  const s=this.getSimulation(),find=id=>this.element.querySelector('#'+id),selected=this.selected();
  for(const e of s.allEngines()){
   const pending=e.enabled!==e.requestedEnabled,status=pending?'待恢复执行':!e.enabled?(e.thrust>1?'关阀中':'已禁用'):e.thrust>1?'工作中':e.stage==='upper'&&!s.upper?'待分离':e.phaseActive===false?'本阶段停机':'待命';
   const row=this.element.querySelector(`[data-engine-row="${e.id}"]`);row.classList.toggle('inhibited',!e.requestedEnabled);row.classList.toggle('selected-engine',selected.includes(e.id));
   const sw=row.querySelector('button');sw.textContent=e.requestedEnabled?'关机':'恢复';sw.setAttribute('aria-label',`${e.requestedEnabled?'关闭':'恢复'} ${e.id}`);
   row.querySelector('[data-engine-status]').textContent=status;row.querySelector('[data-engine-thrust]').textContent=(e.thrust/1000).toFixed(1)+' kN';row.querySelector('[data-engine-valve]').textContent=`阀门 ${(e.valve*100).toFixed(0)}%`;
   row.querySelector('[data-engine-bar]').style.width=`${Math.min(100,e.valve*100)}%`;
   const marker=this.element.querySelector(`[data-engine-pick="${e.id}"]`);if(marker){marker.classList.toggle('selected',selected.includes(e.id));marker.classList.toggle('firing',e.thrust>100);marker.classList.toggle('inhibited',!e.requestedEnabled);marker.setAttribute('aria-pressed',String(selected.includes(e.id)));}
  }
  find('engine-cut').disabled=find('engine-restore').disabled=find('engine-schedule-add').disabled=!selected.length;
  for(const stage of ['booster','upper']){const value=s.requestedManualThrottle[stage],manual=this.element.querySelector('[data-throttle-manual="'+stage+'"]'),slider=this.element.querySelector('[data-throttle="'+stage+'"]');manual.checked=value!==null;slider.disabled=value===null;if(value!==null)slider.value=Math.round(value*100);this.element.querySelector('[data-throttle-value="'+stage+'"]').textContent=value===null?'自动':Math.round(value*100)+'%';}
  find('attitude-control').checked=s.requestedAttitudeControl;
  find('engine-rates').textContent=s.angularVelocity.map(n=>(n*180/Math.PI).toFixed(2)).join(' / ');
  find('engine-moment').textContent=s.torqueImbalance.map(n=>(n/1000).toFixed(1)).join(' / ');
  find('engine-plans').textContent=s.schedules.filter(p=>!p.cancelled).map(p=>`${p.ids.join('+')} · ${p.altitude/1000} km ${p.direction==='ascending'?'↑':'↓'} · ${p.triggered.length===p.ids.length?'已触发':'等待经过'}`).join('\n')||'暂无计划';
  const last=s.engineCommands.at(-1);find('engine-command-log').textContent=(s.commandQueue.length?`${s.commandQueue.length} 条指令待下一物理步执行。\n`:'')+(last?`最近：T=${last.appliedAt.toFixed(3)} s · ${last.ids.join('+')} ${last.enabled?'恢复':'关机'}\n一级 ${(last.altitude/1000).toFixed(3)} km${last.upperAltitude===null?'':` · 二级 ${(last.upperAltitude/1000).toFixed(3)} km`}`:'尚未注入故障。建议上升时关闭 B2，对比自动姿控开 / 关。');
 }
}
