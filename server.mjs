import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ShotStore,StoreError} from './lib/storage.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.glb':'model/gltf-binary','.md':'text/plain; charset=utf-8'};
async function body(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new StoreError(413,'This upload is too large.');chunks.push(chunk)}return Buffer.concat(chunks)}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
async function file(req,res,target){const info=await stat(target);if(!info.isFile())throw new StoreError(404,'Not found.');res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache'});if(req.method==='HEAD')res.end();else createReadStream(target).on('error',()=>res.destroy()).pipe(res)}
export async function createEditorServer({dataDir=process.env.SCRIBBLE_DATA_DIR||path.join(ROOT,'data')}={}){
 const store=new ShotStore(dataDir);await store.init();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https: blob: data:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'");
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),host=req.headers.host||'';
   if(!/^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/.test(host))throw new StoreError(403,'Use a loopback address.');
   if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site'))throw new StoreError(403,'Open this local editor directly to save.');
   if(pathname==='/api/health'&&req.method==='GET')return json(res,{ok:true,app:'scribble-space',version:'0.1.0'});
   if(pathname==='/api/assets'&&req.method==='POST'){
    const type=req.headers['content-type']?.split(';')[0];if(!['image/png','model/gltf-binary'].includes(type))throw new StoreError(415,'Upload PNG or GLB.');return json(res,await store.putAsset(await body(req,type==='image/png'?12e6:64e6),type),201);
   }
   if(pathname==='/api/shots'&&req.method==='GET')return json(res,{shots:await store.list()});
   const match=pathname.match(/^\/api\/shots\/([a-z0-9-]+)$/);
   if(match){if(req.method==='GET')return json(res,await store.get(match[1]));if(req.method==='PUT'){if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new StoreError(415,'Expected JSON.');const payload=JSON.parse((await body(req,16e6)).toString('utf8'));if(payload.document?.id!==match[1])throw new StoreError(400,'View id does not match.');return json(res,await store.save(payload.document,payload.revision||null))}}
   if(!['GET','HEAD'].includes(req.method))throw new StoreError(405,'Method not allowed.');
   if(pathname.startsWith('/api/assets/'))return await file(req,res,store.assetPath(pathname.slice(12)));
   const relative=pathname==='/'?'editor.html':pathname.slice(1);
   if(!/^(editor\.html|demo\.html|README\.md|LICENSE|THIRD-PARTY\.md|(?:public|shared|vendor|spec|docs)\/[^\\]+)$/.test(relative)||relative.split('/').includes('..')||relative.includes('\0'))throw new StoreError(404,'Not found.');
   return await file(req,res,path.join(ROOT,relative));
  }catch(error){if(res.headersSent)return res.destroy();const status=error.status||(['ENOENT','ENOTDIR'].includes(error.code)?404:error instanceof SyntaxError?400:500);if(status===500)console.error('Scribble Space:',error.message);json(res,{error:status===500?'Could not save or load. Check free disk space.':error.message},status)}
 });return {server,store};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server}=await createEditorServer();const port=Number(process.env.PORT||4322);server.listen(port,'127.0.0.1',()=>console.log(`Scribble Space: http://127.0.0.1:${port}/editor.html`))}
