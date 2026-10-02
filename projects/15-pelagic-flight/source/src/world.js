/* Pelagic / 掠海长航 — deterministic world, metres and seconds. */
window.Pelagic = (() => {
  'use strict';
  const T = THREE;
  const clamp = T.MathUtils.clamp;
  const smooth = (a,b,x) => { x=clamp((x-a)/(b-a),0,1); return x*x*(3-2*x); };
  const mix = (a,b,t) => a+(b-a)*t;
  const fract = x => x-Math.floor(x);
  const hash = (x,z) => fract(Math.sin(x*127.1+z*311.7)*43758.5453123);
  function noise(x,z) {
    const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
    const u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz);
    return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
  }
  function fbm(x,z) {return .55*noise(x,z)+.28*noise(x*2.07+19,z*2.07)+.12*noise(x*4.23,z*4.23+7)+.05*noise(x*8.6,z*8.6);}
  function rng(seed) {return () => {seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  const route = new T.CatmullRomCurve3([
    [0,16,1500],[0,14.5,700],[0,13.5,200],[-120,14,-350],[240,19,-1250],
    [1450,27,-2050],[2700,21,-1750],[3650,19,-3200],[5200,24,-3800],
    [6700,18,-2950],[7400,16,-1150],[7500,15,900],[6300,22,2800],
    [4900,26,3950],[3200,22,4100],[1550,18,3650],[300,20,2750],[0,18,2300]
  ].map(p=>new T.Vector3(...p)), true, 'catmullrom', .42);
  route.arcLengthDivisions=8192;
  route.updateArcLengths();
  const length=route.getLength(), speed=106, speedLimits=Object.freeze({min:80,max:360});
  const islands = [
    {x:-630,z:-320,rx:365,rz:560,height:195,angle:-.32,seed:3,name:'雾岬'},
    {x:1080,z:-570,rx:450,rz:595,height:245,angle:.58,seed:12,name:'双脊岛'},
    {x:1800,z:480,rx:450,rz:550,height:162,angle:-.48,seed:7,name:'长汀'},
    {x:-2220,z:-2300,rx:690,rz:830,height:365,angle:.2,seed:19,name:'远岫'},
    {x:4920,z:-1480,rx:700,rz:1060,height:340,angle:-.6,seed:27,name:'东岸'},
    {x:-2020,z:2220,rx:460,rz:670,height:225,angle:-.7,seed:36,name:'青屿'},
    {x:3500,z:3130,rx:780,rz:550,height:270,angle:.55,seed:55,name:'南屿'},
    {x:460,z:-3440,rx:590,rz:485,height:250,angle:.1,seed:22,name:'北礁'},
    {x:-320,z:-810,rx:96,rz:158,height:39,angle:-.3,seed:64,name:'碎浪礁'},
    {x:6300,z:-2040,rx:230,rz:350,height:120,angle:.25,seed:91,name:'望潮屿'},
    {x:6100,z:1700,rx:270,rz:390,height:139,angle:-.5,seed:83,name:'长风屿'}
  ];
  function islandHeight(island,x,z) {
    const c=Math.cos(island.angle),s=Math.sin(island.angle),dx=x-island.x,dz=z-island.z;
    const nx=(dx*c+dz*s)/island.rx,nz=(-dx*s+dz*c)/island.rz;
    const r=Math.hypot(nx,nz),a=Math.atan2(nz,nx);
    const edge=.87+.07*Math.sin(a*3+island.seed)+.045*Math.sin(a*7+2)+.018*Math.sin(a*13);
    if(r>edge) return -Math.min(18,(r-edge)*100);
    const inland=edge-r;
    const mass=.76*Math.exp(-((nx+.24)**2/.19+(nz-.07)**2/.37))+.55*Math.exp(-((nx-.28)**2/.11+(nz+.26)**2/.23));
    const ridge=1-Math.abs(2*fbm(nx*3.9+island.seed,nz*3.9+island.seed*.3)-1);
    const detail=fbm(nx*17+island.seed,nz*17+8)-.5;
    const cliff=1-smooth(.30,.68,noise(nx*3.1+island.seed,nz*3.1));
    const coast=smooth(0,.22-cliff*.13,inland);
    const mountain=(.025+.92*mass+.13*ridge+.10*detail)*coast;
    const beach=smooth(.18,.6,noise(nx*4+island.seed,nz*4+11));
    const h=mountain*island.height;
    return mix(h,h*smooth(0,.115,inland),beach*.7)-1.35;
  }
  const waves = [
    [.66,.047, .94,.342,.68], [.37,.094,-.30,.954,.95],
    [.20,.174, .76,-.65,1.25], [.05,.37,.98,.18,1.90],
    [.022,.78,-.56,.83,2.75]
  ];
  let windSampler=null;
  function waveHeight(x,z,t) {let h=0;for(let i=0;i<waves.length;i++){const [a,k,dx,dz,w]=waves[i];h+=a*Math.sin((x*dx+z*dz)*k-t*w+(noise(x*(.018+i*.004)+i*13,z*(.018+i*.004)+i*7)-.5)*3.4);}return h+(windSampler?windSampler(x,z):0);}
  // Precompute periodic roll profiles. Smooth the bounded roll itself, so high
  // speed cannot turn a tiny curvature sign change into a violent wing reversal.
  // Sampling these tables is cheap enough for both the aircraft and past wing tips.
  const rollCount=4096,rollStep=length/rollCount,rollSpeedStep=speedLimits.max/12,rollProfiles=[];
  const curvature=new Float32Array(rollCount),turnA=new T.Vector3(),turnB=new T.Vector3();
  for(let i=0;i<rollCount;i++){
    const u=i/rollCount;route.getTangentAt((u+60/length)%1,turnA);route.getTangentAt((u-60/length+1)%1,turnB);
    curvature[i]=Math.atan2(turnB.z*turnA.x-turnB.x*turnA.z,turnB.x*turnA.x+turnB.z*turnA.z)/120;
  }
  for(let level=0;level<=12;level++){
    const velocity=level*rollSpeedStep,raw=new Float32Array(rollCount),filtered=new Float32Array(rollCount),sigma=Math.max(24,velocity*.40),radius=Math.ceil(sigma*3/rollStep),weights=[];let total=0;
    for(let i=0;i<rollCount;i++)raw[i]=clamp(Math.atan(curvature[i]*velocity*velocity/9.81)*.62,-.44,.44);
    for(let j=-radius;j<=radius;j++){const w=Math.exp(-.5*Math.pow(j*rollStep/sigma,2));weights.push(w);total+=w;}
    for(let i=0;i<rollCount;i++){let sum=0;for(let j=-radius;j<=radius;j++)sum+=raw[(i+j+rollCount)%rollCount]*weights[j+radius];filtered[i]=sum/total;}
    rollProfiles.push(filtered);
  }
  function rollAt(u,velocity){
    const p=u*rollCount,i=Math.floor(p)%rollCount,j=(i+1)%rollCount,f=p-Math.floor(p),s=clamp(velocity/rollSpeedStep,0,12),a=Math.floor(s),b=Math.min(12,a+1);
    return mix(mix(rollProfiles[a][i],rollProfiles[a][j],f),mix(rollProfiles[b][i],rollProfiles[b][j],f),s-a);
  }
  const point = new T.Vector3(), tangent = new T.Vector3(),lookPoint=new T.Vector3();
  const rot = new T.Matrix4(), up = new T.Vector3(0,1,0), bankQ=new T.Quaternion(), axis=new T.Vector3(0,0,1);
  function flight(distance,time,out,velocity=speed) {
    const u=((distance%length)+length)%length/length;
    route.getPointAt(u,point);
    point.y+=.22*Math.sin(time*.41)+.1*Math.sin(time*.87);
    route.getTangentAt(u,tangent).normalize();
    // Local +Z points aft: a clockwise heading change lowers the right wing.
    const bank=rollAt(u,velocity);
    rot.lookAt(point,lookPoint.copy(point).add(tangent),up);
    out.position.copy(point);out.forward.copy(tangent);out.quaternion.setFromRotationMatrix(rot);
    bankQ.setFromAxisAngle(axis,bank);out.quaternion.multiply(bankQ);
    out.bank=bank;out.progress=u;out.clearance=point.y-waveHeight(point.x,point.z,time)-.98;
    return out;
  }
  const makeFlightState=()=>({position:new T.Vector3(),forward:new T.Vector3(),quaternion:new T.Quaternion(),bank:0,progress:0,clearance:0});
  return {T,clamp,smooth,mix,noise,fbm,rng,route,length,speed,speedLimits,islands,islandHeight,waves,waveHeight,flight,makeFlightState,setWindSampler(fn){windSampler=fn;},maximumWaveHeight:3.85};
})();
