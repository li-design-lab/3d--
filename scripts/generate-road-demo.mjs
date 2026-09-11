// Independent analytic illustration. Never reads the user's road workbook or geometry.
import fs from 'node:fs/promises';
export function makeDemo() {
  const point = t => [Number((97.6 + .065*Math.sin(t*8) + .02*Math.sin(t*23)).toFixed(6)), Number((31.65 - .48*t + .024*Math.sin(t*12)).toFixed(6))];
  const records = Array.from({length:61},(_,i)=>({id:`demo-m-${i}`,kind:'milestone',sequence:i+1,route:'DEMO',name:null,rawChainage:20000+i*1000,coordinates:point(i/60),note:i===0?'演示起点':i===60?'演示终点':'',source:{sheet:'数学曲线演示',row:i+1,range:'非表格数据'}}));
  for(let i=0;i<8;i++)records.push({id:`demo-b-${i}`,kind:'bridge',sequence:i+1,route:'DEMO',name:`示例桥 ${String(i+1).padStart(2,'0')}`,rawChainage:23500+i*7000,coordinates:point((3500+i*7000)/60000),note:'',source:{sheet:'数学曲线演示',row:i+1,range:'非表格数据'}});
  return {version:1,mode:'synthetic',chainageUnit:'metres',title:'昌都 · 公路演示',sourceFile:'独立数学曲线生成，不来自原始表格',coordinateReferenceSystem:'演示经纬度，无测绘用途',geometryNote:'线路及资产均为虚构，不代表真实道路',records};
}
if(process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await fs.mkdir(new URL('../dist/client/assets/roads/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../dist/client/assets/roads/road.json',import.meta.url),JSON.stringify(makeDemo(),null,2)+'\n');
}
