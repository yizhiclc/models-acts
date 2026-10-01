import {engineLayout} from './vehicle.js';
// Standalone SI rigid-body math. Body +Y is the nose; angular velocity is body-local.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,k)=>a.map(x=>x*k);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=a=>Math.hypot(...a);
export const unit=a=>mul(a,1/Math.max(1e-30,length(a)));
export const limit=(a,max)=>mul(a,Math.min(1,max/Math.max(1e-30,length(a))));
export const qConjugate=q=>[-q[0],-q[1],-q[2],q[3]];
export function qMultiply(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
export function qExp(rotation){const a=length(rotation),s=a<1e-10?.5:Math.sin(a*.5)/a;return [...mul(rotation,s),Math.cos(a*.5)];}
export function qLog(q){const sign=q[3]<0?-1:1,v=mul(q.slice(0,3),sign),s=length(v);return s<1e-12?mul(v,2):mul(v,2*Math.atan2(s,Math.abs(q[3]))/s);}
export function rotate(q,v){const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));}
export const unrotate=(q,v)=>rotate(qConjugate(q),v);
export const targetQuaternion=(pitch,crossTilt=0,roll=0)=>qMultiply(qMultiply(qExp([0,0,pitch]),qExp([crossTilt,0,0])),qExp([0,roll,0]));
export function initRigid(body,attitude=[0,0,0,1],omega=[0,0,0]){
 body.attitude=[...attitude];body.angularVelocity=[...omega];body.angularAcceleration=[0,0,0];body.rotationIntegral=[0,0,0];body.rotationStep=[0,0,0];body.gyroscopicTorque=[0,0,0];body.torqueTotal=[0,0,0];body.worldAngularImpulse=[0,0,0];body.worldTransportImpulse=[0,0,0];body.angularImpulse=0;body.inertiaTransportImpulse=0;body.thetaIntegral=0;syncAttitude(body);
}
export function syncAttitude(body){
 body.axis=rotate(body.attitude,[0,1,0]);body.theta=-Math.atan2(body.axis[0],body.axis[1]);
 body.omega=body.angularVelocity[2];body.alpha=body.angularAcceleration[2];
 body.tilt=Math.acos(Math.min(1,Math.max(-1,body.axis[1])));
 // Swing/twist diagnostic, not the authoritative attitude state.
 body.roll=2*Math.atan2(body.attitude[1],body.attitude[3]);body.yaw=Math.atan2(body.axis[2],Math.hypot(body.axis[0],body.axis[1]));
}
export function integrateRotation(body,torque,oldI,newI,dt){
 const inertia=oldI.map((v,i)=>(v+newI[i])*.5),w0=body.angularVelocity;
 body.integrationInertia=[...inertia];body.integrationOmega0=[...w0];
 const acceleration=w=>sub(torque,cross(w,w.map((v,i)=>v*inertia[i]))).map((v,i)=>v/inertia[i]);
 const predictor=add(w0,mul(acceleration(w0),dt*.5)),alpha=acceleration(predictor),w1=add(w0,mul(alpha,dt)),mid=mul(add(w0,w1),.5);
 const rotation=mul(mid,dt),midQ=qMultiply(body.attitude,qExp(mul(rotation,.5)));
 body.attitude=unit(qMultiply(body.attitude,qExp(rotation)));body.angularVelocity=w1;body.angularAcceleration=alpha;
 body.rotationStep=rotation;body.rotationIntegral=add(body.rotationIntegral,rotation);body.thetaIntegral=body.rotationIntegral[2];
 body.gyroscopicTorque=cross(predictor,predictor.map((v,i)=>v*inertia[i]));body.torqueTotal=[...torque];
 body.worldAngularImpulse=add(body.worldAngularImpulse,mul(rotate(midQ,torque),dt));
 // Fuel ejected with its co-rotating angular momentum, not artificial I-dot spin-up.
 const transport=mid.map((v,i)=>v*(newI[i]-oldI[i]));
 body.worldTransportImpulse=add(body.worldTransportImpulse,rotate(midQ,transport));
 body.angularImpulse+=torque[2]*dt;body.inertiaTransportImpulse+=transport[2];syncAttitude(body);
}
export function makeEngines(upper=false){return engineLayout(upper).map(e=>({...e,enabled:true,requestedEnabled:true,valve:0,thrust:0,fuelUsed:0,gimbal:[0,0],gimbalTarget:[0,0],direction:[0,1,0],force:[0,0,0],torque:[0,0,0],intensity:0,triggerAt:null,activations:[]}));}
export function updateValves(engines,command,available,dt,fueled,upper=false){
 for(const e of engines){const target=e.enabled&&fueled&&(upper||e.phaseActive!==false)?command:0;if(target<=0)e.valve=Math.max(0,e.valve-dt*(upper?3:4));else e.valve+=(target-e.valve)*(1-Math.exp(-dt/(upper?.45:.22)));if(!fueled)e.valve=0;e.thrust=(upper?e.ratedThrust*(available/14640000):available/33)*e.valve;}
}
// Small-angle differential gimbal allocation, followed by exact r × F evaluation.
// Column scaling gives angles as unknowns. Saturation and finite servo slew remain real.
function solve3(a,b){const m=a.map((r,i)=>[...r,b[i]]);for(let k=0;k<3;k++){let pivot=k;for(let j=k+1;j<3;j++)if(Math.abs(m[j][k])>Math.abs(m[pivot][k]))pivot=j;[m[k],m[pivot]]=[m[pivot],m[k]];const d=m[k][k];if(Math.abs(d)<1e-16)return [0,0,0];for(let j=k;j<4;j++)m[k][j]/=d;for(let i=0;i<3;i++)if(i!==k){const v=m[i][k];for(let j=k;j<4;j++)m[i][j]-=v*m[k][j];}}return m.map(r=>r[3]);}
export function actuate(body,engines,target,inertia,aeroTorque,dt,{enabled=true,fueled=true,upper=false,fins=false,dynamicPressure=0,wn=.5}={}){
 const error=qLog(qMultiply(qConjugate(body.attitude),target)),gyro=cross(body.angularVelocity,body.angularVelocity.map((v,i)=>v*inertia[i]));
 const desired=enabled&&fueled?sub(add(error.map((v,i)=>inertia[i]*(wn*wn*v-1.9*wn*body.angularVelocity[i])),gyro),aeroTorque):[0,0,0];
 const base=engines.reduce((sum,e)=>add(sum,cross(e.position,[0,e.thrust,0])),[0,0,0]);
 const columns=engines.flatMap(e=>[mul(cross(e.position,[1,0,0]),e.gimbalLimit?e.thrust:0),mul(cross(e.position,[0,0,1]),e.gimbalLimit?e.thrust:0)]);
 const a=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>columns.reduce((s,c)=>s+c[i]*c[j],0)));
 const regularizer=Math.max(1e-12,(a[0][0]+a[1][1]+a[2][2])*1e-10);for(let i=0;i<3;i++)a[i][i]+=regularizer;
 const solution=enabled&&fueled?solve3(a,sub(desired,base)):[0,0,0],maxAngle=8*Math.PI/180;
 let force=[0,0,0],engineTorque=[0,0,0],servoPower=0;
 for(let i=0;i<engines.length;i++){
  const e=engines[i],angles=[dot(columns[2*i],solution),dot(columns[2*i+1],solution)],norm=Math.hypot(...angles);
  e.gimbalTarget=angles.map(v=>v*Math.min(1,Math.min(e.gimbalLimit,maxAngle)/Math.max(1e-30,norm)));
  if(e.thrust<1||!enabled||!fueled)e.gimbalTarget=[0,0];
  const before=[...e.gimbal];e.gimbal=e.gimbal.map((v,j)=>v+Math.min(.35*dt,Math.max(-.35*dt,(e.gimbalTarget[j]-v)*(1-Math.exp(-dt/.12)))));
  e.direction=unit([Math.tan(e.gimbal[0]),1,Math.tan(e.gimbal[1])]);e.force=mul(e.direction,e.thrust);e.torque=cross(e.position,e.force);
  force=add(force,e.force);engineTorque=add(engineTorque,e.torque);servoPower+=e.thrust>1?8000*(length(e.gimbal)+length(sub(e.gimbal,before))/dt*.02):0;
 }
 const residual=sub(desired,engineTorque),finMax=fins&&enabled&&fueled?dynamicPressure*48*29*.48:0;
 const finTorque=residual.map((v,i)=>Math.min(i===1?finMax*.06:finMax,Math.max(i===1?-finMax*.06:-finMax,v)));
 const rcsMax=upper?[4500000,180000,4500000]:[16000000,500000,16000000];
 const rcsTorque=sub(residual,finTorque).map((v,i)=>enabled&&fueled?Math.min(rcsMax[i],Math.max(-rcsMax[i],v)):0);
 const finDeflection=finMax>1e-12?Math.max(...finTorque.map(Math.abs))/finMax*.42:0;
 const finPower=Math.abs(dot(finTorque,body.angularVelocity))/.55+180000*Math.abs(finDeflection);
 return {force,engineTorque,imbalanceTorque:base,gimbalTorque:sub(engineTorque,base),finTorque,rcsTorque,finDeflection,finPower,servoPower,error,requested:desired,torque:add(engineTorque,add(finTorque,rcsTorque))};
}
export function aerodynamicTorque(body,forceWorld,rho,speed,{upper=false,fins=false}={}){
 const forceBody=unrotate(body.attitude,forceWorld),vBody=unrotate(body.attitude,[body.vx,body.vy,body.vz||0]);
 // Equivalent pressure centre changes with axial flow direction and deployed fins.
 const cpY=-(upper?2:3.0)*Math.tanh(vBody[1]/60)+(fins?6:0),cp=[0,cpY,0];
 const pressureMoment=cross(cp,forceBody),L=upper?50:71,A=upper?450:639,r=4.5;
 const transverse=.5*rho*Math.max(10,speed)*A*L*L*.009;
 const polar=.5*rho*(speed+Math.abs(body.angularVelocity[1])*r)*A*r*r*.055;
 const damping=body.angularVelocity.map((v,i)=>-v*(i===1?polar:transverse));
 return {torque:add(pressureMoment,damping),pressureMoment,damping,cp,forceBody};
}
