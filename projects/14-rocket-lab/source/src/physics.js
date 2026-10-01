// SI units; full 3D translational / quaternion rigid-body state, integrated live.
import {add,sub,mul,dot,cross,length,unit,rotate,unrotate,qMultiply,qExp,targetQuaternion,initRigid,syncAttitude,integrateRotation,makeEngines,updateValves,actuate,aerodynamicTorque} from './rigid-body.js';
export const DT=1/120, G0=9.80665;
export const BUILD='2026-09-30-starship-flight-control';
export const CONSTANTS=Object.freeze({earthRadius:6371000,dryMass:200000,payloadMass:100000,upperDryMass:120000,upperInitialFuel:1200000,initialPropellant:4600000,ascentReserve:360000,length:71,radius:4.5,contactHeight:55,upperMount:38,upperCOM:25,thrustSL:73920000,thrustVac:80850000,upperThrust:14640000,upperIsp:370,fuelEnergy:50e6,combustionFraction:.12,crushForce:16000000,structuralForce:25000000,rcsIsp:72,rcsLever:32,landingX:1600});
export const DEFAULTS=Object.freeze({landingIgnition:12000,finDeployAltitude:45000,stroke:2.2,initialFuel:4600000,pitchKick:2.0});
export const PHASES=['STANDBY','DELUGE','IGNITION','BUILDUP','ASCENT','MECO','SEPARATION','FLIP','BOOSTBACK','COAST','ENTRY','LANDING','CONTACT','LANDED','CRASHED'];
export const PHASE_NAMES={STANDBY:'待命',DELUGE:'喷水 / 撤离',IGNITION:'发动机点火',BUILDUP:'推力建立',ASCENT:'重力转弯上升',MECO:'主发动机关机',SEPARATION:'级间分离',FLIP:'助推器转向',BOOSTBACK:'返场点火',COAST:'高空滑行',ENTRY:'再入减速',LANDING:'着陆点火',CONTACT:'塔架缓冲',LANDED:'捕获成功',CRASHED:'坠毁'};
export const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function atmosphere(h){const altitude=Math.max(0,h),temperature=Math.max(216.65,288.15-altitude*.0065);return {rho:1.225*Math.exp(-altitude/8500),temperature,pressure:101325*Math.exp(-altitude/8400),sound:Math.sqrt(1.4*287.05*temperature)};}
export function dragCoefficient(m){return .30+.40*Math.exp(-(((m-1)/.19)**2))+.12/(1+Math.exp(-(m-1.25)*8));}
export function heating(rho,speed){return 1.83e-4*Math.sqrt(Math.max(rho,0)/1.8)*Math.max(speed,0)**3;}
export function inertiaFor(fuel,payload=0){const c=CONSTANTS;return c.dryMass*(c.length**2/12+c.radius**2/4)+fuel*(47**2/12+c.radius**2/4)+payload*(63**2+50**2/12);}
const upperInertia=f=>(CONSTANTS.upperDryMass+CONSTANTS.payloadMass)*(50**2/12+4.5**2/4)+f*(32**2/12+4.5**2/4);
export function gravityAt(x,y,z=0){const r=Math.hypot(x,CONSTANTS.earthRadius+y,z),g=G0*(CONSTANTS.earthRadius/r)**2;return {x:-g*x/r,y:-g*(CONSTANTS.earthRadius+y)/r,z:-g*z/r,magnitude:g};}
export const altitudeAt=(x,y,z=0)=>Math.max(0,Math.hypot(x,CONSTANTS.earthRadius+y,z)-CONSTANTS.earthRadius-CONSTANTS.contactHeight);
// Empirical pressure-ratio envelope and shock-cell contrast, not a CFD solution.
export function exhaustState(pressure,throttle=1,vacuum=false){const exitPressure=(vacuum?5500:145000)*Math.max(.08,throttle),pressureRatio=exitPressure/Math.max(pressure,20),halfAngle=clamp(3+Math.log2(Math.max(.25,pressureRatio))*2.6,2,vacuum?32:27)*Math.PI/180;return {exitPressure,pressureRatio,halfAngle,expansion:1+Math.tan(halfAngle)*12,machContrast:clamp(throttle,0,1)*clamp(Math.sqrt(pressure/101325),.03,1)*.8,machSpacing:(vacuum?4.8:3)*Math.sqrt(Math.max(.35,pressureRatio))};}
export function assessTouchdown({mass,vx,vy,vz=0,omega,inertia,theta,x,z=0,attitude=null,angularVelocity=null,inertiaTensor=null,propellant,stroke,landingX=CONSTANTS.landingX,legsDeployed=true}){
 const c=CONSTANTS,tilt=attitude?Math.acos(clamp(rotate(attitude,[0,1,0])[1],-1,1)):Math.abs(wrap(theta)),kineticEnergy=.5*mass*(vx*vx+vy*vy+vz*vz)+(angularVelocity?.reduce((sum,w,i)=>sum+.5*inertiaTensor[i]*w*w,0)??.5*inertia*omega*omega),netForce=Math.max(0,c.crushForce-mass*G0),capacity=netForce*stroke,strokeRequired=netForce>0?kineticEnergy/netForce:Infinity,netImpulse=mass*Math.max(0,-vy),stoppingTime=netForce>0?netImpulse/netForce:Infinity,groundImpulse=c.crushForce*stoppingTime,reasons=[];
 if(kineticEnergy>capacity)reasons.push('缓冲行程耗尽');if(c.crushForce>c.structuralForce||netForce<=0)reasons.push('支撑载荷超限');if(Math.abs(tilt)>6*Math.PI/180)reasons.push('触地倾角超限');if(!legsDeployed)reasons.push('未进入塔架捕获窗口');if(Math.hypot(x-landingX,z)>27)reasons.push('偏离着陆区');if(Math.hypot(vx,vz)>4)reasons.push('侧向剪切超限');
 const success=!reasons.length,chemicalEnergy=propellant*c.fuelEnergy*c.combustionFraction,explosionEnergy=success?0:kineticEnergy+chemicalEnergy,blastScale=success?0:Math.cbrt(explosionEnergy/1e8);
 return {success,reasons,mass,vx,vy,vz,omega,theta,x,z,attitude,angularVelocity,inertiaTensor,legsDeployed,landingX,landingError:Math.hypot(x-landingX,z),tilt,propellant,inertia,stroke,kineticEnergy,chemicalEnergy,explosionEnergy,capacity,strokeRequired,netImpulse,stoppingTime,groundImpulse,crushForce:c.crushForce,peakLoadG:c.crushForce/mass/G0,blastScale,blastRadius:success?0:12+20*blastScale,blastDuration:success?0:3+2*Math.log10(1+explosionEnergy/1e8),debrisRange:success?0:25+43*blastScale};
}
const fieldNames=['plume','upperPlume','steam','reentry','explosion','upperExplosion','dust'];
export const ENGINE_COLUMNS=['t','engine','enabled','requestedEnabled','valve','thrust','gimbalX','gimbalZ','fuelUsed','intensity','forceX','forceY','forceZ','torqueX','torqueY','torqueZ','emission','triggerAt'];
export class Simulation{
 constructor(config={}){this.reset(config);}
 reset(config=this.config){
  this.config={...DEFAULTS,...config};this.t=0;this.tick=0;this.phase='STANDBY';this.running=false;this.x=0;this.y=CONSTANTS.contactHeight;this.vx=this.vy=this.theta=this.omega=this.alpha=this.thetaTarget=0;
  // Sole authoritative mission inventory, with stage tank allocations. No cross-feed after separation.
  const upper=Math.min(CONSTANTS.upperInitialFuel,this.config.initialFuel*CONSTANTS.upperInitialFuel/CONSTANTS.initialPropellant);this.fuel={booster:this.config.initialFuel-upper,upper};
  this.z=this.vz=this.az=0;initRigid(this);this.engines=makeEngines();this.upperEngines=makeEngines(true);this.attitudeControl=true;this.requestedAttitudeControl=true;this.commandQueue=[];this.engineCommands=[];this.schedules=[];this.commandNumber=0;this.manualThrottle={booster:null,upper:null};this.requestedManualThrottle={booster:null,upper:null};
  this.torqueEngine=this.torqueAero=this.torqueFinVector=this.torqueRCSVector=this.torqueImbalance=this.forceEngine=[0,0,0];
  this.ledger={main:0,rcs:0,fins:0,gimbal:0,upperMain:0,upperRCS:0,upperGimbal:0,explosion:0,dispersed:0};this.attached=true;this.upper=null;this.payload=0;
  this.throttle=this.throttleCommand=this.thrust=this.gimbal=this.finDeflection=this.torqueGimbal=this.torqueRCS=this.torqueFins=this.finPower=0;this.finsDeployed=false;
  this.thetaIntegral=this.angularImpulse=this.inertiaTransportImpulse=this.ax=this.ay=0;
  for(const n of ['touchdown','entryBurnAt','entryCutoffAt','liftoffAt','mecoAt','separationAt','contactAt','terminalAt','pitchKickAt','gravityTurnAt','boostbackAt','boostbackCutoffAt','apogeeAt'])this[n]=null;
  this.maxAltitude=this.maxSpeed=this.maxHeat=0;this.previousPhase=null;this.predictedLandingX=this.returnTime=this.returnError=0;this.predictAt=-1;
  this.fields=Object.fromEntries(fieldNames.map(k=>[k,{intensity:0,triggerAt:null,activations:[],emission:0}]));this.events=[];this.samples=[];this.engineSamples=[];this.gpuEvidence={backend:'not-attached',dispatches:{},note:'CPU records inputs; actual GPU execution is separately read back in browser tests.'};this.derive();this.updateFields(0);this.record();
 }
 get propellant(){return this.fuel.booster+this.fuel.upper;}get boosterPropellant(){return this.fuel.booster;}get altitude(){return altitudeAt(this.x,this.y,this.z);}get terminal(){return this.phase==='LANDED'||this.phase==='CRASHED';}get missionComplete(){return this.terminal&&(!this.upper||this.upper.cutoffAt!==null||this.upper.touchdown);}
 event(type,extra={}){this.events.push({t:this.t,type,...extra});}setPhase(phase){if(this.phase===phase)return;this.previousPhase=this.phase;this.phase=phase;this.event('phase',{phase});}start(){if(this.phase==='STANDBY')this.setPhase('DELUGE');this.running=true;}pause(){this.running=false;}

 allEngines(){return [...this.engines,...this.upperEngines];}
 setEnginesEnabled(ids,enabled){
  if(!Array.isArray(ids)||!ids.length)throw Error('请选择发动机');const engines=ids.map(id=>this.allEngines().find(e=>e.id===id));if(engines.some(e=>!e))throw Error('未知发动机');
  const command={id:++this.commandNumber,type:'engine-command',ids:[...new Set(ids)],enabled:!!enabled,requestedAt:this.t,requestedAltitude:this.altitude,source:'manual'};
  for(const e of engines)e.requestedEnabled=!!enabled;this.commandQueue.push(command);return command;
 }
 setThrottle(stage,value){if(!['booster','upper'].includes(stage)||value!==null&&(!Number.isFinite(value)||value<0||value>1))throw Error('油门应为 0–1，null 为自动');this.requestedManualThrottle[stage]=value;this.commandQueue.push({id:++this.commandNumber,type:'throttle-command',stage,value,requestedAt:this.t});}
 setAttitudeControl(enabled){this.requestedAttitudeControl=!!enabled;this.commandQueue.push({id:++this.commandNumber,type:'attitude-control',enabled:!!enabled,requestedAt:this.t});}
 scheduleEngineShutdown(ids,altitude,direction='ascending'){
  if(!Number.isFinite(altitude)||altitude<0||altitude>1000000)throw Error('高度应为 0–1000000 m');
  if(!['ascending','descending'].includes(direction)||!ids.length||ids.some(id=>!this.allEngines().some(e=>e.id===id)))throw Error('无效的关机计划');
  const plan={id:++this.commandNumber,ids:[...new Set(ids)],altitude,direction,createdAt:this.t,triggered:[],cancelled:false};this.schedules.push(plan);this.event('engine-shutdown-scheduled',{...plan});return plan;
 }
 cancelSchedules(){for(const p of this.schedules)if(!p.cancelled){p.cancelled=true;this.event('engine-schedule-cancelled',{scheduleId:p.id});}}
 applyCommands(){
  for(const plan of this.schedules)if(!plan.cancelled)for(const id of plan.ids)if(!plan.triggered.includes(id)){
   const body=id.startsWith('S')?this.upper:this;if(!body)continue;const h=body.altitude;
   if((plan.direction==='ascending'&&body.vy>0&&h>=plan.altitude)||(plan.direction==='descending'&&body.vy<0&&h<=plan.altitude)){
    this.commandQueue.push({id:++this.commandNumber,type:'engine-command',ids:[id],enabled:false,requestedAt:this.t,requestedAltitude:h,source:'altitude',scheduleId:plan.id});plan.triggered.push(id);
   }
  }
  for(const command of this.commandQueue){
   if(command.type==='throttle-command'){this.manualThrottle[command.stage]=command.value;this.event('throttle-command',{...command,appliedAt:this.t,altitude:this.altitude});continue;}
   if(command.type==='attitude-control'){this.attitudeControl=command.enabled;this.event('attitude-control',{...command,appliedAt:this.t});continue;}
   for(const id of command.ids){const e=this.allEngines().find(e=>e.id===id);e.enabled=e.requestedEnabled=command.enabled;}
   const record={...command,appliedAt:this.t,altitude:this.altitude,upperAltitude:this.upper?.altitude??null,phase:this.phase,attitude:[...this.attitude],omega:[...this.angularVelocity],fuel:{...this.fuel}};this.engineCommands.push(record);this.event('engine-command',record);
  }
  this.commandQueue=[];
 }
 inertia3(upper=false){const transverse=upper?upperInertia(this.fuel.upper):inertiaFor(this.fuel.booster,this.payload),polar=(upper?CONSTANTS.upperDryMass+CONSTANTS.payloadMass+this.fuel.upper:this.mass)*CONSTANTS.radius**2*.5;return [transverse*1.012,polar,transverse];}

 derive(){
  const c=CONSTANTS;syncAttitude(this);Object.assign(this,atmosphere(this.altitude));this.payload=this.attached?c.upperDryMass+c.payloadMass+this.fuel.upper:0;this.mass=c.dryMass+this.fuel.booster+this.payload;this.inertia=inertiaFor(this.fuel.booster,this.payload);this.inertiaTensor=this.inertia3();
  this.speed=Math.hypot(this.vx,this.vy,this.vz);this.mach=this.speed/this.sound;this.flightPathAngle=-Math.atan2(this.vx,this.vy);this.angleOfAttack=this.speed>.01?Math.acos(clamp(dot(this.axis,[this.vx,this.vy,this.vz])/this.speed,-1,1)):0;this.cd=dragCoefficient(this.mach);this.q=.5*this.rho*this.speed**2;
  const alignment=this.speed>.01?dot(this.axis,[this.vx,this.vy,this.vz])/this.speed:1;this.sideFactor=Math.max(0,1-alignment**2);this.area=Math.PI*c.radius**2+c.length*2*c.radius*this.sideFactor+(this.finsDeployed?48:0);this.effectiveCd=this.cd+.75*this.sideFactor;this.drag=this.q*this.effectiveCd*this.area;
  const dragForce=this.speed>.01?mul([this.vx,this.vy,this.vz],-this.drag/this.speed):[0,0,0];[this.dragX,this.dragY,this.dragZ]=dragForce;
  this.aerodynamics=aerodynamicTorque(this,dragForce,this.rho,this.speed,{fins:this.finsDeployed});this.torqueAero=this.aerodynamics.torque;
  this.heatFlux=heating(this.rho,this.speed);this.skinTemperature=(288.15**4+this.heatFlux/(.8*5.670374419e-8))**.25;this.gravityVector=gravityAt(this.x,this.y,this.z);this.gravity=this.gravityVector.magnitude;this.availableThrust=c.thrustSL+(c.thrustVac-c.thrustSL)*(1-this.pressure/101325);this.isp=327+29*(1-this.pressure/101325);
 }
 debit(pool,demands){const total=Object.values(demands).reduce((a,b)=>a+b,0),available=this.fuel[pool],ratio=total>0?Math.min(1,available/total):(available>0?1:0);for(const [key,value]of Object.entries(demands))this.ledger[key]+=value*ratio;this.fuel[pool]=Math.max(0,available-total*ratio);if(this.fuel[pool]<1e-8)this.fuel[pool]=0;return ratio;}
 separate(){
  const c=CONSTANTS,detachedMass=this.payload,boosterMass=c.dryMass+this.fuel.booster,axis=this.axis,offset=c.upperMount+c.upperCOM;
  const pre={x:this.x,y:this.y,z:this.z,vx:this.vx,vy:this.vy,vz:this.vz,theta:this.theta,omega:this.omega,attitude:[...this.attitude],angularVelocity:[...this.angularVelocity]},impulse=detachedMass*4,boosterDeltaV=-impulse/boosterMass;
  this.vx+=axis[0]*boosterDeltaV;this.vy+=axis[1]*boosterDeltaV;this.vz+=axis[2]*boosterDeltaV;
  this.upper={x:pre.x+axis[0]*offset,y:pre.y+axis[1]*offset,z:pre.z+axis[2]*offset,vx:pre.vx+axis[0]*4,vy:pre.vy+axis[1]*4,vz:pre.vz+axis[2]*4,thetaAtSeparation:this.theta,omegaAtSeparation:this.omega,thrust:0,throttle:0,throttleCommand:0,gimbal:0,torque:0,torqueGimbal:0,torqueRCS:0,phase:'SEPARATED',ignitionAt:null,cutoffAt:null,mass:detachedMass,inertia:upperInertia(this.fuel.upper),altitude:this.altitude,heatFlux:0,maxAltitude:0,maxSpeed:0,torqueEngine:[0,0,0],torqueAero:[0,0,0],torqueRCSVector:[0,0,0],torqueFinVector:[0,0,0],torqueImbalance:[0,0,0],forceEngine:[0,0,0]};initRigid(this.upper,this.attitude,this.angularVelocity);this.upper.inertiaTensor=this.inertia3(true);this.upper.engines=this.upperEngines;
  this.attached=false;this.separationAt=this.t;
  this.event('separation',{...pre,altitude:this.altitude,detachedMass,boosterMass,axisX:axis[0],axisY:axis[1],axisZ:axis[2],impulse,boosterDeltaV,upperX:this.upper.x,upperY:this.upper.y,upperZ:this.upper.z,upperVx:this.upper.vx,upperVy:this.upper.vy,upperVz:this.upper.vz,
   momentumResidualX:boosterMass*(this.vx-pre.vx)+detachedMass*(this.upper.vx-pre.vx),momentumResidualY:boosterMass*(this.vy-pre.vy)+detachedMass*(this.upper.vy-pre.vy),momentumResidualZ:boosterMass*(this.vz-pre.vz)+detachedMass*(this.upper.vz-pre.vz),springEnergy:.5*detachedMass*4**2+.5*boosterMass*boosterDeltaV**2,upperFuel:this.fuel.upper});this.derive();
 }
 stageLogic(){
  if(this.phase==='DELUGE'&&this.t>=5)this.setPhase('IGNITION');if(this.phase==='IGNITION'&&this.t>=6)this.setPhase('BUILDUP');if(this.phase==='BUILDUP'&&this.t>=8&&this.thrust>this.mass*this.gravity*1.04){this.setPhase('ASCENT');this.liftoffAt=this.t;}
  if(this.phase==='ASCENT'){
   if(this.altitude>=250&&this.pitchKickAt===null){this.pitchKickAt=this.t;this.event('pitch-kick',{altitude:this.altitude,targetDegrees:-this.config.pitchKick});}
   if(this.pitchKickAt!==null&&this.t-this.pitchKickAt>=12&&this.gravityTurnAt===null){this.gravityTurnAt=this.t;this.event('gravity-turn',{altitude:this.altitude});}
   if(this.fuel.booster<=(this.config.ascentReserve??CONSTANTS.ascentReserve)){this.mecoAt=this.t;this.setPhase('MECO');this.event('meco',{altitude:this.altitude,speed:this.speed,downrange:this.x,boosterFuel:this.fuel.booster});}
  }
  if(this.phase==='MECO'&&this.t-this.mecoAt>=3){this.setPhase('SEPARATION');this.separate();}if(this.phase==='SEPARATION'&&this.t-this.separationAt>=2)this.setPhase('FLIP');
  if(this.phase==='FLIP'&&Math.abs(wrap(this.theta-Math.PI*.46))<.13&&length(this.angularVelocity)<.10){this.boostbackAt=this.t;this.setPhase('BOOSTBACK');this.event('boostback-ignition',{altitude:this.altitude});}
  if(this.phase==='BOOSTBACK'&&this.returnError<this.availableThrust*this.throttle**2/(8*this.mass)*Math.sin(this.theta)*this.returnTime&&this.t-this.boostbackAt>2){this.boostbackCutoffAt=this.t;this.setPhase('COAST');this.event('boostback-cutoff',{altitude:this.altitude,predictedLandingX:this.predictedLandingX,vx:this.vx});}
  if(['COAST','BOOSTBACK','FLIP'].includes(this.phase)&&this.vy<0&&this.apogeeAt===null){this.apogeeAt=this.t;this.event('apogee',{altitude:this.altitude,x:this.x});}
  if(this.phase==='COAST'&&this.vy<0&&this.altitude<55000)this.setPhase('ENTRY');
  if(this.phase==='ENTRY'&&this.altitude<45000&&this.entryBurnAt===null){this.entryBurnAt=this.t;this.event('entry-ignition',{altitude:this.altitude});}
  if(this.entryBurnAt!==null&&this.entryCutoffAt===null&&this.t-this.entryBurnAt>=20){this.entryCutoffAt=this.t;this.event('entry-cutoff',{altitude:this.altitude,speed:this.speed});}
  if(['ENTRY','COAST'].includes(this.phase)&&this.vy<0&&this.altitude<=this.config.landingIgnition){this.setPhase('LANDING');this.event('landing-ignition',{altitude:this.altitude});}
  if(this.separationAt!==null&&this.vy<0&&this.altitude<this.config.finDeployAltitude&&!this.finsDeployed){this.finsDeployed=true;this.event('fins-deployed',{altitude:this.altitude});}
 }
 // On-line ballistic predictor: axial drag until landing burn, never a baked path.
 predictReturn(){let x=this.x,y=this.y,vx=this.vx,vy=this.vy,t=0;const mass=this.mass,area=Math.PI*CONSTANTS.radius**2+48;while(t<700&&altitudeAt(x,y)>6000){const a=atmosphere(altitudeAt(x,y)),s=Math.hypot(vx,vy),d=.5*a.rho*s*dragCoefficient(s/a.sound)*area/mass,g=gravityAt(x,y);vx+=g.x-d*vx;vy+=g.y-d*vy;x+=vx;y+=vy;t++;}this.predictedLandingX=x+vx*Math.min(12,6000/Math.max(30,-vy));this.returnTime=t;this.returnError=this.predictedLandingX-CONSTANTS.landingX;this.predictAt=this.t;}
 control(dt){
  if(this.separationAt!==null&&this.t-this.predictAt>=(this.phase==='BOOSTBACK'?.025:.25)&&!this.terminal)this.predictReturn();let command=0;this.thetaTarget=0;
  if(this.phase==='IGNITION')command=.04+(this.t-5)*.10;if(this.phase==='BUILDUP')command=.14+(this.t-6)*.43;
  if(this.phase==='ASCENT'){command=this.q>42000?.72:.96;if(this.pitchKickAt!==null)this.thetaTarget=-this.config.pitchKick*Math.PI/180;if(this.gravityTurnAt!==null)this.thetaTarget=clamp(this.flightPathAngle,-Math.PI*.31,0);command=Math.min(command,4.4*G0*this.mass/this.availableThrust);}
  if(['MECO','SEPARATION'].includes(this.phase))this.thetaTarget=this.flightPathAngle;
  if(['FLIP','BOOSTBACK'].includes(this.phase))this.thetaTarget=Math.PI*.46;if(this.phase==='BOOSTBACK')command=.80;
  if(['COAST','ENTRY'].includes(this.phase)){this.thetaTarget=wrap(this.flightPathAngle+Math.PI);if(this.phase==='COAST'&&this.vy>0)this.thetaTarget=0;}
  if(this.phase==='ENTRY'&&this.entryBurnAt!==null&&this.entryCutoffAt===null){command=.65;const desiredVx=(CONSTANTS.landingX-this.x)/Math.max(20,this.returnTime),axWanted=clamp((desiredVx-this.vx)*.32,-10,10);this.thetaTarget=-Math.atan2(axWanted,this.availableThrust*(13/33)*command/this.mass);}
  if(this.phase==='LANDING'){const aWanted=clamp((this.vy**2-3.8**2)/(2*Math.max(this.altitude,.3)),-5,90),tgo=Math.max(4,2*this.altitude/(Math.max(0,-this.vy)+3.8)),axWanted=clamp(6*(CONSTANTS.landingX-this.x)/(tgo*tgo)-4*this.vx/tgo,-24,24);this.thetaTarget=-clamp(Math.atan2(axWanted,this.gravity+aWanted),-.35,.35);command=(this.mass*(this.gravity+aWanted)-this.dragY)/(this.availableThrust*Math.max(.7,Math.cos(this.theta)));}
  let crossTilt=0;
  if(this.phase==='ASCENT'&&this.gravityTurnAt!==null)crossTilt=Math.asin(clamp(this.vz/Math.max(1,this.speed),-.30,.30));
  if(['COAST','ENTRY'].includes(this.phase)&&this.vy<0)crossTilt=-Math.asin(clamp(this.vz/Math.max(1,this.speed),-.5,.5));
  if(this.phase==='LANDING'){const aWanted=clamp((this.vy**2-3.8**2)/(2*Math.max(this.altitude,.3)),-5,90),tgo=Math.max(4,2*this.altitude/(Math.max(0,-this.vy)+3.8)),azWanted=clamp(-6*this.z/tgo**2-4*this.vz/tgo,-24,24);crossTilt=clamp(Math.atan2(azWanted,this.gravity+aWanted),-.35,.35);}
  this.targetAttitude=targetQuaternion(this.thetaTarget,crossTilt);
  for(let i=0;i<this.engines.length;i++)this.engines[i].phaseActive=['BOOSTBACK','ENTRY'].includes(this.phase)?i<13:this.phase==='LANDING'?i<(command>3/33*.85?13:3):true;
  const groupThrust=this.availableThrust*this.engines.filter(e=>e.phaseActive).length/33;
  if(this.phase==='LANDING')command*=this.availableThrust/groupThrust;
  if(this.manualThrottle.booster!==null)command=this.manualThrottle.booster;
  this.throttleCommand=clamp(command,0,1);
  updateValves(this.engines,this.throttleCommand,this.availableThrust,dt,this.fuel.booster>0);
  const act=actuate(this,this.engines,this.targetAttitude,this.inertiaTensor,this.torqueAero,dt,{enabled:this.attitudeControl,fueled:this.fuel.booster>0,fins:this.finsDeployed,dynamicPressure:this.q,wn:this.phase==='LANDING'?1.15:.50});
  const main=this.engines.reduce((sum,e)=>sum+e.thrust/(this.isp*G0)*dt,0),rcs=act.rcsTorque.reduce((sum,tau,i)=>sum+Math.abs(tau)/((i===1?4.5:CONSTANTS.rcsLever)*CONSTANTS.rcsIsp*G0)*dt,0);
  const ratio=this.debit('booster',{main,rcs,fins:act.finPower/(.22*CONSTANTS.fuelEnergy)*dt,gimbal:act.servoPower/(.22*CONSTANTS.fuelEnergy)*dt});
  this.applyActuatorResult(this,this.engines,act,ratio,this.isp,dt);
 }
 applyActuatorResult(body,engines,act,ratio,isp,dt){
  body.forceEngine=mul(act.force,ratio);body.torqueEngine=mul(act.engineTorque,ratio);body.torqueImbalance=mul(act.imbalanceTorque,ratio);body.torqueFinVector=mul(act.finTorque,ratio);body.torqueRCSVector=mul(act.rcsTorque,ratio);
  body.stepEngineTorque=[...body.torqueEngine];body.stepRCSTorque=[...body.torqueRCSVector];body.stepFinTorque=[...body.torqueFinVector];
  body.controlTorque=mul(act.torque,ratio);body.torqueGimbal=body.torqueEngine[2];body.torqueRCS=body.torqueRCSVector[2];body.torqueFins=body.torqueFinVector[2];body.finDeflection=act.finDeflection;body.finPower=act.finPower*ratio;
  for(const e of engines){e.thrust*=ratio;e.force=mul(e.force,ratio);e.torque=mul(e.torque,ratio);e.fuelUsed+=e.thrust/(isp*G0)*dt;}
  body.thrust=engines.reduce((sum,e)=>sum+e.thrust,0);body.throttle=engines.reduce((sum,e)=>sum+e.valve,0)/engines.length;body.gimbal=-engines.reduce((sum,e)=>sum+e.gimbal[0],0)/engines.length;
 }

 stepUpper(dt){
  const u=this.upper;if(!u)return;if(u.touchdown){this.zeroActuators(u,this.upperEngines);this.clearStepDynamics(u);return;}const c=CONSTANTS,oldMass=c.upperDryMass+c.payloadMass+this.fuel.upper,oldI=this.inertia3(true);u.altitude=altitudeAt(u.x,u.y,u.z);const a=atmosphere(u.altitude),g=gravityAt(u.x,u.y,u.z);u.speed=Math.hypot(u.vx,u.vy,u.vz);syncAttitude(u);
  if(u.ignitionAt===null&&this.t-this.separationAt>=4){u.ignitionAt=this.t;u.phase='IGNITION';this.event('upper-ignition',{altitude:u.altitude,propellant:this.fuel.upper});}
  if(u.ignitionAt!==null&&u.cutoffAt===null&&this.fuel.upper<=25000){u.cutoffAt=this.t;u.phase='COAST';this.event('upper-cutoff',{altitude:u.altitude,speed:u.speed,propellant:this.fuel.upper});}
  const powered=u.ignitionAt!==null&&u.cutoffAt===null;u.throttleCommand=this.manualThrottle.upper!==null?this.manualThrottle.upper:powered?Math.min(1,4*G0*oldMass/c.upperThrust):0;
  if(powered)u.phase=this.upperEngines.some(e=>e.enabled)?(this.t-u.ignitionAt>2?'POWERED':'IGNITION'):'ENGINE_OFF';
  const flightAngle=-Math.atan2(u.vx,u.vy);u.thetaTarget=powered?clamp(flightAngle,-Math.PI*.49,-.20):u.theta;
  const target=powered?targetQuaternion(u.thetaTarget,Math.asin(clamp(u.vz/Math.max(1,u.speed),-.6,.6))):[...u.attitude];u.targetAttitude=target;
  const alignment=u.speed>1?dot(u.axis,[u.vx,u.vy,u.vz])/u.speed:1,side=Math.max(0,1-alignment**2),drag=.5*a.rho*u.speed**2*(dragCoefficient(u.speed/a.sound)+.75*side)*(Math.PI*c.radius**2+450*side);
  const dragForce=u.speed>.01?mul([u.vx,u.vy,u.vz],-drag/u.speed):[0,0,0];u.aerodynamics=aerodynamicTorque(u,dragForce,a.rho,u.speed,{upper:true});u.torqueAero=u.aerodynamics.torque;
  updateValves(this.upperEngines,u.throttleCommand,c.upperThrust*(1-.10*a.pressure/101325),dt,this.fuel.upper>0,true);
  const act=actuate(u,this.upperEngines,target,oldI,u.torqueAero,dt,{enabled:this.attitudeControl,fueled:this.fuel.upper>0,upper:true,wn:.55});
  const main=this.upperEngines.reduce((sum,e)=>sum+e.thrust/(c.upperIsp*G0)*dt,0),rcs=act.rcsTorque.reduce((sum,tau,i)=>sum+Math.abs(tau)/((i===1?4:20)*c.rcsIsp*G0)*dt,0),ratio=this.debit('upper',{upperMain:main,upperRCS:rcs,upperGimbal:act.servoPower/(.22*c.fuelEnergy)*dt});
  this.applyActuatorResult(u,this.upperEngines,act,ratio,c.upperIsp,dt);u.mass=c.upperDryMass+c.payloadMass+this.fuel.upper;u.inertia=upperInertia(this.fuel.upper);u.inertiaTensor=this.inertia3(true);
  u.appliedAeroTorque=[...u.torqueAero];integrateRotation(u,add(u.controlTorque,u.torqueAero),oldI,u.inertiaTensor,dt);u.torque=u.torqueTotal[2];
  u.stepThrustWorld=rotate(u.attitude,u.forceEngine);u.stepDragWorld=[...dragForce];u.stepGravity=[g.x,g.y,g.z];u.integrationMass=.5*(oldMass+u.mass);const force=add(u.stepThrustWorld,dragForce),m=u.integrationMass;u.ax=force[0]/m+g.x;u.ay=force[1]/m+g.y;u.az=force[2]/m+g.z;
  const oldV=[u.vx,u.vy,u.vz];u.vx+=u.ax*dt;u.vy+=u.ay*dt;u.vz+=u.az*dt;u.x+=(oldV[0]+u.vx)*.5*dt;u.y+=(oldV[1]+u.vy)*.5*dt;u.z+=(oldV[2]+u.vz)*.5*dt;
  u.altitude=altitudeAt(u.x,u.y,u.z);u.speed=Math.hypot(u.vx,u.vy,u.vz);u.heatFlux=heating(a.rho,u.speed);u.pressure=a.pressure;u.maxAltitude=Math.max(u.maxAltitude,u.altitude);u.maxSpeed=Math.max(u.maxSpeed,u.speed);u.exhaust=exhaustState(a.pressure,u.throttle,true);
  const radial=unit([u.x,c.earthRadius+u.y,u.z]),axisRadial=dot(u.axis,radial),extent=Math.max(25.65*axisRadial,-25*axisRadial)+4.5*Math.sqrt(Math.max(0,1-axisRadial**2));
  if(Math.hypot(u.x,c.earthRadius+u.y,u.z)-c.earthRadius<=extent){
   u.touchdown={t:this.t,...assessTouchdown({mass:u.mass,vx:u.vx,vy:u.vy,vz:u.vz,omega:u.omega,inertia:u.inertia,theta:u.theta,x:u.x,z:u.z,attitude:[...u.attitude],angularVelocity:[...u.angularVelocity],inertiaTensor:[...u.inertiaTensor],legsDeployed:false,propellant:this.fuel.upper,stroke:0})};
   u.touchdown.impactY=u.y-extent;u.phase='CRASHED';this.event('upper-touchdown',u.touchdown);this.rupture('upper',u.touchdown);this.event('upper-contact-impulse',{deltaVelocity:mul([u.vx,u.vy,u.vz],-1),deltaOmega:mul(u.angularVelocity,-1)});u.vx=u.vy=u.vz=u.speed=0;u.angularVelocity=[0,0,0];this.zeroActuators(u,this.upperEngines);this.clearStepDynamics(u);syncAttitude(u);
  }
  if(this.fuel.upper===0)this.zeroActuators(u,this.upperEngines);
 }
 clearStepDynamics(body){body.torqueTotal=body.appliedAeroTorque=body.stepEngineTorque=body.stepRCSTorque=body.stepFinTorque=body.gyroscopicTorque=body.angularAcceleration=body.rotationStep=[0,0,0];body.alpha=body.ax=body.ay=body.az=0;}
 rupture(pool,td){const before=this.fuel[pool],burned=before*CONSTANTS.combustionFraction,dispersed=before-burned;this.event('tank-rupture',{stage:pool,propellantBeforeRupture:before,burned,dispersed,chemicalEnergyReleased:burned*CONSTANTS.fuelEnergy});this.debit(pool,{explosion:burned,dispersed});}
 zeroActuators(body,engines){body.thrust=body.throttle=body.torqueGimbal=body.torqueRCS=body.torqueFins=0;body.forceEngine=body.torqueEngine=body.torqueImbalance=body.torqueRCSVector=body.torqueFinVector=body.controlTorque=[0,0,0];for(const e of engines){e.thrust=e.valve=0;e.force=e.torque=[0,0,0];}}
 updateEngineFields(dt){for(const e of this.allEngines()){const max=e.ratedThrust,source=e.thrust/max;
   if(source>.002&&(e.emission||0)<=.002){if(e.triggerAt===null)e.triggerAt=this.t;e.activations.push(this.t);this.event('engine-plume-trigger',{engine:e.id});}e.emission=source;e.intensity+=(source-e.intensity)*(1-Math.exp(-dt/(e.stage==='upper'?.45:.28)));e.exhaust=exhaustState(e.stage==='upper'?(this.upper?.pressure??this.pressure):this.pressure,e.valve,e.kind==='vacuum');}}

 updateFields(dt){this.updateEngineFields(dt);const nozzleHeight=Math.max(0,this.y-35.9*this.axis[1]),sources={plume:this.thrust/CONSTANTS.thrustSL,upperPlume:(this.upper?.thrust||0)/CONSTANTS.upperThrust,steam:this.t>.5&&this.t<12?(this.t<5?.22:.35+.65*Math.min(1,this.thrust/1.2e6)):0,reentry:['ENTRY','COAST','LANDING'].includes(this.phase)&&this.vy<0?clamp(this.heatFlux/300000,0,3):0,explosion:this.phase==='CRASHED'?Math.exp(-(this.t-this.terminalAt)/Math.max(.1,this.touchdown.blastDuration*.3))*this.touchdown.blastScale:0,upperExplosion:this.upper?.touchdown?Math.exp(-(this.t-this.upper.touchdown.t)/Math.max(.1,this.upper.touchdown.blastDuration*.3))*this.upper.touchdown.blastScale:0,dust:this.thrust>0?this.thrust/1e6*Math.exp(-nozzleHeight/32):0},decay={plume:.28,upperPlume:.45,steam:2.8,reentry:.5,explosion:.14,upperExplosion:.14,dust:2.1};
  for(const name of fieldNames){const f=this.fields[name],source=sources[name];if(source>.002&&f.emission<=.002){if(f.triggerAt===null)f.triggerAt=this.t;f.activations.push(this.t);this.event('field-trigger',{field:name});}f.emission=source;f.intensity+=(source-f.intensity)*(1-Math.exp(-dt/decay[name]));}this.exhaust=exhaustState(this.pressure,this.throttle);this.nozzleExpansion=this.exhaust.expansion;
 }
 contact(old){
  const fraction=clamp(old.clearance/Math.max(1e-9,old.clearance-this.groundClearance()),0,1);
  this.vx=old.vx+(this.vx-old.vx)*fraction;this.vy=old.vy+(this.vy-old.vy)*fraction;this.vz=old.vz+(this.vz-old.vz)*fraction;this.x=old.x+(this.x-old.x)*fraction;this.z=old.z+(this.z-old.z)*fraction;this.y=this.groundContactHeight();this.derive();
  const legsDeployed=this.events.some(e=>e.type==='landing-ignition'&&this.t-e.t>=2.8)&&Math.hypot(this.x-CONSTANTS.landingX,this.z)<3;
  this.touchdown={t:this.t,...assessTouchdown({mass:this.mass,vx:this.vx,vy:this.vy,vz:this.vz,omega:this.omega,inertia:this.inertia,theta:this.theta,x:this.x,z:this.z,attitude:[...this.attitude],angularVelocity:[...this.angularVelocity],inertiaTensor:[...this.inertiaTensor],legsDeployed,propellant:this.attached?this.propellant:this.fuel.booster,stroke:this.config.stroke}),attachedAtImpact:this.attached};this.contactAt=this.t;this.setPhase('CONTACT');this.event('touchdown',this.touchdown);
  if(!this.touchdown.success){this.setPhase('CRASHED');this.terminalAt=this.t;this.rupture('booster',this.touchdown);if(this.attached)this.rupture('upper',this.touchdown);}else this.y-=this.touchdown.strokeRequired;
  this.event('contact-impulse',{deltaVx:-this.vx,deltaVy:-this.vy,deltaVz:-this.vz,deltaOmega:mul(this.angularVelocity,-1)});this.vx=this.vy=this.vz=0;this.angularVelocity=[0,0,0];this.clearStepDynamics(this);syncAttitude(this);this.zeroActuators(this,this.engines);this.throttleCommand=0;
 }
 groundContactHeight(){
  const deployed=this.events.some(e=>e.type==='landing-ignition'&&this.t-e.t>=2.8),axis=this.axis;
  if(deployed&&Math.hypot(this.x-CONSTANTS.landingX,this.z)<3&&axis[1]>.978)return CONSTANTS.contactHeight+4.5*Math.hypot(axis[0],axis[2]);
  // Tilted hull/nozzle collision, not the upright leg height for an overturned rocket.
  return .35+Math.max(35.9*axis[1],-(this.attached?88:38)*axis[1])+4.5*Math.hypot(axis[0],axis[2]);
 }
 groundClearance(){return this.y-this.groundContactHeight();}

 step(dt=DT){
  if(!this.running)return false;this.t+=dt;this.tick++;this.applyCommands();
  if(this.terminal||this.phase==='CONTACT'){
   this.zeroActuators(this,this.engines);this.clearStepDynamics(this);
   if(this.phase==='CONTACT'&&this.t-this.contactAt>=.5){this.setPhase('LANDED');this.terminalAt=this.t;}this.stepUpper(dt);this.derive();this.updateFields(dt);this.record();return true;
  }
  this.stageLogic();this.derive();this.appliedAeroTorque=[...this.torqueAero];const oldI=[...this.inertiaTensor],oldMass=this.mass,old={x:this.x,y:this.y,z:this.z,vx:this.vx,vy:this.vy,vz:this.vz,clearance:this.groundClearance()};this.control(dt);
  const midMass=.5*(oldMass+CONSTANTS.dryMass+this.fuel.booster+this.payload),newI=this.inertia3();newI[0]=inertiaFor(this.fuel.booster,this.payload)*1.012;newI[2]=inertiaFor(this.fuel.booster,this.payload);newI[1]=(CONSTANTS.dryMass+this.fuel.booster+this.payload)*CONSTANTS.radius**2*.5;
  if(['DELUGE','IGNITION','BUILDUP'].includes(this.phase)){
   // Hold-down clamps supply balancing force AND torque before actual release.
   this.padReactionTorque=mul(add(this.controlTorque,this.torqueAero),-1);this.ax=this.ay=this.az=0;this.angularAcceleration=[0,0,0];this.rotationStep=[0,0,0];
  }else{
   this.padReactionTorque=[0,0,0];integrateRotation(this,add(this.controlTorque,this.torqueAero),oldI,newI,dt);
   this.stepThrustWorld=rotate(this.attitude,this.forceEngine);this.stepDragWorld=[this.dragX,this.dragY,this.dragZ];this.stepGravity=[this.gravityVector.x,this.gravityVector.y,this.gravityVector.z];this.integrationMass=midMass;const force=add(this.stepThrustWorld,this.stepDragWorld);this.ax=force[0]/midMass+this.gravityVector.x;this.ay=force[1]/midMass+this.gravityVector.y;this.az=force[2]/midMass+this.gravityVector.z;
   this.vx+=this.ax*dt;this.vy+=this.ay*dt;this.vz+=this.az*dt;this.x+=(old.vx+this.vx)*.5*dt;this.y+=(old.vy+this.vy)*.5*dt;this.z+=(old.vz+this.vz)*.5*dt;if(this.groundClearance()<=0)this.contact(old);
  }
  this.stepUpper(dt);this.derive();if(this.fuel.booster===0)this.zeroActuators(this,this.engines);this.maxAltitude=Math.max(this.maxAltitude,this.altitude);this.maxSpeed=Math.max(this.maxSpeed,this.speed);this.maxHeat=Math.max(this.maxHeat,this.heatFlux);this.updateFields(dt);this.record();return true;
 }
 snapshot(includeEngines=true){const u=this.upper;return {t:this.t,phase:this.phase,x:this.x,y:this.y,z:this.z,altitude:this.altitude,vx:this.vx,vy:this.vy,vz:this.vz,theta:this.theta,omega:this.omega,alpha:this.alpha,thetaTarget:this.thetaTarget,thetaIntegral:this.thetaIntegral,angularImpulse:this.angularImpulse,inertiaTransportImpulse:this.inertiaTransportImpulse,mass:this.mass,inertia:this.inertia,propellant:this.propellant,boosterPropellant:this.fuel.booster,upperPropellant:this.fuel.upper,payload:this.payload,
  ...Object.fromEntries(Object.entries(this.ledger).map(([k,v])=>['fuel'+({rcs:'RCS',upperRCS:'UpperRCS'}[k]||k[0].toUpperCase()+k.slice(1)),v])),thrust:this.thrust,throttle:this.throttle,throttleCommand:this.throttleCommand,gimbal:this.gimbal,torqueGimbal:this.torqueGimbal,torqueRCS:this.torqueRCS,torqueFins:this.torqueFins,finDeflection:this.finDeflection,finPower:this.finPower,finsDeployed:Number(this.finsDeployed),rho:this.rho,pressure:this.pressure,sound:this.sound,mach:this.mach,cd:this.cd,effectiveCd:this.effectiveCd,q:this.q,area:this.area,drag:this.drag,dragX:this.dragX,dragY:this.dragY,heatFlux:this.heatFlux,skinTemperature:this.skinTemperature,ax:this.ax,ay:this.ay,az:this.az,dragZ:this.dragZ,flightPathAngle:this.flightPathAngle,angleOfAttack:this.angleOfAttack,predictedLandingX:this.predictedLandingX,returnError:this.returnError,landingTargetX:CONSTANTS.landingX,
  nozzleExpansion:this.nozzleExpansion,plumeHalfAngle:this.exhaust.halfAngle,nozzlePressureRatio:this.exhaust.pressureRatio,machCellContrast:this.exhaust.machContrast,machCellSpacing:this.exhaust.machSpacing,
  ...this.rigidSnapshot(this),...this.rigidSnapshot(u,'upper'),...(includeEngines?this.engineSnapshot():{}),attitudeControl:Number(this.attitudeControl),manualBoosterThrottle:this.manualThrottle.booster,manualUpperThrottle:this.manualThrottle.upper,
  upperZ:u?.z||0,upperVz:u?.vz||0,upperPhase:u?.phase||'ATTACHED',upperX:u?.x||0,upperY:u?.y||0,upperAltitude:u?.altitude||0,upperVx:u?.vx||0,upperVy:u?.vy||0,upperSpeed:u?.speed||0,upperTheta:u?.theta||0,upperOmega:u?.omega||0,upperAlpha:u?.alpha||0,upperThetaIntegral:u?.thetaIntegral||0,upperThetaTarget:u?.thetaTarget||0,upperAngularImpulse:u?.angularImpulse||0,upperInertiaTransportImpulse:u?.inertiaTransportImpulse||0,upperMass:u?.mass||this.payload,upperInertia:u?.inertia||upperInertia(this.fuel.upper),upperThrust:u?.thrust||0,upperThrottle:u?.throttle||0,upperTorqueGimbal:u?.torqueGimbal||0,upperTorqueRCS:u?.torqueRCS||0,upperGimbal:u?.gimbal||0,upperHeatFlux:u?.heatFlux||0,upperNozzleExpansion:u?.exhaust?.expansion||0,
  ...Object.fromEntries(fieldNames.flatMap(n=>[[`${n}Intensity`,this.fields[n].intensity],[`${n}Emission`,this.fields[n].emission],[`${n}TriggerAt`,this.fields[n].triggerAt]]))};}

 rigidSnapshot(b,prefix=''){
  const out={},put=(key,value)=>out[prefix?prefix+key[0].toUpperCase()+key.slice(1):key]=value;
  for(const [key,values,axes] of [['quat',b?.attitude||[0,0,0,1],['X','Y','Z','W']],['omega',b?.angularVelocity||[0,0,0],['X','Y','Z']],['alpha',b?.angularAcceleration||[0,0,0],['X','Y','Z']],['inertia',b?.inertiaTensor||[0,0,0],['X','Y','Z']],['rotationStep',b?.rotationStep||[0,0,0],['X','Y','Z']],['torqueEngine',b?.torqueEngine||[0,0,0],['X','Y','Z']],['torqueImbalance',b?.torqueImbalance||[0,0,0],['X','Y','Z']],['torqueAero',b?.torqueAero||[0,0,0],['X','Y','Z']],['torqueRCS',b?.torqueRCSVector||[0,0,0],['X','Y','Z']],['torqueFin',b?.torqueFinVector||[0,0,0],['X','Y','Z']],['torqueTotal',b?.torqueTotal||[0,0,0],['X','Y','Z']],['gyroTorque',b?.gyroscopicTorque||[0,0,0],['X','Y','Z']]])axes.forEach((a,i)=>put(key+a,values[i]));
  for(const [key,values] of [['appliedAeroTorque',b?.appliedAeroTorque],['stepEngineTorque',b?.stepEngineTorque],['stepRCSTorque',b?.stepRCSTorque],['stepFinTorque',b?.stepFinTorque],['padReactionTorque',b?.padReactionTorque],['integrationInertia',b?.integrationInertia],['integrationOmega0',b?.integrationOmega0],['forceEngine',b?.forceEngine],['stepThrustWorld',b?.stepThrustWorld],['stepDragWorld',b?.stepDragWorld],['stepGravity',b?.stepGravity]])['X','Y','Z'].forEach((a,i)=>put(key+a,values?.[i]||0));
  put('integrationMass',b?.integrationMass||0);put('roll',b?.roll||0);put('yaw',b?.yaw||0);put('tilt',b?.tilt||0);put('pressureCentreY',b?.aerodynamics?.cp[1]||0);return out;
 }
 engineSnapshot(){const out={};for(const e of this.allEngines()){for(const [k,v]of Object.entries({enabled:Number(e.enabled),requestedEnabled:Number(e.requestedEnabled),valve:e.valve,thrust:e.thrust,gimbalX:e.gimbal[0],gimbalZ:e.gimbal[1],fuelUsed:e.fuelUsed,intensity:e.intensity,triggerAt:e.triggerAt,torqueX:e.torque[0],torqueY:e.torque[1],torqueZ:e.torque[2],forceX:e.force[0],forceY:e.force[1],forceZ:e.force[2],positionX:e.position[0],positionY:e.position[1],positionZ:e.position[2],emission:e.emission||0}))out[e.id+'_'+k]=v;}return out;}

 record(){const event=this.events.at(-1)?.t===this.t;if(this.tick%4===0||event)this.samples.push(this.snapshot(false));if(this.tick%12===0||event)for(const e of this.allEngines())this.engineSamples.push([this.t,e.id,Number(e.enabled),Number(e.requestedEnabled),e.valve,e.thrust,...e.gimbal,e.fuelUsed,e.intensity,...e.force,...e.torque,e.emission||0,e.triggerAt]);}
 exportData(){return {schema:'astra-flight-3.0',build:BUILD,units:'SI; angles rad; heatFlux W/m²; temperature K; inertia kg·m²',integrator:{dt:DT,translation:'central gravity / explicit forces / trapezoid velocity',attitude:'I omegaDot = torque - omega cross I omega; explicit midpoint / body quaternion exponential map; co-rotating mass outflow',contact:'dissipative impulse; explicit event'},config:{...this.config},constants:CONSTANTS,result:this.phase,summary:{duration:this.t,maxAltitude:this.maxAltitude,maxSpeed:this.maxSpeed,maxHeat:this.maxHeat,propellantUsed:this.config.initialFuel-this.propellant,upperMaxAltitude:this.upper?.maxAltitude||0,upperMaxSpeed:this.upper?.maxSpeed||0},engineCommands:this.engineCommands,scheduledCommands:this.schedules,pendingCommands:this.commandQueue,manualThrottle:this.manualThrottle,attitudeControl:this.attitudeControl,engines:this.allEngines().map(e=>({...e})),rigidModel:{bodyAxes:'Y nose/roll, Z primary pitch, X crossrange pitch/yaw; quaternions xyzw body-to-world',inertia:'diagonal tensor with 1.2% transverse asymmetry; fixed effective mass distribution',engineTorque:'each engine position cross exact gimballed force',aero:'drag at direction-dependent pressure centre plus rotational damping; passive aerodynamic torque survives fuel exhaustion',contact:'tower capture window or orientation-dependent hull first intersection'},fuelLedger:{remaining:{...this.fuel},spent:{...this.ledger},initial:this.config.initialFuel,residual:this.config.initialFuel-this.propellant-Object.values(this.ledger).reduce((a,b)=>a+b,0)},upper:this.upper?{...this.upper}:null,touchdown:this.touchdown,fields:this.fields,events:this.events,gpuEvidence:this.gpuEvidence,telemetry:{bodyHz:30,engineHz:10,eventSamples:true,physicsHz:120},engineTimeline:{columns:ENGINE_COLUMNS,rows:this.engineSamples},samples:this.samples};}
}
export function toCSV(data){const keys=Object.keys(data.samples[0]),extras=['configLandingIgnition','configStroke','configFinDeployAltitude','configPitchKick','impactKineticEnergy','impactRemainingPropellant','impactChemicalEnergy','impactNetImpulse','impactGroundImpulse','bufferCapacity','strokeRequired','explosionEnergy','blastScale','blastRadius','blastDuration','debrisRange'],value=n=>typeof n==='number'?Number(n.toPrecision(11)):n??'';return [...keys,...extras].join(',')+'\n'+data.samples.map(row=>{const td=data.touchdown&&row.t>=data.touchdown.t?data.touchdown:null;return [...keys.map(k=>value(row[k])),...[data.config.landingIgnition,data.config.stroke,data.config.finDeployAltitude,data.config.pitchKick,td?.kineticEnergy,td?.propellant,td?.chemicalEnergy,td?.netImpulse,td?.groundImpulse,td?.capacity,td?.strokeRequired,td?.explosionEnergy,td?.blastScale,td?.blastRadius,td?.blastDuration,td?.debrisRange].map(value)].join(',');}).join('\n');}
export function toEngineCSV(data){return data.engineTimeline.columns.join(',')+'\n'+data.engineTimeline.rows.map(row=>row.map(v=>typeof v==='number'?Number(v.toPrecision(11)):v??'').join(',')).join('\n');}










