// Dependency-free, loopback-only server supervised by the user's launchd agent.
import http from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
export const requiredFiles = ['index.html','app.js','road-scene.js','road-data.js','road.css','assets/three.module.js','assets/regions/manifest.json','assets/540300.json','assets/roads/road.json'];

export function createLocalServer(root) {
  const started = new Date().toISOString();
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, text, contentType = 'text/plain; charset=utf-8') => {
      response.writeHead(status, {'Content-Type':contentType}); response.end(request.method === 'HEAD' ? undefined : text);
    };
    if (!['GET','HEAD'].includes(request.method)) { response.setHeader('Allow','GET, HEAD'); return reply(405, 'Method not allowed'); }
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(request.headers.host || '')) return reply(403, 'Local access only');
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { return reply(400, 'Invalid URL'); }
    if (pathname.includes('\0') || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) return reply(403, 'Not available');
    try {
      // Resolve the current deployment for each request, so atomic updates work.
      const realRoot = await fs.realpath(root);
      if (pathname === '/_blue-atlas/health') {
        await Promise.all(requiredFiles.map(file => fs.access(path.join(realRoot, file))));
        const release = JSON.parse(await fs.readFile(path.join(realRoot, 'local-release.json'), 'utf8'));
        return reply(200, JSON.stringify({service:'blue-atlas-local',status:'ok',pid:process.pid,started,revision:release.revision}), 'application/json; charset=utf-8');
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const candidate = path.resolve(realRoot, relative);
      if (!candidate.startsWith(realRoot + path.sep)) return reply(403, 'Not available');
      const actual = await fs.realpath(candidate);
      if (!actual.startsWith(realRoot + path.sep)) return reply(403, 'Not available');
      const stat = await fs.stat(actual);
      if (!stat.isFile()) return reply(404, 'Not found');
      response.writeHead(200, {'Content-Type':mime[path.extname(actual).toLowerCase()] || 'application/octet-stream','Content-Length':stat.size});
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(actual);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (pathname === '/_blue-atlas/health') return reply(503, JSON.stringify({service:'blue-atlas-local',status:'assets-unavailable'}), 'application/json; charset=utf-8');
      if (['ENOENT','ENOTDIR'].includes(error.code)) return reply(404, 'Not found');
      console.error(new Date().toISOString(), 'Request failed:', error.code || error.message);
      return reply(500, 'Unable to read map assets');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), rootIndex = args.indexOf('--root'), portIndex = args.indexOf('--port');
  if (rootIndex < 0 || !args[rootIndex + 1]) throw Error('Missing --root');
  const root = path.resolve(args[rootIndex + 1]), port = portIndex < 0 ? 5174 : Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
  const server = createLocalServer(root);
  server.on('error', error => { console.error(error.code, error.message); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(new Date().toISOString(), `Blue Atlas ready at http://127.0.0.1:${port}`));
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
