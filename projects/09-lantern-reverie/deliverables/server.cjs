const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Lantern Reverie: http://127.0.0.1:${port}`));
