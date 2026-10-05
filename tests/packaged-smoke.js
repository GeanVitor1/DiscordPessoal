import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const expectedVersion=JSON.parse(await fs.readFile('package.json','utf8')).version;
const output=path.resolve(process.argv[2]?.startsWith('--')?'dist':process.argv[2] || 'dist'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-package-'));
const env={...process.env,APPDATA:temp};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(path.join(output,'win-unpacked/MeuApp.exe'),['--inspect=127.0.0.1:15291',`--user-data-dir=${temp}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let ws,backend,diagnostic='';child.stderr.on('data',d=>diagnostic+=d.toString());
try {
  let endpoint;
  for(let i=0;i<100;i++){try{const targets=await fetch('http://127.0.0.1:15291/json/list').then(r=>r.json());endpoint=targets[0]?.webSocketDebuggerUrl;if(endpoint)break;}catch{}if(child.exitCode!==null)throw Error(diagnostic);await new Promise(r=>setTimeout(r,100));}
  assert.ok(endpoint,'Packaged Electron inspector unavailable: '+diagnostic);
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const message=JSON.parse(e.data);if(message.id) {const p=pending.get(message.id);pending.delete(message.id);p?.(message);}});
  async function evaluate(expression) {
    const n=++id;const response=new Promise(resolve=>pending.set(n,resolve));ws.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
    const message=await Promise.race([response,new Promise((_,reject)=>setTimeout(()=>reject(Error('Inspector timeout')),5000))]);if(message.error || message.result?.exceptionDetails)throw Error(JSON.stringify(message.error || message.result.exceptionDetails));return message.result.result.value;
  }
  const electron="process.getBuiltinModule('module').createRequire(process.execPath)('electron')";
  let report;
  for(let i=0;i<100;i++) {
    report=await evaluate(`(async()=>{const {app,BrowserWindow}=${electron};const w=BrowserWindow.getAllWindows()[0];if(!w || w.webContents.isLoading() || !w.webContents.getURL().includes('app.asar'))return null;const view=await w.webContents.executeJavaScript('(async()=>({desktop:electronAPI.isDesktop,version:await electronAPI.getAppVersion(),nativeText:typeof desktopInteraction.textInput,login:!!document.querySelector(\\\"[data-testid=auth-submit]\\\") }))()');return {packaged:app.isPackaged,url:w.webContents.getURL(),...view};})()`);
    if(report?.login)break;await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(report.packaged,true);assert.equal(report.version,expectedVersion);assert.equal(report.desktop,true);assert.equal(report.nativeText,'function');assert.equal(report.login,true);
  if(process.argv.includes('--ui-test')) {
    const base='http://127.0.0.1:15010';
    backend=spawn(process.execPath,['server/src/server.js'],{env:{...process.env,DATABASE_URL:'',HOST:'127.0.0.1',PORT:'15010',SQLITE_PATH:path.join(temp,'test.db')},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let backendLog='';backend.stdout.on('data',d=>backendLog+=d);backend.stderr.on('data',d=>backendLog+=d);
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(backend.exitCode!==null || i===99)throw Error(backendLog);await new Promise(r=>setTimeout(r,100));}
    const registered=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'packagecheck',username:'Package Check',password:'Package-test-password-123'})});
    assert.equal(registered.status,201);const account=await registered.json();
    const view=code=>evaluate(`(async()=>{const {BrowserWindow}=${electron};return BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(code)},true);})()`);
    const waitView=async(code,label)=>{for(let i=0;i<150;i++){if(await view(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Packaged UI timeout: '+label+': '+await view('document.body.innerText'));};
    const click=title=>view(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(title)} || b.getAttribute('aria-label')===${JSON.stringify(title)} || b.textContent.trim()===${JSON.stringify(title)});if(!b)throw Error('Missing button '+${JSON.stringify(title)});b.click();return true;})()`);
    await evaluate(`(async()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows()[0];globalThis.packageRuntimeErrors=[];w.webContents.on('console-message',event=>{if(/ReferenceError|TypeError/.test(event.message))globalThis.packageRuntimeErrors.push(event.message);});await w.webContents.executeJavaScript(${JSON.stringify(`(async()=>{localStorage.setItem('backend_mode','custom');localStorage.setItem('backend_url',${JSON.stringify(base)});await electronAPI.auth.saveToken(${JSON.stringify(base)},${JSON.stringify(account.token)});return true;})()`)});w.reload();return true;})()`);
    await waitView("document.body.textContent.includes('Canais de Voz')",'authenticated app');
    await click('Configurações de Usuário');
    await waitView("!!document.querySelector('[role=dialog][aria-label=\"Configurações de Usuário\"]')",'settings');
    await evaluate(`(async()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows()[0];w.showInactive();await w.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');const screenshot=await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.resolve('docs/validation/settings-packaged.png'))},screenshot.toPNG());return true;})()`);
    await click('Salvar Alterações');await waitView("!document.querySelector('[role=dialog]')",'profile save');
    await click('Configurações de Usuário');await waitView("!!document.querySelector('[role=dialog]')",'settings reopen');
    await view("(() => {document.querySelector('[aria-label=\"Fechar configurações\"]').click();return true;})()");
    const setInput=(selector,value)=>view(`(() => {const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await click('Configurações de Usuário');await click('Aparência');await click('Claro');await waitView("document.documentElement.dataset.theme==='light'",'packaged light theme');
    async function capture(name){await evaluate(`(async()=>{const {BrowserWindow}=${electron},w=BrowserWindow.getAllWindows()[0];await w.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.resolve('docs/validation/appearance-packaged-'+name+'.png'))},(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());return true;})()`);}
    await capture('light');await click('Meia-noite');await waitView("document.documentElement.dataset.theme==='midnight'",'packaged midnight theme');await waitView("getComputedStyle(document.querySelector('.theme-preview-light')).color==='rgb(23, 25, 29)'",'light preview remains legible in dark theme');await capture('midnight');
    await click('Floresta');await waitView("document.documentElement.dataset.theme==='forest'",'packaged forest theme');await click('Pôr do sol');await waitView("document.documentElement.dataset.theme==='sunset'",'packaged sunset theme');
    await view("(() => {document.querySelector('input[aria-label=\"Mensagens compactas\"]').click();document.querySelector('input[aria-label=\"Reduzir movimento\"]').click();return true;})()");await click('Notificações');
    await view("(() => {document.querySelector('input[aria-label=\"Sons do aplicativo\"]').click();document.querySelector('input[aria-label=\"Mostrar prévia nas notificações\"]').click();return true;})()");await click('Fechar');
    await evaluate(`(()=>{${electron}.BrowserWindow.getAllWindows()[0].reload();return true;})()`);await waitView("document.body.textContent.includes('Canais de Voz') && document.documentElement.dataset.theme==='sunset' && document.documentElement.dataset.compact==='true'",'packaged preferences persist across reload');
    await click('Configurações de Usuário');await click('Aparência');await click('Restaurar preferências padrão');await click('Fechar');
    await waitView("!!document.querySelector('input[aria-label=\"Mensagem do canal\"]')",'packaged chat');
    await setInput('input[aria-label="Mensagem do canal"]','Mensagem empacotada original');await view("(() => {document.querySelector('input[aria-label=\"Mensagem do canal\"]').closest('form').requestSubmit();return true;})()");
    await waitView("document.body.textContent.includes('Mensagem empacotada original') && document.querySelector('input[aria-label=\"Mensagem do canal\"]').value===''",'packaged message send');
    await view("(() => {const row=[...document.querySelectorAll('.message-row')].find(r=>r.textContent.includes('Mensagem empacotada original'));row.querySelector('button[title=Responder]').click();return true;})()");await setInput('input[aria-label="Mensagem do canal"]','Resposta empacotada');await view("(() => {document.querySelector('input[aria-label=\"Mensagem do canal\"]').closest('form').requestSubmit();return true;})()");
    await waitView("document.body.textContent.includes('Resposta empacotada') && !document.body.textContent.includes('Respondendo a')",'packaged quoted reply');
    await view("(() => {const row=[...document.querySelectorAll('.message-row')].find(r=>r.textContent.includes('Mensagem empacotada original') && !r.textContent.includes('↪'));row.querySelector('[aria-label=\"Editar mensagem\"]').click();return true;})()");await setInput('textarea[aria-label="Editar conteúdo da mensagem"]','Mensagem empacotada editada');await click('Salvar mensagem');
    await waitView("document.body.textContent.includes('Mensagem empacotada editada') && !document.body.textContent.includes('Mensagem empacotada original')",'packaged edit and quote refresh');
    await setInput('input[aria-label="Buscar mensagens no canal"]','empacotada editada');await click('Buscar');await waitView("document.body.textContent.includes('1 resultado(s)')",'packaged search');await click('Fechar busca');
    await view("(() => {const row=[...document.querySelectorAll('.message-row')].find(r=>r.textContent.includes('Mensagem empacotada editada') && !r.textContent.includes('↪'));row.querySelector('[aria-label=\"Excluir mensagem\"]').click();return true;})()");await waitView("!!document.querySelector('[role=dialog][aria-label=\"Excluir mensagem\"]')",'packaged delete confirmation');await click('Excluir');await waitView("document.body.textContent.includes('Mensagem excluída') && !document.body.textContent.includes('Mensagem empacotada editada')",'packaged deletion and quote refresh');
    const created=await fetch(base+'/api/servers',{method:'POST',headers:{Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify({name:'Convites empacotados'})}).then(r=>r.json());
    await waitView("[...document.querySelectorAll('button')].some(b=>b.title==='Convites empacotados')",'packaged server creation');await click('Convites empacotados');await click('Convidar pessoas');await click('Gerar link de convite');await waitView("!!document.querySelector('input[aria-label=\"Link de convite\"]')",'packaged link generation');
    const link=await view("document.querySelector('input[aria-label=\"Link de convite\"]').value");assert.ok(link.startsWith(base+'/?invite='));await click('Revogar');await waitView("document.body.textContent.includes('Convite revogado.')",'packaged invitation revocation');await click('Fechar convites');
    await click('Entrar em servidor');await setInput('input[aria-label="Link ou código do convite"]',link);await waitView("document.body.textContent.includes('Convite inválido, esgotado ou expirado')",'packaged revoked link rejected');await view("(() => {document.querySelector('[aria-label=\"Fechar convite\"]').click();return true;})()");
    await click('Comunidade Principal');
    report.features={themes:['light','midnight','forest','sunset'],preferencesPersistAfterReload:true,notificationPreferences:true,replyEditDelete:true,quotedContextUpdates:true,search:true,inviteLink:true,inviteRevocation:true};
    await view(`(() => {const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.testAudio=new AudioContext();const destination=window.testAudio.createMediaStreamDestination();navigator.mediaDevices.getUserMedia=constraints=>constraints.audio && !constraints.audio.mandatory && !constraints.video ? Promise.resolve(destination.stream.clone()) : native(constraints);return true;})()`);
    await waitView("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Sala de Bate-Papo' && !b.disabled)",'signaling');
    await click('Sala de Bate-Papo');await waitView("document.body.textContent.includes('Conectado à chamada')",'voice join');
    await click('Compartilhar Tela');await waitView("document.body.textContent.includes('Selecione uma tela inteira ou janela aberta')",'native screen picker');
    const source=await view("electronAPI.getScreenSources().then(sources=>sources.find(s=>s.id.startsWith('screen:') && s.display_id))");assert.ok(source);
    await click(source.name);await waitView("[...document.querySelectorAll('video')].some(v=>v.srcObject?.getVideoTracks()[0]?.readyState==='live' && v.videoWidth>0)",'real desktop screen preview');
    await click('Parar Compartilhamento');
    await click('Desconectar da Chamada');await waitView("!document.body.textContent.includes('Conectado à chamada')",'voice leave');
    assert.deepEqual(await evaluate('globalThis.packageRuntimeErrors'),[]);
    report.ui={settingsOpenSaveReopen:true,voiceJoinLeave:true,nativeScreenPicker:true,realScreenPreview:true,rendererErrors:0,microphone:'synthetic audio; actual desktop capture'};
  }
  if(process.argv.includes('--capture-test')) {
    report.nativeCapture=await evaluate(`(async()=>{const {BrowserWindow}=${electron};const w=BrowserWindow.getAllWindows()[0];return w.webContents.executeJavaScript(\`(async()=>{const sources=await electronAPI.getScreenSources();const source=sources.find(s=>s.id.startsWith('screen:') && s.display_id);if(!source)throw Error('No full display source');const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:source.id,maxWidth:1920,maxHeight:1080,maxFrameRate:30}}});try{const video=document.createElement('video');video.muted=true;video.srcObject=stream;await video.play();const result={realDesktopSource:true,width:video.videoWidth,height:video.videoHeight,trackSettings:stream.getVideoTracks()[0].getSettings(),live:stream.getVideoTracks()[0].readyState==='live'};video.srcObject=null;return result;}finally{stream.getTracks().forEach(t=>t.stop());}})()\`);})()`);
    assert.ok(report.nativeCapture.realDesktopSource && report.nativeCapture.live && report.nativeCapture.width>0 && report.nativeCapture.height>0);
  }
  const helper=spawn(path.join(output,'win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let helperOutput='';helper.stdout.on('data',d=>helperOutput+=d.toString());helper.stdin.end('PING\nEXIT\n');assert.equal(await new Promise(resolve=>helper.on('exit',resolve)),0);assert.match(helperOutput,/READY/);assert.match(helperOutput,/PONG/);
  report={...report,passed:true,packagedHelperStarts:true,helperScope:'PING only; no physical input in this package smoke test'};
  if(process.argv.includes('--toast-test')) {
    report.osNotification=await evaluate(`(async()=>{
      const {BrowserWindow,Notification}=${electron},w=BrowserWindow.getAllWindows()[0];
      let done;const notification=new Promise(resolve=>{done=resolve;});
      const original=Notification.prototype.show;
      Notification.prototype.show=function(){this.once('show',()=>{done({shown:true});setTimeout(()=>this.close(),1000);});this.once('failed',(_event,message)=>done({shown:false,reason:String(message)}));original.call(this);};
      try {w.hide();const submitted=await w.webContents.executeJavaScript("electronAPI.notifications.show({type:'dm',title:'MeuApp — teste local',body:'Validação da notificação Windows da versão 1.0.11.',route:{dmId:'native-toast-test'}})");if(!submitted)return {shown:false,reason:'Notification was suppressed'};return await Promise.race([notification,new Promise(resolve=>setTimeout(()=>resolve({shown:false,reason:'No Windows show event received'}),3500))]);}
      finally{Notification.prototype.show=original;}
    })()`);
  }
  await fs.writeFile('docs/validation/packaged.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  await evaluate(`${electron}.app.exit(0)`);
}finally{ws?.close();child.kill();backend?.kill();}
