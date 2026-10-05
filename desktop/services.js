import { app,Notification,safeStorage,nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function installDesktopServices(handleTrusted,getWindow) {
  function vaultPath(origin) {
    const u=new URL(origin);
    if(u.origin!==origin || u.username || u.password || (u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw new Error('Invalid server');
    const folder=path.join(app.getPath('userData'),'sessions');fs.mkdirSync(folder,{recursive:true});
    return path.join(folder,crypto.createHash('sha256').update(origin).digest('hex')+'.bin');
  }
  handleTrusted('auth-get-token',(_event,origin)=>{
    const file=vaultPath(origin);if(!safeStorage.isEncryptionAvailable() || !fs.existsSync(file))return null;
    try {return safeStorage.decryptString(fs.readFileSync(file));}catch{return null;}
  });
  handleTrusted('auth-save-token',(_event,{origin,token})=>{
    const file=vaultPath(origin);
    if(token===null){if(fs.existsSync(file))fs.unlinkSync(file);return true;}
    if(typeof token!=='string' || !/^[\w-]{43}$/.test(token) || !safeStorage.isEncryptionAvailable())throw new Error('Secure storage unavailable');
    fs.writeFileSync(file+'.tmp',safeStorage.encryptString(token));fs.renameSync(file+'.tmp',file);return true;
  });
  const notices=new Set();let lastNotice=0;
  handleTrusted('desktop-notify',(_event,data)=>{
    const window=getWindow();
    if(!window || window.isFocused() || !Notification.isSupported())return false;
    if(!['dm','friend','call','assistance','chat'].includes(data?.type))return false;
    if(typeof data.title!=='string' || typeof data.body!=='string' || Date.now()-lastNotice<500)return false;
    const route={};
    for(const k of ['dmId','channelId','serverId']) if(typeof data.route?.[k]==='string' && /^[\w-]{1,100}$/.test(data.route[k]))route[k]=data.route[k];
    for(const k of ['friends','assistance'])if(data.route?.[k]===true)route[k]=true;
    lastNotice=Date.now();
    const n=new Notification({title:data.title.slice(0,100),body:data.body.slice(0,240),silent:data.type==='chat'});notices.add(n);
    n.on('click',()=>{if(window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();window.webContents.send('notification-open',route);});
    n.on('close',()=>notices.delete(n));n.show();return true;
  });
  handleTrusted('desktop-badge',(_event,value)=>{
    const count=Number.isSafeInteger(value)?Math.max(0,Math.min(value,999)):0;
    app.setBadgeCount(count);
    const window=getWindow();if(!window)return false;
    // nativeImage cannot decode SVG on Windows; render a small bitmap via the trusted renderer.
    if(!count)window.setOverlayIcon(null,'');
    else window.webContents.executeJavaScript(`(() => {const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.fillStyle='#ed4245';x.beginPath();x.arc(16,16,16,0,7);x.fill();x.fillStyle='white';x.font='bold 18px Arial';x.textAlign='center';x.fillText('${count>99?'99+':count}',16,22);return c.toDataURL();})()`).then(url=>{if(!window.isDestroyed())window.setOverlayIcon(nativeImage.createFromDataURL(url),`${count} notificações`);}).catch(()=>{});
    return true;
  });
}
