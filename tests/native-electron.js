import {app,BrowserWindow,screen} from 'electron';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
let window,helper,code=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try {
    window=new BrowserWindow({width:800,height:600,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<html><body style="margin:0;background:#313338;color:white;font:16px Arial"><h2 style="margin:20px">Teste de entrada nativa do MeuApp</h2><p style="margin:20px">Esta janela pertence ao teste. O helper rejeita entrada quando outra janela ganha foco.</p><textarea id="editor" style="margin:20px;width:700px;height:150px"></textarea><div id="pad" style="margin:20px;height:180px;background:#5865f2">Área de mouse, drag, duplo clique e scroll</div><script>window.events=[];for(const type of ['keydown','keyup','pointermove','pointerdown','pointerup','dblclick','wheel'])document.addEventListener(type,e=>{events.push({type,key:e.key,code:e.code,button:e.button,ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,buttons:e.buttons});});document.addEventListener('contextmenu',e=>e.preventDefault());document.querySelector('textarea').focus();</script></body></html>`));
    window.show();window.focus();window.moveTop();await sleep(300);
    const handle=window.getNativeWindowHandle();const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
    const relay = process.argv.includes('--relay');
    helper=spawn(path.join(root,'desktop/NativeInputHost.exe'),[...(relay ? ['--relay-test'] : []),'--target-window',hwnd],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='',queue=[],waiters=[];
    helper.stdout.on('data',data=>{buffer+=data.toString();let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);const waiter=waiters.shift();if(waiter)waiter(line);else queue.push(line);}});
    const line=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native helper timeout')),4000);const done=v=>{clearTimeout(timer);resolve(v);};if(queue.length)done(queue.shift());else waiters.push(done);});
    assert.equal(await line(),'READY');
    async function focusFixture() {
      for(let attempt=0;attempt<10;attempt++) {
        window.show();window.focus();window.moveTop();helper.stdin.write('FOCUS_TEST\n');
        const result=await line();if(result==='OK FOCUS_TEST')return;
        await sleep(100);
      }
      throw Error('Windows refused focus on the owned fixture; no input will be injected');
    }
    async function command(value){
      for(let attempt=0;attempt<3;attempt++) {
        await focusFixture();helper.stdin.write(value+'\n');const result=await line();
        if(result==='ERR TEST_WINDOW_NOT_FOREGROUND')continue;
        assert.ok(result.startsWith('OK'),result);await sleep(40);return;
      }
      throw Error('Owned test window repeatedly lost focus; input was rejected');
    }
    const get=js=>window.webContents.executeJavaScript(js);
    await focusFixture();
    const text='ação, coração, Ç, á é í ó ú, ã õ, €';
    await command('TEXT '+Buffer.from(text).toString('base64'));await sleep(200);assert.equal(await get('document.querySelector("textarea").value'),text);
    await command('KEYDOWN Code:ControlLeft');await command('KEYDOWN Code:KeyA');await command('KEYUP Code:KeyA');await command('KEYUP Code:ControlLeft');
    await command('TEXT '+Buffer.from('PT-BR confirmado').toString('base64'));await sleep(200);assert.equal(await get('document.querySelector("textarea").value'),'PT-BR confirmado');
    for(const k of ['ShiftLeft','AltLeft','Enter','Backspace','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){await command('KEYDOWN Code:'+k);await command('KEYUP Code:'+k);}
    const rect=await get('(()=>{const r=document.querySelector("#pad").getBoundingClientRect();return {x:r.x+50,y:r.y+50};})()');
    const bounds=window.getContentBounds();const p=screen.dipToScreenPoint({x:Math.round(bounds.x+rect.x),y:Math.round(bounds.y+rect.y)});
    await command(`MOVE ${p.x} ${p.y}`);await command(`MOUSEDOWN 0 ${p.x} ${p.y}`);await command(`MOVE ${p.x+100} ${p.y+30}`);await command(`MOUSEUP 0 ${p.x+100} ${p.y+30}`);
    // Keep the two clicks in one input burst; activating a window between clicks
    // can reset Windows/Chromium's double-click recognition.
    await focusFixture();
    helper.stdin.write(`MOUSEDOWN 0 ${p.x} ${p.y}\nMOUSEUP 0 ${p.x} ${p.y}\n`);
    for(let i=0;i<2;i++)assert.ok((await line()).startsWith('OK'));
    await sleep(60);
    helper.stdin.write(`MOUSEDOWN 0 ${p.x} ${p.y}\nMOUSEUP 0 ${p.x} ${p.y}\n`);
    for(let i=0;i<2;i++)assert.ok((await line()).startsWith('OK'));
    await sleep(150);
    await command(`MOUSEDOWN 2 ${p.x} ${p.y}`);await command(`MOUSEUP 2 ${p.x} ${p.y}`);
    await focusFixture();helper.stdin.write(`MOVE ${p.x} ${p.y}\nSCROLL -120 0\n`);
    assert.ok((await line()).startsWith('OK'));assert.ok((await line()).startsWith('OK'));await sleep(150);
    const events=await get('events');assert.ok(events.some(e=>e.type==='pointermove'&&e.buttons===1));assert.ok(events.some(e=>e.type==='pointerdown'&&e.button===2));assert.ok(events.some(e=>e.type==='dblclick'));assert.ok(events.some(e=>e.type==='wheel'));assert.ok(events.some(e=>e.type==='keydown'&&e.code==='KeyA'&&e.ctrl));
    // EOF releases a held modifier. Confirm using a subsequent browser key event.
    const priorReleases=events.filter(e=>e.type==='keyup'&&e.code==='ControlLeft').length;
    await command('KEYDOWN Code:ControlLeft');helper.stdin.end('EXIT\n');await new Promise(r=>helper.once('exit',r));await sleep(100);
    const after=await get('events');assert.ok(after.filter(e=>e.type==='keyup'&&e.code==='ControlLeft').length>priorReleases);
    const report={passed:true,scope:'Local Windows SendInput into an owned Electron test window; not two physical PCs',relay,relayScope:relay?'Real ACL/PID-verified local pipe and child helper at current privilege; UAC is not automated':undefined,unicode:text,mouse:true,rightClick:true,doubleClick:true,drag:true,scroll:true,ctrlShortcut:true,modifiers:true,navigation:true,eofReleasesKeys:true,eventCount:after.length};
    await fs.mkdir(path.join(root,'docs/validation'),{recursive:true});await fs.writeFile(path.join(root,'docs/validation',relay?'native-relay.json':'native.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }catch(e){console.error(e.stack);code=1;}
  finally{helper?.stdin.end('EXIT\n');helper?.kill();window?.destroy();app.exit(code);}
});
