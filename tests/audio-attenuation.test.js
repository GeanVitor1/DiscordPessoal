import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
test('Windows attenuation changes and restores only an isolated silent fixture session',{skip:process.platform!=='win32',timeout:15000},async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-duck-')),fixtureExe=path.join(folder,'fixture.exe'),wav=path.join(folder,'silence.wav');
 execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/main:AudioFixture',`/out:${fixtureExe}`,path.resolve('desktop/AudioSessionHost.cs'),path.resolve('tests/fixtures/AudioFixture.cs')],{windowsHide:true});
 const data=Buffer.alloc(44+44100*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(44100,24);data.writeUInt32LE(88200,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);fs.writeFileSync(wav,data);
 const processes=[];const start=(exe,args)=>{const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});processes.push(child);const queue=[],waiting=[];readline.createInterface({input:child.stdout}).on('line',line=>waiting.length?waiting.shift()(line):queue.push(line));return {child,line:()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>waiting.push(r)),command:async command=>{child.stdin.write(command+'\n');return queue.length?queue.shift():await new Promise(r=>waiting.push(r));}};};
 t.after(()=>{for(const p of processes)if(p.stdin.writable)p.stdin.end('EXIT\n');});const fixture=start(fixtureExe,[wav]);assert.equal(await fixture.line(),'READY');let initial=-1;for(let n=0;n<15;n++){initial=Number(await fixture.command('VOLUME'));if(Number.isFinite(initial)&&initial>=0)break;await new Promise(r=>setTimeout(r,100));}
 if(!(initial>0)){t.skip('No usable audio endpoint/session: attenuation fixture could not play');return;}
 const helper=start('desktop/AudioSessionHost.exe',[`--only=${fixture.child.pid}`]);assert.equal(await helper.line(),'READY');assert.equal(await helper.command('DUCK 0.5'),'OK');assert.ok(Math.abs(Number(await fixture.command('VOLUME'))-initial*.5)<.01,'fixture volume is halved');
 assert.equal(await helper.command('RESTORE'),'OK');assert.ok(Math.abs(Number(await fixture.command('VOLUME'))-initial)<.01,'fixture volume restored');
 assert.equal(await helper.command('DUCK 0.75'),'OK');helper.child.stdin.end();await new Promise(r=>helper.child.once('exit',r));assert.ok(Math.abs(Number(await fixture.command('VOLUME'))-initial)<.01,'EOF restores volume');
});
