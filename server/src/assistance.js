import crypto from 'node:crypto';

// A grant belongs to authenticated live sockets, never to a broadcast or viewer.
// Shared channel membership is used only to discover/request a participant.
export function createAssistanceSignaling(io, activeUsers, { sameRoom, publishCapabilities, legacyBusy = () => false } = {}) {
  const sessions = new Map(), capabilities = new Map();
  const live = id => activeUsers[id] && io.sockets.sockets.get(id)?.connected;
  const revoke = (id, reason) => {
    const s = sessions.get(id); if (!s) return;
    sessions.delete(id); clearTimeout(s.timer);
    for (const peer of [s.host, s.guest]) io.to(peer).emit('assistance_revoke', { sessionId: id, reason });
  };
  const revokeFor = (id, reason) => { for (const [key,s] of sessions) if ([s.host,s.guest].includes(id)) revoke(key,reason); };
  const busy = id => legacyBusy(id) || [...sessions.values()].some(s => [s.host,s.guest].includes(id));
  const authorized = (socket, data) => {
    const s = sessions.get(data.sessionId);
    if (!s?.approved || !live(s.host) || !live(s.guest)) return null;
    return (s.host === socket.id && s.guest === data.targetSocketId || s.guest === socket.id && s.host === data.targetSocketId) ? s : null;
  };
  const attach = socket => {
    socket.on('assistance_capabilities', (data = {}, ack = () => {}) => {
      if (!live(socket.id)) return ack({ error: 'UNAUTHENTICATED' });
      capabilities.set(socket.id, data.nativeControl === true && data.protocol === 2);
      publishCapabilities?.(socket.id, capabilities.get(socket.id));
      ack({ ok: true, protocol: 2 });
    });
    socket.on('assistance_request', (data = {}, ack = () => {}) => {
      const host = data.targetSocketId, id = data.sessionId;
      if (typeof id !== 'string' || !/^[\w-]{8,100}$/.test(id) || sessions.has(id) || !live(socket.id) || !live(host) || !sameRoom(socket.id,host) || !capabilities.get(host)) return ack({ error: 'Participante indisponível para assistência desktop' });
      if (busy(host) || busy(socket.id)) return ack({ error: 'Já existe uma solicitação ou assistência em andamento' });
      const s = { host, guest: socket.id, approved: false };
      s.timer = setTimeout(() => revoke(id,'Solicitação expirada'), 60000); sessions.set(id,s);
      io.to(host).emit('assistance_request', { sessionId: id, fromSocketId: socket.id, fromUser: {id:activeUsers[socket.id].id,username:activeUsers[socket.id].username,handle:activeUsers[socket.id].handle}, assistanceMode: 'desktop', protocol: 2 });
      ack({ ok: true, protocol: 2 });
    });
    socket.on('assistance_consent', (data = {}, ack = () => {}) => {
      const s = sessions.get(data.sessionId);
      if (!s || s.approved || s.host !== socket.id || s.guest !== data.targetSocketId || !live(s.host) || !live(s.guest)) return ack({ error: 'Solicitação inválida ou expirada' });
      if (data.approved !== true) { revoke(data.sessionId,'Solicitação recusada'); return ack({ ok:true }); }
      const d = data.display;
      if (!d || typeof d.id !== 'string' || d.id.length > 100 || ![d.width,d.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 32768)) return ack({ error:'Tela da assistência inválida' });
      clearTimeout(s.timer); s.approved = true; s.token = crypto.randomBytes(32).toString('base64url');
      s.display = { id:d.id, width:d.width, height:d.height };s.clipboard=data.clipboard===true;
      s.timer = setTimeout(() => revoke(data.sessionId,'Assistência expirada'),30*60*1000);
      ack({ ok:true,token:s.token });
    });
    socket.on('assistance_ready', (data = {}) => {
      const s = authorized(socket,data); if (!s || s.host !== socket.id || s.ready) return;
      s.ready = true;
      io.to(s.guest).emit('assistance_consent', { sessionId:data.sessionId,fromSocketId:s.host,approved:true,token:s.token,display:s.display,clipboard:s.clipboard,assistanceMode:'desktop',protocol:2 });
    });
    socket.on('assistance_revoke', (data = {}) => { const s=sessions.get(data.sessionId); if(s && [s.host,s.guest].includes(socket.id))revoke(data.sessionId,'Assistência encerrada pelo participante'); });
    for (const event of ['assistance_signal_offer','assistance_signal_answer','assistance_signal_ice']) socket.on(event,(data = {}) => {
      const s=authorized(socket,data);if(!s?.ready)return;
      io.to(data.targetSocketId).emit(event,{fromSocketId:socket.id,sessionId:data.sessionId,sdp:data.sdp,candidate:data.candidate});
    });
    socket.on('assistance_event',(data = {}) => {
      const s=authorized(socket,data), e=data.event;
      if(!s?.ready || s.guest !== socket.id || e?.sessionId !== data.sessionId || e?.token !== s.token || e?.participantId !== activeUsers[socket.id]?.id)return;
      if(['ClipboardWrite','ClipboardRead'].includes(e.eventType) && !s.clipboard)return;
      io.to(s.host).emit('assistance_event',{fromSocketId:socket.id,sessionId:data.sessionId,event:e});
    });
    socket.on('assistance_heartbeat',(data = {}) => {
      const s=authorized(socket,data);if(!s?.ready || data.token !== s.token)return;
      io.to(data.targetSocketId).emit('assistance_heartbeat',{fromSocketId:socket.id,sessionId:data.sessionId,token:s.token});
    });
    socket.on('assistance_ack',(data = {}) => {
      const s=authorized(socket,data), a=data.ack;
      if(!s?.ready || s.host !== socket.id || a?.kind !== 'native_ack' || a.sessionId !== data.sessionId || a.token !== s.token || !Number.isSafeInteger(a.sequence) || a.sequence < 0)return;
      io.to(s.guest).emit('assistance_ack',{fromSocketId:socket.id,sessionId:data.sessionId,ack:{kind:'native_ack',sessionId:data.sessionId,token:s.token,sequence:a.sequence,eventType:String(a.eventType || '').slice(0,24),success:a.success === true,nativeAck:a.nativeAck === 'OK' ? 'OK':'ERROR',code:typeof a.code === 'string' ? a.code.slice(0,80):undefined,...(s.clipboard && a.eventType==='ClipboardRead' && typeof a.clipboardText==='string' && a.clipboardText.length<=16000?{clipboardText:a.clipboardText}:{})}});
    });
    socket.on('disconnect',()=>{revokeFor(socket.id,'Conexão perdida');capabilities.delete(socket.id);});
  };
  const revokeBetweenUsers=(a,b)=>{for(const [id,s]of sessions){const h=activeUsers[s.host]?.id,g=activeUsers[s.guest]?.id;if(h===a && g===b || h===b && g===a)revoke(id,'Participante bloqueado');}};
  return { attach, sessions, capabilities, busy, revokeFor, revokeBetweenUsers, close:()=>{for(const id of sessions.keys())revoke(id,'Servidor encerrado');} };
}
