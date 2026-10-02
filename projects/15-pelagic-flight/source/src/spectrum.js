/* A deterministic Phillips spectrum, evolved by dispersion and a 2D inverse FFT.
 * Two bounded CPU textures interpolate at display refresh rate. No asset downloads. */
(() => {
  'use strict';
  const P=Pelagic,T=THREE;
  P.OceanSpectrum=class {
    constructor(){
      this.n=128;this.period=160;this.interval=1/30;this.last=-1;this.start=0;this.blend=0;this.scale=0;this.amplitude=1;
      const n=this.n,count=n*n;this.re=new Float64Array(count);this.im=new Float64Array(count);this.h0r=new Float64Array(count);this.h0i=new Float64Array(count);this.omega=new Float64Array(count);this.neg=new Uint32Array(count);
      this.reverse=new Uint16Array(n);this.cos=new Float64Array(n/2);this.sin=new Float64Array(n/2);
      for(let i=0;i<n;i++){let j=i,v=0;for(let b=0;b<7;b++){v=v*2+(j&1);j>>=1;}this.reverse[i]=v;}
      for(let i=0;i<n/2;i++){this.cos[i]=Math.cos(2*Math.PI*i/n);this.sin[i]=Math.sin(2*Math.PI*i/n);}
      const random=P.rng(18231),L=5.7*5.7/9.81;
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){
        const i=z*n+x,kx=(x<=n/2?x:x-n)*2*Math.PI/this.period,kz=(z<=n/2?z:z-n)*2*Math.PI/this.period,k=Math.hypot(kx,kz);
        this.neg[i]=((n-z)%n)*n+(n-x)%n;if(k===0)continue;
        const direction=(kx*.91+kz*.415)/k;
        const power=Math.exp(-1/(k*k*L*L))/(k*k*k*k)*(.24+.76*direction*direction)*Math.exp(-k*k*.55)*(direction<0?.20:1);
        const g=Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.sqrt(power*.5),a=random()*Math.PI*2;
        this.h0r[i]=g*Math.cos(a);this.h0i[i]=g*Math.sin(a);this.omega[i]=Math.sqrt(9.81*k*(1+k*k*.000074));
      }
      const create=()=>{
        const data=new Uint8Array(count*4),texture=new T.DataTexture(data,n,n,T.RGBAFormat,T.UnsignedByteType);
        texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
        return {data,texture,height:new Float32Array(count),foam:new Float32Array(count)};
      };
      this.a=create();this.b=create();this.update(0,0);
    }
    fftLine(offset,stride){
      const {n,re,im,reverse,cos,sin}=this;
      for(let i=0;i<n;i++){const j=reverse[i];if(j>i){const a=offset+i*stride,b=offset+j*stride,r=re[a],v=im[a];re[a]=re[b];im[a]=im[b];re[b]=r;im[b]=v;}}
      for(let size=2;size<=n;size*=2){const half=size/2,step=n/size;for(let block=0;block<n;block+=size)for(let j=0;j<half;j++){
        const a=offset+(block+j)*stride,b=a+half*stride,w=j*step,rr=re[b]*cos[w]-im[b]*sin[w],ii=re[b]*sin[w]+im[b]*cos[w];
        re[b]=re[a]-rr;im[b]=im[a]-ii;re[a]+=rr;im[a]+=ii;
      }}
    }
    calculate(frame,time,previous,dt){
      const {n,re,im,h0r,h0i,omega,neg}=this,count=n*n;
      for(let i=0;i<count;i++){
        const j=neg[i],a=omega[i]*time,c=Math.cos(a),s=Math.sin(a);
        re[i]=(h0r[i]+h0r[j])*c-(h0i[i]+h0i[j])*s;
        im[i]=(h0r[i]-h0r[j])*s+(h0i[i]-h0i[j])*c;
      }
      for(let z=0;z<n;z++)this.fftLine(z*n,1);for(let x=0;x<n;x++)this.fftLine(x,n);
      if(!this.scale){let sum=0;for(let i=0;i<count;i++)sum+=re[i]*re[i];this.scale=.29/Math.sqrt(sum/count);}
      const h=frame.height,data=frame.data,foam=frame.foam,oldFoam=previous?.foam,cell=this.period/n,decay=Math.exp(-dt*.76);
      for(let i=0;i<count;i++)h[i]=P.clamp(re[i]*this.scale,-1.53,1.53);
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){
        const i=z*n+x,l=z*n+(x+n-1)%n,r=z*n+(x+1)%n,u=((z+n-1)%n)*n+x,d=((z+1)%n)*n+x;
        const dx=(h[r]-h[l])/(2*cell),dz=(h[d]-h[u])/(2*cell),xx=(h[r]+h[l]-2*h[i])/(cell*cell),zz=(h[d]+h[u]-2*h[i])/(cell*cell);
        const jacobian=(1+xx*3.1)*(1+zz*3.1);
        const breaking=P.smooth(.48,.13,jacobian)*P.smooth(.30,.75,h[i]);
        foam[i]=Math.max(breaking,oldFoam?oldFoam[i]*decay:0);
        data[i*4]=Math.round((h[i]/3.2+.5)*255);data[i*4+1]=Math.round(P.clamp(dx*.5+.5,0,1)*255);data[i*4+2]=Math.round(P.clamp(dz*.5+.5,0,1)*255);data[i*4+3]=Math.round(foam[i]*255);
      }
      frame.texture.needsUpdate=true;
    }
    update(time,weather){
      this.amplitude=1+weather*.12;
      if(this.last<0||time<this.last||time-this.last>.3||time>=this.start+this.interval*2){
        const dt=this.last<0||time<this.last?0:time-this.last;
        if(time<this.last||this.last<0){this.a.foam.fill(0);this.b.foam.fill(0);}
        this.start=Math.floor(time/this.interval)*this.interval;
        this.calculate(this.a,this.start,dt?this.b:null,dt);this.calculate(this.b,this.start+this.interval,this.a,this.interval);
      }else if(time>=this.start+this.interval){
        const spare=this.a;this.a=this.b;this.b=spare;this.start+=this.interval;
        this.calculate(this.b,this.start+this.interval,this.a,this.interval);
      }
      this.blend=P.clamp((time-this.start)/this.interval,0,1);this.last=time;
    }
    sample(frame,x,z){
      const n=this.n;let u=((x/this.period)%1+1)%1*n-.5,v=((z/this.period)%1+1)%1*n-.5;const ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
      const x0=(ix+n)%n,z0=(iz+n)%n,x1=(x0+1)%n,z1=(z0+1)%n,h=frame.height;
      return P.mix(P.mix(h[z0*n+x0],h[z0*n+x1],fx),P.mix(h[z1*n+x0],h[z1*n+x1],fx),fz);
    }
    heightAt(x,z){
      const primary=P.mix(this.sample(this.a,x,z),this.sample(this.b,x,z),this.blend);
      const xx=(.8*x-.6*z)/2.17+51.3,zz=(.6*x+.8*z)/2.17+17.1;
      return (primary+.42*P.mix(this.sample(this.a,xx,zz),this.sample(this.b,xx,zz),this.blend))*this.amplitude;
    }
    dispose(){this.a.texture.dispose();this.b.texture.dispose();}
  };
})();
