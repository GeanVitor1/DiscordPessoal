import { InteractionSerializer } from './InteractionSerializer.js';
import { DEFAULT_RTC_CONFIG, addRemoteCandidate, setRemoteDescription } from '../rtc/ice.js';
import { traceAssist } from './diagnostics.js';

export class RealtimeTransport {
  constructor({ socket, sessionId, targetPeerSocketId, isInitiator = false, onMessage = null, onAcknowledgement = null, onTransportStatus = null, rtcConfig = DEFAULT_RTC_CONFIG, sessionToken = null, now = Date.now, eventNamespace = 'interaction', connectionTimeoutMs = 4000 }) {
    Object.assign(this, { socket, sessionId, targetPeerSocketId, isInitiator, onMessage, onTransportStatus, rtcConfig });
    this.eventNamespace = eventNamespace;
    this.connectionTimeoutMs=connectionTimeoutMs;
    this.peerConnection = null;
    this.dataChannel = null;
    this.usingFallback = false;
    this.status = 'disconnected';
    this._isDestroyed = false;
    this._connectTimeout = null;
    this.sessionToken = sessionToken;
    this.onAcknowledgement = onAcknowledgement;
    this.now = now;
    this.startedAt = now();
    this.lastPeerHeartbeatAt = null;
    const matches = data => !this._isDestroyed && data.fromSocketId === this.targetPeerSocketId && data.sessionId === this.sessionId;
    this._onOffer = async data => {
      if (!matches(data) || this.isInitiator || !this.peerConnection) return;
      const pc = this.peerConnection;
      try {
        await setRemoteDescription(pc, data.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        if (!this._isDestroyed) socket.emit(eventNamespace + '_signal_answer', { targetSocketId: data.fromSocketId, sessionId, sdp: pc.localDescription });
      } catch { if (!this._isDestroyed) this._useFallbackTransport(); }
    };
    this._onAnswer = async data => {
      if (!matches(data) || !this.isInitiator || !this.peerConnection) return;
      try { await setRemoteDescription(this.peerConnection, data.sdp); }
      catch { if (!this._isDestroyed) this._useFallbackTransport(); }
    };
    this._onIce = async data => {
      if (!matches(data) || !this.peerConnection) return;
      try { await addRemoteCandidate(this.peerConnection, data.candidate); }
      catch { /* Connectivity failure is reported by the peer's state. */ }
    };
    this._onSocketEvent = data => {
      if (matches(data) && data.event?.sessionId === sessionId) this.onMessage?.(data.event);
    };
    this._onHeartbeat = data => {
      if (matches(data) && this.sessionToken && data.token === this.sessionToken) this.lastPeerHeartbeatAt = this.now();
    };
    this._onDisconnect = () => this._handleDisconnect();
    this._onAck = data => { if(matches(data))this._receiveAck(data.ack); };
    socket?.on(eventNamespace + '_signal_offer', this._onOffer);
    socket?.on(eventNamespace + '_signal_answer', this._onAnswer);
    socket?.on(eventNamespace + '_signal_ice', this._onIce);
    socket?.on(eventNamespace + '_event', this._onSocketEvent);
    socket?.on(eventNamespace + '_heartbeat', this._onHeartbeat);
    socket?.on(eventNamespace + '_ack', this._onAck);
    socket?.on('disconnect', this._onDisconnect);
  }
  connect() {
    if (this._isDestroyed || this.peerConnection) return;
    this._updateStatus('connecting');
    this.startedAt = this.now();
    this._heartbeatTimer = setInterval(() => {
      this._checkPeerLiveness();
      if (this._isDestroyed || !this.sessionToken) return;
      const heartbeat = { kind: 'heartbeat', sessionId: this.sessionId, token: this.sessionToken };
      if (this.dataChannel?.readyState === 'open') {
        try { this.dataChannel.send(JSON.stringify(heartbeat)); } catch { this._handleDisconnect(); }
      } else if (this.usingFallback && this.socket?.connected !== false) {
        this.socket?.emit(this.eventNamespace + '_heartbeat', { targetSocketId: this.targetPeerSocketId, sessionId: this.sessionId, token: this.sessionToken });
      }
    }, 1000);
    if (typeof RTCPeerConnection === 'undefined') { this._useFallbackTransport(); return; }
    try {
      const pc = new RTCPeerConnection(this.rtcConfig);
      this.peerConnection = pc;
      this.preparePeerConnection?.(pc);
      pc.onicecandidate = ({ candidate }) => {
        if (candidate && !this._isDestroyed) this.socket?.emit(this.eventNamespace + '_signal_ice', { targetSocketId: this.targetPeerSocketId, sessionId: this.sessionId, candidate });
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) this._handleDisconnect();
      };
      pc.ondatachannel = ({ channel }) => this._setupDataChannel(channel);
      if (this.isInitiator) {
        this._setupDataChannel(pc.createDataChannel(this.eventNamespace + '_dc', { ordered: true }));
        (async () => {
          await pc.setLocalDescription(await pc.createOffer());
          if (!this._isDestroyed) this.socket?.emit(this.eventNamespace + '_signal_offer', { targetSocketId: this.targetPeerSocketId, sessionId: this.sessionId, sdp: pc.localDescription });
        })().catch(() => { if (!this._isDestroyed) this._useFallbackTransport(); });
      }
      this._connectTimeout = setTimeout(() => { if (!this._isDestroyed && this.status === 'connecting') this._useFallbackTransport(); }, this.connectionTimeoutMs);
    } catch { this._useFallbackTransport(); }
  }
  _setupDataChannel(channel) {
    if (this._isDestroyed) { channel.close(); return; }
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => { if (this._isDestroyed) return; clearTimeout(this._connectTimeout); this.usingFallback = false; this._updateStatus('connected'); };
    channel.onmessage = event => {
      if (this._isDestroyed) return;
      try {
        const packet = InteractionSerializer.deserialize(event.data);
        if (packet.kind === 'heartbeat') {
          if (packet.sessionId === this.sessionId && this.sessionToken && packet.token === this.sessionToken) this.lastPeerHeartbeatAt = this.now();
          return;
        }
        if (packet.kind === 'native_ack') { this._receiveAck(packet); return; }
      } catch { /* The receiver reports malformed input packets. */ }
      this.onMessage?.(event.data);
    };
    channel.onclose = () => this._handleDisconnect();
    channel.onerror = () => this._handleDisconnect();
  }
  _useFallbackTransport() {
    if (this._isDestroyed) return;
    if (!this.socket || this.socket.connected === false) { this._handleDisconnect(); return; }
    this.usingFallback = true;
    this._updateStatus('fallback');
  }
  _handleDisconnect() {
    if (this._isDestroyed) return;
    this.destroy();
    this._updateStatus('disconnected');
  }
  isPeerAlive() { return this.lastPeerHeartbeatAt !== null && this.now() - this.lastPeerHeartbeatAt < 6500; }
  _checkPeerLiveness() {
    const deadline=this.lastPeerHeartbeatAt === null ? this.connectionTimeoutMs+2500 : 6500;
    if (this.sessionToken && this.now() - (this.lastPeerHeartbeatAt ?? this.startedAt) >= deadline) this._handleDisconnect();
  }
  send(packet) {
    if (this._isDestroyed || packet.sessionId !== this.sessionId) return false;
    if (this.dataChannel?.readyState === 'open') {
      if (this.dataChannel.bufferedAmount > 65536) { this._handleDisconnect(); return false; }
      try { this.dataChannel.send(InteractionSerializer.serialize(packet, 'json')); traceAssist('TRANSPORT',packet.eventType,packet.sequence,'DataChannel sent'); return true; }
      catch { this._handleDisconnect(); return false; }
    }
    if (this.usingFallback && this.socket && this.socket.connected !== false) {
      this.socket.emit(this.eventNamespace + '_event', { targetSocketId: this.targetPeerSocketId, sessionId: this.sessionId, event: packet });
      traceAssist('TRANSPORT',packet.eventType,packet.sequence,'Socket.IO sent');
      return true;
    }
    return false;
  }
  _updateStatus(status) { this.status = status; this.onTransportStatus?.(status); }
  _receiveAck(ack) {
    if (!this.isInitiator || !ack || ack.kind !== 'native_ack' || ack.sessionId !== this.sessionId || !this.sessionToken || ack.token !== this.sessionToken || !Number.isSafeInteger(ack.sequence) || ack.sequence < 0 || !['OK','ERROR'].includes(ack.nativeAck)) return;
    this.onAcknowledgement?.({ sequence: ack.sequence, eventType: ack.eventType, success: ack.success === true, nativeAck: ack.nativeAck, code: ack.code });
  }
  sendAcknowledgement(event, result) {
    if (this._isDestroyed || this.isInitiator || !this.sessionToken) return false;
    if (event.eventType === 'PointerMove' && result.success && this.now()-(this.lastMoveAckAt || 0)<200) return true;
    if (event.eventType === 'PointerMove') this.lastMoveAckAt=this.now();
    const ack={kind:'native_ack',sessionId:this.sessionId,token:this.sessionToken,sequence:event.sequence,eventType:event.eventType,success:result.success===true,nativeAck:result.nativeAck || 'ERROR',code:result.code};
    try {
      if(this.dataChannel?.readyState==='open'){this.dataChannel.send(JSON.stringify(ack));return true;}
      if(this.usingFallback && this.socket?.connected!==false){this.socket.emit(this.eventNamespace + '_ack',{targetSocketId:this.targetPeerSocketId,sessionId:this.sessionId,ack});return true;}
    }catch{this._handleDisconnect();}
    return false;
  }
  destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this.sessionToken = null;
    clearTimeout(this._connectTimeout);
    clearInterval(this._heartbeatTimer);
    if (this.dataChannel) {
      this.dataChannel.onopen = this.dataChannel.onclose = this.dataChannel.onmessage = this.dataChannel.onerror = null;
      this.dataChannel.close(); this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.ontrack = this.peerConnection.onconnectionstatechange = this.peerConnection.onicecandidate = this.peerConnection.ondatachannel = null;
      this.peerConnection.close(); this.peerConnection = null;
    }
    for (const [event, handler] of [['interaction_signal_offer', this._onOffer], ['interaction_signal_answer', this._onAnswer], ['interaction_signal_ice', this._onIce], ['interaction_event', this._onSocketEvent], ['interaction_heartbeat', this._onHeartbeat], ['interaction_ack', this._onAck], ['disconnect', this._onDisconnect]]) this.socket?.off(event.replace(/^interaction_/,this.eventNamespace + '_'), handler);
  }
}
