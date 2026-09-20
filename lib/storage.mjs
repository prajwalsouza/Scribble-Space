import {inspectGLB} from '../shared/model.mjs';
import {mkdir,readFile,writeFile,rename,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ASSET,ID,validateShot,immutableCapture,referencedAssets} from '../shared/document.mjs';
export class StoreError extends Error{constructor(status,message){super(message);this.status=status}}
export function pngDimensions(bytes){if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw new StoreError(400,'Choose a PNG image.');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width<1||height<1||width>4096||height>4096||width*height>12e6)throw new StoreError(400,'Image dimensions are too large.');return {width,height}}
export class ShotStore{
 constructor(root){this.root=path.resolve(root);this.assets=path.join(this.root,'assets');this.shots=path.join(this.root,'shots');this.locks=new Map()}
 async init(){await mkdir(this.assets,{recursive:true});await mkdir(this.shots,{recursive:true})}
 async putAsset(bytes,type='image/png'){if(bytes.length>(type==='model/gltf-binary'?64e6:12e6))throw new StoreError(413,'Image is too large.');let dimensions={};if(type==='model/gltf-binary'){try{inspectGLB(bytes)}catch(e){throw new StoreError(400,e.message)}}else dimensions=pngDimensions(bytes);const id=createHash('sha256').update(bytes).digest('hex')+(type==='model/gltf-binary'?'.glb':'.png');try{await writeFile(path.join(this.assets,id),bytes,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}return {id,...dimensions}}
 assetPath(id){if(!ASSET.test(id))throw new StoreError(400,'Invalid image id.');return path.join(this.assets,id)}
 shotPath(id){if(!ID.test(id))throw new StoreError(400,'Invalid view id.');return path.join(this.shots,id+'.json')}
 async get(id){try{return JSON.parse(await readFile(this.shotPath(id),'utf8'))}catch(e){if(e.code==='ENOENT')throw new StoreError(404,'View not found.');throw e}}
 async list(){const names=(await readdir(this.shots)).filter(n=>n.endsWith('.json'));const records=await Promise.all(names.map(async n=>{try{const d=await this.get(n.slice(0,-5));return{id:d.id,title:d.title,note:d.note.slice(0,120),preview:d.preview||d.capture.asset,revision:d.revision,updatedAt:d.updatedAt,markCount:d.marks.length,sceneId:d.scene.id}}catch{return null}}));return records.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
 async save(raw,expectedRevision){let next;try{next=validateShot(raw)}catch(e){throw new StoreError(400,e.message)}const id=next.id;const previous=this.locks.get(id)||Promise.resolve();const operation=previous.catch(()=>{}).then(async()=>{
  let old=null;try{old=await this.get(id)}catch(e){if(e.status!==404)throw e}
  if(old&&old.revision!==expectedRevision||!old&&expectedRevision)throw new StoreError(409,'This view changed in another tab. Save a copy to keep both versions.');
  if(old&&immutableCapture(old)!==immutableCapture(next))throw new StoreError(400,'A saved view keeps its original camera and screenshot. Capture a new view instead.');
  for(const asset of referencedAssets(next)){try{await stat(this.assetPath(asset))}catch{throw new StoreError(400,'An image has not finished uploading.')}}
  const dimensions=pngDimensions(await readFile(this.assetPath(next.capture.asset)));if(dimensions.width!==next.capture.width||dimensions.height!==next.capture.height)throw new StoreError(400,'Screenshot dimensions do not match.');
  const now=new Date().toISOString();const document={...next,revision:randomUUID(),createdAt:old?.createdAt||now,updatedAt:now};const file=this.shotPath(id),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(document,null,2));await rename(temp,file);return document;
 });this.locks.set(id,operation);try{return await operation}finally{if(this.locks.get(id)===operation)this.locks.delete(id)}}
}
