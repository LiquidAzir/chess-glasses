const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
 const target=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)});
}).listen(Number(process.env.PORT||5201),'127.0.0.1',()=>console.log('Chess preview ready on http://127.0.0.1:'+(process.env.PORT||5201)));
