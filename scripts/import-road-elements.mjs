// Import the supplied API JSON into the ignored local data directory.
// This script never writes to dist/client and never publishes the source payload.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePilePoint} from '../dist/client/road-elements.js';

const input = process.argv[2];
if (!input) throw Error('用法：node scripts/import-road-elements.mjs /path/to/elements.json');
const source = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'));
if (source.code !== 200 || !source.data?.pilePointFcstElementVos) throw Error('输入不是道路要素接口 JSON');
for (const group of source.data.pilePointFcstElementVos) for (const point of group.fcstElementTime || []) parsePilePoint(point.pilePoint);
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.private/road-elements.json');
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, JSON.stringify(source.data, null, 2) + '\n');
console.log(JSON.stringify({output, elements: source.data.pilePointFcstElementVos.length, points: source.data.pilePointFcstElementVos.reduce((n, group) => n + group.fcstElementTime.length, 0)}, null, 2));
