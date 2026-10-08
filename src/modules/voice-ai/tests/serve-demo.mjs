import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const preview = path.join(process.cwd(), 'private-documents', 'voice-demo', 'voice-qa-demo.html');
const content = await fs.readFile(preview);
const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  response.end(content);
});
server.on('error', error => { console.error('QA demo server:', error.code); process.exitCode = 1; });
server.listen(3102, '127.0.0.1', () => console.log('QA preview (not published on DB): http://127.0.0.1:3102'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
