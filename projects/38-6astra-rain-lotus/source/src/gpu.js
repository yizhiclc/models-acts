import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import { SIZE, RESOLUTION as N, DX, FIXED_DT, MAX_RAIN, MAX_LEAVES, MAX_EXTRA, WAVE_SPEED, CAPILLARY, DAMPING, VISCOSITY,shoreDistance } from './config.js';
import rainCode from './rain.wgsl?raw';
import waveCode from './wave.wgsl?raw';
import surfaceCode from './surface.wgsl?raw';

// Native compute and Three.js share one GPUDevice. The r180 backend bridge is
// isolated here; no CPU copy of the wave field is used for rendering or stepping.
export class PondGPU {
  constructor(renderer, leaves, stems) {
    this.renderer=renderer; this.device=renderer.backend.device; this.leaves=leaves;this.stems=stems;
    this.time=0;this.steps=0;this.front=0;this.pending=[];this.busy=false;this.maskAge=0;
    this.params=new Float32Array(24);this.leafData=new Float32Array(MAX_LEAVES*8);
    this.maskData=new Float32Array(N*N*2);this.shoreMask=new Float32Array(N*N*2);this.extraData=new Float32Array(MAX_EXTRA*4);
    for(let z=0;z<N;z++)for(let x=0;x<N;x++)if(shoreDistance((x+.5)*DX-SIZE/2,(z+.5)*DX-SIZE/2)>=0)this.shoreMask[(z*N+x)*2]=1;
    this.seen=new Float32Array(MAX_RAIN);this.stats={waterHits:0,leafHits:0,readbacks:0};
    this.buffers=[];
    const B=GPUBufferUsage;
    this.uniform=this.buffer(96,B.UNIFORM|B.COPY_DST,'Pond parameters');
    this.wave=[0,1].map(i=>this.buffer(N*N*8,B.STORAGE|B.COPY_SRC|B.COPY_DST,`Wave ${i}: height + velocity`));
    this.impulse=this.buffer(N*N*4,B.STORAGE|B.COPY_DST,'Atomic rain impulses');
    this.leafBuffer=this.buffer(MAX_LEAVES*32,B.STORAGE|B.COPY_DST,'Leaf collision surfaces');
    this.mask=this.buffer(N*N*8,B.STORAGE|B.COPY_DST|B.COPY_SRC,'Solid + rain cover');
    this.events=this.buffer(MAX_RAIN*32,B.STORAGE|B.COPY_SRC|B.COPY_DST,'Leaf impact events');
    this.extra=this.buffer(MAX_EXTRA*16,B.STORAGE|B.COPY_DST,'Leaf runoff and manual drops');
    this.counters=this.buffer(16,B.STORAGE|B.COPY_SRC|B.COPY_DST,'Impact counters');
    this.readback=this.buffer(MAX_RAIN*32+16,B.MAP_READ|B.COPY_DST,'Asynchronous leaf readback');
    this.rainAttribute=new THREE.StorageBufferAttribute(new Float32Array(MAX_RAIN*12),4);
    this.rainAttribute.name='Rain / shared GPU particles';
    const arr=this.rainAttribute.array;
    for(let i=0;i<MAX_RAIN;i++){arr[i*12+1]=-100;arr[i*12+11]=10;}
    renderer.backend.createStorageAttribute(this.rainAttribute);
    this.rainBuffer=renderer.backend.get(this.rainAttribute).buffer;
    this.rainNode=storage(this.rainAttribute,'vec4',MAX_RAIN*3).toReadOnly();
    this.surface=new THREE.StorageTexture(N,N);this.surface.type=THREE.HalfFloatType;this.surface.generateMipmaps=false;this.surface.name='Computed height / slopes';
    renderer.initTexture(this.surface);this.surfaceGPU=renderer.backend.get(this.surface).texture;
    this.updateLeaves();this.updateMask();
  }
  buffer(size,usage,label){const b=this.device.createBuffer({size,usage,label});this.buffers.push(b);return b;}
  async pipeline(code,label){
    const module=this.device.createShaderModule({code,label});
    const info=await module.getCompilationInfo();
    const errors=info.messages.filter(m=>m.type==='error');
    if(errors.length)throw new Error(`${label}: ${errors.map(m=>`${m.lineNum}: ${m.message}`).join('\n')}`);
    return this.device.createComputePipelineAsync({label,layout:'auto',compute:{module,entryPoint:'main'}});
  }
  group(pipeline,resources){return this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:resources.map((r,binding)=>({binding,resource:r instanceof GPUBuffer ? {buffer:r} : r}))});}
  async init(){
    [this.rainPipeline,this.wavePipeline,this.surfacePipeline]=await Promise.all([this.pipeline(rainCode,'Rain collision and atomic impulses'),this.pipeline(waveCode,'Persistent capillary-gravity wave equation'),this.pipeline(surfaceCode,'Water surface gradients')]);
    this.rainGroup=this.group(this.rainPipeline,[this.uniform,this.rainBuffer,this.impulse,this.leafBuffer,this.events,this.mask,this.extra,this.counters]);
    this.waveGroups=[0,1].map(i=>this.group(this.wavePipeline,[this.uniform,this.wave[i],this.wave[1-i],this.impulse,this.mask]));
    this.surfaceGroups=[0,1].map(i=>this.group(this.surfacePipeline,[this.uniform,this.wave[i],this.surfaceGPU.createView({baseMipLevel:0,mipLevelCount:1})]));
  }
  updateLeaves(){
    this.leaves.forEach((l,i)=>this.leafData.set([l.x,l.group.position.y,l.z,l.radius,l.slopeX,l.slopeZ,l.phase,0],i*8));
    this.device.queue.writeBuffer(this.leafBuffer,0,this.leafData);
  }
  updateMask(){
    const data=this.maskData;data.set(this.shoreMask);
    for(let z=0;z<N;z++)for(let x=0;x<N;x++)if(x<2||z<2||x>N-3||z>N-3)data[(z*N+x)*2]=1;
    const disk=(x,z,r,fn)=>{
      const x0=Math.max(0,Math.floor((x-r+SIZE/2)/DX)),x1=Math.min(N-1,Math.ceil((x+r+SIZE/2)/DX));
      const z0=Math.max(0,Math.floor((z-r+SIZE/2)/DX)),z1=Math.min(N-1,Math.ceil((z+r+SIZE/2)/DX));
      for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){
        const qx=(i+.5)*DX-SIZE/2-x,qz=(j+.5)*DX-SIZE/2-z,rr=Math.hypot(qx,qz)/r;
        if(rr<=1)fn((j*N+i)*2,rr,qx,qz);
      }
    };
    for(const l of this.leaves){
      disk(l.x,l.z,l.radius,(i,rr,qx,qz)=>{
        data[i+1]=1; // All leaf canopies intercept rain.
        // Only rims near the water obstruct waves. Elevated leaves do not act as walls.
        const rim=l.group.position.y+l.slopeX*qx+l.slopeZ*qz;
        if(rr>.88 && rim<.075)data[i]=1;
      });
      disk(l.x,l.z,Math.max(.012,DX*.85),i=>data[i]=1);
    }
    for(const s of this.stems)disk(s.x,s.z,Math.max(s.radius||.008,DX*.85),i=>data[i]=1);
    this.device.queue.writeBuffer(this.mask,0,data);
  }
  addDrop(x,z,diameter=.0036,speed=6){if(this.pending.length<MAX_EXTRA)this.pending.push([x,z,diameter,speed]);}
  step(options){
    this.time+=FIXED_DT;this.steps++;
    const active=options.paused?0:Math.round(30+3700*options.rain**1.6);
    const p=this.params;
    p.set([FIXED_DT,this.time,options.rain,options.wind,active,this.leaves.length,this.steps,this.pending.length,SIZE,N,DX,0,WAVE_SPEED,CAPILLARY,DAMPING,VISCOSITY,options.wind*.7,options.wind*.22,0,0,0,0,0,0]);
    this.device.queue.writeBuffer(this.uniform,0,p);
    if(this.pending.length){this.pending.forEach((v,i)=>this.extraData.set(v,i*4));this.device.queue.writeBuffer(this.extra,0,this.extraData);this.pending.length=0;}
    const enc=this.device.createCommandEncoder({label:'Rain + wave substep'});
    let pass=enc.beginComputePass();pass.setPipeline(this.rainPipeline);pass.setBindGroup(0,this.rainGroup);pass.dispatchWorkgroups(MAX_RAIN/64);pass.end();
    pass=enc.beginComputePass();pass.setPipeline(this.wavePipeline);pass.setBindGroup(0,this.waveGroups[this.front]);pass.dispatchWorkgroups(N/8,N/8);pass.end();
    this.front=1-this.front;
    this.device.queue.submit([enc.finish()]);
  }
  encodeSurface(){
    const enc=this.device.createCommandEncoder({label:'Wave gradients'}),pass=enc.beginComputePass();
    pass.setPipeline(this.surfacePipeline);pass.setBindGroup(0,this.surfaceGroups[this.front]);pass.dispatchWorkgroups(N/8,N/8);pass.end();this.device.queue.submit([enc.finish()]);
  }
  async readEvents(callback){
    if(this.busy)return;this.busy=true;
    try{
      const enc=this.device.createCommandEncoder();enc.copyBufferToBuffer(this.events,0,this.readback,0,MAX_RAIN*32);enc.copyBufferToBuffer(this.counters,0,this.readback,MAX_RAIN*32,16);this.device.queue.submit([enc.finish()]);
      await this.readback.mapAsync(GPUMapMode.READ);
      const mapped=this.readback.getMappedRange(),arr=new Float32Array(mapped,0,MAX_RAIN*8),counts=new Uint32Array(mapped,MAX_RAIN*32,4);
      this.stats.waterHits=counts[0];this.stats.leafHits=counts[1];this.stats.readbacks++;
      for(let i=0;i<MAX_RAIN;i++){const j=i*8;if(arr[j+4]>this.seen[i]){this.seen[i]=arr[j+4];callback(arr[j+3]|0,arr[j],arr[j+1],arr[j+2]);}}
      this.readback.unmap();
    }finally{this.busy=false;}
  }
  async snapshot(){
    const b=this.device.createBuffer({size:N*N*8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const e=this.device.createCommandEncoder();e.copyBufferToBuffer(this.wave[this.front],0,b,0,b.size);this.device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
    const a=new Float32Array(b.getMappedRange().slice(0));b.unmap();b.destroy();return a;
  }
  async clear(){
    // Diagnostic reset only; normal rain pause never clears this persistent state.
    const e=this.device.createCommandEncoder();for(const b of [...this.wave,this.impulse,this.events,this.counters])e.clearBuffer(b);this.device.queue.submit([e.finish()]);this.seen.fill(0);this.pending.length=0;
  }
  dispose(){for(const b of this.buffers)b.destroy();this.surface.dispose();}
}
