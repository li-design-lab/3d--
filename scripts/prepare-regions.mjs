// Usage: node scripts/prepare-regions.mjs /path/to/中国_省.geojson [--fetch-cities]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeRegions} from '../dist/client/region-data.js';
const assets = fileURLToPath(new URL('../dist/client/assets/',import.meta.url));
const old = JSON.parse(await fs.readFile(path.join(assets,'100000.json'),'utf8'));
const defaults = Object.fromEntries(old.features.map(f=>[String(f.properties.adcode),f.properties]));
const supplied = JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const national = normalizeRegions(supplied,defaults);
await fs.mkdir(path.join(assets,'regions'),{recursive:true});
await fs.writeFile(path.join(assets,'regions/provinces.json'),JSON.stringify(national));
const views = {'100000':{file:'regions/provinces.json',source:'用户提供：中国_省.geojson',count:national.features.length}};
const missing = [];
async function load(code, download=false) {
  try {return normalizeRegions(JSON.parse(await fs.readFile(path.join(assets,code+'.json'),'utf8')));} catch {}
  if (!download) return null;
  const url = `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`;
  try {
    const r = await fetch(url,{signal:AbortSignal.timeout(12000)});
    if (!r.ok) throw Error(String(r.status));
    const data=normalizeRegions(await r.json());
    if (data.features.every(f=>f.properties.adcode===code)) return null;
    await fs.writeFile(path.join(assets,code+'.json'),JSON.stringify(data));
    return data;
  } catch (e) {missing.push({code,reason:e.message});return null;}
}
let queue=national.features.map(f=>f.properties.adcode);
const visited=new Set();
while(queue.length) {
  const next=[];
  for(let start=0;start<queue.length;start+=6) {
    await Promise.all(queue.slice(start,start+6).map(async code=>{
      if(visited.has(code)) return; visited.add(code);
      const data=await load(code,process.argv.includes('--fetch-cities'));
      if(!data) return;
      views[code]={file:code+'.json',source:'既有边界 / DataV GeoAtlas',count:data.features.length};
      for(const f of data.features) if(f.properties.level==='city' && Number(f.properties.childrenNum)>0) next.push(f.properties.adcode);
    }));
  }
  queue=next;
}
// Additional district files can hold township polygons, without changing UI code.
for(const name of await fs.readdir(assets)) {
  if(!/^\d{6,12}\.json$/.test(name)||name==='100000.json')continue;
  const code=name.slice(0,-5);
  const data=await load(code);
  if(data && data.features.some(f=>f.properties.adcode!==code)) views[code] ||= {file:name,source:'本地边界',count:data.features.length};
}
await fs.writeFile(path.join(assets,'regions/manifest.json'),JSON.stringify({views,missing},null,2));
console.log(JSON.stringify({provinceCount:national.features.length,boundaryLineGroups:national.boundaryLines.length,views:Object.keys(views).length,missing},null,2));
