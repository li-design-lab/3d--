import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prepareRoadData,chainageLabel} from '../dist/client/road-data.js';
import {makeDemo} from './generate-road-demo.mjs';
import {auditPublic} from './audit-public.mjs';
test('public data is reproducible and independent',async()=>{
 const stored=JSON.parse(await fs.readFile(new URL('../dist/client/assets/roads/road.json',import.meta.url)));
 assert.deepEqual(stored,makeDemo());
 const data=prepareRoadData(stored);
 assert.equal(data.records.length,69);assert.equal(data.bridges.length,8);assert.equal(data.spanMetres,60000);assert.equal(data.issues.length,0);
 assert.equal(data.sourceSha256,undefined);
});
test('explicit metre units are respected for small chainages',()=>{
 const source=makeDemo();source.records=source.records.filter(r=>r.kind==='milestone').slice(0,2).map((r,i)=>({...r,rawChainage:i*1000}));
 const data=prepareRoadData(source);assert.equal(data.end.chainage,1000);assert.equal(chainageLabel(data.start.chainage),'K0+000');
});
test('coordinate spikes are reported without mutating input',()=>{
 const source=makeDemo();source.records[20].coordinates=[100,32];const original=structuredClone(source);
 const data=prepareRoadData(source);assert(data.records[20].issues.some(i=>i.type==='coordinate'));assert.deepEqual(source,original);
});
test('public static tree passes privacy audit',async()=>{await auditPublic(fileURLToPath(new URL('../dist/client',import.meta.url)));});
