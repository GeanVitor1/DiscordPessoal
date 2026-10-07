import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const output=path.resolve(process.env.MEUAPP_TEST_OUTPUT || 'artifacts/desktop-1.1.2');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-performance-'));
const env={...process.env,APPDATA:temp};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(path.join(output,'win-unpacked/MeuApp.exe'),['--inspect=127.0.0.1:15301',`--user-data-dir=${temp}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const base='http://127.0.0.1:15018';
const backendEntry=process.env.MEUAPP_TEST_BACKEND_ENTRY || 'server/src/server.js';
const backend=spawn(process.execPath,[backendEntry],{env:{...process.env,DATABASE_URL:'',HOST:'127.0.0.1',PORT:'15018',SQLITE_PATH:path.join(temp,'test.db')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let ws,logs='',backendLogs='';child.stderr.on('data',d=>logs+=d);backend.stderr.on('data',d=>backendLogs+=d);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const electron="process.getBuiltinModule('module').createRequire(process.execPath)('electron')";
try {
  for(let i=0;i<200;i++){try{await fs.stat(path.join(temp,'logs/app.log'));break;}catch{}if(child.exitCode!==null)throw Error(logs);await delay(50);}
  let endpoint;for(let i=0;i<200;i++){try{endpoint=(await fetch('http://127.0.0.1:15301/json/list').then(r=>r.json()))[0]?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await delay(50);}
  assert.ok(endpoint,logs);ws=new WebSocket(endpoint);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);});
  const main=async expression=>{const n=++id;const m=await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Performance inspector timeout')),15000);pending.set(n,m=>{clearTimeout(timer);pending.delete(n);r(m);});ws.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});if(m.result?.exceptionDetails || m.error)throw Error(JSON.stringify(m.result?.exceptionDetails || m.error));return m.result.result.value;};
  const view=code=>main(`(()=>{const w=${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app.asar'));return w?.webContents.executeJavaScript(${JSON.stringify(code)},true);})()`);
  const wait=async(code,label)=>{const limit=Date.now()+20000;while(Date.now()<limit){if(await view(code))return;await delay(10);}throw Error(label+': '+await view('document.body.innerText'));};
  const click=text=>view(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(text)} || b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing control');b.click();return true;})()`);
  await wait("!!document.querySelector('[data-testid=auth-submit]')",'login');
  for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(backend.exitCode!==null)throw Error(backendLogs);await delay(50);}
  const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'performance',username:'Performance Test',password:'Performance-test-password-123'})});assert.equal(response.status,201);const account=await response.json();
  await view(`(async()=>{localStorage.setItem('backend_mode','custom');localStorage.setItem('backend_url',${JSON.stringify(base)});await electronAPI.auth.saveToken(${JSON.stringify(base)},${JSON.stringify(account.token)});return true;})()`);
  await main(`(()=>{${electron}.BrowserWindow.getAllWindows()[0].reload();return true;})()`);
  await wait("!!document.querySelector('[aria-label=\"Mensagem do canal\"]') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Sala de Bate-Papo' && !b.disabled)",'authenticated signaling');
  await view(`(()=>{const send=WebSocket.prototype.send;window.perfTypingFrames=0;WebSocket.prototype.send=function(data){if(typeof data==='string' && data.includes('["send_message",'))setTimeout(()=>send.call(this,data),250);else {if(typeof data==='string' && data.includes('["typing_start",'))perfTypingFrames++;send.call(this,data);}};return true;})()`);
  const text='Mensagem para medir responsividade';
  await view(`(async()=>{const el=document.querySelector('[aria-label="Mensagem do canal"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;for(let i=1;i<=${text.length};i++){set.call(el,${JSON.stringify(text)}.slice(0,i));el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,15));}return true;})()`);
  const start=performance.now();await view("document.querySelector('[aria-label=\"Mensagem do canal\"]').closest('form').requestSubmit()");
  await wait(`!!document.querySelector('[data-testid="pending-message"]') || [...document.querySelectorAll('.message-row')].some(e=>e.textContent.includes(${JSON.stringify(text)}))`,'first send feedback');const firstFeedbackMs=Math.round(performance.now()-start);
  await wait(`document.querySelector('[aria-label="Mensagem do canal"]').value==='' && [...document.querySelectorAll('.message-row')].some(e=>e.textContent.includes(${JSON.stringify(text)}))`,'confirmed message');const confirmedMs=Math.round(performance.now()-start);
  const typingFrames=await view('perfTypingFrames');
  await view(`(()=>{window.perfAudio=new AudioContext();const destination=perfAudio.createMediaStreamDestination();navigator.mediaDevices.getUserMedia=async()=>{await new Promise(r=>setTimeout(r,60));return destination.stream.clone();};const enumerate=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{await new Promise(r=>setTimeout(r,350));return enumerate();};return true;})()`);
  const joined=performance.now();await click('Sala de Bate-Papo');await wait("document.body.textContent.includes('Conectado à chamada')",'voice join');const joinMs=Math.round(performance.now()-joined);
  await click('Desconectar da Chamada');
  const report={version:await view('electronAPI.getAppVersion()'),passed:true,firstFeedbackMs,confirmedMs,typingFrames,keystrokes:text.length,joinMs,scope:'Packaged app, isolated local backend; outgoing message delayed 250 ms, synthetic microphone delayed 60 ms, device enumeration delayed 350 ms. These measurements isolate application scheduling and do not benchmark internet latency.'};
  if(process.argv.includes('--expect-optimized')){assert.ok(firstFeedbackMs<180,JSON.stringify(report));assert.ok(typingFrames<=2,JSON.stringify(report));assert.ok(joinMs<300,JSON.stringify(report));}
  report.backendEntry=backendEntry;
  await fs.writeFile(`docs/validation/performance-packaged-${report.version}${process.env.MEUAPP_TEST_BACKEND_ENTRY?'-legacy-backend':''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await main(`${electron}.app.exit(0)`);
}finally{ws?.close();child.kill();backend.kill();}
