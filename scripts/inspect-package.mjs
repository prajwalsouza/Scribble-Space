import {readFile} from 'node:fs/promises';
import {unzipStore,digest} from '../shared/archive.mjs';
import {validateShot,referencedAssets} from '../shared/document.mjs';
const filename=process.argv[2];if(!filename)throw Error('Usage: node scripts/inspect-package.mjs capture.sm3dl.zip');
const files=unzipStore(await readFile(filename));const parse=p=>JSON.parse(new TextDecoder().decode(files[p]));const manifest=parse('manifest.json');if(manifest.format!=='sm3dl'||!['0.1.0','0.2.0'].includes(manifest.version))throw Error('Unsupported format.');
for(const entry of manifest.files){if(!files[entry.path]||files[entry.path].length!==entry.bytes||await digest(files[entry.path])!==entry.sha256)throw Error('Integrity failure: '+entry.path)}
const views=manifest.views.map(p=>validateShot(parse(p)));for(const view of views)for(const id of referencedAssets(view)){if(!files['assets/'+id]||await digest(files['assets/'+id])!==id.slice(0,64))throw Error('Invalid asset: '+id)}
console.log(JSON.stringify({format:manifest.format,version:manifest.version,files:Object.keys(files).length,views:views.map(v=>({id:v.id,title:v.title,note:v.note,marks:v.marks.length,template:v.workspace.template,camera:v.camera.position}))},null,2));
