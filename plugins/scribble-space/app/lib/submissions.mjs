import {EventEmitter} from 'node:events';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './storage.mjs';
import {ID} from '../shared/document.mjs';

// Each open_sketch creates a distinct session: another task cannot accidentally
// receive this canvas's sends. Draft saves never enter this queue.
export class SubmissionQueue {
 constructor(store){this.store=store;this.root=path.join(store.root,'submissions');this.sessions=new Map();this.events=new EventEmitter();this.pending=Promise.resolve()}
 async init(){await mkdir(this.root,{recursive:true})}
 open(){const id=randomUUID();this.sessions.set(id,[]);return id}
 requireSession(id){if(!this.sessions.has(id))throw new StoreError(409,'This Codex connection ended. Ask Codex to reopen the canvas; your saved views are still available.')}
 async submit({session,id,revision}){
  this.requireSession(session);
  const operation=this.pending.catch(()=>{}).then(async()=>{
   const document=await this.store.get(id);
   if(!revision||document.revision!==revision)throw new StoreError(409,'The view changed. Save the latest drawing before sending.');
   if(!document.preview)throw new StoreError(400,'Render the annotated image before sending.');
   const records=this.sessions.get(session),existing=records.find(r=>r.viewId===id&&r.revision===revision);
   if(existing)return existing;
   const submission={id:randomUUID(),session,sequence:records.length+1,sentAt:new Date().toISOString(),document};
   const target=path.join(this.root,submission.id+'.json'),temp=target+'.tmp';
   await writeFile(temp,JSON.stringify(submission,null,2));await rename(temp,target);
   const receipt={id:submission.id,session,sequence:submission.sequence,sentAt:submission.sentAt,viewId:id,revision,status:'queued'};
   records.push(receipt);this.events.emit(session);return receipt;
  });this.pending=operation;return operation;
 }
 async get(id,session){
  this.requireSession(session);if(!ID.test(id||''))throw new StoreError(400,'Invalid submission id.');
  const receipt=this.sessions.get(session).find(r=>r.id===id);if(!receipt)throw new StoreError(404,'Submission not found in this session.');
  return JSON.parse(await readFile(path.join(this.root,id+'.json'),'utf8'));
 }
 receipt(id,session){this.requireSession(session);const item=this.sessions.get(session).find(r=>r.id===id);if(!item)throw new StoreError(404,'Submission not found.');return item}
 delivered(id,session){const r=this.receipt(id,session);r.status='delivered';r.deliveredAt=new Date().toISOString()}
 async wait(session,after,timeoutMs,signal){
  this.requireSession(session);const next=()=>this.sessions.get(session).find(r=>r.sequence>after);
  if(!next()&&timeoutMs>0&&!signal?.aborted)await new Promise(resolve=>{
   let timer;const done=()=>{clearTimeout(timer);this.events.off(session,done);signal?.removeEventListener('abort',done);resolve()};
   this.events.on(session,done);signal?.addEventListener('abort',done,{once:true});timer=setTimeout(done,timeoutMs);
   if(next()||signal?.aborted)done();
  });const receipt=next();return receipt?this.get(receipt.id,session):null;
 }
}
