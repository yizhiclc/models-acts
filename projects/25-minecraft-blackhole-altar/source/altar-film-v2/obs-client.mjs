import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function connect() {
  const config=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
  const ws=new WebSocket(`ws://127.0.0.1:${config.server_port||4455}`),pending=new Map();
  let serial=0;
  let resolveReady,rejectReady;
  const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b;});
  const timer=setTimeout(()=>rejectReady(Error('OBS identification timed out')),10000);
  const fail=error=>{rejectReady(error);for(const p of pending.values())p.reject(error);pending.clear();};
  ws.addEventListener('error',()=>fail(Error('OBS connection failed')));
  ws.addEventListener('close',()=>fail(Error('OBS disconnected')));
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.op===0) {
      const d={rpcVersion:1,eventSubscriptions:0};
      if(m.d.authentication) {
        const hash=x=>crypto.createHash('sha256').update(x).digest('base64');
        d.authentication=hash(hash(config.server_password+m.d.authentication.salt)+m.d.authentication.challenge);
      }
      ws.send(JSON.stringify({op:1,d}));
    } else if(m.op===2) {clearTimeout(timer);resolveReady();}
    else if(m.op===7) {
      const p=pending.get(m.d.requestId);
      if(!p)return;
      pending.delete(m.d.requestId);clearTimeout(p.timer);
      if(m.d.requestStatus.result)p.resolve(m.d.responseData||{});
      else p.reject(Error(`${m.d.requestType}: ${m.d.requestStatus.comment||m.d.requestStatus.code}`));
    }
  });
  await ready;
  return {
    request(requestType,requestData={}) {
      const requestId=String(++serial);
      return new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{pending.delete(requestId);reject(Error(`${requestType} timed out`));},15000);
        pending.set(requestId,{resolve,reject,timer:timeout});
        ws.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));
      });
    },
    close(){ws.close();}
  };
}
