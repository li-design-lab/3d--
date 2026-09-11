import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {requiredFiles} from './local-server.mjs';

const label = 'local.blue-atlas.map';
const domain = `gui/${process.getuid()}`, target = `${domain}/${label}`;
const installDir = path.join(os.homedir(), 'Library/Application Support/Blue Atlas 3D');
const plist = path.join(os.homedir(), 'Library/LaunchAgents', label + '.plist');
const logDir = path.join(os.homedir(), 'Library/Logs/Blue Atlas 3D');
const shortcut = path.join(os.homedir(), 'Desktop/打开蓝色3D地图.command');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const url = 'http://127.0.0.1:5174/?scene=g214';
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shellQuote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const launch = (...args) => execFileSync('/bin/launchctl', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']});
function loaded() { try { launch('print',target); return true; } catch { return false; } }
async function health() { try { const r = await fetch('http://127.0.0.1:5174/_blue-atlas/health',{signal:AbortSignal.timeout(1500),cache:'no-store'}); const body = await r.json(); return r.ok && body.service === 'blue-atlas-local' && body.status === 'ok' ? body : null; } catch { return null; } }
async function waitUntilReady() {
  for (let attempt = 0; attempt < 30; attempt++) { const result = await health(); if (result) return result; await new Promise(resolve => setTimeout(resolve,500)); }
  throw Error(`地图未就绪。请检查 ${logDir}，确认 5174 端口未被其他程序占用。`);
}
async function start() {
  if (!loaded()) { await fs.access(plist); launch('enable',target); launch('bootstrap',domain,plist); }
  else if (!await health()) launch('kickstart','-k',target);
  return waitUntilReady();
}
async function stopService() {
  if (!loaded()) return;
  launch('bootout',target);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!loaded()) return;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw Error('服务仍在退出中，请稍后重试安装。');
}
async function install() {
  const source = path.resolve(scriptDir,'../dist/client');
  await Promise.all(requiredFiles.map(file => fs.access(path.join(source,file))));
  const portInUse = (() => { try { return execFileSync('/usr/sbin/lsof',['-tiTCP:5174','-sTCP:LISTEN'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { return ''; } })();
  if (portInUse && !await health() && !loaded()) throw Error('5174 端口已有其他程序运行，请先结束本项目旧开发服务再安装；不会关闭其他程序。');
  await Promise.all([fs.mkdir(installDir,{recursive:true}),fs.mkdir(path.dirname(plist),{recursive:true}),fs.mkdir(logDir,{recursive:true})]);
  const files = (await fs.readdir(source,{recursive:true,withFileTypes:true})).filter(item => item.isFile()).map(item => path.relative(source,path.join(item.parentPath,item.name))).sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file); hash.update(await fs.readFile(path.join(source,file))); }
  const privateFile = path.resolve(scriptDir, '../.private/road.json');
  let privateData;
  try { privateData = await fs.readFile(privateFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (privateData) hash.update(privateData);
  const revision = hash.digest('hex');
  const release = path.join(installDir,'releases',revision);
  try { await fs.access(path.join(release,'local-release.json')); }
  catch {
    const staging = release + '.tmp-' + process.pid;
    await fs.cp(source,staging,{recursive:true});
    if (privateData) await fs.writeFile(path.join(staging,'assets/roads/road.json'),privateData);
    await fs.writeFile(path.join(staging,'local-release.json'),JSON.stringify({revision,installedAt:new Date().toISOString()},null,2));
    await fs.rename(staging,release);
  }
  const link = path.join(installDir,`current-${process.pid}`);
  await fs.symlink(release,link); await fs.rename(link,path.join(installDir,'current'));
  for (const file of ['local-server.mjs','manage-local-service.mjs']) await fs.copyFile(path.join(scriptDir,file),path.join(installDir,file));
  const definition = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(installDir,'local-server.mjs'))}</string><string>--root</string><string>${xml(path.join(installDir,'current'))}</string></array>
<key>WorkingDirectory</key><string>${xml(installDir)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>${xml(path.join(logDir,'service.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logDir,'error.log'))}</string>
</dict></plist>\n`;
  await stopService();
  await fs.writeFile(plist,definition,{mode:0o644});
  // This shortcut belongs to the installed app, so moving the source folder is safe.
  const command = `#!/bin/zsh\nset -e\n${shellQuote(process.execPath)} ${shellQuote(path.join(installDir,'manage-local-service.mjs'))} open\n`;
  try {
    const previous = await fs.readFile(shortcut,'utf8');
    if (!previous.includes('Blue Atlas 3D/manage-local-service.mjs')) throw Error(`桌面已有同名文件，已保留：${shortcut}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(shortcut,command,{mode:0o755}); await fs.chmod(shortcut,0o755);
  const ready = await start();
  if (ready.revision !== revision) throw Error('服务返回的版本与安装版本不同');
  console.log(JSON.stringify({...ready,url,plist,shortcut},null,2));
}

try {
  if (process.platform !== 'darwin') throw Error('此服务安装器用于 macOS。其他系统可用 node scripts/local-server.mjs --root dist/client。');
  const action = process.argv[2] || 'status';
  if (action === 'install') await install();
  else if (action === 'start') console.log(JSON.stringify(await start(),null,2));
  else if (action === 'status') console.log(JSON.stringify({registered:loaded(),health:await health(),url,plist},null,2));
  else if (action === 'stop') { await stopService(); console.log('本次登录期间服务已停止；start 可恢复，下次登录仍会自动启动。'); }
  else if (action === 'uninstall') { await stopService(); await fs.rm(plist,{force:true}); console.log('自动启动已移除；安装文件及桌面入口保留。'); }
  else if (action === 'open') { await start(); execFileSync('/usr/bin/open',['-a','Google Chrome',url]); }
  else throw Error('用法：node scripts/manage-local-service.mjs install|start|status|stop|uninstall|open');
} catch (error) { console.error(error.message); if (error.stderr) console.error(String(error.stderr)); process.exitCode = 1; }
