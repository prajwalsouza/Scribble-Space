import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipStore} from '../shared/archive.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('packaged MCP initializes and serves every tool with real saved images',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'scribble-mcp-'));const child=spawn(process.execPath,[path.join(root,'plugins/scribble-space/scripts/mcp-server.mjs')],{env:{...process.env,SCRIBBLE_DATA_DIR:dir},stdio:['pipe','pipe','pipe']});let buffer='',stderr='',nextId=0;const pending=new Map();child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',bytes=>{buffer+=bytes;let p;while((p=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,p);buffer=buffer.slice(p+1);try{const m=JSON.parse(line);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP timeout: '+stderr))},10000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 try{
  const init=await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(init.serverInfo.name,'scribble-space');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const listed=await call('tools/list');assert.equal(listed.tools.length,8);
  const tool=(name,args={})=>call('tools/call',{name,arguments:args});const opened=await tool('open_sketch',{template:'room',brief:'Keep this open.'});assert.equal(opened.isError,undefined);const url=new URL(opened.structuredContent.url),base=url.origin;assert.equal((await fetch(base+'/api/health')).status,200);assert.equal(url.searchParams.get('brief'),'Keep this open.');assert.equal((await tool('list_sketches')).structuredContent.sketches.length,0);
  const zip=unzipStore(await readFile(path.join(root,'tests/fixtures/courtyard.sm3dl.zip'))),manifest=JSON.parse(new TextDecoder().decode(zip['manifest.json'])),doc=JSON.parse(new TextDecoder().decode(zip[manifest.views[0]]));for(const [name,data]of Object.entries(zip))if(name.startsWith('assets/')){const r=await fetch(base+'/api/assets',{method:'POST',headers:{'Content-Type':'image/png'},body:data});assert.equal(r.status,201)}
  const saved=await fetch(base+'/api/shots/'+doc.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:doc,revision:null})});assert.equal(saved.status,200);const savedDocument=await saved.json();const read=await tool('read_sketch',{id:doc.id,images:'both'});assert.equal(read.structuredContent.document.note,doc.note);assert.equal(read.content.filter(c=>c.type==='image').length,2);assert.equal((await tool('wait_for_sketch',{after:'2020-01-01T00:00:00.000Z',timeoutMs:0})).structuredContent.changed,true);assert.equal((await tool('wait_for_sketch',{after:'2099-01-01T00:00:00.000Z',timeoutMs:0})).structuredContent.changed,false);
  const session=opened.structuredContent.session;
  assert.equal(url.searchParams.get('session'),session);
  assert.equal((await tool('wait_for_submission',{session,after:0,timeoutMs:0})).structuredContent.submitted,false,'autosave must not submit');
  const post=(revision,sessionId=session)=>fetch(base+'/api/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sessionId,id:doc.id,revision})});
  assert.equal((await post('stale')).status,409);
  assert.equal((await post(savedDocument.revision,crypto.randomUUID())).status,409);
  const waiting=tool('wait_for_submission',{session,after:0,timeoutMs:4000});
  const sent=await post(savedDocument.revision);assert.equal(sent.status,201);const receipt=await sent.json();
  const received=await waiting;assert.equal(received.structuredContent.submitted,true);assert.equal(received.content.filter(c=>c.type==='image').length,2);assert.equal(received.structuredContent.cursor,1);
  assert.equal((await (await post(savedDocument.revision)).json()).id,receipt.id,'retry must not duplicate');
  const newer={...doc,note:'Changed after sending'};assert.equal((await fetch(base+'/api/shots/'+doc.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:newer,revision:savedDocument.revision})})).status,200);
  const immutable=await tool('read_submission',{session,id:receipt.id});assert.equal(immutable.structuredContent.submission.document.note,doc.note,'sent snapshot must remain immutable');
  assert.equal((await tool('wait_for_submission',{session,after:1,timeoutMs:0})).structuredContent.submitted,false,'later autosave must not submit');
  const isolated=await tool('open_sketch',{template:'blank'});assert.equal((await tool('wait_for_submission',{session:isolated.structuredContent.session,after:0,timeoutMs:0})).structuredContent.submitted,false);
  assert.equal((await tool('read_submission',{session:isolated.structuredContent.session,id:receipt.id})).isError,true);
  const delivery=await (await fetch(base+'/api/submissions/'+receipt.id+'?session='+session)).json();assert.equal(delivery.status,'delivered');
  const exported=await tool('export_sketch',{id:doc.id});assert.ok(unzipStore(await readFile(exported.structuredContent.file))['manifest.json']);assert.equal(exported.structuredContent.containsRenderedGeometry,false);assert.match((await tool('read_format_spec')).content[0].text,/SM3DL 0.2/);
  const modelPath=path.join(dir,'sample.glb');await writeFile(modelPath,zip['scene.glb']);const model=await tool('open_sketch',{modelPath});assert.match(new URL(model.structuredContent.url).searchParams.get('model'),/\.glb$/);assert.equal((await tool('open_sketch',{modelPath:'relative.glb'})).isError,true);assert.equal((await tool('read_sketch',{id:'../../secret'})).isError,true);
 }finally{child.stdin.end();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('close',()=>{clearTimeout(timer);resolve()})});await rm(dir,{recursive:true,force:true})}
});
