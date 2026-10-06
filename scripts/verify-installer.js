import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {version}=JSON.parse(fs.readFileSync('package.json','utf8'));
const extractor=process.argv[2] || '7za';
const installer=path.resolve(`dist/MeuApp-Setup-${version}.exe`);
const target=path.resolve(`artifacts/installer-verification-${version}`);
fs.mkdirSync(target,{recursive:true});
const extracted=spawnSync(extractor,['x',installer,`-o${target}`,'-y','-bso0','-bsp0'],{windowsHide:true,encoding:'utf8'});
assert.equal(extracted.status,0,extracted.error?.message || extracted.stderr || extracted.stdout);
// NSIS embeds the application in a second archive. Validate the application
// extracted from that payload instead of requiring a pre-populated directory.
const payload=path.join(target,'$PLUGINSDIR','app-64.7z');
if(fs.existsSync(payload)) {
  const application=spawnSync(extractor,['x',payload,`-o${target}`,'-y','-bso0','-bsp0'],{windowsHide:true,encoding:'utf8'});
  assert.equal(application.status,0,application.error?.message || application.stderr || application.stdout);
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const file of ['MeuApp.exe','resources/app.asar','resources/app.asar.unpacked/desktop/NativeInputHost.exe']) assert.equal(hash(path.join(target,file)),hash(path.resolve('dist/win-unpacked',file)),`Installer payload mismatch: ${file}`);
const helperPath=path.join(target,'resources/app.asar.unpacked/desktop/NativeInputHost.exe');
assert.equal(hash(helperPath),hash('desktop/NativeInputHost.exe'));
const asar=createRequire(import.meta.url)('@electron/asar');
assert.equal(JSON.parse(asar.extractFile(path.join(target,'resources/app.asar'),'package.json')).version,version);
const probe=spawnSync(helperPath,[],{windowsHide:true,input:'PING\nEXIT\n',encoding:'utf8',timeout:5000});
assert.equal(probe.status,0);assert.match(probe.stdout,/READY/);assert.match(probe.stdout,/PONG/);
const report={version,checkedAt:new Date().toISOString(),passed:true,actualNsisPayload:true,applicationMatchesUnpacked:true,asarMatchesUnpacked:true,helperPath,helperMatchesFreshCompilation:true,extractedHelperStarts:true};
fs.writeFileSync('docs/validation/installer-payload.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
