import { clamp } from './physics.js';
import { rng } from './surfaces.js';

// Opt-in synthesis only: no recordings, downloads, microphones or autoplay.
// Audio follows instantaneous telemetry; simulation time remains the only clock for envelopes.
export class LaunchAudio {
 constructor(){this.enabled=false;this.context=null;this.lastSecond=-1;this.lastTime=-1;}
 async toggle(){
  if(!this.context)this.init();
  this.enabled=!this.enabled;
  if(this.enabled)await this.context.resume();else await this.context.suspend();
 }
 init(){
  const c=this.context=new AudioContext();
  const master=c.createGain();master.gain.value=.38;
  const limiter=c.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;master.connect(limiter);limiter.connect(c.destination);
  const random=rng(554),buffer=c.createBuffer(1,c.sampleRate*6,c.sampleRate),data=buffer.getChannelData(0);let brown=0;
  for(let i=0;i<data.length;i++){brown=(brown+(random()*2-1)*.035)/1.02;data[i]=brown*3.2+(random()*2-1)*.23;}
  const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;noise.start();
  const makeLayer=(frequency,type)=>{const filter=c.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=.6;const gain=c.createGain();gain.gain.value=0;noise.connect(filter);filter.connect(gain);gain.connect(master);return {gain,filter};};
  this.rumble=makeLayer(130,'lowpass');this.jet=makeLayer(850,'bandpass');this.water=makeLayer(2200,'highpass');this.blast=makeLayer(370,'lowpass');
  this.beep=c.createOscillator();this.beep.type='sine';this.beep.frequency.value=720;this.beepGain=c.createGain();this.beepGain.gain.value=0;this.beep.connect(this.beepGain);this.beepGain.connect(master);this.beep.start();
 }
 update(sim,camera){
  if(!this.context||!this.enabled)return;
  const c=this.context;
  if(!sim.running){if(c.state==='running')c.suspend();return;}
  if(c.state==='suspended')c.resume();
  const distance=Math.hypot(camera.position.x-sim.x,camera.position.y-sim.y,camera.position.z);
  const near=1/Math.sqrt(1+distance/180),p=clamp(sim.thrust/1e6,0,1.2),t=c.currentTime;
  const blast=sim.phase==='CRASHED'?Math.exp(-(sim.t-sim.terminalAt)*1.1)*clamp(sim.touchdown.blastScale/8,0,2):0;
  this.rumble.gain.gain.setTargetAtTime(p*near*1.5,t,.025);
  this.jet.gain.gain.setTargetAtTime(p*near*.75,t,.025);this.jet.filter.frequency.setTargetAtTime(330+p*820,t,.035);
  this.water.gain.gain.setTargetAtTime(sim.fields.steam.emission*.07,t,.03);this.blast.gain.gain.setTargetAtTime(blast*1.4,t,.01);
  const second=Math.floor(sim.t);
  if(sim.t<this.lastTime)this.lastSecond=-1;
  if(second!==this.lastSecond&&sim.t<8){this.beep.frequency.value=second===7?1080:720;this.beepGain.gain.cancelScheduledValues(t);this.beepGain.gain.setValueAtTime(.16,t);this.beepGain.gain.exponentialRampToValueAtTime(.0001,t+.095);}
  this.lastSecond=second;this.lastTime=sim.t;
 }
}
