// Coordinates are longitude/latitude. Preserve supplied geometry, including holes.
export function polygons(feature) {
  const g = feature.geometry;
  return g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
}

export function normalizeRegions(data, defaults = {}) {
  if (data?.type !== 'FeatureCollection') throw Error('边界文件不是 GeoJSON FeatureCollection');
  const features = [];
  for (const f of data.features || []) {
    const rings = polygons(f);
    if (!rings.length) continue;
    const p = {...f.properties};
    const code = String(p.adcode || p.gb?.replace(/^156/, '') || '');
    if (!/^\d{6,12}$/.test(code) || !p.name) continue;
    const coords = rings.flatMap(poly => poly[0]);
    if (!coords.length || coords.some(c => !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) >= 85)) throw Error('边界坐标无效，需提供经纬度数据');
    const bbox = coords.reduce((b, c) => [Math.min(b[0],c[0]),Math.min(b[1],c[1]),Math.max(b[2],c[0]),Math.max(b[3],c[1])], [180,90,-180,-90]);
    const reference = defaults[code] || {};
    features.push({...f, bbox, properties:{...reference,...p,adcode:code,level:p.level || reference.level || (code.length > 6 ? 'town' : /0000$/.test(code) ? 'province' : /00$/.test(code) ? 'city' : 'district'),center:p.center || p.centroid || reference.centroid || reference.center || [(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2]}});
  }
  if (!features.length) throw Error('文件没有可用的行政区面边界');
  return {...data, features, boundaryLines:data.boundaryLines || (data.features || []).filter(f=>['MultiLineString','LineString'].includes(f.geometry?.type))};
}

export async function readJson(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  try {
    const r = await fetch(url, {signal:controller.signal});
    if (!r.ok) throw Error(`边界加载失败 (${r.status})`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export function createRegionStore(manifest) {
  const cache = new Map();
  return {
    has: code => Boolean(manifest.views[String(code)]),
    async get(code) {
      code = String(code);
      if (cache.has(code)) return cache.get(code);
      const entry = manifest.views[code];
      if (!entry) throw Error('暂缺下级边界数据');
      const data = normalizeRegions(await readJson('./assets/'+entry.file));
      cache.set(code, data);
      return data;
    },
  };
}
