const fs=require('node:fs'),path=require('node:path');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
const nominal=read('successful-landing'),late=read('late-ignition-crash'),short=read('short-stroke-crash');
const event=(type,flight=nominal)=>flight.events.find(e=>e.type===type);
const phase=(name,flight=nominal)=>flight.events.find(e=>e.type==='phase'&&e.phase===name);
async function advanceTo(page,time){
 const now=await page.evaluate(()=>astra.simulation.t);
 for(let remaining=time-now;remaining>1/240;remaining-=12)await page.evaluate(n=>astra.advance(n),Math.min(12,remaining));
}
module.exports={nominal,late,short,event,phase,advanceTo};
