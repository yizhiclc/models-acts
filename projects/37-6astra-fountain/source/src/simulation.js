import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import particleSource from './particles.wgsl?raw';
import waveSource from './waves.wgsl?raw';

export const CORE_COUNT=65536, PARTICLE_COUNT=98304, GRID=128, FIELD_COUNT=GRID*GRID*3;
export class WaterSimulation {
  constructor(renderer){
    this.renderer=renderer;this.device=renderer.backend.device;this.time=0;this.tick=0;this.dt=1/120;
    this.params=new Float32Array(8);
    this.uniform=this.device.createBuffer({label:'Hydraulic controls',size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.positions=this.shared(PARTICLE_COUNT,'Persistent parcel position / age');
    this.velocities=this.shared(PARTICLE_COUNT,'Persistent parcel velocity / phase');
    this.metadata=this.shared(PARTICLE_COUNT,'Parcel radius / emitter / volume / birth time');
    this.events=this.shared(PARTICLE_COUNT,'Collision position / time');
    this.field=this.shared(FIELD_COUNT,'Wave height / vertical velocity / foam');
    this.nextField=this.buffer(FIELD_COUNT*16,'Wave ping-pong');
    this.impulses=this.buffer((FIELD_COUNT+4)*4,'Atomic impact grid and inflow counters');
    this.reservoirs=this.buffer(32,'Basin volumes and filtered pump / wind');
    this.errors=[];
  }
  buffer(size,label){return this.device.createBuffer({label,size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|GPUBufferUsage.VERTEX});}
  shared(count,label){
    const attribute=new THREE.StorageBufferAttribute(count,4);attribute.name=label;
    const gpu=this.buffer(count*16,label);
    // The only version-specific bridge (three is pinned to 0.180.0).
    // Both native WGSL compute and Three TSL render nodes share this GPUBuffer;
    // particle data is never uploaded per frame or read back for animation.
    this.renderer.backend.get(attribute).buffer=gpu;
    return {attribute,gpu,node:storage(attribute,'vec4',count).toReadOnly()};
  }
  async init(power,wind){
    const device=this.device;
    const module=device.createShaderModule({label:'Water parcel physics',code:particleSource});
    const waves=device.createShaderModule({label:'Impact-driven wave equation',code:waveSource});
    for(const m of [module,waves]){const info=await m.getCompilationInfo();const errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw new Error(errors.map(x=>`${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));}
    const layout=device.createBindGroupLayout({entries:Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0?'uniform':'storage'}}))});
    const pl=device.createPipelineLayout({bindGroupLayouts:[layout]});
    const create=(entryPoint)=>device.createComputePipelineAsync({label:entryPoint,layout:pl,compute:{module,entryPoint}});
    [this.initPipeline,this.hydraulicPipeline,this.particlePipeline,this.secondaryPipeline]=await Promise.all([create('initialize'),create('hydraulics'),create('advanceCore'),create('advanceSecondary')]);
    this.particleGroup=device.createBindGroup({layout,entries:[this.uniform,this.positions.gpu,this.velocities.gpu,this.metadata.gpu,this.events.gpu,this.impulses,this.reservoirs].map((buffer,binding)=>({binding,resource:{buffer}}))});
    this.wavePipeline=await device.createComputePipelineAsync({label:'Wave propagation with reflecting boundaries',layout:'auto',compute:{module:waves,entryPoint:'advanceWaves'}});
    this.waveGroup=device.createBindGroup({layout:this.wavePipeline.getBindGroupLayout(0),entries:[this.uniform,this.field.gpu,this.nextField,this.impulses].map((buffer,binding)=>({binding,resource:{buffer}}))});
    this.writeControls(power,wind);
    const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(this.initPipeline);pass.setBindGroup(0,this.particleGroup);pass.dispatchWorkgroups(PARTICLE_COUNT/128);pass.end();device.queue.submit([encoder.finish()]);
  }
  writeControls(power,wind){this.params.set([this.dt,this.time,power,wind,this.tick,0,0,0]);this.device.queue.writeBuffer(this.uniform,0,this.params);}
  step(power,wind){
    this.writeControls(power,wind);
    const encoder=this.device.createCommandEncoder({label:'Water state step'});
    const run=(pipeline,group,count,label)=>{const pass=encoder.beginComputePass({label});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(count);pass.end();};
    run(this.hydraulicPipeline,this.particleGroup,1,'Reservoir mass balance');
    // Each extra-particle invocation reads core state. Separate passes give a
    // device-wide storage barrier; there is no cross-workgroup read/write race.
    run(this.particlePipeline,this.particleGroup,CORE_COUNT/128,'Integrate connected core parcels');
    run(this.secondaryPipeline,this.particleGroup,(PARTICLE_COUNT-CORE_COUNT)/128,'Integrate shed droplets and spray');
    run(this.wavePipeline,this.waveGroup,FIELD_COUNT/128,'Deposit impacts / propagate waves');
    encoder.copyBufferToBuffer(this.nextField,0,this.field.gpu,0,FIELD_COUNT*16);
    this.device.queue.submit([encoder.finish()]);this.time+=this.dt;this.tick++;
  }
  async snapshot(){
    // Explicit, on-demand diagnostic only. The render loop never uses readback.
    const snapshotTime=this.time,snapshotTick=this.tick;
    const buffers=[this.positions.gpu,this.velocities.gpu,this.field.gpu,this.reservoirs,this.events.gpu];
    const sizes=[PARTICLE_COUNT*16,PARTICLE_COUNT*16,FIELD_COUNT*16,32,PARTICLE_COUNT*16];
    const reads=sizes.map(size=>this.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}));
    const e=this.device.createCommandEncoder();buffers.forEach((b,i)=>e.copyBufferToBuffer(b,0,reads[i],0,sizes[i]));this.device.queue.submit([e.finish()]);
    await Promise.all(reads.map(b=>b.mapAsync(GPUMapMode.READ)));
    const [p,v,w,s,events]=reads.map(b=>new Float32Array(b.getMappedRange().slice(0)));reads.forEach(b=>{b.unmap();b.destroy();});
    let active=0,highest=0,energy=0,foam=0,finite=true,meanX=0,core=0,droplets=0;
    for(let i=0;i<PARTICLE_COUNT;i++){for(let k=0;k<4;k++)if(!Number.isFinite(p[i*4+k])||!Number.isFinite(v[i*4+k]))finite=false;if(v[i*4+3]>.5){active++;highest=Math.max(highest,p[i*4+1]);meanX+=p[i*4];if(v[i*4+3]===1)core++;else droplets++;}}
    for(let i=0;i<FIELD_COUNT;i++){energy+=w[i*4]*w[i*4];foam+=w[i*4+2];if(!Number.isFinite(w[i*4]))finite=false;}
    const impacts=[0,1,2].map(layer=>{const height=[.565,1.925,3.215][layer];let count=0,x=0,z=0;for(let i=0;i<PARTICLE_COUNT;i++){const j=i*4;if(snapshotTime-events[j+3]<.35&&Math.abs(events[j+1]-height)<.001){count++;x+=events[j];z+=events[j+2];}}return {layer,count,x:x/Math.max(1,count),z:z/Math.max(1,count)};});
    return {time:snapshotTime,tick:snapshotTick,active,core,droplets,highest,meanX:meanX/Math.max(1,active),waveEnergy:energy,foam,finite,reservoirs:Array.from(s),impacts};
  }
}
