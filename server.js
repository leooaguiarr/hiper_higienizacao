const http = require('http');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  let filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(path.resolve(publicDir))) {
    res.writeHead(403).end('Acesso negado');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) filePath = path.join(publicDir, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(process.env.PORT || 8000, () => {
  console.log('Hiper Higienizações disponível em http://localhost:8000');
});

