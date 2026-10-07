const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('overlayAPI',{onState:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('overlay-state',handler);return()=>ipcRenderer.removeListener('overlay-state',handler);},action:(action,text)=>ipcRenderer.send('overlay-action',{action,text})});
