import {app,BrowserWindow,dialog,Notification,globalShortcut} from 'electron';
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
    assert.equal((await js(`desktopInteraction.textInput('denied-session','test')`)).code,'SESSION_INACTIVE','no native input without consent');
    assert.equal(await js(`electronAPI.getAssistanceSource('denied-session',${JSON.stringify(String(displays[0].id))})`),null,'assistance monitor lookup requires a native grant');
    await js('electronAPI.notifications.badge(3)');await js('electronAPI.notifications.badge(0)');
    await js('(() => { electronAPI.notifications.onOpen(route => {window.notificationRoute=route;}); return true; })()');
    window.hide();await js(`electronAPI.notifications.show({type:'dm',title:'Test DM',body:'Test content',route:{dmId:'test-conversation'}})`);
    if(Notification.isSupported()){assert.equal(notifications.length,1);notifications[0].emit('click');await new Promise(r=>setTimeout(r,100));assert.equal(await js('window.notificationRoute.dmId'),'test-conversation');const actualFocus=window.isFocused;window.isFocused=()=>true;assert.equal(await js(`electronAPI.notifications.show({type:'dm',title:'Focused test',body:'Focused test'})`),false,'focused window suppresses toasts');window.isFocused=actualFocus;}
    assert.equal(await js(`electronAPI.notifications.show({type:'unknown',title:'Rejected',body:'Rejected'})`),false);
    assert.equal((await js("desktopInteraction.clipboardRead('denied-session',{} )")).code,'CLIPBOARD_NOT_AUTHORIZED','clipboard is not read without its own active consent');
    const initialSettings=await js('electronAPI.desktop.getSettings()');assert.equal(initialSettings.startWithWindows,false);
    const modified=await js(`electronAPI.desktop.saveSettings({...${JSON.stringify(initialSettings)},shortcuts:{...${JSON.stringify(initialSettings.shortcuts)},open:'Control+Alt+Shift+F10'}})`);assert.equal(modified.shortcuts.open,'Control+Alt+Shift+F10');assert.equal(globalShortcut.isRegistered('Control+Alt+Shift+F10'),true,'custom desktop shortcut is registered');
    assert.ok(Array.isArray(await js('electronAPI.desktop.runningApps()')));assert.ok((await js('electronAPI.desktop.idleSeconds()'))>=0);
    await js("electronAPI.desktop.runtime({active:true,chatActive:true,channel:'Fixture call',participants:[{name:'<script>fixture</script>',speaking:true}],messages:[{name:'Fixture',text:'Quick chat fixture'}],ptt:{enabled:false}})");
    await js('electronAPI.desktop.toggleOverlay()');let overlay;for(let i=0;i<50;i++){overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('overlay.html'));if(overlay&&!overlay.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}assert.ok(overlay);overlay.hide();
    const view=await overlay.webContents.executeJavaScript("({text:document.body.innerText,scripts:document.querySelectorAll('#participants script').length,node:typeof require,chatEnabled:!document.getElementById('text').disabled})");assert.match(view.text,/<script>fixture<\/script>/);assert.equal(view.scripts,0,'overlay renders names as plain text');assert.equal(view.node,'undefined');assert.equal(view.chatEnabled,true);overlay.destroy();
    await js(`electronAPI.desktop.saveSettings(${JSON.stringify(initialSettings)})`);window.show();window.close();assert.equal(window.isDestroyed(),false,'close-to-tray keeps the app running');assert.equal(window.isVisible(),false);await js('electronAPI.desktop.open()');assert.equal(window.isVisible(),true);
    const featureReport={version:JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version,electronVersion:app.getVersion(),passed:true,checkedAt:new Date().toISOString(),customShortcut:true,overlayState:true,overlayPlainText:true,overlayQuickChatAvailability:true,trayCloseAndReopen:true,idleAndProcessIPC:true,separateClipboardConsent:true,scope:'Isolated temporary profile. Startup registration is not changed. No physical PTT key press or exclusive-fullscreen game overlay is exercised.'};await fs.mkdir('docs/validation',{recursive:true});await fs.writeFile('docs/validation/desktop-features.json',JSON.stringify(featureReport,null,2));
    console.log(JSON.stringify({passed:true,preload:true,encryptedTokenVault:true,defaultConsentRefused:true,nativeInputDenied:true,badgeIPC:true,notificationCreation:Notification.isSupported(),notificationToast:'Not displayed by this test'}));
  }catch(e){console.error(e.stack);code=1;}
  finally{for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(code);}
});
