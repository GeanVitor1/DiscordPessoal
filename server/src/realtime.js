import crypto from 'node:crypto';

// All grants are ephemeral and bound to two live sockets and one screen broadcast.
export function createRealtimeSignaling(io, voiceRooms, activeUsers, options = {}) {
  const sessions = new Map();
  const viewers = new Map();
  const participant = (socketId, channelId) => voiceRooms[channelId]?.find(p => p.socketId === socketId);
  const roomOf = socketId => Object.keys(voiceRooms).find(id => participant(socketId, id));
  const sameRoom = (a, b, channelId = roomOf(a)) => a !== b && channelId && participant(a, channelId) && participant(b, channelId);
  const revoke = (id, reason) => {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    clearTimeout(session.timer);
    for (const socketId of [session.host, session.guest]) {
      io.to(socketId).emit('interaction_revoke', { sessionId: id, reason });
    }
  };
  const revokeFor = (socketId, reason) => {
    for (const [id, session] of sessions) {
      if (session.host === socketId || session.guest === socketId) revoke(id, reason);
    }
  };
  const leave = (socket, reason = 'Participante saiu da chamada') => {
    revokeFor(socket.id, reason);
    for (const [guest, host] of viewers) {
      if (guest === socket.id || host === socket.id) {
        viewers.delete(guest);
        io.to(host).emit('screen_viewer_left', { viewerSocketId: guest });
      }
    }
    for (const channelId of Object.keys(voiceRooms)) {
      const p = participant(socket.id, channelId);
      if (!p) continue;
      if (p.isScreenSharing) socket.to(`voice_${channelId}`).emit('screen_share_stopped', { channelId, sharerSocketId: socket.id, user: p.user });
      socket.to(`voice_${channelId}`).emit('user_left_voice', { channelId, socketId: socket.id });
      socket.leave(`voice_${channelId}`);
      voiceRooms[channelId] = voiceRooms[channelId].filter(p => p.socketId !== socket.id);
      if (!voiceRooms[channelId].length) delete voiceRooms[channelId];
    }
    if (options.publishRooms) options.publishRooms(); else io.emit('voice_state_update', voiceRooms);
  };
  const authorized = (socket, data) => {
    const s = sessions.get(data.sessionId);
    if (!s || !s.approved || !sameRoom(s.host, s.guest, s.channelId) || !participant(s.host, s.channelId)?.isScreenSharing || viewers.get(s.guest) !== s.host) return null;
    return ((s.host === socket.id && s.guest === data.targetSocketId) || (s.guest === socket.id && s.host === data.targetSocketId)) ? s : null;
  };

  function attach(socket) {
    socket.on('join_voice_channel', async ({ channelId } = {}, ack = () => {}) => {
      if (typeof channelId !== 'string' || !activeUsers[socket.id]) return ack({ error: 'Usuário ou canal inválido' });
      if (options.authorizeChannel && !await options.authorizeChannel(socket, channelId)) return ack({ error: 'Canal indisponivel' });
      if (!socket.connected) return;
      leave(socket);
      voiceRooms[channelId] ||= [];
      const users = [...voiceRooms[channelId]];
      const user = activeUsers[socket.id];
      voiceRooms[channelId].push({ socketId: socket.id, user, isMuted: false, isDeafened: false, isSpeaking: false, isScreenSharing: false, isCameraOn: false });
      socket.join(`voice_${channelId}`);
      socket.emit('voice_room_users', { channelId, users });
      socket.to(`voice_${channelId}`).emit('user_joined_voice', { channelId, socketId: socket.id, user });
      if (options.publishRooms) options.publishRooms(); else io.emit('voice_state_update', voiceRooms);
      ack({ ok: true });
    });
    socket.on('leave_voice_channel', () => leave(socket));
    for (const event of ['voice_offer', 'voice_answer', 'ice_candidate']) {
      socket.on(event, (data = {}) => {
        if (!sameRoom(socket.id, data.targetSocketId, data.channelId)) return;
        io.to(data.targetSocketId).emit(event, { fromSocketId: socket.id, channelId: roomOf(socket.id), sdp: data.sdp, candidate: data.candidate });
      });
    }
    socket.on('voice_speaking', ({ channelId, isSpeaking } = {}) => {
      const p = participant(socket.id, channelId);
      if (!p) return;
      p.isSpeaking = isSpeaking === true && !p.isMuted && !p.isDeafened;
      io.to(`voice_${channelId}`).emit('participant_speaking', { socketId: socket.id, isSpeaking: p.isSpeaking });
    });
    socket.on('voice_state_toggle', (data = {}) => {
      const p = participant(socket.id, data.channelId);
      if (!p) return;
      for (const key of ['isMuted', 'isDeafened', 'isCameraOn']) if (typeof data[key] === 'boolean') p[key] = data[key];
      if (typeof data.isScreenSharing === 'boolean' && p.isScreenSharing !== data.isScreenSharing) {
        p.isScreenSharing = data.isScreenSharing;
        p.canAssist = p.isScreenSharing && data.canAssist === true;
        p.assistanceMode = data.assistanceMode === 'presentation' ? 'presentation' : 'desktop';
        if (!p.isScreenSharing) {
          revokeFor(socket.id, 'Compartilhamento encerrado');
          for (const [guest, host] of viewers) if (host === socket.id) viewers.delete(guest);
        }
        io.to(`voice_${data.channelId}`).emit(p.isScreenSharing ? 'screen_share_started' : 'screen_share_stopped', { channelId: data.channelId, sharerSocketId: socket.id, user: p.user });
      }
      if (p.isMuted || p.isDeafened) p.isSpeaking = false;
      if (options.publishRooms) options.publishRooms(); else io.emit('voice_state_update', voiceRooms);
    });
    socket.on('screen_request_view', ({ targetSocketId, channelId } = {}) => {
      if (!sameRoom(socket.id, targetSocketId, channelId) || !participant(targetSocketId, channelId)?.isScreenSharing) return;
      revokeFor(socket.id, 'Transmissão selecionada mudou');
      const previous = viewers.get(socket.id);
      if (previous) io.to(previous).emit('screen_viewer_left', { viewerSocketId: socket.id, channelId });
      viewers.set(socket.id, targetSocketId);
      io.to(targetSocketId).emit('screen_request_view', { viewerSocketId: socket.id, viewerUser: activeUsers[socket.id], channelId });
    });
    for (const [event, field] of [['screen_offer', 'sharerSocketId'], ['screen_answer', 'viewerSocketId'], ['screen_ice_candidate', 'fromSocketId']]) {
      socket.on(event, (data = {}) => {
        if (!sameRoom(socket.id, data.targetSocketId, data.channelId)) return;
        if (viewers.get(socket.id) !== data.targetSocketId && viewers.get(data.targetSocketId) !== socket.id) return;
        io.to(data.targetSocketId).emit(event, { [field]: socket.id, channelId: data.channelId, sdp: data.sdp, candidate: data.candidate });
      });
    }
    socket.on('screen_stop_viewing', ({ targetSocketId, channelId } = {}) => {
      if (viewers.get(socket.id) !== targetSocketId) return;
      viewers.delete(socket.id);
      revokeFor(socket.id, 'Visualização encerrada');
      io.to(targetSocketId).emit('screen_viewer_left', { viewerSocketId: socket.id, channelId });
    });
    socket.on('interaction_request', (data = {}, ack = () => {}) => {
      const { targetSocketId: host, sessionId } = data;
      const channelId = roomOf(socket.id);
      if (typeof sessionId !== 'string' || !/^[\w-]{8,100}$/.test(sessionId) || sessions.has(sessionId) || !sameRoom(socket.id, host, channelId) || !participant(host, channelId)?.canAssist || viewers.get(socket.id) !== host) return ack({ error: 'Assista a uma transmissão com interação disponível na mesma chamada' });
      if ([...sessions.values()].some(s => [s.host, s.guest].includes(host) || [s.host, s.guest].includes(socket.id))) return ack({ error: 'Já existe uma solicitação ou assistência em andamento' });
      const s = { host, guest: socket.id, channelId, approved: false };
      s.timer = setTimeout(() => revoke(sessionId, 'Solicitação expirada'), 30000);
      sessions.set(sessionId, s);
      io.to(host).emit('interaction_request', { fromSocketId: socket.id, fromUser: activeUsers[socket.id], sessionId, channelId, assistanceMode: participant(host, channelId).assistanceMode });
      ack({ ok: true });
    });
    socket.on('interaction_consent', (data = {}, ack = () => {}) => {
      const s = sessions.get(data.sessionId);
      if (!s || s.approved || s.host !== socket.id || s.guest !== data.targetSocketId || !sameRoom(s.host, s.guest, s.channelId) || !participant(s.host, s.channelId)?.canAssist || viewers.get(s.guest) !== s.host) return ack({ error: 'Solicitação inválida ou expirada' });
      if (data.approved !== true) {
        io.to(s.guest).emit('interaction_consent', { fromSocketId: socket.id, sessionId: data.sessionId, approved: false });
        revoke(data.sessionId, 'Solicitação recusada');
        return ack({ ok: true });
      }
      clearTimeout(s.timer);
      s.approved = true;
      s.token = crypto.randomBytes(32).toString('base64url');
      s.timer = setTimeout(() => revoke(data.sessionId, 'Assistência expirada'), 30 * 60 * 1000);
      // Host installs receiver first; guest starts negotiation only after host signals ready.
      ack({ ok: true, token: s.token });
    });
    socket.on('interaction_ready', (data = {}) => {
      const s = authorized(socket, data);
      if (!s || s.host !== socket.id || s.ready) return;
      s.ready = true;
      io.to(s.guest).emit('interaction_consent', { fromSocketId: s.host, sessionId: data.sessionId, token: s.token, approved: true, assistanceMode: participant(s.host,s.channelId)?.assistanceMode });
    });
    socket.on('interaction_revoke', (data = {}) => {
      const s = sessions.get(data.sessionId);
      if (s && (s.host === socket.id || s.guest === socket.id)) revoke(data.sessionId, 'Assistência encerrada pelo participante');
    });
    for (const event of ['interaction_signal_offer', 'interaction_signal_answer', 'interaction_signal_ice']) {
      socket.on(event, (data = {}) => {
        const s = authorized(socket, data);
        if (!s?.ready) return;
        io.to(data.targetSocketId).emit(event, { fromSocketId: socket.id, sessionId: data.sessionId, sdp: data.sdp, candidate: data.candidate });
      });
    }
    socket.on('interaction_event', (data = {}) => {
      const s = authorized(socket, data);
      if (!s?.ready || s.guest !== socket.id || data.event?.sessionId !== data.sessionId || data.event?.token !== s.token || data.event?.participantId !== activeUsers[socket.id]?.id) return;
      io.to(s.host).emit('interaction_event', { fromSocketId: socket.id, sessionId: data.sessionId, event: data.event });
    });
    socket.on('interaction_heartbeat', (data = {}) => {
      const s = authorized(socket, data);
      if (!s?.ready || data.token !== s.token) return;
      io.to(data.targetSocketId).emit('interaction_heartbeat', { fromSocketId: socket.id, sessionId: data.sessionId, token: s.token });
    });
    socket.on('interaction_ack', (data = {}) => {
      const s = authorized(socket, data), ack = data.ack;
      if (!s?.ready || s.host !== socket.id || ack?.kind !== 'native_ack' || ack.sessionId !== data.sessionId || ack.token !== s.token || !Number.isSafeInteger(ack.sequence) || ack.sequence < 0) return;
      io.to(s.guest).emit('interaction_ack', { fromSocketId: socket.id, sessionId: data.sessionId, ack: { kind: 'native_ack', sessionId: data.sessionId, token: s.token, sequence: ack.sequence, eventType: String(ack.eventType || '').slice(0, 24), success: ack.success === true, nativeAck: ack.nativeAck === 'OK' ? 'OK' : 'ERROR', code: typeof ack.code === 'string' ? ack.code.slice(0, 32) : undefined } });
    });
    socket.on('disconnect', () => leave(socket, 'Conexão perdida'));
  }
  const revokeBetweenUsers = (a,b) => {
    for (const [id,s] of sessions) {
      const host=activeUsers[s.host]?.id,guest=activeUsers[s.guest]?.id;
      if ((host===a && guest===b) || (host===b && guest===a)) revoke(id,'Participante bloqueado');
    }
  };
  return { attach, leave, sessions, revokeFor, revokeBetweenUsers, close: () => { for (const id of sessions.keys()) revoke(id, 'Servidor encerrado'); } };
}
