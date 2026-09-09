import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeRegions,createRegionStore,readJson} from '../dist/client/region-data.js';
const assets=new URL('../dist/client/assets/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,assets),'utf8'));

test('all indexed boundary files are valid; national codes are unique',async()=>{
  const manifest=await read('regions/manifest.json');
  const national=normalizeRegions(await read(manifest.views['100000'].file));
  assert.equal(national.features.length,34);
  assert.equal(new Set(national.features.map(f=>f.properties.adcode)).size,34);
  assert.equal(national.boundaryLines.length,8);
  for(const [code,entry] of Object.entries(manifest.views)){
    const data=normalizeRegions(await read(entry.file));
    assert.equal(data.features.length,entry.count,code);
    assert.equal(new Set(data.features.map(f=>f.properties.adcode)).size,data.features.length,code);
    assert.ok(data.features.every(f=>f.properties.center?.length===2),code);
  }
});

test('store caches success, retries failure and rejects missing levels',async()=>{
  const original=globalThis.fetch;
  const data=await read('510100.json');
  let calls=0;
  globalThis.fetch=async()=>{calls++;if(calls===1)return {ok:false,status:503};return {ok:true,json:async()=>data};};
  try{
    const store=createRegionStore({views:{'510100':{file:'510100.json'}}});
    assert.equal(store.has('510104'),false);
    await assert.rejects(store.get('510104'),/暂缺/);
    await assert.rejects(store.get('510100'),/503/);
    const result=await store.get('510100');
    assert.equal(await store.get('510100'),result);
    assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
});

test('slow requests abort instead of spinning forever',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  try{await assert.rejects(readJson('slow.json',10),/aborted/);}finally{globalThis.fetch=original;}
});

test('township polygons with holes remain intact and invalid coordinates fail',()=>{
  const feature={type:'Feature',properties:{name:'测试乡镇',adcode:'510104001',level:'town'},geometry:{type:'Polygon',coordinates:[[[104,30],[105,30],[105,31],[104,30]],[[104.2,30.2],[104.3,30.2],[104.3,30.3],[104.2,30.2]]]}};
  const normalized=normalizeRegions({type:'FeatureCollection',features:[feature]});
  assert.equal(normalized.features[0].geometry,feature.geometry);
  assert.equal(normalized.features[0].properties.level,'town');
  feature.geometry.coordinates[0][0]=[999,999];
  assert.throws(()=>normalizeRegions({type:'FeatureCollection',features:[feature]}),/坐标无效/);
});
