#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

// Serve from project root so we can access dist/ as well as demo/
const root = path.resolve(__dirname, '..');
const port = process.env.PORT || 5173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/demo/index.html';
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); return res.end('Not found');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', mime[path.extname(filePath)] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Demo running: http://localhost:${port}`);
});
