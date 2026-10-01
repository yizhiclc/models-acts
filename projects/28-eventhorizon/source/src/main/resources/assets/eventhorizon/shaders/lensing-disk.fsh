#version 330 core
in vec2 uv;
out vec4 fragColor;
uniform sampler2D SceneColor;
uniform sampler2D SceneDepth;
uniform mat4 ViewProjection;
uniform mat4 InverseViewProjection;
uniform vec3 HolePosition;
uniform vec2 Resolution;
uniform vec3 SkyColor;
uniform float MassRadius;
uniform float Spin;
uniform float StepScale;
uniform int StepBudget;
uniform float DiskTime;
uniform float DiskInner;

struct Metric { float r; float f; vec3 l; vec3 dr; vec3 df; vec3 dl0; vec3 dl1; vec3 dl2; };
struct Ray { vec3 x; vec3 p; };

vec3 toKerr(vec3 p) { return vec3(p.x, -p.z, p.y); }
vec3 fromKerr(vec3 p) { return vec3(p.x, p.z, -p.y); }
float radiusKerr(vec3 x) {
    float b=dot(x,x)-Spin*Spin;
    return sqrt(max(1e-10,.5*(b+sqrt(b*b+4.0*Spin*Spin*x.z*x.z))));
}
Metric metric(vec3 x) {
    float a=Spin, a2=a*a, rho2=dot(x,x), z2=x.z*x.z;
    float disc=max(1e-10,sqrt((rho2-a2)*(rho2-a2)+4.0*a2*z2));
    float r2=max(1e-10,.5*(rho2-a2+disc)), r=sqrt(r2);
    float den=r2+a2, d=max(1e-10,r2*r2+a2*z2);
    Metric m;
    m.r=r; m.f=2.0*r*r2/d;
    m.l=vec3(r*x.x+a*x.y,r*x.y-a*x.x,den*x.z/r)/den;
    m.dr=vec3(x.x*r,x.y*r,x.z*den/r)/disc;
    m.df=m.f*((3.0/r-4.0*r*r2/d)*m.dr-vec3(0,0,2.0*a2*x.z/d));
    m.dl0=((x.x-2.0*r*m.l.x)*m.dr+vec3(r,a,0))/den;
    m.dl1=((x.y-2.0*r*m.l.y)*m.dr+vec3(-a,r,0))/den;
    m.dl2=-x.z/r2*m.dr+vec3(0,0,1.0/r);
    return m;
}
Ray rhs(Ray s) {
    Metric m=metric(s.x);
    float q=dot(m.l,s.p)-1.0;
    return Ray(s.p-m.f*q*m.l,.5*m.df*q*q+m.f*q*(s.p.x*m.dl0+s.p.y*m.dl1+s.p.z*m.dl2));
}
Ray addRay(Ray a,Ray b,float h) { return Ray(a.x+h*b.x,a.p+h*b.p); }
Ray advance(Ray s,Ray k1,float h) {
    Ray k2=rhs(addRay(s,k1,h*.5));
    Ray k3=rhs(addRay(s,k2,h*.5));
    Ray k4=rhs(addRay(s,k3,h));
    return Ray(s.x+h*(k1.x+2.0*k2.x+2.0*k3.x+k4.x)/6.0,
               s.p+h*(k1.p+2.0*k2.p+2.0*k3.p+k4.p)/6.0);
}
vec3 unproject(vec2 q,float d) {
    vec4 p=InverseViewProjection*vec4(q*2.0-1.0,d*2.0-1.0,1);
    return p.xyz/p.w;
}
bool project(vec3 p,out vec2 q) {
    vec4 clip=ViewProjection*vec4(p,1);
    q=clip.xy/max(clip.w,1e-8)*.5+.5;
    return clip.w>0.01 && all(greaterThan(q,vec2(.001))) && all(lessThan(q,vec2(.999)));
}
bool sceneGap(vec3 p,out float gap,out vec2 hit) {
    if(!project(p,hit)) return false;
    float depth=texture(SceneDepth,hit).r;
    if(depth>=.999999) return false;
    vec3 surface=unproject(hit,depth);
    gap=length(p)-length(surface);
    return true;
}
bool sceneIntersection(vec3 before,vec3 after,out vec2 hit,out vec3 surfacePoint) {
    float endGap,beginGap;
    vec2 beginUv;
    if(!sceneGap(after,endGap,hit) || endGap<0.0) return false;
    if(!sceneGap(before,beginGap,beginUv) || beginGap>0.0) return false;
    // Refine the crossing, rather than sampling beyond the wall at an RK4 step endpoint.
    vec3 lo=before,hi=after;
    for(int j=0;j<7;j++) {
        vec3 middle=(lo+hi)*.5;
        float gap;
        vec2 candidate;
        if(sceneGap(middle,gap,candidate) && gap>=0.0) hi=middle;
        else lo=middle;
    }
    surfacePoint=hi;
    float gap;
    return sceneGap(hi,gap,hit) && gap<max(.12,length(after-before)*.02);
}
vec3 skyFallback(vec3 direction) {
    float height=smoothstep(-.35,.55,direction.y);
    vec3 horizon=SkyColor*mix(.62,1.05,height);
    vec3 zenith=SkyColor*mix(.92,1.18,height);
    return mix(horizon,zenith,height);
}
vec3 fallbackDirection(vec3 direction,vec3 original) {
    vec4 clip=ViewProjection*vec4(direction,0);
    vec3 sky=skyFallback(direction);
    if(clip.w<=0.0) return sky;
    vec2 source=clip.xy/clip.w*.5+.5;
    vec2 safeUv=clamp(source,vec2(.003),vec2(.997));
    vec3 sampled=texture(SceneColor,safeUv).rgb;
    float outside=max(max(-source.x,source.x-1.0),max(-source.y,source.y-1.0));
    // Keep a narrow boundary sample for nearby rays, then transition to a sky
    // model instead of stretching the last screen pixel indefinitely.
    float boundaryWeight=1.0-smoothstep(0.0,.16,outside);
    float sceneWeight=boundaryWeight*boundaryWeight;
    return mix(sky,sampled,sceneWeight);
}
float hash31(vec3 p) {
    p=fract(p*.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p) {
    vec3 cell=floor(p),f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(cell),hash31(cell+vec3(1,0,0)),f.x),
                   mix(hash31(cell+vec3(0,1,0)),hash31(cell+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash31(cell+vec3(0,0,1)),hash31(cell+vec3(1,0,1)),f.x),
                   mix(hash31(cell+vec3(0,1,1)),hash31(cell+vec3(1,1,1)),f.x),f.y),f.z);
}
float turbulence(vec3 p) {
    return .57*noise3(p)+.28*noise3(p*2.03+11.7)+.15*noise3(p*4.11-9.2);
}
vec3 thermalColor(float kelvin) {
    // Three-band Planck approximation for display color, not a spectral renderer.
    vec3 wavelength=vec3(.650,.550,.450);
    vec3 b=1.0/(pow(wavelength,vec3(5.0))*(exp(14388.0/(wavelength*kelvin))-1.0));
    return pow(b/max(max(b.r,b.g),b.b),vec3(.4545));
}
vec3 flowPattern(float phase,float r,float z) {
    vec3 advected=vec3(cos(phase),sin(phase),log(r)*2.1);
    float coarse=turbulence(advected*3.1);
    float fine=turbulence(vec3(cos(phase)*13.0,sin(phase)*13.0,r*1.1+z*2.5));
    float strands=pow(.5+.5*sin(17.0*log(r)+3.0*phase+coarse*8.0),5.0);
    return vec3(coarse,fine,strands);
}
void integrateDisk(Ray ray,float deltaLambda,float observerEnergy,
                   inout vec3 radiance,inout float transmission) {
    Metric m=metric(ray.x);
    float r=m.r;
    if(r<DiskInner || r>23.0 || abs(ray.x.z)>2.8) return;
    float signA=Spin<0.0?-1.0:1.0;
    float omega=signA/(pow(r,1.5)+abs(Spin));
    float phi=atan(ray.x.y,ray.x.x);
    float time=DiskTime*8.0;
    float outerOmega=signA/(pow(17.0,1.5)+abs(Spin));
    float outerPhase=phi-outerOmega*time;
    // Overlapping finite-life flow fields prevent unlimited shear and hard resets.
    float age=mod(time,96.0),age2=mod(time+48.0,96.0);
    float phase=outerPhase-(omega-outerOmega)*age;
    float phase2=outerPhase-(omega-outerOmega)*age2;
    float weight=.5-.5*cos(6.2831853*age/96.0);
    vec3 flow=mix(flowPattern(phase2,r,ray.x.z),flowPattern(phase,r,ray.x.z),weight);
    float coarse=flow.x,fine=flow.y,strands=flow.z;
    float edgeCloud=turbulence(vec3(cos(outerPhase)*4.0,sin(outerPhase)*4.0,r*.16));
    float outer=15.6+4.6*edgeCloud+1.0*sin(5.0*outerPhase+edgeCloud*4.0);
    float edge=1.0-smoothstep(outer-.6,outer+.65,r);
    float tendril=mix(sin(3.0*phase2+5.5*log(r)+coarse*3.0),
                      sin(3.0*phase+5.5*log(r)+coarse*3.0),weight);
    // Smooth central thickness taper; turbulence changes density, not the envelope.
    float taper=1.0-smoothstep(DiskInner,21.0,r);
    float height=.035+.78*pow(taper,1.35);
    float envelope=exp(-.5*pow(ray.x.z/max(height,.08),2.0));
    float inner=smoothstep(DiskInner,DiskInner+.45,r);
    float gaps=smoothstep(.20,.68,coarse+.15*tendril);
    float density=inner*edge*envelope*(.008+2.6*gaps*gaps)*(.15+.9*fine+.5*strands);
    if(density<.002) return;

    // Circular equatorial four-velocity; extend vertically through the thin layer.
    vec3 velocity=omega*vec3(-ray.x.y,ray.x.x,0);
    float norm=1.0-dot(velocity,velocity)-m.f*pow(1.0+dot(m.l,velocity),2.0);
    if(norm<=.001) return;
    float emitterEnergy=(1.0+dot(ray.p,velocity))/sqrt(norm);
    if(emitterEnergy<=.001) return;
    float g=clamp(observerEnergy/emitterEnergy,.08,2.8);
    float boundary=max(.002,1.0-sqrt(DiskInner/r));
    float temperature=21000.0*pow(DiskInner/r,.75)*pow(boundary,.25);
    float hot=.25+1.5*strands+1.0*pow(gaps,3.0);
    float emissivity=(.4+1.8*pow(DiskInner/r,.7))*hot;
    float alpha=1.0-exp(-density*emitterEnergy*deltaLambda*.95);
    vec3 emitted=thermalColor(clamp(temperature*g,1300.0,32000.0))
        *emissivity*clamp(pow(g,4.0),.03,9.0);
    radiance+=transmission*alpha*emitted;
    transmission*=1.0-alpha;
}
vec3 compositeDisk(vec3 background,vec3 radiance,float transmission) {
    float peak=max(radiance.r,max(radiance.g,radiance.b));
    vec3 mapped=radiance/(1.0+peak);
    return clamp(mapped+transmission*background*(1.0-mapped),0.0,1.0);
}
void main() {
    vec3 original=texture(SceneColor,uv).rgb;
    vec3 direction=normalize(unproject(uv,.999));
    float rg=MassRadius, centerDistance=length(HolePosition);
    float along=dot(HolePosition,direction);
    float impact=length(cross(HolePosition,direction))/rg;
    if((along<=0.0 && centerDistance>rg*4.0) || impact>40.0) { fragColor=vec4(original,1); return; }
    float horizon=1.0+sqrt(1.0-Spin*Spin);
    vec3 start=toKerr(-HolePosition/rg);
    float startRadius=radiusKerr(start);
    if(startRadius<horizon+.02) { fragColor=vec4(0,0,0,1); return; }
    float baseDepth=texture(SceneDepth,uv).r;
    float foregroundDistance=baseDepth<.999999?length(unproject(uv,baseDepth)):1e8;
    // The disk extends well beyond the shadow. Only skip surfaces ahead of all of it.
    if(foregroundDistance<max(0.0,along-24.0*rg)) { fragColor=vec4(original,1); return; }
    Metric m0=metric(start);
    vec3 n=toKerr(direction);
    vec3 momentum;
    if(m0.f<.95) {
        float lapse=sqrt(1.0-m0.f), ln=dot(m0.l,n);
        vec3 spatial=n+(lapse-1.0)*ln*m0.l;
        momentum=(spatial+m0.f*m0.l*(ln-1.0)/lapse)/lapse;
    } else {
        // Eulerian tetrad inside the static limit, where a static observer cannot exist.
        float ln=dot(m0.l,n), root=sqrt(1.0+m0.f);
        momentum=n+(root-1.0)*ln*m0.l;
        float pt=1.0/root+m0.f/(1.0+m0.f)*dot(m0.l,momentum);
        if(pt<=.001) { fragColor=vec4(0,0,0,1); return; }
        momentum/=pt;
    }
    Ray ray=Ray(start,momentum);
    float observerEnergy=m0.f<.95?inversesqrt(1.0-m0.f):1.0;
    vec3 radiance=vec3(0);
    float transmission=1.0;
    vec3 color=original;
    bool resolved=false;
    for(int i=0;i<512;i++) {
        if(i>=StepBudget) break;
        Metric m=metric(ray.x);
        if(m.r<horizon+.018) { color=vec3(0); resolved=true; break; }
        Ray v=rhs(ray);
        float speed=max(length(v.x),.01);
        float radial=dot(m.dr,v.x);
        float h=StepScale*m.r/speed;
        if(m.r<25.0 && abs(ray.x.z)<3.5)
            h=min(h,(StepScale<.1?.28:.42)/speed);
        if(radial<0.0) h=min(h,.25*max(m.r-horizon,.01)/max(-radial,.01));
        Ray next=advance(ray,v,h);
        vec3 sceneBefore=HolePosition+fromKerr(ray.x)*rg;
        vec3 scenePoint=HolePosition+fromKerr(next.x)*rg;
        vec2 hit;
        vec3 surfacePoint;
        bool surfaceHit=i>1 && sceneIntersection(sceneBefore,scenePoint,hit,surfacePoint);
        float segment=surfaceHit?clamp(length(surfacePoint-sceneBefore)/max(length(scenePoint-sceneBefore),1e-6),0.0,1.0):1.0;
        Ray middle=Ray(mix(ray.x,next.x,.5*segment),mix(ray.p,next.p,.5*segment));
        integrateDisk(middle,h*segment,observerEnergy,radiance,transmission);
        if(transmission<.008) { color=vec3(0); resolved=true; break; }
        if(surfaceHit) {
            color=texture(SceneColor,hit).rgb;
            resolved=true; break;
        }
        ray=next;
        if(m.r>64.0 && radial>0.0) {
            vec3 outDir=normalize(fromKerr(v.x));
            vec3 exitPoint=HolePosition+fromKerr(ray.x)*rg;
            float stride=rg*1.5;
            for(int j=0;j<32;j++) {
                vec3 before=exitPoint;
                exitPoint+=outDir*stride;
                if(sceneIntersection(before,exitPoint,hit,surfacePoint)) {
                    color=texture(SceneColor,hit).rgb;
                    resolved=true; break;
                }
                stride*=1.18;
            }
            if(!resolved) color=fallbackDirection(outDir,original);
            resolved=true; break;
        }
        if(any(isnan(ray.x)) || any(isinf(ray.x)) || any(isnan(ray.p))) break;
    }
    if(!resolved) color=fallbackDirection(direction,original);
    color=compositeDisk(color,radiance,transmission);
    float edge=1.0-smoothstep(28.0,40.0,impact);
    fragColor=vec4(mix(original,color,edge),1);
}
