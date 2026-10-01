import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) {
      res.writeHead(403).end(); return;
    }
    if (!(await stat(filename)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(filename));
  } catch { res.writeHead(404).end('Not found'); }
});
let port = Number(process.env.PORT || 4173);
server.on('error', error => {
  if (error.code === 'EADDRINUSE') { port++; server.listen(port, '127.0.0.1'); }
  else throw error;
});
server.listen(port, '127.0.0.1', () => console.log(`BlackHole: http://127.0.0.1:${port}`));
