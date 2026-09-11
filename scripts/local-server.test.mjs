import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {createLocalServer,requiredFiles} from './local-server.mjs';

test('stable local server serves modules/data, bypasses stale cache and confines files to site', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'blue-atlas-server-test-'));
  const root = path.join(temporary,'site'); await fs.mkdir(root);
  for (const file of requiredFiles) { await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true}); await fs.writeFile(path.join(root,file),file.endsWith('.json')?'{}':'map-content'); }
  await fs.writeFile(path.join(root,'local-release.json'),JSON.stringify({revision:'release-one'}));
  await fs.writeFile(path.join(temporary,'outside.txt'),'private'); await fs.symlink(path.join(temporary,'outside.txt'),path.join(root,'link.txt'));
  const server = createLocalServer(root); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(origin+'/?scene=g214'); assert.equal(home.status,200); assert.match(home.headers.get('content-type'),/text\/html/); assert.equal(home.headers.get('cache-control'),'no-store');
    const module = await fetch(origin+'/app.js?v=old'); assert.match(module.headers.get('content-type'),/javascript/); assert.equal(await module.text(),'map-content');
    await fs.writeFile(path.join(root,'app.js'),'new-content'); assert.equal(await (await fetch(origin+'/app.js?v=old')).text(),'new-content');
    const head = await fetch(origin+'/app.js',{method:'HEAD'}); assert.equal(await head.text(),''); assert.equal(head.headers.get('content-length'),'11');
    const data = await fetch(origin+'/assets/roads/road.json'); assert.match(data.headers.get('content-type'),/application\/json/);
    const health = await (await fetch(origin+'/_blue-atlas/health')).json(); assert.equal(health.service,'blue-atlas-local'); assert.equal(health.revision,'release-one');
    assert.equal((await fetch(origin+'/link.txt')).status,403); assert.equal((await fetch(origin+'/.git/config')).status,403);
    assert.equal((await fetch(origin+'/missing.js')).status,404); assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
    const traversal = await new Promise(resolve => http.get(origin+'/%2e%2e%2foutside.txt',r => {r.resume();resolve(r.statusCode);})); assert.equal(traversal,403);
    await fs.unlink(path.join(root,'assets/roads/road.json')); assert.equal((await fetch(origin+'/_blue-atlas/health')).status,503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(temporary,{recursive:true,force:true}); }
});
