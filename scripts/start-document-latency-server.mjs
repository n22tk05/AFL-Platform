// Local production verification only. Never publishes or touches the user's server.
import next from 'next';
import http from 'node:http';
const endpoint = new URL(process.env.VIETOCR_ENDPOINT ?? 'http://127.0.0.1:8002/predict');
if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('LOCAL_OCR_REQUIRED');
process.env.VIETOCR_ENDPOINT = endpoint.href;
process.env.DOCUMENT_OCR_PROVIDER = 'vietocr';
process.env.AFL_BUILD_DIR = '.next-document-json-build';
const app = next({ dev: false, hostname: '127.0.0.1', port: 3100 });
await app.prepare();
const server = http.createServer(app.getRequestHandler());
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(3100, '127.0.0.1', () => console.log('Local latency test: http://127.0.0.1:3100'));
