// Pure geographic/data functions shared by the viewer and regression checks.
export function chainageLabel(metres) {
  const value = Math.round(metres);
  return `K${Math.floor(value / 1000)}+${String(value % 1000).padStart(3, '0')}`;
}

export function distanceMetres(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function prepareRoadData(source) {
  const records = source.records.map(raw => {
    if (raw.coordinates?.length !== 2 || raw.coordinates.some(x => !Number.isFinite(x)) || Math.abs(raw.coordinates[0]) > 180 || Math.abs(raw.coordinates[1]) >= 85 || !Number.isFinite(raw.rawChainage)) throw Error('G214 点位格式无效');
    // Preserve source units and retain ambiguous values for review.
    const inferredKilometres = source.chainageUnit !== 'metres' && raw.rawChainage < 10000;
    const chainage = inferredKilometres ? Math.round(raw.rawChainage * 1000) : raw.rawChainage;
    return {...raw, coordinates: [...raw.coordinates], chainage, label: chainageLabel(chainage), issues: inferredKilometres ? [{type: 'unit', text: `原值 ${raw.rawChainage}，按公里暂读为 ${chainageLabel(chainage)}，单位待确认。`}] : []};
  });
  if (new Set(records.map(r => r.id)).size !== records.length) throw Error('G214 点位 ID 重复');
  const milestones = records.filter(r => r.kind === 'milestone').sort((a, b) => a.chainage - b.chainage);
  const bridges = records.filter(r => r.kind === 'bridge').sort((a, b) => a.chainage - b.chainage);
  if (milestones.length < 2) throw Error('里程点不足，无法建立线路');
  const segments = milestones.slice(1).map((to, i) => {
    const from = milestones[i], gap = to.chainage - from.chainage;
    if (gap <= 0) throw Error('里程桩号重复或顺序无效');
    const distance = distanceMetres(from.coordinates, to.coordinates);
    return {from, to, distance, suspect: distance > Math.max(2000, gap * 3)};
  });
  // Isolated spikes have long incoming AND outgoing segments. Do not move them.
  milestones.forEach((record, i) => {
    if (segments[i - 1]?.suspect && segments[i]?.suspect) record.issues.push({type: 'coordinate', text: `前后相邻桩点直距分别为 ${(segments[i - 1].distance / 1000).toFixed(2)} / ${(segments[i].distance / 1000).toFixed(2)} km，与桩号间距差异较大，坐标待核对。`});
  });
  for (const bridge of bridges) {
    const segment = segments.find(s => s.from.chainage <= bridge.chainage && bridge.chainage <= s.to.chainage);
    if (!segment) { bridge.issues.push({type: 'range', text: '中心桩号不在里程表范围内。'}); continue; }
    const t = (bridge.chainage - segment.from.chainage) / (segment.to.chainage - segment.from.chainage);
    const interpolated = segment.from.coordinates.map((value, i) => value + (segment.to.coordinates[i] - value) * t);
    const offset = distanceMetres(bridge.coordinates, interpolated);
    bridge.neighbours = [segment.from.label, segment.to.label];
    bridge.chainageOffsetMetres = offset;
    if (!segment.suspect && offset > 2000) bridge.issues.push({type: 'coordinate', text: `与同桩号的桩点插值位置相距约 ${(offset / 1000).toFixed(2)} km，请核对中心桩号及坐标。`});
  }
  return {...source, records, milestones, bridges, segments,
    issues: records.filter(r => r.issues.length),
    start: milestones[0], end: milestones.at(-1),
    spanMetres: milestones.at(-1).chainage - milestones[0].chainage,
    wholeMilestones: milestones.filter(r => r.chainage % 1000 === 0).length,
    bounds: records.reduce((b, r) => [Math.min(b[0], r.coordinates[0]), Math.min(b[1], r.coordinates[1]), Math.max(b[2], r.coordinates[0]), Math.max(b[3], r.coordinates[1])], [180, 90, -180, -90])};
}

export function mercator([lon, lat]) {
  return [lon, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI];
}

export function roadProjection(bounds) {
  const sw = mercator(bounds.slice(0, 2)), ne = mercator(bounds.slice(2));
  const scale = 94 / Math.max(ne[0] - sw[0], ne[1] - sw[1]);
  return coordinate => {
    const p = mercator(coordinate);
    return [(p[0] - (sw[0] + ne[0]) / 2) * scale, -(p[1] - (sw[1] + ne[1]) / 2) * scale];
  };
}

// Clip existing administrative rings to the route window, preserving geography.
export function clipRing(ring, bounds) {
  let output = ring.slice();
  for (const [axis, edge, sign] of [[0, bounds[0], 1], [0, bounds[2], -1], [1, bounds[1], 1], [1, bounds[3], -1]]) {
    const input = output; output = [];
    if (!input.length) break;
    let previous = input.at(-1), previousInside = (previous[axis] - edge) * sign >= 0;
    for (const point of input) {
      const inside = (point[axis] - edge) * sign >= 0;
      if (inside !== previousInside) {
        const t = (edge - previous[axis]) / (point[axis] - previous[axis]);
        output.push(previous.map((v, i) => v + (point[i] - v) * t));
      }
      if (inside) output.push(point);
      previous = point; previousInside = inside;
    }
  }
  return output;
}
