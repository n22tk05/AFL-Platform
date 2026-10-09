import next from 'next';
import http from 'node:http';
// Public Next custom-server API; useful for local integration without CLI launcher.
const port=Number(process.env.PORT||3100);
const app=next({dev:true,hostname:'127.0.0.1',port});
await app.prepare();
http.createServer(app.getRequestHandler()).listen(port,'127.0.0.1',()=>console.log('Document test server http://127.0.0.1:'+port));