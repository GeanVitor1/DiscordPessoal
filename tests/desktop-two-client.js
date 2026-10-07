import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseline = process.argv.includes('--baseline');
const output = path.resolve(process.env.MEUAPP_TEST_OUTPUT || 'dist');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'meuapp-two-desktops-'));
const clients = [];
let soundPlayer;
const backend = spawn(process.execPath, ['server/src/server.js'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: '', SQLITE_PATH: path.join(temp, 'test.db'), HOST: '127.0.0.1', PORT: '15011' }
});
let backendLogs = '';
backend.stderr.on('data', d => backendLogs += d);
const delay = ms => new Promise(r => setTimeout(r, ms));
const electron = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')";

async function connectClient(name, port, parentClient) {
  const profile = path.join(temp, name);
  const env = { ...process.env, APPDATA: profile, MEUAPP_DIAGNOSTICS: 'true' }; delete env.ELECTRON_RUN_AS_NODE;
  const executable=path.join(output,'win-unpacked/MeuApp.exe'),args=[`--inspect=127.0.0.1:${port}`,`--user-data-dir=${profile}`];
  const child = parentClient ? {
    pid:await parentClient.main(`(()=>{const env={...process.env,APPDATA:${JSON.stringify(profile)},MEUAPP_DIAGNOSTICS:'true'};delete env.ELECTRON_RUN_AS_NODE;globalThis.testViewerProcess=process.getBuiltinModule('child_process').spawn(${JSON.stringify(executable)},${JSON.stringify(args)},{env,windowsHide:true,stdio:['ignore','pipe','pipe']});globalThis.testViewerLog='';testViewerProcess.stderr.on('data',d=>testViewerLog+=d);return testViewerProcess.pid;})()`),
    exitCode:null,stderr:{on(){}},kill:()=>parentClient.main("(()=>{testViewerProcess.kill();return true;})()").catch(()=>{})
  } : spawn(executable,args,{ env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const client={name,child};clients.push(client);
  let logs = '', endpoint; child.stderr.on('data', d => logs += d);
  // Attaching the Node inspector before Electron bootstraps can stall a second instance.
  // Wait for the application's startup log before opening the inspector connection.
  for(let i=0;i<150;i++){try{await fs.stat(path.join(profile,'logs/app.log'));break;}catch{}if(child.exitCode!==null || i===149)throw Error('Desktop startup failed: '+logs);await delay(100);}
  await delay(300);
  for (let i = 0; i < 100; i++) {
    try { endpoint = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()))[0]?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    if (child.exitCode !== null) throw Error(logs); await delay(100);
  }
  assert.ok(endpoint, logs);
  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  let phase='initial DOM';
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); });
  const main = async expression => {
    const n = ++id;
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(n); reject(Error(`Inspector timeout: ${name}: ${phase}`)); }, 30000);
      pending.set(n, m => { clearTimeout(timer); pending.delete(n); resolve(m); });
      ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (message.error || message.result?.exceptionDetails) throw Error(JSON.stringify(message.error || message.result.exceptionDetails));
    return message.result.result.value;
  };
  const view = code => main(`(async()=>{const {BrowserWindow}=${electron};const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));if(!w)return null;return w.webContents.executeJavaScript(${JSON.stringify(code)},true);})()`);
  const wait = async (code, label) => { const deadline=Date.now()+45000;while(Date.now()<deadline){if(await view(code))return;await delay(100);}throw Error(`${name}: ${label}: ${await view('document.body.innerText')}`); };
  const click = title => view(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(title)} || b.textContent.trim()===${JSON.stringify(title)});if(!b)throw Error('Missing button '+${JSON.stringify(title)});b.click();return true;})()`);
  Object.assign(client,{ ws, main, view, wait, click, logs: () => logs });
  for(let i=0;i<300;i++){if(await main(`(()=>{const {app,BrowserWindow}=${electron};return app.isReady() && BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('app.asar'));})()`))break;if(i===299)throw Error('No packaged main window');await delay(100);}
  // The app has system font fallbacks. External Google Fonts can keep a file://
  // page loading and hold executeJavaScript promises in this inspector harness.
  await main(`(()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));w.webContents.session.webRequest.onBeforeRequest({urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']},(_details,callback)=>callback({cancel:true}));w.reload();return true;})()`);
  await wait("!!document.querySelector('[data-testid=auth-submit]')", 'login');
  phase='registration';
  const base = 'http://127.0.0.1:15011';
  const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: name, username: name, password: 'Two-client-password-123' }) });
  assert.equal(response.status, 201); const account = await response.json();
  phase='isolated profile setup';
  await view(`(async()=>{localStorage.setItem('backend_mode','custom');localStorage.setItem('backend_url',${JSON.stringify(base)});localStorage.setItem('meuapp_diagnostics','true');await electronAPI.auth.saveToken(${JSON.stringify(base)},${JSON.stringify(account.token)});return true;})()`);
  await main(`(()=>{const {BrowserWindow}=${electron};BrowserWindow.getAllWindows()[0].reload();return true;})()`);
  phase='authenticated app';
  await wait("document.body.textContent.includes('Canais de Voz')", 'authenticated app');
  await view(`(() => {window.testPcs=[];const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);window.testPcs.push(this);}};const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.testAudio=new AudioContext();const dest=window.testAudio.createMediaStreamDestination();navigator.mediaDevices.getUserMedia=constraints=>constraints.audio && !constraints.audio.mandatory && !constraints.video ? Promise.resolve(dest.stream.clone()) : native(constraints);return true;})()`);
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Sala de Bate-Papo' && !b.disabled)", 'signaling');
  await click('Sala de Bate-Papo'); await wait("document.body.textContent.includes('Conectado à chamada')", 'voice');
  phase='packaged acceptance';
  return client;
}

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:15011/api/health')).ok) break; } catch {} if (backend.exitCode !== null) throw Error(backendLogs); await delay(100); }
  const host = await connectClient('nativehost', 15293);
  const viewer = await connectClient('nativeviewer', 15294);
  if(!baseline)assert.equal((await host.view("desktopInteraction.movePointer('no-authorization',null,.5,.5)")).code,'SESSION_INACTIVE');
  await host.click('Compartilhar Tela'); await host.wait("document.body.textContent.includes('Selecione uma tela inteira ou janela aberta')", 'picker');
  const source = await host.view("electronAPI.getScreenSources().then(s=>s.find(s=>s.id.startsWith('screen:') && s.display_id))"); assert.ok(source);
  await host.click(source.name); await host.wait("[...document.querySelectorAll('video')].some(v=>v.srcObject?.getVideoTracks()[0]?.readyState==='live')", 'capture');
  const capture = await host.view("(() => {const s=document.querySelector('video').srcObject;return {audio:s.getAudioTracks().map(t=>({enabled:t.enabled,live:t.readyState,settings:t.getSettings()})),video:s.getVideoTracks().length};})()");
  await viewer.wait("document.body.textContent.includes('Assistir Transmissão')", 'broadcast'); await viewer.click('Assistir Transmissão');
  await viewer.wait("document.querySelector('[data-testid=remote-screen-video]')?.videoWidth>0", 'remote video');
  const wav = path.join(temp, 'tone.wav'), script = path.join(temp, 'tone.ps1');
  const samples=48000*4,pcm=Buffer.alloc(samples*2),header=Buffer.alloc(44);
  for(let i=0;i<samples;i++)pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*700*i/48000)*1000),i*2);
  header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(96000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  await fs.writeFile(wav,Buffer.concat([header,pcm]));await fs.writeFile(script,"param([string]$Wav)\n$player = New-Object System.Media.SoundPlayer $Wav\n$player.PlaySync()\n");
  const screenStats=async(client,hostSide)=>client.view(`(async()=>{const stream=document.querySelector(${JSON.stringify(hostSide?'video':'[data-testid=remote-screen-video]')}).srcObject;const pc=window.testPcs.find(pc=>(pc.${hostSide?'getSenders':'getReceivers'}()).some(r=>r.track?.id===stream.getVideoTracks()[0]?.id));if(!pc)return null;const reports=[...(await pc.getStats()).values()].filter(s=>s.type===${JSON.stringify(hostSide?'outbound-rtp':'inbound-rtp')} && (s.kind || s.mediaType)==='audio');return {audioTracks:stream.getAudioTracks().length,sdpAudio:/m=audio/.test(pc.${hostSide?'localDescription':'remoteDescription'}?.sdp || ''),rtp:reports.map(s=>({bytes:s.bytesSent ?? s.bytesReceived,packets:s.packetsSent ?? s.packetsReceived,totalAudioEnergy:s.totalAudioEnergy}))};})()`);
  const audioBefore={host:await screenStats(host,true),viewer:await screenStats(viewer,false)};
  await viewer.view(`(async() => {const video=document.querySelector('[data-testid=remote-screen-video]'),audio=document.querySelector('[data-testid=remote-screen-audio]');window.probeContext=new AudioContext();if(probeContext.setSinkId)await probeContext.setSinkId({type:'none'});await probeContext.resume();window.probeAnalyser=probeContext.createAnalyser();probeAnalyser.fftSize=2048;probeContext.createMediaStreamSource(video.srcObject).connect(probeAnalyser);if(audio)await audio.play();else video.muted=true;return true;})()`);
  let ownAudioExclusion=null;
  if(!baseline) {
    assert.equal(capture.audio.length,1);assert.equal(capture.audio[0].live,'live');assert.equal(capture.audio[0].enabled,true);
    // Both clients share this computer's physical output. Pause viewer playback
    // during the loopback measurement so it cannot become an external feedback source.
    await viewer.view("(()=>{document.querySelector('[data-testid=remote-screen-audio]').pause();return true;})()");await delay(500);
    const sampleOwnTone="(()=>{probeAnalyser.fftSize=4096;const a=new Float32Array(probeAnalyser.fftSize);probeAnalyser.getFloatTimeDomainData(a);let real=0,imag=0;for(let i=0;i<a.length;i++){const angle=2*Math.PI*1000*i/probeContext.sampleRate;real+=a[i]*Math.cos(angle);imag+=a[i]*Math.sin(angle);}return {rms:Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length),toneAmplitude:2*Math.hypot(real,imag)/a.length,viewerPaused:document.querySelector('[data-testid=remote-screen-audio]').paused};})()";
    const beforeOwnTone=await viewer.view(sampleOwnTone);
    await host.view("(async()=>{window.ownTone=testAudio.createOscillator();const gain=testAudio.createGain();gain.gain.value=.03;ownTone.frequency.value=1000;ownTone.connect(gain);gain.connect(testAudio.destination);ownTone.start();await testAudio.resume();return true;})()");
    await delay(600);
    ownAudioExclusion={...await viewer.view(sampleOwnTone),beforeToneAmplitude:beforeOwnTone.toneAmplitude};
    await host.view("(()=>{ownTone.stop();return true;})()");
    console.log(JSON.stringify({capture,ownAudioExclusion}));
    await fs.writeFile('docs/validation/audio-exclusion-probe.json',JSON.stringify({capture,ownAudioExclusion},null,2));
    assert.ok(ownAudioExclusion.toneAmplitude<beforeOwnTone.toneAmplitude+.005,'The host application 1000 Hz tone must be excluded from screen audio, independently from other system sounds');
    await host.click('Ativar Mudo');
    await delay(100);
    assert.equal(await host.view("(()=>{const s=document.querySelector('video').srcObject;return s.getAudioTracks()[0].enabled && window.testPcs.flatMap(pc=>pc.getSenders()).filter(r=>r.track?.kind==='audio' && r.track.id!==s.getAudioTracks()[0].id).every(r=>r.track.enabled===false);})()"),true,'Microphone mute must preserve system audio');
  }
  const sampleExternalTone="(() => {const a=new Float32Array(probeAnalyser.fftSize);probeAnalyser.getFloatTimeDomainData(a);let real=0,imag=0;for(let i=0;i<a.length;i++){const angle=2*Math.PI*700*i/probeContext.sampleRate;real+=a[i]*Math.cos(angle);imag+=a[i]*Math.sin(angle);}return {rms:Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length),toneAmplitude:2*Math.hypot(real,imag)/a.length,audioContext:probeContext.state};})()";
  const externalBaseline=await viewer.view(sampleExternalTone);
  soundPlayer=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Wav',wav],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  await delay(2000);
  const decoded={...await viewer.view(sampleExternalTone),baselineToneAmplitude:externalBaseline.toneAmplitude};
  const audioAfter={host:await screenStats(host,true),viewer:await screenStats(viewer,false)};
  if(!baseline){await viewer.view("document.querySelector('[data-testid=remote-screen-audio]').play().then(()=>true)");await delay(150);}
  const playback=await viewer.view("(()=>{const e=document.querySelector('[data-testid=remote-screen-audio]') || document.querySelector('[data-testid=remote-screen-video]');return {paused:e.paused,muted:e.muted,volume:e.volume,audioTracks:e.srcObject.getAudioTracks().length,readyState:e.readyState,currentTime:e.currentTime};})()");
  if(!baseline)await viewer.view("(()=>{document.querySelector('[data-testid=remote-screen-audio]').pause();return true;})()");
  console.log(JSON.stringify({audioBefore,audioAfter,decoded}));
  if(!baseline) {
    assert.ok(audioAfter.host.rtp[0].bytes>audioBefore.host.rtp[0].bytes && audioAfter.host.rtp[0].packets>audioBefore.host.rtp[0].packets);
    assert.ok(audioAfter.viewer.rtp[0].bytes>audioBefore.viewer.rtp[0].bytes && audioAfter.viewer.rtp[0].packets>audioBefore.viewer.rtp[0].packets);
    assert.ok(decoded.rms>.002 && decoded.toneAmplitude>externalBaseline.toneAmplitude+.002,'Decoded PCM must contain the external 700 Hz Windows fixture tone above baseline');
    assert.equal(playback.paused,false);assert.equal(playback.muted,false);assert.equal(playback.volume,1);
    await host.click('Desativar Mudo');
  }
  if(process.argv.includes('--media-only')) {
    const graphics=await host.main(`(()=>{const {app}=${electron};return {hardwareAcceleration:app.isHardwareAccelerationEnabled(),singleInstance:app.hasSingleInstanceLock()};})()`);
    assert.equal(graphics.hardwareAcceleration,false);
    assert.equal(graphics.singleInstance,true);
    assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'STOPPED');
    await host.click('Parar Compartilhamento');
    await viewer.wait("!document.querySelector('[data-testid=remote-screen-video]')",'screen teardown');
    assert.equal(await viewer.view("document.querySelector('[data-testid=voice-audio]').srcObject.getAudioTracks()[0].readyState==='live'"),true);
    const report={passed:true,version:await host.view('electronAPI.getAppVersion()'),mode:'packaged software rendering media regression',graphics,capture,audioBefore,audioAfter,decoded,playback,ownAudioExclusion,screenTeardownPreservesVoice:true,idleHelperStopped:true,scope:'Two packaged clients on one Windows computer; real desktop capture, loopback audio and RTP; synthetic microphones. No physical mouse/keyboard injection in this media run. Native entry is covered separately by native.json; no subjective physical cursor latency benchmark or two physical PCs.'};
    await fs.writeFile('docs/validation/two-desktops.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } else {
  const display = await host.main(`(()=>{const {screen}=${electron};return screen.getAllDisplays().find(d=>String(d.id)===${JSON.stringify(source.display_id)});})()`);
  const fixtureHtml = `<html><body style="margin:0;background:#202225;color:white;font:18px Arial"><h2>Janela pertencente ao teste de input</h2><button id="click" style="width:180px;height:70px">Clique nativo</button><textarea id="editor" style="display:block;width:500px;height:100px"></textarea><div id="scroll" style="width:500px;height:160px;overflow:auto"><div style="width:1200px;height:1600px;background:linear-gradient(#5865f2,#23a55a)">Scroll nativo</div></div><script>window.events=[];window.clicks=0;document.querySelector('#click').onclick=()=>clicks++;for(const type of ['pointermove','pointerdown','pointerup','dblclick','wheel','keydown','keyup'])document.addEventListener(type,e=>events.push({type,button:e.button,buttons:e.buttons,key:e.key,code:e.code,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey}));document.addEventListener('contextmenu',e=>e.preventDefault());</script></body></html>`;
  await host.main(`(async()=>{const {BrowserWindow}=${electron};for(const w of BrowserWindow.getAllWindows())if(w.webContents.getURL().startsWith('data:'))w.hide();globalThis.fixture=new BrowserWindow({x:${Math.round(display.bounds.x+30)},y:${Math.round(display.bounds.y+120)},width:760,height:620,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});fixture.setMenu(null);await fixture.loadURL(${JSON.stringify('data:text/html;charset=utf-8,'+encodeURIComponent(fixtureHtml))});fixture.show();fixture.focus();fixture.moveTop();return true;})()`);
  // Test-only inspector setup: consent dialog is approved in the owned test process;
  // the distributed helper is constrained to this test window, never another app.
  await host.main(`(()=>{const {dialog}=${electron};dialog.showMessageBox=async()=>({response:1});const cp=process.getBuiltinModule('child_process'),original=cp.spawn;cp.spawn=(file,args,opts)=>{if(file.endsWith('NativeInputHost.exe') && args.length===0){const handle=fixture.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());globalThis.nativeFixtureProc=original(file,['--target-window',hwnd,'--test-busy-desktop'],opts);return nativeFixtureProc;}return original(file,args,opts);};process.getBuiltinModule('module').syncBuiltinESMExports();return true;})()`);
  await viewer.click('Solicitar assistência'); await host.wait("document.body.textContent.includes('Solicitação de assistência')", 'request');
  await host.click('Autorizar assistência'); await viewer.wait("!!document.querySelector('[tabindex=\"0\"].ring-2')", 'authorized input');
  const independent = await host.view(`(()=>{const share=document.querySelector('video').srcObject.getVideoTracks()[0],assistance=testPcs.find(pc=>pc.sctp && pc.connectionState==='connected'),screen=testPcs.find(pc=>!pc.sctp && pc.getSenders().some(s=>s.track?.id===share.id)),track=assistance.getSenders().find(s=>s.track?.kind==='video').track;return {differentConnections:assistance!==screen,shareTrackId:share.id,assistanceTrackId:track.id,differentCaptureTracks:share.id!==track.id};})()`);
  assert.equal(independent.differentConnections,true);assert.equal(independent.differentCaptureTracks,true);
  assert.equal(await viewer.view("document.querySelector('[data-testid=assistance-video]').srcObject !== document.querySelector('[data-testid=remote-screen-video]').srcObject"),true);
  const layout=await viewer.view(`(()=>{const panel=document.querySelector('[aria-label="Sessão de assistência remota"]'),video=document.querySelector('[data-testid=assistance-video]'),r=video.getBoundingClientRect();return {mode:panel.dataset.layout,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
  assert.equal(layout.mode,'expanded');assert.ok(layout.width>layout.viewportWidth*.9 && layout.height>layout.viewportHeight*.7,'Assistance must use the main application area');
  assert.equal(await host.view("document.querySelector('[aria-label=\"Sessão de assistência remota\"]').dataset.layout==='host' && !document.querySelector('[data-testid=assistance-video]')"),true,'Host notification is compact and never pretends to be the remote video');

  await host.main("(()=>{globalThis.fixtureHelperOutput='';nativeFixtureProc.stdout.on('data',d=>fixtureHelperOutput+=d.toString());return true;})()");
  const focusFixture=async()=>{for(let attempt=0;attempt<5;attempt++){const focused=await host.main(`(async()=>{const {BrowserWindow}=${electron};for(const w of BrowserWindow.getAllWindows())if(w!==fixture && w.webContents.getURL().startsWith('data:'))w.hide();fixture.show();fixture.focus();fixture.moveTop();const handle=fixture.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());return new Promise(resolve=>{const child=process.getBuiltinModule('child_process').spawn(process.resourcesPath+'/app.asar.unpacked/desktop/NativeInputHost.exe',['--target-window',hwnd],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.on('error',e=>resolve({ok:false,output:String(e.message)}));child.on('exit',()=>resolve({ok:output.includes('OK FOCUS_TEST'),output}));child.stdin.end('STATUS\\nFOCUS_TEST\\nEXIT\\n');});})()`);if(focused.ok)return;console.log(JSON.stringify({ownedFixtureFocus:focused,attempt}));await delay(100);}throw Error('Windows refused the owned native fixture focus; no input is sent');};
  await focusFixture();await delay(100);
  const fixture = code => host.main(`fixture.webContents.executeJavaScript(${JSON.stringify(code)})`);
  const assistanceClick=async title=>{const point=await viewer.view(`(()=>{const p=document.querySelector('[aria-label="Sessão de assistência remota"]'),b=[...p.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(title)});if(!b)throw Error('Missing assistance control');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await viewer.main(`(async()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));if(!w.webContents.debugger.isAttached())w.webContents.debugger.attach('1.3');for(const type of ['mousePressed','mouseReleased'])await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:${point.x},y:${point.y},button:'left',clickCount:1});return true;})()`);};
  const nativeAck=async(before,command)=>{
    for(let i=0;i<100;i++){
      const status=await host.view('desktopInteraction.getStatus()');
      if(status.lastSequence>before && status.lastInput===command && ['OK','ERROR'].includes(status.lastNativeAck))return status;
      await delay(30);
    }
    throw Error(`Missing actual native acknowledgement for ${command}`);
  };
  const norm = async selector => {
    const point = await fixture(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,60)};})()`);
    return host.main(`(()=>{const {screen}=${electron},b=fixture.getContentBounds(),d=screen.getAllDisplays().find(d=>String(d.id)===${JSON.stringify(source.display_id)}),p=screen.dipToScreenPoint({x:Math.round(b.x+${point.x}),y:Math.round(b.y+${point.y})}),r=screen.dipToScreenRect(null,d.bounds);return {x:(p.x-r.x)/(r.width-1),y:(p.y-r.y)/(r.height-1),physical:p};})()`);
  };
  const pointer = async (type, point, button = 0) => {
    await focusFixture();
    const before=(await host.view('desktopInteraction.getStatus()')).lastSequence ?? -1;
    const active=await viewer.view("!!document.querySelector('[tabindex=\"0\"].ring-2')");
    const coordinates=await viewer.view(`(()=>{const el=document.querySelector('[tabindex="0"].ring-2') || document.querySelector('[data-testid=remote-screen-video]').parentElement,r=el.getBoundingClientRect(),v=el.querySelector('video'),ratio=v.videoWidth/v.videoHeight;let w=r.width,h=r.height;if(w/h>ratio)w=h*ratio;else h=w/ratio;return {x:Math.round(r.x+(r.width-w)/2+${point.x}*w),y:Math.round(r.y+(r.height-h)/2+${point.y}*h)};})()`);
    const inputType = {pointermove:'mouseMoved',pointerdown:'mousePressed',pointerup:'mouseReleased'}[type];
    // sendInputEvent requires Windows foreground focus, which this single-PC
    // test reserves for the host's guarded native fixture. CDP produces trusted
    // Chromium events without moving the physical focus away from that fixture.
    await viewer.main(`(async()=>{const {BrowserWindow}=${electron};const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));if(!w.webContents.debugger.isAttached())w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:${JSON.stringify(inputType)},x:${coordinates.x},y:${coordinates.y},button:${JSON.stringify(type==='pointermove'?'none':['left','middle','right'][button])},clickCount:${type==='pointermove'?0:1}});return true;})()`);
    if(active)await nativeAck(before,{pointermove:'MOVE',pointerdown:'MOUSEDOWN',pointerup:'MOUSEUP'}[type]);
  };
  const p = await norm('#click'); const before = await host.main(`(()=>{const {screen}=${electron};return screen.getCursorScreenPoint();})()`);
  await pointer('pointermove', p); await delay(300);
  const after = await host.main(`(()=>{const {screen}=${electron};return screen.dipToScreenPoint(screen.getCursorScreenPoint());})()`);
  const appliedPosition=baseline?after:(await host.view('desktopInteraction.getStatus()')).lastNativePosition;
  const trace = { mode: 'packaged native desktop', capture, audioBefore, audioAfter, decoded, playback, ownAudioExclusion, before, expected: p.physical, after, appliedPosition, nativeMouseMoved: !!appliedPosition && Math.abs(appliedPosition.x-p.physical.x)<=3 && Math.abs(appliedPosition.y-p.physical.y)<=3, canvasOverlay: await host.view("!!document.querySelector('canvas')") };
  await fs.mkdir('docs/validation', { recursive: true });
  if(!baseline){trace.nativeStatus=await host.view('desktopInteraction.getStatus()');trace.inputLog=(await fs.readFile(path.join(temp,'nativehost/logs/app.log'),'utf8')).split('\n').filter(line=>line.includes('[ASSIST]'));console.log(JSON.stringify(trace,null,2));await fs.writeFile('docs/validation/native-pipeline-probe.json',JSON.stringify(trace,null,2));}
  if (baseline) { await fs.writeFile('docs/validation/baseline-native.json', JSON.stringify(trace, null, 2)); console.log(JSON.stringify(trace, null, 2)); }
  assert.equal(trace.nativeMouseMoved, true, 'Input stops before the real Windows cursor');
  assert.equal(trace.canvasOverlay, false, 'A native desktop must never select a canvas target');
  if (!baseline) {
    await pointer('pointerdown', p); await pointer('pointerup', p); await delay(200); assert.equal(await fixture('clicks'), 1);
    await viewer.view("(() => {window.fullscreenProbe={requests:0,result:null};const original=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(...args){fullscreenProbe.requests++;return original.apply(this,args).then(r=>{fullscreenProbe.result='resolved';return r;},e=>{fullscreenProbe.result=String(e);throw e;});};return true;})()");
    await viewer.main(`(()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));w.show();w.focus();return true;})()`);await assistanceClick('Tela cheia');await delay(500);console.log('Fullscreen probe',JSON.stringify(await viewer.view("({probe:fullscreenProbe,enabled:document.fullscreenEnabled,element:document.fullscreenElement?.tagName,visibility:document.visibilityState,focus:document.hasFocus(),panel:document.querySelector('[aria-label=\"Sessão de assistência remota\"]').getBoundingClientRect().toJSON()})")));await viewer.wait("document.fullscreenElement===document.querySelector('[aria-label=\"Sessão de assistência remota\"]')",'assistance fullscreen');
    const beforeFullscreenClick=await fixture('clicks');await pointer('pointerdown',p);await pointer('pointerup',p);await delay(200);assert.equal(await fixture('clicks'),beforeFullscreenClick+1,'Fullscreen coordinates must still click the Windows target');
    await assistanceClick('Sair de tela cheia');await viewer.wait("!document.fullscreenElement",'exit fullscreen');
    await viewer.click('Reduzir janela');await viewer.wait("document.querySelector('[aria-label=\"Sessão de assistência remota\"]').dataset.layout==='compact'",'compact assistance');
    const beforeCompactClick=await fixture('clicks');await pointer('pointerdown',p);await pointer('pointerup',p);await delay(200);assert.equal(await fixture('clicks'),beforeCompactClick+1,'Compact coordinates must still click the Windows target');
    await viewer.click('Ampliar janela');await viewer.wait("document.querySelector('[aria-label=\"Sessão de assistência remota\"]').dataset.layout==='expanded'",'restore expanded assistance');
    await viewer.main(`(async()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.resolve('artifacts/assistance-expanded-1.0.19.png'))},(await w.webContents.capturePage()).toPNG());return true;})()`);

    for(let i=0;i<2;i++){await pointer('pointerdown',p);await pointer('pointerup',p);}await delay(150);assert.ok(await fixture("events.some(e=>e.type==='dblclick')"));
    for(const button of [1,2]){await pointer('pointerdown',p,button);await pointer('pointerup',p,button);}await delay(150);console.log(JSON.stringify({buttonEvents:await fixture("events.filter(e=>e.type==='pointerdown' || e.type==='pointerup')")}));assert.ok(await fixture("events.some(e=>e.type==='pointerdown' && e.button===1) && events.some(e=>e.type==='pointerdown' && e.button===2)"));
    const scrollPoint=await norm('#scroll');await pointer('pointermove',scrollPoint);await delay(50);await pointer('pointerdown',scrollPoint);await pointer('pointermove',{...scrollPoint,x:scrollPoint.x+.03});await delay(50);await pointer('pointermove',{...scrollPoint,x:scrollPoint.x+.06});await pointer('pointerup',{...scrollPoint,x:scrollPoint.x+.06});await delay(100);assert.ok(await fixture("events.some(e=>e.type==='pointermove' && e.buttons===1)"));
    const wheel = async (dx,dy)=>{
      const before=(await host.view('desktopInteraction.getStatus()')).lastSequence ?? -1;
      await viewer.view(`(()=>{const el=document.querySelector('[tabindex="0"].ring-2'),v=el.querySelector('video'),r=el.getBoundingClientRect(),ratio=v.videoWidth/v.videoHeight;let w=r.width,h=r.height;if(w/h>ratio)w=h*ratio;else h=w/ratio;el.dispatchEvent(new WheelEvent('wheel',{clientX:r.x+(r.width-w)/2+${scrollPoint.x}*w,clientY:r.y+(r.height-h)/2+${scrollPoint.y}*h,deltaX:${dx},deltaY:${dy},deltaMode:0,bubbles:true,cancelable:true}));return true;})()`);
      await nativeAck(before,'SCROLL');
    };
    await wheel(0,300);await delay(200);assert.ok(await fixture("document.querySelector('#scroll').scrollTop>0"),'Vertical scroll must change the actual Windows target');
    await wheel(300,0);await delay(200);assert.ok(await fixture("document.querySelector('#scroll').scrollLeft>0"),'Horizontal scroll must change the actual Windows target');
    const editor=await norm('#editor');await pointer('pointermove',editor);await delay(50);await pointer('pointerdown',editor);await pointer('pointerup',editor);await delay(100);
    const text='ação e coração 123';
    await viewer.view(`(()=>{document.querySelector('textarea[aria-label="Teclado remoto"]').focus();return true;})()`);
    await viewer.main(`(async()=>{const {BrowserWindow}=${electron};await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar')).webContents.debugger.sendCommand('Input.insertText',{text:${JSON.stringify(text)}});return true;})()`);await delay(200);assert.equal(await fixture("document.querySelector('#editor').value"),text);
    const key=async(type,key,code,ctrl=false)=>{await focusFixture();const before=(await host.view('desktopInteraction.getStatus()')).lastSequence ?? -1;await viewer.view(`(()=>{const e=document.querySelector('textarea[aria-label="Teclado remoto"]');e.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{key:${JSON.stringify(key)},code:${JSON.stringify(code)},ctrlKey:${ctrl},bubbles:true,cancelable:true}));return true;})()`);await nativeAck(before,type==='keydown'?'KEYDOWN':'KEYUP');};
    for(const [k,code] of [['Enter','Enter'],['Backspace','Backspace'],['Delete','Delete'],['Tab','Tab'],['ArrowLeft','ArrowLeft'],['ArrowRight','ArrowRight'],['ArrowUp','ArrowUp'],['ArrowDown','ArrowDown'],['Escape','Escape'],['Shift','ShiftLeft'],['Alt','AltLeft']]){await key('keydown',k,code);await key('keyup',k,code);}
    await key('keydown','Control','ControlLeft',true);await key('keydown','a','KeyA',true);await key('keyup','a','KeyA',true);await key('keyup','Control','ControlLeft');await delay(200);
    // Real helper rejection previously revoked the entire session. It must reach
    // both UIs and allow the next valid command without asking for consent again.
    await key('keydown','Unidentified','Unsupported');await key('keyup','Unidentified','Unsupported');
    await viewer.wait("document.body.textContent.includes('Esta tecla não é suportada')",'recoverable native error reaches viewer');
    assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'RUNNING');
    await pointer('pointermove',p);await delay(200);
    assert.equal((await host.view('desktopInteraction.getStatus()')).lastNativeAck,'OK');
    assert.equal(await viewer.view("!!document.querySelector('[tabindex=\"0\"].ring-2') && !document.body.textContent.includes('Esta tecla não é suportada')"),true,'Next successful input clears the error and keeps consent');
    await fs.writeFile('docs/validation/native-keys-probe.json',JSON.stringify({events:await fixture('events'),status:await host.view('desktopInteraction.getStatus()'),log:(await fs.readFile(path.join(temp,'nativehost/logs/app.log'),'utf8')).split('\n').filter(line=>line.includes('[ASSIST]'))},null,2));
    assert.ok(await fixture("events.some(e=>e.type==='keydown' && e.code==='KeyA' && e.ctrl)"));
    const applied=await host.view('desktopInteraction.getStatus()');assert.equal(applied.nativeHost,'RUNNING');assert.equal(applied.lastNativeAck,'OK');
    await viewer.click('Diagnóstico');await viewer.wait("document.body.textContent.includes('LAST NATIVE ACK: OK')",'native ACK reaches viewer');
    const transport=await viewer.view("document.querySelector('[aria-label=\"Diagnóstico da assistência\"]').innerText");assert.match(transport,/DataChannel aberto/);await viewer.click('Fechar');
    const releasesBefore=await fixture("events.filter(e=>e.type==='keyup' && e.code==='ControlLeft').length");
    await key('keydown','Control','ControlLeft',true);await pointer('pointerdown',editor);await delay(100);
    await host.click('Encerrar assistência');await viewer.wait("!document.querySelector('[tabindex=\"0\"].ring-2')",'revocation');await delay(150);
    await fs.writeFile('artifacts/native-release-probe.json',JSON.stringify({events:await fixture('events'),status:await host.view('desktopInteraction.getStatus()'),fixtureFocused:await host.main('fixture.isFocused()'),output:await host.main('fixtureHelperOutput'),log:await fs.readFile(path.join(temp,'nativehost/logs/app.log'),'utf8')},null,2));
    for(let i=0;i<20;i++){if(await fixture(`events.filter(e=>e.type==='keyup' && e.code==='ControlLeft').length>${releasesBefore}`))break;await delay(100);}
    assert.ok(await fixture(`events.filter(e=>e.type==='keyup' && e.code==='ControlLeft').length>${releasesBefore}`),'Revocation releases held keys');
    assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'STOPPED');
    const clicksBefore=await fixture('clicks');await pointer('pointerdown',p);await pointer('pointerup',p);await delay(100);assert.equal(await fixture('clicks'),clicksBefore);
    assert.equal(await host.view("document.querySelector('video').srcObject.getVideoTracks()[0].readyState==='live' && document.body.textContent.includes('Conectado à chamada')"),true);
    assert.equal(await viewer.view("document.querySelector('[data-testid=remote-screen-video]').videoWidth>0 && document.querySelector('[data-testid=voice-audio]').srcObject.getAudioTracks()[0].readyState==='live'"),true);
    await viewer.click('Solicitar assistência');await host.wait("document.body.textContent.includes('Solicitação de assistência')",'second request');await host.click('Autorizar assistência');await viewer.wait("!!document.querySelector('[tabindex=\"0\"].ring-2')",'second authorization');
    await viewer.click('Parar de Assistir');await viewer.wait("!document.querySelector('[data-testid=remote-screen-video]')",'close share viewer');
    assert.equal(await viewer.view("!!document.querySelector('[tabindex=\"0\"].ring-2') && document.querySelector('[data-testid=assistance-video]').videoWidth>0"),true);
    await host.click('Parar Compartilhamento');await delay(300);
    assert.equal(await viewer.view("!!document.querySelector('[tabindex=\"0\"].ring-2') && document.querySelector('[data-testid=assistance-video]').srcObject.getVideoTracks()[0].readyState==='live'"),true);
    assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'RUNNING');
    const clickCount=await fixture('clicks');await pointer('pointerdown',p);await pointer('pointerup',p);await delay(200);assert.equal(await fixture('clicks'),clickCount+1,'Native click survives screen broadcast teardown');
    await pointer('pointerdown',editor);await pointer('pointerup',editor);
    await viewer.main(`(async()=>{const {BrowserWindow}=${electron};await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar')).webContents.debugger.sendCommand('Input.insertText',{text:' sessão independente'});return true;})()`);await delay(200);
    assert.ok(await fixture("document.querySelector('#editor').value.includes('sessão independente')"),'Native keyboard survives screen broadcast teardown');
    await host.main("(()=>{fixture.show();fixture.focus();fixture.moveTop();return true;})()");await key('keydown','Shift','ShiftLeft');await delay(150);
    const shiftBefore=await fixture("events.filter(e=>e.type==='keyup' && e.code==='ShiftLeft').length");
    await viewer.view("(()=>{window.testPcs.find(pc=>pc.connectionState==='connected' && pc.sctp && !pc.getSenders().some(s=>s.track)).close();return true;})()");
    for(let i=0;i<80;i++){if((await host.view('desktopInteraction.getStatus()')).nativeHost==='STOPPED')break;await delay(100);}assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'STOPPED');
    for(let i=0;i<20;i++){if(await fixture(`events.filter(e=>e.type==='keyup' && e.code==='ShiftLeft').length>${shiftBefore}`))break;await delay(100);}
    assert.ok(await fixture(`events.filter(e=>e.type==='keyup' && e.code==='ShiftLeft').length>${shiftBefore}`));
    await viewer.click('Solicitar assistência');await host.wait("document.body.textContent.includes('Solicitação de assistência')",'call-bound consent request');await host.click('Autorizar assistência');await viewer.wait("!!document.querySelector('[tabindex=\"0\"].ring-2')",'call-bound authorization');
    await host.main("(()=>{fixture.show();fixture.focus();fixture.moveTop();return true;})()");await key('keydown','Shift','ShiftLeft');await delay(150);const voiceShiftBefore=await fixture("events.filter(e=>e.type==='keyup' && e.code==='ShiftLeft').length");
    await viewer.click('Desconectar da Chamada');await viewer.wait("!document.querySelector('[tabindex=\"0\"].ring-2')",'voice exit revokes assistance');
    for(let i=0;i<80;i++){if((await host.view('desktopInteraction.getStatus()')).nativeHost==='STOPPED')break;await delay(100);}assert.equal((await host.view('desktopInteraction.getStatus()')).nativeHost,'STOPPED');assert.ok(await fixture(`events.filter(e=>e.type==='keyup' && e.code==='ShiftLeft').length>${voiceShiftBefore}`),'Voice exit releases held inputs');
    const afterVoice=await fixture('clicks');assert.equal((await host.view(`desktopInteraction.movePointer('ended-call-session',${JSON.stringify(source.display_id)},.2,.2)`)).code,'SESSION_INACTIVE');await delay(150);assert.equal(await fixture('clicks'),afterVoice,'Voice exit prevents new native input');
    const report={passed:true,version:await host.view('electronAPI.getAppVersion()'),...trace,independent,layout,fullscreenNativeClick:true,compactNativeClick:true,busyProtocolDesktopNativeInput:true,assistanceOwnVideo:true,shareViewerStopPreservesAssistance:true,shareStopPreservesNativeMouseAndKeyboard:true,voiceLeaveRevokesAssistance:true,displayScale:display.scaleFactor,displayBounds:display.bounds,nativeClick:true,rightClick:true,middleClick:true,doubleClick:true,drag:true,verticalScroll:true,horizontalScroll:true,unicode:text,controlShortcut:true,keyboard:true,trustedViewerPointer:true,trustedTextInsertion:true,recoverableErrorPreservesConsent:true,errorRecoveryReachesViewer:true,nativeApplied:applied,nativeAckReachedViewer:true,transport:'DataChannel',consentRequired:true,revocationReleasesHeldInputs:true,revocationStopsInput:true,screenAndVoiceContinue:true,dataChannelCloseRevokes:true,scope:'Two packaged clients on one Windows computer; real Windows loopback, RTP and SendInput constrained to an owned window. Viewer pointers/text use trusted Chromium CDP input; shortcuts/wheel and microphones are synthetic. PCM is inspected separately; the real unmuted HTML audio output is played briefly to avoid feedback from sharing one physical output device. Native dialog approval is substituted only in the test inspector. Physical two-PC and UAC/administrator workflows are not automated.'};
    await fs.writeFile('docs/validation/two-desktops.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }
  }
} catch(error) {
  for(const c of clients) {try{console.log(JSON.stringify({client:c.name,body:await c.view('document.body.innerText'),native:await c.view('desktopInteraction.getStatus()'),helper:c.name==='nativehost'?await c.main('globalThis.fixtureHelperOutput || null'):null}));}catch{}}
  throw error;
} finally {
  for (const c of [...clients].reverse()) { try { if(c.main)await c.main(`(()=>{setTimeout(()=>${electron}.app.exit(0),30);return true;})()`);await delay(50); } catch {} c.ws?.close(); await c.child.kill(); }
  backend.kill();
  soundPlayer?.kill();
}
