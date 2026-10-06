import {app,BrowserWindow,dialog,Notification} from 'electron';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
let code=0;
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-desktop-'));
app.setPath('userData',folder);
process.env.VITE_DEV_SERVER_URL='';
// Exercise notifications without displaying test messages on the user's desktop.
const notifications=[];
Notification.prototype.show=function(){notifications.push(this);};
let consentOptions;
dialog.showMessageBox=async(_window,options)=>{consentOptions=options;return {response:0};};
await import('../desktop/main.js');
app.whenReady().then(async()=>{
  try {
    let window;
    for(let i=0;i<100;i++){window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(window && !window.webContents.isLoading())break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(window);const js=code=>window.webContents.executeJavaScript(code);
    assert.equal(await js('electronAPI.isDesktop'),true);
    assert.equal(await js('typeof desktopInteraction.textInput'),'function');
    assert.ok(await js('document.body.textContent.includes("MeuApp")'));
    const token=crypto.randomBytes(32).toString('base64url'),origin='https://example.com';
    await js(`electronAPI.auth.saveToken(${JSON.stringify(origin)},${JSON.stringify(token)})`);
    assert.equal(await js(`electronAPI.auth.getToken(${JSON.stringify(origin)})`),token);
    const untrusted=new BrowserWindow({show:false,webPreferences:{preload:fileURLToPath(new URL('../desktop/preload.cjs',import.meta.url)),sandbox:true,contextIsolation:true}});
    await untrusted.loadURL('data:text/html,Untrusted test frame');
    assert.equal(await untrusted.webContents.executeJavaScript(`electronAPI.auth.getToken(${JSON.stringify(origin)}).then(()=>false).catch(e=>e.message.includes('IPC origin rejected'))`),true,'a second window cannot read the vault');untrusted.destroy();
    const files=await fs.readdir(path.join(folder,'sessions'));const encrypted=await fs.readFile(path.join(folder,'sessions',files[0]));assert.equal(encrypted.includes(Buffer.from(token)),false);
    await js(`electronAPI.auth.saveToken(${JSON.stringify(origin)},null)`);assert.equal(await js(`electronAPI.auth.getToken(${JSON.stringify(origin)})`),null);
    const displays=await js('desktopInteraction.getDisplays()');assert.ok(displays.length);
    assert.equal(await js(`desktopInteraction.setAuthorizedSession('denied-session','test-guest',${JSON.stringify(String(displays[0].id))},'Test guest').then(r=>r.success)`),false,'default refusal installs no grant');
    assert.equal(consentOptions.checkboxChecked,false,'Administrative control requires an explicit local choice');
    assert.match(consentOptions.checkboxLabel,/administrador/);
    assert.equal(await js(`desktopInteraction.textInput('denied-session','test')`),false,'no native input without consent');
    await js('electronAPI.notifications.badge(3)');await js('electronAPI.notifications.badge(0)');
    await js('(() => { electronAPI.notifications.onOpen(route => {window.notificationRoute=route;}); return true; })()');
    window.hide();await js(`electronAPI.notifications.show({type:'dm',title:'Test DM',body:'Test content',route:{dmId:'test-conversation'}})`);
    if(Notification.isSupported()){assert.equal(notifications.length,1);notifications[0].emit('click');await new Promise(r=>setTimeout(r,100));assert.equal(await js('window.notificationRoute.dmId'),'test-conversation');const actualFocus=window.isFocused;window.isFocused=()=>true;assert.equal(await js(`electronAPI.notifications.show({type:'dm',title:'Focused test',body:'Focused test'})`),false,'focused window suppresses toasts');window.isFocused=actualFocus;}
    assert.equal(await js(`electronAPI.notifications.show({type:'unknown',title:'Rejected',body:'Rejected'})`),false);
    console.log(JSON.stringify({passed:true,preload:true,encryptedTokenVault:true,defaultConsentRefused:true,nativeInputDenied:true,badgeIPC:true,notificationCreation:Notification.isSupported(),notificationToast:'Not displayed by this test'}));
  }catch(e){console.error(e.stack);code=1;}
  finally{for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(code);}
});
