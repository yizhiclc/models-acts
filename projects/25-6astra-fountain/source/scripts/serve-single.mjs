import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port=Number(process.env.PORT||4174);
const file=new URL('../dist/fountain-single.html',import.meta.url);
const html=await readFile(file);
createServer((request,response)=>{
  const path=new URL(request.url,'http://localhost').pathname;
  if(path==='/favicon.ico'){response.writeHead(204);response.end();return;}
  if(path!=='/'&&path!=='/fountain-single.html'){response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(html);
}).listen(port,'127.0.0.1',()=>console.log(`Single-file fountain: http://127.0.0.1:${port}`));
