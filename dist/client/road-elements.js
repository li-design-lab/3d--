// Road weather/condition elements keyed by route and pile point.
// The file intentionally contains no coordinates; positions are joined to the
// road asset data by chainage so the same payload can drive local and demo maps.
const ELEMENT_LABELS = {
  vis: '能见度',
  pre: '降水',
  road: '路面状态',
  t2: '2 米气温',
  tg2: '2 米地温',
  wind: '风速',
};

export function elementLabel(code) {
  return ELEMENT_LABELS[code] || code;
}

export function parsePilePoint(value) {
  const match = /^K(\d+)(?:\+(\d{1,3}))?$/i.exec(String(value ?? '').trim());
  if (!match) throw Error(`道路桩点格式无效：${value}`);
  return Number(match[1]) * 1000 + Number(match[2] || 0);
}

export function prepareRoadElements(source) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.pilePointFcstElementVos)) throw Error('道路要素数据格式无效');
  const elements = source.pilePointFcstElementVos.map(group => {
    if (!group?.element || !Array.isArray(group.fcstElementTime)) throw Error('道路要素分组格式无效');
    const points = new Map();
    for (const item of group.fcstElementTime) {
      if (!['G214', 'DEMO'].includes(item.roadCode) || !item.pilePoint) throw Error('道路要素缺少有效道路桩点');
      const chainage = parsePilePoint(item.pilePoint);
      const value = Number(item.elementValue);
      if (!Number.isFinite(value) || !/^#[0-9a-f]{6}$/i.test(item.elementLevelHexColor || '')) throw Error(`道路要素值无效：${group.element}`);
      if (points.has(chainage)) throw Error(`道路要素桩点重复：${item.pilePoint}`);
      points.set(chainage, {
        element: group.element,
        elementLabel: elementLabel(group.element),
        chainage,
        pilePoint: item.pilePoint,
        value,
        unit: String(item.elementUnit || ''),
        level: String(item.elementLevel ?? ''),
        levelDesc: String(item.elementLevelDesc || ''),
        levelColor: String(item.elementLevelColor || ''),
        levelHexColor: item.elementLevelHexColor.toUpperCase(),
      });
    }
    return {code: group.element, label: elementLabel(group.element), points};
  });
  const byChainage = new Map();
  for (const group of elements) for (const [chainage, point] of group.points) {
    const row = byChainage.get(chainage) || {};
    row[group.code] = point;
    byChainage.set(chainage, row);
  }
  return {
    ...source,
    elements,
    byChainage,
    elementCount: elements.length,
    pileCount: new Set([...byChainage.keys()]).size,
  };
}

export function attachRoadElements(data, elementData) {
  const records = data.records.map(record => ({...record, elementValues: elementData.byChainage.get(record.chainage) || {}}));
  const byId = new Map(records.map(record => [record.id, record]));
  const milestones = data.milestones.map(record => byId.get(record.id));
  const bridges = data.bridges.map(record => byId.get(record.id));
  const segments = data.segments.map(segment => ({...segment, from: byId.get(segment.from.id), to: byId.get(segment.to.id)}));
  return {...data, records, milestones, bridges, segments, start: byId.get(data.start.id), end: byId.get(data.end.id)};
}
