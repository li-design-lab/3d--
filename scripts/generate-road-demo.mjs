// Independent analytic illustration. Never reads the user's road workbook or geometry.
import fs from 'node:fs/promises';
export function makeDemo() {
  const point = t => [Number((97.6 + .065*Math.sin(t*8) + .02*Math.sin(t*23)).toFixed(6)), Number((31.65 - .48*t + .024*Math.sin(t*12)).toFixed(6))];
  const records = Array.from({length:61},(_,i)=>({id:`demo-m-${i}`,kind:'milestone',sequence:i+1,route:'DEMO',name:null,rawChainage:20000+i*1000,coordinates:point(i/60),note:i===0?'演示起点':i===60?'演示终点':'',source:{sheet:'数学曲线演示',row:i+1,range:'非表格数据'}}));
  for(let i=0;i<8;i++)records.push({id:`demo-b-${i}`,kind:'bridge',sequence:i+1,route:'DEMO',name:`示例桥 ${String(i+1).padStart(2,'0')}`,rawChainage:23500+i*7000,coordinates:point((3500+i*7000)/60000),note:'',source:{sheet:'数学曲线演示',row:i+1,range:'非表格数据'}});
  return {version:1,mode:'synthetic',chainageUnit:'metres',title:'昌都 · 公路演示',sourceFile:'独立数学曲线生成，不来自原始表格',coordinateReferenceSystem:'演示经纬度，无测绘用途',geometryNote:'线路及资产均为虚构，不代表真实道路',records};
}
export function makeDemoElements(road = makeDemo()) {
  const defs = [
    ['vis', (i) => 9500 + (i % 5) * 120, 'm', '4', '无影响', 'green', '#47EC18'],
    ['pre', (i) => i % 11 === 0 ? .1 : 0, 'mm/h', (i) => i % 11 === 0 ? '3' : '4', (i) => i % 11 === 0 ? '稍有影响' : '无影响', (i) => i % 11 === 0 ? 'blue' : 'green', (i) => i % 11 === 0 ? '#38A5DF' : '#47EC18'],
    ['road', (i) => i % 11 === 0 ? 3 : 4, '', (i) => i % 11 === 0 ? '3' : '4', (i) => i % 11 === 0 ? '湿滑' : '正常', (i) => i % 11 === 0 ? '#38A5DF' : '#47EC18', (i) => i % 11 === 0 ? '#38A5DF' : '#47EC18'],
    ['t2', (i) => 16.5 + i * .12, '℃', '4', '无影响', 'green', '#47EC18'],
    ['tg2', (i) => 25 + i * .08, '℃', '4', '无影响', 'green', '#47EC18'],
    ['wind', (i) => 1.8 + (i % 9) * .22, 'm/s', '4', '无影响', 'green', '#47EC18'],
  ];
  const milestones = road.records.filter(record => record.kind === 'milestone');
  return {version:1,mode:'synthetic',source:'独立数学曲线生成，不来自真实接口',startTime:'demo',fcstTime:'demo',pilePointFcstElementVos:defs.map(([element, value, unit, level, desc, color, hex]) => ({element,fcstElementTime:milestones.map((record,index) => ({roadCode:'DEMO',pilePoint:record.note === '演示起点' ? 'K20+000' : record.note === '演示终点' ? 'K80+000' : `K${Math.floor(record.rawChainage / 1000)}+${String(record.rawChainage % 1000).padStart(3,'0')}`,elementValue:String(typeof value === 'function' ? value(index) : value),elementUnit:unit,elementLevel:String(typeof level === 'function' ? level(index) : level),elementLevelDesc:typeof desc === 'function' ? desc(index) : desc,elementLevelColor:typeof color === 'function' ? color(index) : color,elementLevelHexColor:typeof hex === 'function' ? hex(index) : hex}))}))};
}
if(process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await fs.mkdir(new URL('../dist/client/assets/roads/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../dist/client/assets/roads/road.json',import.meta.url),JSON.stringify(makeDemo(),null,2)+'\n');
  await fs.writeFile(new URL('../dist/client/assets/roads/elements.json',import.meta.url),JSON.stringify(makeDemoElements(),null,2)+'\n');
}
