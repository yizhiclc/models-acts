import * as THREE from 'three/webgpu';

// All bitmaps are synthesized at startup. No image, HDRI, model or network asset is loaded.
export function rng(seed=9137) { let x=seed>>>0; return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;}; }
function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function tex(c,color=true,repeat=1){const t=new THREE.CanvasTexture(c);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=16;return t;}
function grain(c,base,amount,seed){const ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height),r=rng(seed);for(let i=0;i<im.data.length;i+=4){const n=(r()-.5)*amount;im.data[i]=base[0]+n;im.data[i+1]=base[1]+n;im.data[i+2]=base[2]+n;im.data[i+3]=255;}ctx.putImageData(im,0,0);return ctx;}
function normalFrom(c,strength=2){const w=c.width,h=c.height,src=c.getContext('2d').getImageData(0,0,w,h).data,out=canvas(w,h),ctx=out.getContext('2d'),im=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*4;const dx=(src[(y*w+(x+1)%w)*4]-src[(y*w+(x+w-1)%w)*4])/255*strength;const dy=(src[(((y+1)%h)*w+x)*4]-src[(((y+h-1)%h)*w+x)*4])/255*strength;const l=Math.hypot(dx,dy,1);im.data[at]=128-dx/l*127;im.data[at+1]=128+dy/l*127;im.data[at+2]=128+127/l;im.data[at+3]=255;}ctx.putImageData(im,0,0);return tex(out,false);}

export function createSurfaces(){
 const maps={};
 const body=canvas(2048,4096),ctx=grain(body,[227,230,225],9,18),r=rng(127);
 // Circumferential weld bands, longitudinal skin panels, fastener heads and inspection stencils.
 for(let x=0;x<2048;x+=128){ctx.fillStyle=`rgba(70,88,88,${.02+r()*.025})`;ctx.fillRect(x,0,2,4096);ctx.fillStyle='rgba(255,255,250,.27)';ctx.fillRect(x+2,0,2,4096);}
 for(let y=180;y<4096;y+=610){ctx.fillStyle='#a5b0ac';ctx.fillRect(0,y,2048,3);ctx.fillStyle='#f7f7ef';ctx.fillRect(0,y+3,2048,2);for(let x=14;x<2048;x+=34){ctx.fillStyle='#848f8d';ctx.beginPath();ctx.arc(x,y+13,2.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f1f4ed';ctx.fillRect(x-1,y+11,2,1);}}
 for(let i=0;i<22000;i++){const x=r()*2048,y=r()*4096;ctx.fillStyle=`rgba(80,88,77,${r()*.06})`;ctx.fillRect(x,y,.7+r()*.8,2+r()*13);}
 // Condensation / frost mottle is a surface roughness and pigment detail, not free thrust.
 for(let i=0;i<3200;i++){const x=r()*2048,y=500+r()*2200,s=3+r()*28;ctx.fillStyle=`rgba(254,255,255,${.025+r()*.04})`;ctx.beginPath();ctx.ellipse(x,y,s,s*(.3+r()),0,0,Math.PI*2);ctx.fill();}
 for(const u of [240,1230]){
   ctx.fillStyle='#243b43';ctx.textAlign='center';ctx.font='700 154px Arial';[...'ASTRA'].forEach((ch,i)=>ctx.fillText(ch,u+90,800+i*160));
   ctx.font='600 43px Arial';ctx.fillText('RLV–01',u+90,1810);ctx.font='20px monospace';ctx.fillText('REUSABLE FLIGHT VEHICLE',u+90,1860);
   ctx.fillStyle='#c05428';ctx.fillRect(u,1940,180,22);ctx.fillStyle='#263b45';ctx.fillRect(u,1980,180,7);
 }
 ctx.textAlign='left';
 for(let i=0;i<35;i++){const x=(i%5)*400+26,y=2200+Math.floor(i/5)*245;ctx.strokeStyle='#8a9692';ctx.lineWidth=2;ctx.strokeRect(x,y,160,92);ctx.fillStyle='#6a7e7c';ctx.font='16px monospace';ctx.fillText(i%2?'ACCESS / '+String(i+1).padStart(3,'0'):'LOX / CRYOGENIC',x+10,y+26);ctx.font='12px monospace';ctx.fillText('NO STEP — SERVICE ONLY',x+10,y+54);for(let j=0;j<30;j++){ctx.fillStyle='#536865';ctx.fillRect(x+10+j*4,y+68,1+(j%3===0),12);}for(const xx of [x+5,x+155])for(const yy of [y+5,y+87]){ctx.fillStyle='#596a66';ctx.fillRect(xx,yy,3,3);}}
 maps.body=tex(body); const bodyHeight=canvas(512,1024),bh=grain(bodyHeight,[128,128,128],12,19);bh.strokeStyle='#727272';bh.lineWidth=1;for(let y=45;y<1024;y+=152.5){bh.beginPath();bh.moveTo(0,y);bh.lineTo(512,y);bh.stroke();}maps.bodyNormal=normalFrom(bodyHeight,1.6);
 const rough=canvas(512,1024);grain(rough,[172,172,172],30,33);maps.bodyRough=tex(rough,false);

 const upper=canvas(1024,2048),uc=grain(upper,[231,234,229],5,108);
 for(let x=0;x<1024;x+=256){uc.fillStyle='rgba(74,87,87,.12)';uc.fillRect(x,0,1.3,2048);uc.fillStyle='rgba(255,255,255,.65)';uc.fillRect(x+1.5,0,1,2048);}
 for(const y of [96,452,1638,1976]){uc.fillStyle='#b5bfbb';uc.fillRect(0,y,1024,2);for(let x=16;x<1024;x+=42){uc.fillStyle='#879793';uc.beginPath();uc.arc(x,y+8,1.5,0,7);uc.fill();}}
 uc.textAlign='center';uc.fillStyle='#45606a';uc.font='600 46px Arial';uc.fillText('ASTRA',260,790);uc.font='16px monospace';uc.fillText('FLIGHT ARTICLE  /  001',260,825);
 for(const x of [125,645]){uc.strokeStyle='#a7b3af';uc.lineWidth=2;uc.strokeRect(x,1360,134,185);uc.font='12px monospace';uc.fillStyle='#728983';uc.fillText('ACCESS',x+67,1443);uc.fillText('NO STEP',x+67,1465);}
 maps.upper=tex(upper);

 for(const [name,base,noise] of [['concrete',[147,145,134],46],['asphalt',[58,64,66],36],['sand',[155,143,113],42],['steel',[134,144,145],20]]){
   const c=canvas(1024),g=grain(c,base,noise,name.length*519),random=rng(name.length*129);
   if(name==='concrete'){
     for(let i=0;i<4500;i++){const x=random()*1024,y=random()*1024;g.fillStyle=`rgba(38,45,39,${random()*.18})`;g.beginPath();g.arc(x,y,random()*2.3+.4,0,7);g.fill();}
     for(let i=0;i<24;i++){let x=random()*1024,y=random()*1024;g.beginPath();g.moveTo(x,y);for(let j=0;j<11;j++){x+=(random()-.4)*15;y+=random()*16;g.lineTo(x,y);}g.strokeStyle='rgba(41,46,41,.21)';g.lineWidth=.5+random();g.stroke();}
     for(let i=0;i<18;i++){const x=random()*1024,y=random()*1024,s=random()*120+20;const gradient=g.createRadialGradient(x,y,0,x,y,s);gradient.addColorStop(0,'rgba(47,46,35,.12)');gradient.addColorStop(1,'rgba(50,49,44,0)');g.fillStyle=gradient;g.fillRect(x-s,y-s,s*2,s*2);}
   }
   if(name==='asphalt')for(let i=0;i<18000;i++){g.fillStyle=`rgba(170,163,141,${random()*.2})`;g.fillRect(random()*1024,random()*1024,1+random()*2,1+random()*2);}
   if(name==='steel')for(let i=0;i<1400;i++){g.fillStyle=`rgba(210,222,216,${random()*.10})`;g.fillRect(random()*1024,random()*1024,.6+random(),100+random()*600);}
   maps[name]=tex(c);maps[name+'Normal']=normalFrom(c,name==='steel'?.8:2);
 }
 const carbon=canvas(512),cc=grain(carbon,[30,36,39],8,92);for(let y=0;y<512;y+=12)for(let x=0;x<512;x+=12){cc.fillStyle=(x/12+y/12)%2?'#313d41':'#1c2529';cc.fillRect(x,y,10,10);cc.strokeStyle='#3e4749';cc.beginPath();cc.moveTo(x+1,y+1);cc.lineTo(x+9,y+9);cc.stroke();}maps.carbon=tex(carbon);maps.carbonNormal=normalFrom(carbon,1.5);
 const hazard=canvas(512,128),hc=hazard.getContext('2d');hc.fillStyle='#ca962d';hc.fillRect(0,0,512,128);hc.fillStyle='#20282b';for(let i=-128;i<600;i+=64){hc.beginPath();hc.moveTo(i,128);hc.lineTo(i+80,0);hc.lineTo(i+112,0);hc.lineTo(i+32,128);hc.fill();}maps.hazard=tex(hazard);
 const grating=canvas(128),gc=grating.getContext('2d');gc.fillStyle='#5b6c6d';for(let i=0;i<128;i+=16){gc.fillRect(i,0,3,128);gc.fillRect(0,i,128,2);}maps.grating=tex(grating);
 const scorch=canvas(1024),sc=scorch.getContext('2d'),sr=rng(1277);for(let i=0;i<240;i++){const x=512+(sr()-.5)*230,y=512+(sr()-.5)*280,s=110+sr()*260;const grad=sc.createRadialGradient(x,y,0,x,y,s);grad.addColorStop(0,'rgba(20,17,14,.022)');grad.addColorStop(.5,'rgba(36,28,20,.014)');grad.addColorStop(1,'rgba(28,24,18,0)');sc.fillStyle=grad;sc.fillRect(x-s,y-s,2*s,2*s);}maps.scorch=tex(scorch);
 const cloud=createCloudAtlas();maps.cloud=cloud.color;maps.cloudNormal=cloud.normal;
 return maps;
}

export function createCloudAtlas(){
 const n=32,noise=new Float32Array(n*n*n),r=rng(2391);for(let i=0;i<noise.length;i++)noise[i]=r();
 const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
 const sample=(x,y,z)=>{let ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=smooth(x-ix),fy=smooth(y-iy),fz=smooth(z-iz);ix&=31;iy&=31;iz&=31;const at=(a,b,c)=>noise[((c&31)*32+(b&31))*32+(a&31)];return lerp(lerp(lerp(at(ix,iy,iz),at(ix+1,iy,iz),fx),lerp(at(ix,iy+1,iz),at(ix+1,iy+1,iz),fx),fy),lerp(lerp(at(ix,iy,iz+1),at(ix+1,iy,iz+1),fx),lerp(at(ix,iy+1,iz+1),at(ix+1,iy+1,iz+1),fx),fy),fz);};
 const size=128,c=canvas(size*4),ctx=c.getContext('2d'),im=ctx.createImageData(size*4,size*4);
 for(let tile=0;tile<16;tile++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const px=(x/(size-1)-.5)*2,py=(y/(size-1)-.5)*2;let optical=0,light=0;
   for(let k=0;k<14;k++){
     const pz=-1+k/6.5,rad=px*px+py*py+pz*pz;
     const a=sample(px*3+tile*3.17,py*3+tile*2.2,pz*3+tile*1.77),b=sample(px*8+tile,py*8+13,pz*8+7);
     const density=Math.max(0,(.74-rad)*1.6+(a-.5)*1.9+(b-.5)*.58);
     const trans=Math.exp(-optical*1.3),amount=density*.23;
     light+=amount*trans*Math.max(.16,.84-py*.36+pz*.10-(1-a)*.52);optical+=amount;
   }
   const alpha=(1-Math.exp(-optical*1.6))*Math.max(0,Math.min(1,(1-Math.max(Math.abs(px),Math.abs(py)))*7));
   const shade=Math.max(.2,Math.min(1,light/(1-Math.exp(-optical*1.3)+.00001)*1.0));
   const index=(((tile>>2)*size+y)*size*4+(tile%4)*size+x)*4;im.data[index]=im.data[index+1]=im.data[index+2]=shade*255;im.data[index+3]=alpha*255;
 }
 ctx.putImageData(im,0,0);
 // Thickness gradients supply local normals for view-dependent smoke lighting.
 const nc=canvas(size*4),ng=nc.getContext('2d'),ni=ng.createImageData(size*4,size*4),width=size*4;
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
   const at=(y*width+x)*4,alpha=(xx,yy)=>im.data[(Math.max(0,Math.min(width-1,yy))*width+Math.max(0,Math.min(width-1,xx)))*4+3]/255;
   const nx=-(alpha(x+2,y)-alpha(x-2,y))*4,ny=(alpha(x,y+2)-alpha(x,y-2))*4,nz=.32,len=Math.hypot(nx,ny,nz);
   ni.data[at]=(nx/len*.5+.5)*255;ni.data[at+1]=(ny/len*.5+.5)*255;ni.data[at+2]=(nz/len*.5+.5)*255;ni.data[at+3]=255;
 }
 ng.putImageData(ni,0,0);const color=tex(c),normal=tex(nc,false);color.wrapS=color.wrapT=normal.wrapS=normal.wrapT=THREE.ClampToEdgeWrapping;return {color,normal};
}
