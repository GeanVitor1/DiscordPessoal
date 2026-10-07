// The Windows/Electron clipboard is touched only for an active, explicitly consented grant.
export function transferClipboard({guard,clipboard,ownerId,sessionId,credentials,text,read=false}) {
  if(!guard.accepts(sessionId,ownerId) || guard.session?.clipboard!==true)return {success:false,nativeAck:'ERROR',code:'CLIPBOARD_NOT_AUTHORIZED'};
  if(!read && (typeof text!=='string' || text.length>16000 || text.includes('\0')))return {success:false,nativeAck:'ERROR',code:'INVALID_CLIPBOARD_TEXT'};
  if(!guard.acceptsInput(sessionId,ownerId,undefined,credentials))return {success:false,nativeAck:'ERROR',code:guard.inputRejection(sessionId,ownerId,undefined,credentials)};
  try {
    if(read){const value=clipboard.readText();if(value.length>16000)return {success:false,nativeAck:'ERROR',code:'CLIPBOARD_TOO_LARGE'};return {success:true,nativeAck:'OK',clipboardText:value};}
    clipboard.writeText(text);return {success:true,nativeAck:'OK'};
  }catch{return {success:false,nativeAck:'ERROR',code:'CLIPBOARD_UNAVAILABLE'};}
}
