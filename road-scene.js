import {readJson} from './region-data.js?v=4e26be6f9bfc05ad96277602e1c84d3efe21c59c';
import * as THREE from 'three';
import {prepareRoadData, roadProjection, chainageLabel, mercator} from './road-data.js?v=4e26be6f9bfc05ad96277602e1c84d3efe21c59c';

const CYAN = '#65e7ff', GOLD = '#ffbd68', ICE = '#d3f7ff';
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function createRoadScene({scene, camera, controls, renderer, notice, onNavigate}) {
  const getJson = readJson;
  const [source, boundary] = await Promise.all([getJson('./assets/roads/road.json'), getJson('./assets/540300.json')]);
  const data = prepareRoadData(source), project = roadProjection(data.bounds);
  const demo = data.mode === 'synthetic';
  const routeName = demo ? 'DEMO' : 'G214';
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const surface = new THREE.Group(), route = new THREE.Group(), milestones = new THREE.Group(), bridges = new THREE.Group(), anomalies = new THREE.Group();
  root.add(surface, route, milestones, bridges, anomalies);
  const groups = {route, milestones, bridges, anomalies};
  const flags = {route: true, milestones: true, bridges: true, anomalies: true, labels: true};
  const projected = new Map(data.records.map(r => { const [x, z] = project(r.coordinates); return [r.id, vector(x, .8, z)]; }));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, selected = data.start, filter = 'all', query = '', playing = false, lastStep = 0, cameraMove = null;
  let lastLayout = 0, dragStart = null;
  const labels = [], pickables = [], animated = [], flowSegments = [];
  const markerById = new Map();
  const ui = document.createElement('section'); ui.id = 'road-workspace'; ui.hidden = true;
  ui.setAttribute('aria-label', '昌都 G214 公路数据工作台');
  ui.innerHTML = `
    <nav class="road-breadcrumbs" aria-label="公路下钻路径">${[['100000','中国'],['540000','西藏自治区'],['540300','昌都市'],['540302','卡若区']].map(([code,name])=>`<button data-road-region="${code}">${name}</button><span> / </span>`).join('')}<strong>公路资产</strong><button class="road-up" data-road-region="540302">↑ 返回区县</button></nav>
    <header class="road-header"><div class="road-brand"><span class="road-brand-icon">◈</span> BLUE ATLAS <span>公路资产</span></div>
      <h1>昌都 <span>${routeName}</span></h1><p>${demo ? '演示数据 · 非真实道路' : '卡若养护段'} <span class="road-divider">/</span> 桩点与桥梁</p>
    </header>
    <div class="road-metrics" aria-label="点位统计">
      <div><span>桩号跨度 <small>km</small></span><strong>${(data.spanMetres / 1000).toFixed(3)}</strong></div>
      <div><span>整公里桩 <small>个</small></span><strong>${data.wholeMilestones}</strong></div>
      <div><span>起终点 <small>个</small></span><strong>2</strong></div>
      <div><span>桥梁 <small>座</small></span><strong>${data.bridges.length}</strong></div>
    </div>
    <div class="road-source-status"><i></i> ${demo ? '公开演示 · 虚构线路' : '本机私有数据'} <span>${data.records.length} 条记录</span></div>
    <button class="road-catalog-toggle" aria-expanded="false" aria-controls="road-catalog">资产目录</button>
    <aside id="road-catalog" class="road-catalog road-surface" aria-label="沿线资产目录">
      <div class="road-panel-heading"><h2>沿线资产</h2><span id="road-result-count"></span></div>
      <label class="road-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input id="road-search" aria-label="搜索桩号或桥梁" placeholder="搜索桩号 / 桥梁名称" autocomplete="off"></label>
      <div class="road-filters" aria-label="资产类型"><button data-road-filter="all" aria-pressed="true">全部</button><button data-road-filter="milestone" aria-pressed="false">桩点</button><button data-road-filter="bridge" aria-pressed="false">桥梁</button><button data-road-filter="issues" aria-pressed="false">待核对 ${data.issues.length}</button></div>
      <div id="road-list" class="road-list" role="list" aria-label="资产搜索结果"></div>
      <div class="road-catalog-foot"><span class="legend-dot"></span> 桩点 <span class="legend-diamond"></span> 桥梁 <span class="legend-dot warning"></span> 待核对</div>
    </aside>
    <aside class="road-inspector road-surface" aria-label="选中资产详情"><div class="road-panel-heading"><h2>点位详情</h2><span id="road-detail-type"></span></div><div id="road-detail" aria-live="polite"></div></aside>
    <div class="road-overview road-surface"><div class="road-panel-heading"><h2>昌都市域</h2><span>区域总览</span></div><div id="road-inset"></div><div class="road-inset-caption"><i></i> ${routeName} 数据范围</div></div>
    <div class="road-map-caption"><span class="road-live-mark"></span> ${routeName} <span>沿线空间分布</span><small>桩点连线示意 · 橙色虚线为待核对连接</small></div>
    <div class="road-map-controls" aria-label="公路地图视角"><button data-road-action="home" title="查看全线" aria-label="查看全线">⌖</button><button data-road-action="in" aria-label="放大公路地图">＋</button><button data-road-action="out" aria-label="缩小公路地图">−</button><button data-road-action="top" aria-label="公路俯视">俯视</button></div>
    <div class="road-layers road-surface" aria-label="公路图层"><span>图层</span><button data-road-layer="route" aria-pressed="true">沿线流光</button><button data-road-layer="milestones" aria-pressed="true">里程桩</button><button data-road-layer="bridges" aria-pressed="true">桥梁</button><button data-road-layer="anomalies" aria-pressed="true">待核对</button><button data-road-layer="labels" aria-pressed="true">标注</button></div>
    <section class="road-timeline road-surface" aria-label="里程巡览">
      <button id="road-play" aria-pressed="false"><span>▶</span> 沿线巡览</button><div class="road-timeline-body"><div class="road-timeline-labels"><span>${data.start.label} <small>起点</small></span><strong id="road-current-chainage">${data.start.label}</strong><span>${data.end.label} <small>终点</small></span></div><div class="road-range-wrap"><div id="road-timeline-marks"></div><input type="range" id="road-range" min="${data.start.chainage}" max="${data.end.chainage}" value="${data.start.chainage}" step="1" aria-label="选择里程桩点"></div><div class="road-timeline-ticks">${Array.from({length:5},(_,i)=>Math.ceil((data.start.chainage+data.spanMetres*i/5)/1000)).map(k => `<span style="left:${(k * 1000 - data.start.chainage) / data.spanMetres * 100}%">K${k}</span>`).join('')}</div></div>
      <button id="road-next" aria-label="下一里程桩">下一桩 →</button>
    </section>
    <div class="road-data-note">${demo ? '演示线路与资产均为虚构 · 县界使用已有地理数据' : '原表坐标系未注明 · 原始经纬度投影 · 视觉高度不表示高程'}</div>
    <div id="road-labels"></div>`;
  document.body.append(ui);
  const $ = selector => ui.querySelector(selector);
  const q = value => escapeHtml(value);
  ui.querySelectorAll('[data-road-region]').forEach(button=>button.onclick=()=>onNavigate(button.dataset.roadRegion));

  function line(points, color, opacity = 1, dashed = false) {
    const material = dashed ? new THREE.LineDashedMaterial({color, transparent: true, opacity, dashSize: .65, gapSize: .45, depthWrite: false}) : new THREE.LineBasicMaterial({color, transparent: true, opacity, depthWrite: false});
    const object = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    if (dashed) object.computeLineDistances();
    return object;
  }
  function label(text, position, className = '', record = null) {
    const el = document.createElement(record ? 'button' : 'span');
    el.className = 'road-label ' + className; el.textContent = text;
    if (record) { el.setAttribute('aria-label', `定位 ${record.name || record.label}`); el.onclick = () => choose(record, true); }
    $('#road-labels').append(el); labels.push({el, position, record, className});
  }

  // Full administrative outlines, softly fading into the surrounding space.
  // No bounding-box clipping, invented terrain, or positional smoothing.
  function soften(material) {
    material.transparent=true; material.depthWrite=false;
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 atlasWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\natlasWorld=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader='varying vec3 atlasWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor.a *= 1.-smoothstep(55.,120.,length(atlasWorld.xz));\n#include <dithering_fragment>');
    };
    return material;
  }
  const countyColors = ['#081d2a', '#092132', '#0b2638', '#071a28'];
  for (const [index, feature] of boundary.features.entries()) {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const polygon of polygons) {
      const ring = polygon[0];
      const points = ring.map(c => { const p = project(c); return new THREE.Vector2(p[0], -p[1]); });
      const shape = new THREE.Shape(points);
      for (const hole of polygon.slice(1)) shape.holes.push(new THREE.Path(hole.map(c => {const p=project(c);return new THREE.Vector2(p[0],-p[1]);})));
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:.35, bevelEnabled:false, steps:1}), [soften(new THREE.MeshBasicMaterial({color:countyColors[index%4],opacity:.86})),soften(new THREE.MeshBasicMaterial({color:'#16485d',opacity:.7}))]);
      mesh.rotation.x = -Math.PI / 2; surface.add(mesh);
      const outline = ring.map(c => {const p = project(c); return vector(p[0], .39, p[1]);}); outline.push(outline[0]);
      const border=line(outline,'#5793af',.32);soften(border.material);surface.add(border);
    }
    const c=feature.properties.centroid||feature.properties.center;
    if(c){const [x,z]=project(c);if(Math.hypot(x,z)<80)label(feature.properties.name,vector(x,.5,z),'county');}
  }
  label('N ↑',vector(0,1,-57),'north');

  const corridorMaterial = new THREE.MeshBasicMaterial({color: '#0c7bba', transparent: true, opacity: .22, depthWrite: false});
  const coreMaterial = new THREE.MeshBasicMaterial({color: new THREE.Color(CYAN).multiplyScalar(1.6), transparent: true, opacity: .94});
  for (const segment of data.segments) {
    const a = projected.get(segment.from.id), b = projected.get(segment.to.id);
    if (segment.suspect) { anomalies.add(line([a, b], GOLD, .7, true)); continue; }
    const path = new THREE.LineCurve3(a, b);
    route.add(new THREE.Mesh(new THREE.TubeGeometry(path, 1, .42, 8, false), corridorMaterial));
    route.add(new THREE.Mesh(new THREE.TubeGeometry(path, 1, .085, 8, false), coreMaterial));
    flowSegments.push({a, b});
  }
  const flow = new THREE.Group(); route.add(flow);
  for (let i = 0; i < 22; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.16, 6, 6), new THREE.MeshBasicMaterial({color: new THREE.Color(ICE).multiplyScalar(2.2)})); flow.add(dot);
  }
  const pinGeo = new THREE.SphereGeometry(.19, 8, 6), bridgeGeo = new THREE.OctahedronGeometry(.48);
  for (const record of data.records) {
    const p = projected.get(record.id), issue = record.issues.length > 0, isBridge = record.kind === 'bridge', special = !!record.note;
    const group = issue ? anomalies : isBridge ? bridges : milestones;
    const color = issue ? GOLD : isBridge ? ICE : CYAN;
    const material = new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(isBridge ? 1.4 : 1.1)});
    const marker = new THREE.Mesh(isBridge ? bridgeGeo : pinGeo, material); marker.position.copy(p); marker.userData.record = record;
    if (special) marker.scale.setScalar(1.65);
    if (isBridge) { marker.position.y += 1.2; group.add(line([p, marker.position], color, .6)); }
    if (special || issue) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 32), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false}));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(p).add(vector(0, .04, 0)); group.add(ring);
      animated.push({object: ring, issue});
    }
    group.add(marker); pickables.push(marker); markerById.set(record.id, marker);
    if (special || (isBridge && record.sequence % 5 === 1) || (!isBridge && record.chainage % 20000 === 0) || issue) {
      label(record.name || `${record.label}${record.note ? ' · ' + record.note : ''}`, marker.position.clone().add(vector(0, 1.5, 0)), issue ? 'issue' : special ? 'endpoint' : isBridge ? 'bridge' : '', record);
    }
  }

  const focus = new THREE.Group(); root.add(focus);
  const focusMaterial = new THREE.MeshBasicMaterial({color: new THREE.Color(CYAN).multiplyScalar(1.6), transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false});
  for (const radius of [.85, 1.5, 2.2]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + .06, 64), focusMaterial.clone()); ring.rotation.x = -Math.PI / 2; ring.position.y = .14; focus.add(ring);
  }
  const beamMaterial = new THREE.ShaderMaterial({uniforms: {color: {value: new THREE.Color(CYAN)}}, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 u;uniform vec3 color;void main(){float a=pow(1.-abs(u.x-.5)*2.,3.)*pow(1.-u.y,1.8);gl_FragColor=vec4(color*1.6,a*.65);}'});
  for (const angle of [0, Math.PI / 2]) { const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 10), beamMaterial); beam.rotation.y = angle; beam.position.y = 5; focus.add(beam); }
  const focusLabel = document.createElement('div'); focusLabel.className = 'road-focus-label'; $('#road-labels').append(focusLabel);

  function drawInset() {
    const coords = boundary.features.flatMap(f => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).flatMap(p => p[0]));
    const bounds = coords.map(mercator).reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [180, 180, -180, -180]);
    const k = Math.min(240 / (bounds[2] - bounds[0]), 105 / (bounds[3] - bounds[1]));
    const pos = c => { const p = mercator(c); return [130 + (p[0] - (bounds[0] + bounds[2]) / 2) * k, 60 - (p[1] - (bounds[1] + bounds[3]) / 2) * k]; };
    const path = list => list.map((c, i) => `${i ? 'L' : 'M'}${pos(c).map(v => v.toFixed(2)).join(',')}`).join(' ');
    $('#road-inset').innerHTML = `<svg viewBox="0 0 260 122" role="img" aria-label="真实昌都市县界及 G214 桩点范围">${boundary.features.map(f => `<path d="${(f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).map(p => p.map(r => path(r) + 'Z').join(' ')).join(' ')}" fill-rule="evenodd" fill="#0b2942" stroke="#397398" stroke-width=".7"/>`).join('')}${data.segments.map(s => `<path d="${path([s.from.coordinates, s.to.coordinates])}" fill="none" stroke="${s.suspect ? GOLD : CYAN}" stroke-width="1.5" ${s.suspect ? 'stroke-dasharray="2 2"' : ''}/>`).join('')}<circle id="road-inset-selection" r="3" fill="white"/><text x="241" y="18" fill="#9abed5" font-size="10">N ↑</text></svg>`;
    return pos;
  }
  const insetPosition = drawInset();
  $('#road-timeline-marks').innerHTML = data.bridges.map(r => `<i style="left:${(r.chainage - data.start.chainage) / data.spanMetres * 100}%" title="${q(r.name)} · ${r.label}"></i>`).join('');

  function rows() {
    const normalized = query.trim().toLowerCase();
    return data.records.filter(r => (filter === 'all' || (filter === 'issues' ? r.issues.length : r.kind === filter)) && (!normalized || `${r.name || ''} ${r.label} ${r.rawChainage} ${r.note}`.toLowerCase().includes(normalized))).sort((a, b) => a.chainage - b.chainage);
  }
  function renderList() {
    const result = rows(); $('#road-result-count').textContent = `${result.length} 条`;
    const container = $('#road-list'); container.replaceChildren();
    if (!result.length) { const p = document.createElement('p'); p.className = 'road-empty'; p.textContent = '未找到匹配点位，请尝试其他桩号或名称。'; container.append(p); }
    for (const r of result) {
      const button = document.createElement('button'); button.className = `road-record${r.id === selected.id ? ' selected' : ''}${r.issues.length ? ' has-issue' : ''}`;
      button.dataset.recordId = r.id; button.setAttribute('aria-pressed', String(r.id === selected.id));
      button.innerHTML = `<span class="record-symbol ${r.kind}">${r.kind === 'bridge' ? '◇' : '·'}</span><span><strong>${q(r.name || r.label)}</strong><small>${r.kind === 'bridge' ? r.label : q(r.note || '整公里桩')}${r.issues.length ? ' · 待核对' : ''}</small></span><span class="record-arrow">↗</span>`;
      button.onclick = () => choose(r, true); container.append(button);
    }
    ui.querySelectorAll('[data-road-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.roadFilter === filter)));
  }

  function renderDetail() {
    const r = selected, type = r.kind === 'bridge' ? '桥梁' : r.note || '整公里桩';
    $('#road-detail-type').textContent = type;
    $('#road-detail').innerHTML = `<div class="road-detail-kicker">${routeName} <span>${r.issues.length ? '待核对' : demo ? '虚构点位' : '原表点位'}</span></div><h3>${q(r.name || r.label)}</h3><p class="road-detail-sub">${r.kind === 'bridge' ? r.label : q(r.note || '里程碑编码 ' + r.rawChainage)}</p>
      <div class="road-coordinates"><div><span>经度 E</span><strong>${r.coordinates[0]}<small>°</small></strong></div><div><span>纬度 N</span><strong>${r.coordinates[1]}<small>°</small></strong></div></div>
      <dl class="road-detail-fields"><div><dt>${r.kind === 'bridge' ? '中心桩号' : '里程桩号'}</dt><dd>${r.label}${r.issues.some(i => i.type === 'unit') ? ' *' : ''}</dd></div><div><dt>原始编码</dt><dd>${r.rawChainage}</dd></div><div><dt>来源位置</dt><dd>${q(r.source.sheet)} · 第 ${r.source.row} 行</dd></div>${r.neighbours ? `<div><dt>相邻公里桩</dt><dd>${r.neighbours.join('<br>')}</dd></div>` : ''}</dl>
      ${r.issues.length ? `<div class="road-issue-note"><strong>数据待核对</strong>${r.issues.map(i => `<p>${q(i.text)}</p>`).join('')}<small>保持原始点位，未自动修正。</small></div>` : `<div class="road-origin-note">${demo ? '独立生成的演示点位，无真实位置含义' : '按原表经纬度落点'}</div>`}
      <div class="road-detail-actions"><button id="road-focus">定位点位 ↗</button><button id="road-copy" aria-label="复制点位信息">复制信息</button></div>
      <details class="road-source"><summary>数据来源与口径</summary><p>${q(data.sourceFile)}</p><p>${q(r.source.sheet)}!${q(r.source.range)}</p><p>${q(data.coordinateReferenceSystem)}。${q(data.geometryNote)}。</p><p>待核对规则：相邻桩点直距 &gt; max(2 km, 桩号间距 × 3)；桥梁与同桩号插值位置偏差 &gt; 2 km。仅作数据筛查。</p></details>`;
    $('#road-focus').onclick = () => flyTo(r);
    $('#road-copy').onclick = async () => {
      const text = `${r.name || r.label} · ${r.route} · ${r.label}\n经度 ${r.coordinates[0]} 纬度 ${r.coordinates[1]}\n原值 ${r.rawChainage}\n${data.sourceFile} / ${r.source.sheet}!${r.source.range}${r.issues.length ? '\n' + r.issues.map(i => i.text).join('\n') : ''}`;
      try { await navigator.clipboard.writeText(text); notice('点位信息已复制'); } catch { notice('复制未成功，请在详情中选取文本'); }
    };
    focus.position.copy(projected.get(r.id));
    focusLabel.textContent = `${r.name || r.label}${r.name ? ' · ' + r.label : ''}`;
    focusLabel.classList.toggle('issue', !!r.issues.length);
    focus.children.slice(0, 3).forEach(o => o.material.color.set(r.issues.length ? GOLD : CYAN).multiplyScalar(1.6));
    beamMaterial.uniforms.color.value.set(r.issues.length ? GOLD : CYAN);
    $('#road-current-chainage').textContent = r.label;
    $('#road-range').value = String(r.chainage);
    $('#road-range').setAttribute('aria-valuetext', r.label);
    const [x, y] = insetPosition(r.coordinates); $('#road-inset-selection').setAttribute('cx', x); $('#road-inset-selection').setAttribute('cy', y);
  }
  function choose(record, move = false, auto = false) {
    if (!auto) pause();
    selected = record; renderDetail();
    ui.classList.remove('catalog-open'); $('.road-catalog-toggle').setAttribute('aria-expanded', 'false');
    ui.querySelectorAll('.road-record').forEach(button => { const on = button.dataset.recordId === record.id; button.classList.toggle('selected', on); button.setAttribute('aria-pressed', String(on)); });
    if (move) flyTo(record);
  }
  function fitFactor() { return innerWidth <= 600 ? 1.65 : Math.max(1, 1.35 / camera.aspect); }
  function moveCamera(position, target, duration = 1100) {
    controls.autoRotate = false;
    cameraMove = {from: camera.position.clone(), to: position, targetFrom: controls.target.clone(), targetTo: target, start: performance.now(), duration: reducedMotion.matches ? 1 : duration};
  }
  function home() { pause(); const phone = innerWidth <= 600, target = phone ? vector(0, 0, 22) : vector(0, 0, 10); moveCamera((phone ? vector(15, 92, 110) : vector(42, 98, 92).multiplyScalar(1.18)).multiplyScalar(fitFactor()).add(target), target); }
  function flyTo(record) {
    const p = projected.get(record.id);
    moveCamera(p.clone().add(vector(25, 39, 36).multiplyScalar(fitFactor())), p.clone());
  }
  function pause() { playing = false; $('#road-play').setAttribute('aria-pressed', 'false'); $('#road-play').innerHTML = '<span>▶</span> 沿线巡览'; }
  function visibleRecord(record) { return record.issues.length ? flags.anomalies : flags[record.kind === 'bridge' ? 'bridges' : 'milestones']; }
  function syncLayers() { for (const [name, group] of Object.entries(groups)) group.visible = flags[name]; ui.querySelectorAll('[data-road-layer]').forEach(b => b.setAttribute('aria-pressed', String(flags[b.dataset.roadLayer]))); }
  $('#road-search').oninput = event => { query = event.target.value; renderList(); };
  $('.road-catalog-toggle').onclick = () => { const open = ui.classList.toggle('catalog-open'); $('.road-catalog-toggle').setAttribute('aria-expanded', String(open)); };
  ui.querySelectorAll('[data-road-filter]').forEach(button => button.onclick = () => { filter = button.dataset.roadFilter; renderList(); });
  ui.querySelectorAll('[data-road-layer]').forEach(button => button.onclick = () => { const key = button.dataset.roadLayer; flags[key] = !flags[key]; syncLayers(); });
  ui.querySelectorAll('[data-road-action]').forEach(button => button.onclick = () => {
    pause(); const action = button.dataset.roadAction;
    if (action === 'home') home();
    else if (action === 'top') moveCamera(controls.target.clone().add(vector(0, 125 * fitFactor(), .01)), controls.target.clone());
    else { const delta = camera.position.clone().sub(controls.target).multiplyScalar(action === 'in' ? .8 : 1.25); delta.setLength(THREE.MathUtils.clamp(delta.length(), controls.minDistance, controls.maxDistance)); moveCamera(controls.target.clone().add(delta), controls.target.clone(), 350); }
  });
  $('#road-range').oninput = event => { const value = Number(event.target.value); const nearest = data.milestones.reduce((a, b) => Math.abs(b.chainage - value) < Math.abs(a.chainage - value) ? b : a); choose(nearest, true); };
  $('#road-next').onclick = () => { const i = data.milestones.findIndex(r => r.chainage > selected.chainage); choose(data.milestones[i < 0 ? 0 : i], true); };
  $('#road-play').onclick = () => {
    if (playing) { pause(); return; }
    playing = true; lastStep = performance.now();
    if (selected.chainage >= data.end.chainage) choose(data.start, true, true); else flyTo(selected);
    $('#road-play').setAttribute('aria-pressed', 'true'); $('#road-play').innerHTML = '<span>Ⅱ</span> 暂停巡览';
  };

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickables.filter(m => visibleRecord(m.userData.record)), false)[0]?.object.userData.record;
  }
  renderer.domElement.addEventListener('pointerdown', event => { if (!active) return; dragStart = [event.clientX, event.clientY]; cameraMove = null; pause(); });
  renderer.domElement.addEventListener('pointerup', event => { if (!active || !dragStart) return; if (Math.hypot(event.clientX - dragStart[0], event.clientY - dragStart[1]) < 5) { const record = hit(event); if (record) choose(record, false); } dragStart = null; });
  renderer.domElement.addEventListener('pointermove', event => { if (active && !event.buttons) renderer.domElement.style.cursor = hit(event) ? 'pointer' : 'grab'; });
  renderer.domElement.addEventListener('wheel', () => { if (active) { cameraMove = null; pause(); } }, {passive: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  renderList(); renderDetail(); syncLayers();

  const screenPoint = new THREE.Vector3();
  function place(el, p) {
    screenPoint.copy(p).project(camera);
    if (screenPoint.z > 1 || Math.abs(screenPoint.x) > 1 || Math.abs(screenPoint.y) > 1) { el.hidden = true; return null; }
    const x = (screenPoint.x * .5 + .5) * innerWidth, y = (-screenPoint.y * .5 + .5) * innerHeight;
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.hidden = false; return {x, y};
  }
  return {
    data, home, resize() { if (active) home(); },
    setActive(value) {
      active = value; root.visible = value; ui.hidden = !value; document.body.classList.toggle('road-mode', value);
      controls.minDistance = value ? 20 : 42; controls.maxDistance = 240 * fitFactor();
      controls.enablePan = value;
      if (!value) { pause(); cameraMove = null; }
    },
    update(time, now) {
      if (!active) return;
      if (cameraMove) {
        const t = Math.min(1, (now - cameraMove.start) / cameraMove.duration), eased = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(cameraMove.from, cameraMove.to, eased); controls.target.lerpVectors(cameraMove.targetFrom, cameraMove.targetTo, eased); camera.lookAt(controls.target);
        if (t === 1) cameraMove = null;
      }
      if (playing && now - lastStep >= 1500) {
        lastStep = now; const index = data.milestones.findIndex(r => r.chainage > selected.chainage);
        if (index < 0) pause(); else choose(data.milestones[index], true, true);
      }
      const motionTime = reducedMotion.matches ? 0 : time;
      flow.children.forEach((dot, i) => {
        const position = (motionTime * 3 + i / flow.children.length * flowSegments.length) % flowSegments.length;
        const segment = flowSegments[Math.floor(position)]; if(segment)dot.position.lerpVectors(segment.a, segment.b, position % 1).y += .08;
      });
      animated.forEach(({object}, i) => { const phase = (motionTime * .45 + i * .17) % 1; object.scale.setScalar(1 + phase * 1.4); object.material.opacity = .7 * (1 - phase); });
      focus.visible = visibleRecord(selected);
      focus.children.slice(0, 3).forEach((ring, i) => { const phase = (motionTime * .35 + i / 3) % 1; ring.scale.setScalar(.8 + phase * .65); ring.material.opacity = .8 * (1 - phase); });
      if (now - lastLayout < 40) return; lastLayout = now;
      // Screen-space collision filtering keeps the dense route readable at every zoom.
      const compact = innerWidth <= 900, leftLimit = compact ? 20 : 285, rightLimit = innerWidth - (compact ? 24 : 322), bottomLimit = innerHeight - (compact ? 245 : 170);
      const occupied = [];
      if (focus.visible) { const p = place(focusLabel, focus.position.clone().add(vector(0, 10.8, 0))); if (p) occupied.push({x: p.x, y: p.y, width: 200}); } else focusLabel.hidden = true;
      for (const item of [...labels].sort((a, b) => Number(b.className === 'endpoint') - Number(a.className === 'endpoint'))) {
        if ((!flags.labels && item.record) || (item.record && (!visibleRecord(item.record) || item.record.id === selected.id))) { item.el.hidden = true; continue; }
        const point = place(item.el, item.position); if (!point) continue;
        const width = item.el.offsetWidth || 90;
        const blocked = point.x < leftLimit + width / 2 || point.x > rightLimit - width / 2 || point.y < 170 || point.y > bottomLimit || occupied.some(p => Math.abs(p.x - point.x) < (p.width + width) / 2 + 8 && Math.abs(p.y - point.y) < 29);
        item.el.hidden = blocked;
        if (!blocked) occupied.push({...point, width});
      }
    },
  };
}
