import { GSSolver } from 'cannon-es';

// Sequential impulse solver based on cannon-es (MIT), with Coulomb friction limits
// coupled to the CURRENT normal contact impulse. The stock gravity-based friction
// bound is inappropriate for short, high-speed impacts against a vertical wall.
export class ContactSolver extends GSSolver {
  constructor() { super(); this.iterations=22;this.tolerance=1e-5;this.lambda=[];this.rhs=[];this.invC=[];this.normalIndex=[]; }
  solve(dt,world) {
    const equations=this.equations,n=equations.length,bodies=world.bodies;
    const lambda=this.lambda,rhs=this.rhs,invC=this.invC,normalIndex=this.normalIndex;
    const equationIndex=new Map(equations.map((e,i)=>[e,i]));
    lambda.length=rhs.length=invC.length=normalIndex.length=n;
    if(!n)return 0;
    for(const body of bodies){body.updateSolveMassProperties();body.vlambda.set(0,0,0);body.wlambda.set(0,0,0);}
    for(let i=0;i<n;i++) {
      const e=equations[i];lambda[i]=0;rhs[i]=e.computeB(dt);invC[i]=1/e.computeC();
      normalIndex[i]=e.sourceContact?equationIndex.get(e.sourceContact):undefined;
    }
    let iteration=0;
    for(;iteration<this.iterations;iteration++) {
      let total=0;
      for(let i=0;i<n;i++) {
        const e=equations[i];
        let delta=invC[i]*(rhs[i]-e.computeGWlambda()-e.eps*lambda[i]);
        let lower=e.minForce,upper=e.maxForce;
        if(normalIndex[i]!==undefined){upper=e.frictionCoefficient*Math.max(0,lambda[normalIndex[i]]);lower=-upper;}
        const next=Math.max(lower,Math.min(upper,lambda[i]+delta));delta=next-lambda[i];
        lambda[i]=next;total+=Math.abs(delta);e.addToWlambda(delta);
      }
      if(total*total<this.tolerance*this.tolerance)break;
    }
    for(const body of bodies) {
      body.vlambda.vmul(body.linearFactor,body.vlambda);body.velocity.vadd(body.vlambda,body.velocity);
      body.wlambda.vmul(body.angularFactor,body.wlambda);body.angularVelocity.vadd(body.wlambda,body.angularVelocity);
    }
    for(let i=0;i<n;i++)equations[i].multiplier=lambda[i]/dt;
    return iteration;
  }
}

export function installCoulombFriction(world) {
  world.solver=new ContactSolver();
  const narrow=world.narrowphase,original=narrow.createFrictionEquationsFromContact;
  narrow.createFrictionEquationsFromContact=function(contact,result) {
    const start=result.length,created=original.call(this,contact,result);
    const coefficient=contact.bi.kind==='projectile'||contact.bj.kind==='projectile'?0.28:0.62;
    for(let i=start;i<result.length;i++){result[i].sourceContact=contact;result[i].frictionCoefficient=coefficient;}
    return created;
  };
}
