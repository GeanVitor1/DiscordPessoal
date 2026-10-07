import {app,BrowserWindow,screen} from 'electron';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {InteractionEventReceiver,InteractionSession,InteractionValidator} from '../client/src/interaction/index.js';

const root=fileURLToPath(new URL('..',import.meta.url));let window,helper,exitCode=0;
app.whenReady().then(async()=>{
  try {
    window=new BrowserWindow({width:760,height:520,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadURL('data:text/html,'+encodeURIComponent('<body style="background:#202225;color:white;font:18px Arial"><h2>Teste isolado de fila do mouse</h2><p>A entrada nativa permanece restrita a esta janela.</p><div style="height:300px;background:#5865f2"></div></body>'));
    window.show();window.focus();window.moveTop();
    const handle=window.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
    const output=path.resolve(process.env.MEUAPP_TEST_OUTPUT || 'artifacts/desktop-1.1.2');
    helper=spawn(path.join(output,'win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe'),['--target-window',hwnd],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='',lines=[],waiters=[];helper.stdout.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);if(waiters.length)waiters.shift()(line);else lines.push(line);}});
    const line=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native queue helper timeout')),5000),done=v=>{clearTimeout(timer);resolve(v);};if(lines.length)done(lines.shift());else waiters.push(done);});
    assert.equal(await line(),'READY');
    let focused=false;for(let i=0;i<10;i++){window.show();window.focus();window.moveTop();helper.stdin.write('FOCUS_TEST\n');if((await line())==='OK FOCUS_TEST'){focused=true;break;}await new Promise(r=>setTimeout(r,100));}
    assert.equal(focused,true,'Windows must focus the owned fixture before any movement is sent');
    const bounds=window.getContentBounds(),scope={x:bounds.x+60,y:bounds.y+150,width:500,height:200};
    const baseline=path.resolve('artifacts/native-queue-baseline');await fs.mkdir(baseline,{recursive:true});
    const {sourceCommit}=JSON.parse(await fs.readFile('docs/validation/release-publication-1.1.1.json','utf8'));
    assert.match(sourceCommit,/^[a-f0-9]{40}$/);
    for(const name of ['InteractionEventReceiver.js','InteractionSerializer.js','protocol.js'])await fs.writeFile(path.join(baseline,name),execFileSync('git',['show',`${sourceCommit}:client/src/interaction/${name}`],{cwd:root}));
    const {InteractionEventReceiver:Previous}=await import(pathToFileURL(path.join(baseline,'InteractionEventReceiver.js')));
    const run=async Receiver=>{
      const session=new InteractionSession({sessionId:'owned-native-queue',hostId:'host',guestId:'guest',token:'owned-test-token'});session.grantConsent();
      let executed=0,lastPosition,lastSequence;const started=performance.now();
      const receiver=new Receiver({session,validator:new InteractionValidator({maxEventsPerSecond:200,burstCapacity:400}),target:{async executeEvent(e){const p=screen.dipToScreenPoint({x:Math.round(scope.x+scope.width*e.payload.x),y:Math.round(scope.y+scope.height*e.payload.y)});helper.stdin.write(`SEQ ${e.sequence} MOVE ${p.x} ${p.y}\n`);const ack=await line();assert.match(ack,new RegExp(`^ACK ${e.sequence} OK MOVE `));executed++;lastSequence=e.sequence;lastPosition=p;return {success:true,nativeAck:'OK'};}}});
      for(let sequence=0;sequence<80;sequence++)receiver.receive({sessionId:session.sessionId,participantId:'guest',token:session.token,sequence,eventType:'PointerMove',payload:{x:(sequence+1)/100,y:.5},timestamp:Date.now()});
      await receiver.executionQueue;session.destroy();return {elapsedMs:Math.round(performance.now()-started),executed,lastSequence,lastPosition};
    };
    const before=await run(Previous),after=await run(InteractionEventReceiver);assert.equal(before.executed,80);assert.equal(after.executed,1);assert.equal(after.lastSequence,79);assert.deepEqual(after.lastPosition,before.lastPosition);
    helper.stdin.end('EXIT\n');await new Promise(r=>helper.once('exit',r));
    const version=JSON.parse(await fs.readFile('package.json','utf8')).version,report={version,passed:true,before,after,helper:'Exact helper extracted in the updated win-unpacked package',scope:'Real SendInput and native acknowledgements restricted to one owned Windows fixture; previous receiver source from v1.1.1. This measures a local burst queue, not physical two-PC network or video latency.'};
    await fs.writeFile(`docs/validation/native-queue-performance-${version}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }catch(e){console.error(e.stack);exitCode=1;}
  finally{helper?.kill();window?.destroy();app.exit(exitCode);}
});
