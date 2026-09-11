// Publish the complete static app, including on-demand boundary/radar assets.
// Vite's bundle alone does not copy these runtime-loaded files.
import fs from 'node:fs/promises';
import {auditPublic} from './audit-public.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const revision=process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid release revision');
const output=new URL(`.pages-dist/${revision}/`,root);
await auditPublic(fileURLToPath(new URL('dist/client/',root)));
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(output,{recursive:true});
await fs.cp(new URL('dist/client/',root),output,{recursive:true});
const entry=new URL('index.html',output);
let html=await fs.readFile(entry,'utf8');
html=html.replace(/app\.js\?v=[^"']+/,`app.js?v=${revision}`)
  .replace(/style\.css\?v=[^"']+/,`style.css?v=${revision}`)
  .replace('href="regions.css"',`href="regions.css?v=${revision}"`)
  .replace(/road\.css\?v=[^"']+/,`road.css?v=${revision}`)
  .replace('下钻版 · 本地预览',`下钻版 · ${revision.slice(0,7)}`);
if(!html.includes('id="region-select"') || !html.includes(revision))throw Error('Missing drill-down UI or revision');
await fs.writeFile(entry,html);
for (const name of ['app.js','road-scene.js']) {
  const file=new URL(name,output);
  const source=await fs.readFile(file,'utf8');
  await fs.writeFile(file,source.replace(/(from\s+['"]\.\/[^'"?]+\.js)(['"])/g,`$1?v=${revision}$2`));
}

await fs.writeFile(new URL('release.json',output),JSON.stringify({revision},null,2));
await fs.writeFile(new URL('.nojekyll',output),'');
const manifest=JSON.parse(await fs.readFile(new URL('assets/regions/manifest.json',output),'utf8'));
for(const {file} of Object.values(manifest.views))await fs.access(new URL('assets/'+file,output));
for(const file of ['app.js','region-data.js','road-scene.js','road-data.js','road.css','assets/roads/road.json','assets/540300.json','assets/three.module.js','assets/radar/cref-202608260054-0212.png'])await fs.access(new URL(file,output));
await auditPublic(fileURLToPath(output));
console.log(`Ready: ${fileURLToPath(output)} (${Object.keys(manifest.views).length} boundary collections)`);
