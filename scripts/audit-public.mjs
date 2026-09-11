import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {makeDemo, makeDemoElements} from './generate-road-demo.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function auditPublic(directory) {
  const payload=JSON.parse(await fs.readFile(path.join(directory,'assets/roads/road.json'),'utf8'));
  const elementPayload=JSON.parse(await fs.readFile(path.join(directory,'assets/roads/elements.json'),'utf8'));
  if(JSON.stringify(payload)!==JSON.stringify(makeDemo()))throw Error('Public road payload must exactly match the independent demo generator');
  if(JSON.stringify(elementPayload)!==JSON.stringify(makeDemoElements(payload)))throw Error('Public element payload must exactly match the independent demo generator');
  const roads=await fs.readdir(path.join(directory,'assets/roads'));
  if(roads.length!==2||!roads.includes('road.json')||!roads.includes('elements.json'))throw Error('Unexpected road file in public assets');
  const files=(await fs.readdir(directory,{recursive:true,withFileTypes:true})).filter(f=>f.isFile()).map(f=>path.join(f.parentPath,f.name));
  await auditFiles(files);
  return files.length;
}
async function auditFiles(files) {
  let privateData;
  try{privateData=JSON.parse(await fs.readFile(path.join(root,'.private/road.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const forbidden=privateData?[privateData.sourceFile,privateData.sourceSha256,...privateData.records.filter(r=>r.kind==='bridge'&&r.name?.length>2).map(r=>r.name)].filter(Boolean):[];
  for(const file of files){
    if(/\.(xlsx?|csv|nc)$/i.test(file)||file.split(path.sep).includes('.private'))throw Error('Private file type in public tree: '+path.relative(root,file));
    if(!/\.(js|mjs|py|json|md|html|css|txt)$/i.test(file))continue;
    const text=await fs.readFile(file,'utf8');
    if(forbidden.some(value=>text.includes(value)))throw Error('Private source metadata found: '+path.relative(root,file));
    if(privateData?.records.some(r=>new RegExp(r.coordinates.map(v=>String(v).replaceAll('.','\\.')).join('\\s*,\\s*')).test(text)))throw Error('Private coordinate pair found: '+path.relative(root,file));
  }
}
if(process.argv[1] && import.meta.url===new URL(process.argv[1],'file:').href){
  const directory=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'dist/client');
  const count=await auditPublic(directory);
  const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(f=>path.join(root,f));
  await auditFiles(sourceFiles);
  console.log(`Public privacy audit passed: ${count} static files; ${sourceFiles.length} source files.`);
}
