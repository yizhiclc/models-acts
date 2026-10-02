import * as THREE from 'three/webgpu';
import { texture,screenUV,uniform,float,vec2,vec3,vec4,clamp,mix,exp,length,abs,max } from 'three/tsl';

// HDR -> depth-aware lens blur -> motion-rejected temporal accumulation -> ACES.
// This is temporal supersampling, not a path tracer.
export class PondPost {
  constructor(renderer,camera){
    this.renderer=renderer;this.camera=camera;
    this.sceneTarget=new THREE.RenderTarget(800,600,{type:THREE.HalfFloatType,depthBuffer:true,samples:0});this.sceneTarget.depthTexture=new THREE.DepthTexture(800,600);this.sceneTarget.texture.name='Pond HDR';
    this.history=[0,1].map(i=>new THREE.RenderTarget(800,600,{type:THREE.HalfFloatType,depthBuffer:false}));this.front=0;
    this.focus=uniform(8);this.aperture=uniform(.7);this.pixel=uniform(new THREE.Vector2(1/800,1/600));this.weight=uniform(0);
    this.current=texture(this.sceneTarget.texture,screenUV);this.old=texture(this.history[0].texture,screenUV);
    const depth=texture(this.sceneTarget.depthTexture,screenUV).r;
    const distance=float(camera.near*camera.far).div(float(camera.far).sub(depth.mul(camera.far-camera.near)));
    const coc=clamp(abs(distance.sub(this.focus)).div(max(distance,.1)).mul(this.aperture),0,4);
    let sum=this.current.rgb;
    for(let i=0;i<12;i++){
      const angle=i*2.399963,r=Math.sqrt((i+.5)/12);
      const offset=vec2(Math.cos(angle)*r,Math.sin(angle)*r).mul(this.pixel).mul(coc).mul(2.1);
      sum=sum.add(texture(this.sceneTarget.texture,clamp(screenUV.add(offset),.001,.999)).rgb);
    }
    const blurred=sum.div(13),difference=length(blurred.sub(this.old.rgb));
    const adaptive=this.weight.mul(exp(difference.mul(-18)));
    const accumulated=mix(blurred,this.old.rgb,adaptive);
    const mat=new THREE.MeshBasicNodeMaterial();mat.colorNode=accumulated;mat.toneMapped=false;mat.depthTest=false;mat.depthWrite=false;
    this.accumulate=new THREE.QuadMesh(mat);
    this.outputTexture=texture(this.history[1].texture,screenUV);
    const vignette=screenUV.sub(.5).length().pow(1.5).mul(.17).oneMinus();
    const out=new THREE.MeshBasicNodeMaterial();out.colorNode=this.outputTexture.rgb.mul(vignette);out.depthTest=false;out.depthWrite=false;this.output=new THREE.QuadMesh(out);
  }
  resize(w,h){this.sceneTarget.setSize(w,h);for(const rt of this.history)rt.setSize(w,h);this.pixel.value.set(1/w,1/h);this.weight.value=0;}
  render(samples,quality){
    this.weight.value=quality?Math.min(Math.max(0,(samples-1)/Math.max(1,samples)),127/128):0;
    this.old.value=this.history[this.front].texture;
    const dst=this.history[1-this.front];
    this.renderer.setRenderTarget(dst);this.accumulate.render(this.renderer);
    this.outputTexture.value=dst.texture;
    this.renderer.setRenderTarget(null);this.output.render(this.renderer);this.front=1-this.front;
  }
}
