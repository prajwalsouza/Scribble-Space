import {mkdir,copyFile,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),target=path.resolve(process.argv[2]||'dist');
if(target===root)throw Error('Choose a separate output folder.');
const files=['editor.html','demo.html','README.md','LICENSE','THIRD-PARTY.md'];
async function walk(folder){for(const e of await readdir(path.join(root,folder),{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=folder+'/'+e.name;if(e.isDirectory())await walk(p);else files.push(p)}}
for(const dir of ['public','shared','vendor','spec','docs'])await walk(dir);
const inventory=[];for(const file of files){const bytes=await readFile(path.join(root,file));await mkdir(path.dirname(path.join(target,file)),{recursive:true});await copyFile(path.join(root,file),path.join(target,file));inventory.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}
await copyFile(path.join(root,'demo.html'),path.join(target,'index.html'));await writeFile(path.join(target,'release.json'),JSON.stringify({app:'scribble-space',version:'0.1.0',files:inventory},null,2));console.log(`Published ${files.length} static files to ${target}`);
