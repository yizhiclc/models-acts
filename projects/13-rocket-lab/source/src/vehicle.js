// Representative 9 m Starship / Super Heavy configuration, not proprietary flight data.
// B1–B3 centre, B4–B13 middle ring, B14–B33 fixed outer ring.
export const VEHICLE={name:'Starship / Super Heavy',diameter:9,boosterLength:71,shipLength:50,hotStageHeight:3,boosterCount:33,shipCount:6,boosterPivot:-34,boosterExit:1.9,shipPivot:-24,shipExit:1.65};
export function engineLayout(upper=false){
 const engines=[];
 const ring=(count,radius,start,kind,gimbal)=>{for(let n=0;n<count;n++){const a=(n/count)*Math.PI*2+(kind==='vacuum'?Math.PI/3:0);engines.push({id:(upper?'S':'B')+(start+n),stage:upper?'upper':'booster',kind,gimbalLimit:gimbal*Math.PI/180,position:[Math.cos(a)*radius,upper?VEHICLE.shipPivot:VEHICLE.boosterPivot,Math.sin(a)*radius],ratedThrust:upper?(kind==='vacuum'?2580000:2300000):2240000});}};
 if(upper){ring(3,1.25,1,'sea-level',8);ring(3,3.15,4,'vacuum',0);}else{ring(3,.95,1,'centre',8);ring(10,2.35,4,'middle',8);ring(20,3.85,14,'outer',0);}
 return engines;
}
