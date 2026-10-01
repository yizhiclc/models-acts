import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {Simulation,BUILD,DT,CONSTANTS as C,DEFAULTS,G0,atmosphere,dragCoefficient,heating,assessTouchdown,exhaustState,toCSV,toEngineCSV} from '../src/physics.js';
import {cross,add,sub,length,qMultiply,qConjugate,qLog} from '../src/rigid-body.js';
const dir=new URL('../data/',import.meta.url);mkdirSync(dir,{recursive:true});const tests=[],scenarios=[];
function check(name,evidence){tests.push({name,passed:true,...evidence});console.log('PASS',name);}
function write(name,data){writeFileSync(new URL(name,dir),typeof data==='string'?data:JSON.stringify(data,null,2));}
function simpleCSV(rows){const keys=Object.keys(rows[0]);return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n');}
function audit(s,a,dt,metrics){
 if(s.terminal||s.phase==='CONTACT'||s.separationAt===s.t||s.liftoffAt===null)return;
 const qError=length(sub(qLog(qMultiply(qConjugate(a.q),s.attitude)),s.rotationStep));metrics.quaternion=Math.max(metrics.quaternion,qError);
 for(let i=0;i<3;i++){
  const forceAcceleration=(s.stepThrustWorld[i]+s.stepDragWorld[i])/s.integrationMass+s.stepGravity[i];
  metrics.force=Math.max(metrics.force,Math.abs([s.ax,s.ay,s.az][i]-forceAcceleration));
  metrics.velocity=Math.max(metrics.velocity,Math.abs([s.vx,s.vy,s.vz][i]-a.v[i]-forceAcceleration*dt));
  metrics.position=Math.max(metrics.position,Math.abs([s.x,s.y,s.z][i]-a.p[i]-([s.vx,s.vy,s.vz][i]+a.v[i])*.5*dt));
  metrics.euler=Math.max(metrics.euler,Math.abs(s.angularAcceleration[i]*s.integrationInertia[i]+s.gyroscopicTorque[i]-s.torqueTotal[i]));
  metrics.torqueSource=Math.max(metrics.torqueSource,Math.abs(s.stepEngineTorque[i]+s.stepRCSTorque[i]+s.stepFinTorque[i]+s.appliedAeroTorque[i]-s.torqueTotal[i]));
 }
 metrics.ledger=Math.max(metrics.ledger,Math.abs(s.config.initialFuel-s.propellant-Object.values(s.ledger).reduce((a,b)=>a+b,0)));
 metrics.engineTorque=Math.max(metrics.engineTorque,...s.engines.map(e=>length(sub(cross(e.position,e.force),e.torque))));
 metrics.peakRates=metrics.peakRates.map((v,i)=>Math.max(v,Math.abs(s.angularVelocity[i])));
 assert(s.attitude.every(Number.isFinite)&&Number.isFinite(s.y),'Nonfinite state');
}
function run(config={},options={}){
 const s=new Simulation(config),m={quaternion:0,force:0,velocity:0,position:0,euler:0,torqueSource:0,ledger:0,engineTorque:0,peakRates:[0,0,0]};if(options.record===false)s.record=()=>{};s.start();
 while(!(options.until?options.until(s):s.terminal)&&s.t<(options.limit||1100)){
  options.command?.(s);const a={q:[...s.attitude],v:[s.vx,s.vy,s.vz],p:[s.x,s.y,s.z]};s.step(options.dt||DT);if(options.audit!==false)audit(s,a,options.dt||DT,m);
 }
 return {s,m};
}
function save(name,s){const end=s.t+(s.phase==='CRASHED'?s.touchdown.blastDuration*1.7:8);while(s.t<end)s.step();const data=s.exportData(),{samples,engineTimeline,...metadata}=data;write(name+'.csv',toCSV(data));write(name+'-engines.csv',toEngineCSV(data));write(name+'.json',{...metadata,timeseries:name+'.csv',sampleCount:samples.length,engineTimeline:{columns:engineTimeline.columns,timeseries:name+'-engines.csv',rows:engineTimeline.rows.length}});scenarios.push({name,result:s.phase,upperResult:s.upper?.phase||'ATTACHED',config:s.config,touchdown:s.touchdown,engineCommands:s.engineCommands,sampleCount:samples.length});}

const nominal=run();assert.equal(nominal.s.phase,'LANDED');
for(const phase of ['DELUGE','IGNITION','BUILDUP','ASCENT','MECO','SEPARATION','FLIP','BOOSTBACK','COAST','ENTRY','LANDING','CONTACT','LANDED'])assert(nominal.s.events.some(e=>e.phase===phase),phase);
const reference={touchdown:nominal.s.touchdown,maxAltitude:nominal.s.maxAltitude,t:nominal.s.t,events:nominal.s.events};
check('A complete live-integrated Super Heavy launch and tower recovery succeeds',{duration:reference.t,apogee:reference.maxAltitude,touchdown:reference.touchdown});
assert.equal(nominal.s.engines.length,33);assert.equal(nominal.s.upperEngines.length,6);assert.equal(nominal.s.engines.filter(e=>e.gimbalLimit===0).length,20);assert.equal(nominal.s.upperEngines.filter(e=>e.kind==='vacuum').length,3);
check('33 booster engines in 3+10+20 rings; three sea-level plus three vacuum ship engines',{fixedOuter:20,gimballedBooster:13,shipGimballed:3});
for(const key of ['force','quaternion','velocity','position'])assert(nominal.m[key]<1e-8,key+':'+nominal.m[key]);assert(nominal.m.euler<1e-5);assert(nominal.m.torqueSource<1e-5);assert(nominal.m.engineTorque<1e-7);assert(nominal.m.ledger<1e-5);
check('Every airborne step satisfies Newton translation, Euler rotation and quaternion integration',nominal.m);
let massFailures=0,paidFinSteps=0;for(let i=1;i<nominal.s.samples.length;i++){const a=nominal.s.samples[i-1],b=nominal.s.samples[i];for(const k of ['mass','inertiaX','inertiaY','inertiaZ','propellant'])if(b[k]>a[k]+1e-6)massFailures++;if(Math.abs(b.torqueFinZ)>1e-3){assert(b.fuelFins>a.fuelFins);paidFinSteps++;}}
assert.equal(massFailures,0);assert(paidFinSteps>0);assert(Math.abs(nominal.s.engines.reduce((v,e)=>v+e.fuelUsed,0)-nominal.s.ledger.main)<1e-5);assert(Math.abs(nominal.s.upperEngines.reduce((v,e)=>v+e.fuelUsed,0)-nominal.s.ledger.upperMain)<1e-5);
check('All diagonal inertias decrease with mass; per-engine fuel sums equal the single ledger',{paidFinSteps,fuelLedger:nominal.s.exportData().fuelLedger});
const sep=nominal.s.events.find(e=>e.type==='separation');assert(sep.altitude>60000);for(const a of ['X','Y','Z'])assert(Math.abs(sep['momentumResidual'+a])<1e-4);assert(reference.maxAltitude>150000);assert(nominal.s.upper.thrust===0&&nominal.s.upper.cutoffAt!==null);
check('Gravity turn, high staging, spring impulse and powered upper stage',{separation:sep,meco:nominal.s.events.find(e=>e.type==='meco'),upperIgnition:nominal.s.events.find(e=>e.type==='upper-ignition'),upperCutoff:nominal.s.events.find(e=>e.type==='upper-cutoff')});
const fade=nominal.s.samples.find(r=>r.phase==='MECO'&&r.thrust===0&&r.plumeIntensity>.001);assert(fade);assert(nominal.s.fields.steam.triggerAt<nominal.s.fields.plume.triggerAt);assert.equal(nominal.s.fields.explosion.triggerAt,null);check('Independent steam, plume, upper-plume and reentry triggers; shutdown leaves a decaying tail',{fadeTime:fade.t,fadeIntensity:fade.plumeIntensity,fields:nominal.s.fields});
save('successful-landing',nominal.s);nominal.s.samples=[];nominal.s.engineSamples=[];

const short=run({stroke:.08});assert.equal(short.s.phase,'CRASHED');assert.equal(short.s.touchdown.vy,reference.touchdown.vy);assert.equal(short.s.touchdown.kineticEnergy,reference.touchdown.kineticEnergy);assert(reference.touchdown.strokeRequired>.08&&reference.touchdown.strokeRequired<2.2);
const impulseResidual=reference.touchdown.groundImpulse-reference.touchdown.mass*G0*reference.touchdown.stoppingTime-reference.touchdown.netImpulse;assert(Math.abs(impulseResidual)<1e-6);
check('Identical impact state succeeds or fails solely through absorber stroke',{velocity:reference.touchdown.vy,requiredStroke:reference.touchdown.strokeRequired,shortStroke:.08,longStroke:2.2,impulseResidual});const shortTD=short.s.touchdown;save('short-stroke-crash',short.s);short.s.samples=[];short.s.engineSamples=[];
const late=run({landingIgnition:80});assert.equal(late.s.phase,'CRASHED');assert(late.s.touchdown.kineticEnergy>shortTD.kineticEnergy);assert(late.s.touchdown.blastRadius>shortTD.blastRadius);assert(late.s.touchdown.blastDuration>shortTD.blastDuration);check('Late ignition produces a physically larger impact and explosion',{late:late.s.touchdown,shortStroke:shortTD});save('late-ignition-crash',late.s);late.s.samples=[];late.s.engineSamples=[];

const failed=run({}, {command:s=>{if(s.t>=55&&!s.injected){s.injected=true;s.setAttitudeControl(false);s.setEnginesEnabled(['B15','B16','B17'],false);}}});
assert.equal(failed.s.phase,'CRASHED');assert(failed.m.peakRates.every(n=>n>.02));assert(failed.m.quaternion<1e-8);assert(failed.m.velocity<1e-8);assert(failed.m.euler<1e-5);assert.equal(failed.s.propellant,0);assert(failed.s.touchdown.attachedAtImpact);assert.equal(failed.s.touchdown.propellant,failed.s.events.filter(e=>e.type==='tank-rupture').reduce((sum,e)=>sum+e.propellantBeforeRupture,0));
check('An asymmetric three-engine cut produces coupled roll, pitch and yaw without pose animation',{metrics:failed.m,commands:failed.s.engineCommands,touchdown:failed.s.touchdown});save('engine-out-tumble-crash',failed.s);failed.s.samples=[];failed.s.engineSamples=[];

const controlled=run({}, {record:false,until:s=>s.t>=70,command:s=>{if(s.t>=55&&!s.injected){s.injected=true;s.setEnginesEnabled(['B15','B16','B17'],false);}}});
const uncontrolled=run({}, {record:false,until:s=>s.t>=70,command:s=>{if(s.t>=55&&!s.injected){s.injected=true;s.setAttitudeControl(false);s.setEnginesEnabled(['B15','B16','B17'],false);}}});
assert(length(controlled.s.angularVelocity)<length(uncontrolled.s.angularVelocity)*.5);assert(controlled.s.engines.filter(e=>e.gimbalLimit>0).some(e=>Math.hypot(...e.gimbal)>.001));
check('Attitude control compensates engine loss only through physical remaining actuators',{controlledRates:controlled.s.angularVelocity,uncontrolledRates:uncontrolled.s.angularVelocity,controlledFuel:controlled.s.ledger,uncontrolledFuel:uncontrolled.s.ledger});

const throttleRows=[];
for(const command of [.3,.6,.9]){const {s}=run({}, {record:false,until:s=>s.t>=32,command:s=>{if(s.t>=30&&!s.injected){s.injected=true;s.setThrottle('booster',command);}}});throttleRows.push({command,t:s.t,thrust:s.thrust,mass:s.mass,ax:s.ax,ay:s.ay,az:s.az,verticalThrust:s.stepThrustWorld[1],verticalDrag:s.stepDragWorld[1],gravityY:s.stepGravity[1],integrationMass:s.integrationMass,altitude:s.altitude,fuelUsed:C.initialPropellant-s.propellant});}
assert(throttleRows[2].thrust>throttleRows[1].thrust&&throttleRows[1].thrust>throttleRows[0].thrust);assert(throttleRows[2].ay>throttleRows[1].ay&&throttleRows[1].ay>throttleRows[0].ay);assert(throttleRows[0].ay<0&&throttleRows[2].ay>0);write('manual-throttle-probes.csv',simpleCSV(throttleRows));check('Manual 30/60/90 percent throttle directly changes thrust and force-derived acceleration',{probes:throttleRows});

const hold=run({}, {record:false,until:s=>s.t>=40}).s;hold.pause();const physical=s=>JSON.stringify({t:s.t,p:[s.x,s.y,s.z],q:s.attitude,w:s.angularVelocity,fuel:s.fuel,engines:s.allEngines().map(e=>[e.thrust,e.valve,e.gimbal]),fields:s.fields});const before=physical(hold);hold.setEnginesEnabled(['B1','B4','B33'],false);hold.setThrottle('booster',.2);for(let i=0;i<100;i++)hold.step();assert.equal(before,physical(hold));hold.start();hold.step();assert.equal(hold.engineCommands[0].appliedAt,hold.t);for(let i=0;i<80;i++)hold.step();assert(hold.engines.filter(e=>['B1','B4','B33'].includes(e.id)).every(e=>e.thrust===0));hold.setEnginesEnabled(['B1','B4'],true);for(let i=0;i<120;i++)hold.step();assert(hold.engines[0].thrust>0);assert.equal(hold.engines[32].thrust,0);
check('Arbitrary multi-selection shutdown and restore work; paused commands wait for a physics step',{commands:hold.engineCommands,manualThrottle:hold.manualThrottle});

const scheduled=new Simulation();scheduled.record=()=>{};scheduled.scheduleEngineShutdown(['B3','B14'],10000);scheduled.start();while(scheduled.t<75&&!scheduled.engineCommands.length)scheduled.step();assert(scheduled.engineCommands.length);assert(scheduled.engineCommands.every(e=>e.altitude>=10000&&e.altitude<10010));check('Altitude-triggered engine cuts log actual crossing time and altitude',{commands:scheduled.engineCommands});

const dry=run({}, {record:false,until:s=>s.t>=50}).s;dry.setAttitudeControl(false);dry.setEnginesEnabled(['B15','B16','B17'],false);while(dry.t<60)dry.step();dry.debit('booster',{dispersed:dry.fuel.booster});dry.debit('upper',{dispersed:dry.fuel.upper});let passive=0;for(let i=0;i<120;i++){dry.step();assert.equal(dry.thrust,0);assert.equal(length(dry.controlTorque),0);assert.equal(dry.upper?.thrust||0,0);if(dry.upper)assert.equal(length(dry.upper.controlTorque),0);passive=Math.max(passive,length(dry.torqueAero));}assert(passive>100);check('Empty tanks gate every propulsive control source, while passive air torque remains',{maximumPassiveTorque:passive,ledger:dry.exportData().fuelLedger});

const upperFault=run({}, {command:s=>{if(s.t>=175&&!s.injected){s.injected=true;s.setEnginesEnabled(s.upperEngines.map(e=>e.id),false);}},until:s=>s.terminal&&!!s.upper?.touchdown,limit:1400});assert(upperFault.s.upper.touchdown);assert(upperFault.s.fields.upperExplosion.triggerAt!==null);assert.equal(upperFault.s.fuel.upper,0);check('All six ship engines can fail independently; the ship collides and debits its own tanks',{upperTouchdown:upperFault.s.upper.touchdown,commands:upperFault.s.engineCommands,ledger:upperFault.s.exportData().fuelLedger});save('ship-engine-cut-crash',upperFault.s);upperFault.s.samples=[];upperFault.s.engineSamples=[];

const probes=[];for(const altitude of [0,10000,30000])for(const speed of [100,300,340,600]){const a=atmosphere(altitude),mach=speed/a.sound,cd=dragCoefficient(mach);probes.push({altitude,speed,rho:a.rho,mach,cd,drag:.5*a.rho*speed**2*cd*Math.PI*C.radius**2,heatFlux:heating(a.rho,speed)});}write('environment-probes.csv',simpleCSV(probes));write('cd-mach-curve.csv',simpleCSV(Array.from({length:81},(_,i)=>({mach:i/40,cd:dragCoefficient(i/40)}))));
assert(dragCoefficient(1)>dragCoefficient(.5)*1.8&&dragCoefficient(1)>dragCoefficient(2)*1.5);assert(atmosphere(30000).rho/atmosphere(0).rho<.04);assert.equal(heating(.2,600)/heating(.2,300),8);assert.equal(heating(.8,300)/heating(.2,300),2);check('Density-dependent drag, transonic Cd peak and density-speed heat flux',{cdMach05:dragCoefficient(.5),cdMach1:dragCoefficient(1),cdMach2:dragCoefficient(2),doubleSpeedHeatRatio:8,quadrupleDensityHeatRatio:2});
const exhaust=[0,10000,30000,60000].map(altitude=>({altitude,...exhaustState(atmosphere(altitude).pressure,.96)}));for(let i=1;i<exhaust.length;i++){assert(exhaust[i].expansion>exhaust[i-1].expansion);assert(exhaust[i].machContrast<exhaust[i-1].machContrast);}write('exhaust-pressure-probes.csv',simpleCSV(exhaust));check('Nozzle pressure mismatch controls expansion and shock-cell contrast',{probes:exhaust});
const energy=[];for(const propellant of [0,10000,200000])for(const speed of [20,100,300]){const td=assessTouchdown({mass:C.dryMass+propellant,vx:0,vy:-speed,omega:0,inertia:1e8,theta:0,x:0,propellant,stroke:.08});energy.push({speed,propellant,kineticEnergy:td.kineticEnergy,chemicalEnergy:td.chemicalEnergy,energy:td.explosionEnergy,blastRadius:td.blastRadius,blastDuration:td.blastDuration,debrisRange:td.debrisRange});}for(const propellant of [0,10000,200000]){const a=energy.filter(e=>e.propellant===propellant);assert(a[2].blastRadius>a[1].blastRadius&&a[1].blastRadius>a[0].blastRadius);}for(const speed of [20,100,300]){const a=energy.filter(e=>e.speed===speed);assert(a[2].blastDuration>a[1].blastDuration&&a[1].blastDuration>a[0].blastDuration);}write('explosion-energy-probes.csv',simpleCSV(energy));check('Explosion size, duration and debris range increase with impact kinetic and fuel energy',{probes:energy});

const coarse=run({}, {record:false,dt:1/60}),fine=run({}, {record:false,dt:1/240});assert.equal(coarse.s.phase,'LANDED');assert.equal(fine.s.phase,'LANDED');assert(Math.abs(coarse.s.touchdown.vy-reference.touchdown.vy)<2);assert(Math.abs(fine.s.touchdown.vy-reference.touchdown.vy)<1);check('Step-size comparison preserves recovery and bounds impact-speed drift',{hz60:coarse.s.touchdown,hz120:reference.touchdown,hz240:fine.s.touchdown});

// Re-read the delivered CSV, independent of live objects. At 30 Hz this is a
// finite-difference approximation; the per-physics-step audit above is stricter.
const lines=readFileSync(new URL('engine-out-tumble-crash.csv',dir),'utf8').trim().split('\n'),keys=lines.shift().split(','),indices=Object.fromEntries(keys.map((k,i)=>[k,i]));let prev=null,qResidual=0,fuelResidual=0,rows=0;
for(const line of lines){const row=line.split(','),n=k=>Number(row[indices[k]]);const q=['X','Y','Z','W'].map(a=>n('quat'+a)),omega=['X','Y','Z'].map(a=>n('omega'+a)),t=n('t');if(prev&&row[indices.phase]==='ASCENT'){const step=qLog(qMultiply(qConjugate(prev.q),q)),integral=omega.map((w,i)=>(w+prev.omega[i])*.5*(t-prev.t));qResidual=Math.max(qResidual,length(sub(step,integral)));}fuelResidual=Math.max(fuelResidual,Math.abs(DEFAULTS.initialFuel-n('propellant')-['fuelMain','fuelRCS','fuelFins','fuelGimbal','fuelUpperMain','fuelUpperRCS','fuelUpperGimbal','fuelExplosion','fuelDispersed'].reduce((v,k)=>v+n(k),0)));prev={q,omega,t};rows++;}assert(qResidual<.0001);assert(fuelResidual<.002);check('Round-tripped 30 Hz CSV supports independent quaternion and fuel-balance verification',{rows,maxQuaternionIntegralResidualRad:qResidual,maxFuelLedgerResidualKg:fuelResidual});
write('validation-report.json',{status:'PASS',build:BUILD,checks:tests.length,scope:'120 Hz actual CPU integration with 30 Hz body and 10 Hz engine exports; event samples retained. GPU evidence is separate.',tests,scenarios});console.log(`${tests.length} checks passed; ${scenarios.length} paired flight/engine datasets exported.`);
