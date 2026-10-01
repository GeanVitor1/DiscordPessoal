import { InteractionSerializer } from './InteractionSerializer.js';

/**
 * RealtimeTransport
 * Provides WebRTC DataChannel interaction transport with seamless WebSocket fallback,
 * isolated interaction signaling channels, duplicate connection prevention,
 * and automatic reconnection handling.
 */
export class RealtimeTransport {
  /**
   * @param {object} options
   * @param {object} [options.socket] - Socket.io client instance
   * @param {string} options.sessionId - Unique interaction session ID
   * @param {string} options.targetPeerSocketId - Remote peer socket ID
   * @param {boolean} [options.isInitiator=false] - Whether this peer initiates the WebRTC offer
   * @param {Function} [options.onMessage] - Callback when an interaction packet is received
   * @param {Function} [options.onTransportStatus] - Status callback ('connected', 'connecting', 'disconnected', 'fallback')
   */
  constructor({
    socket,
    sessionId,
    targetPeerSocketId,
    isInitiator = false,
    onMessage = null,
    onTransportStatus = null
  }) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.targetPeerSocketId = targetPeerSocketId;
    this.isInitiator = isInitiator;
    this.onMessage = onMessage;
    this.onTransportStatus = onTransportStatus;

    this.peerConnection = null;
    this.dataChannel = null;
    this.usingFallback = false;
    this.status = 'disconnected';

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimer = null;
    this._isDestroyed = false;

    this._setupSocketListeners();
  }

  /**
   * Initialize transport connection (WebRTC DataChannel)
   */
  connect() {
    if (this._isDestroyed) return;
    this._updateStatus('connecting');

    if (typeof RTCPeerConnection === 'undefined') {
      console.warn('WebRTC RTCPeerConnection not supported in environment, using WebSocket fallback');
      this._useFallbackTransport();
      return;
    }

    this._createPeerConnection();
  }

  _cleanupPeerConnection() {
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.onmessage = null;
      try { this.dataChannel.close(); } catch (e) { }
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.ondatachannel = null;
      try { this.peerConnection.close(); } catch (e) { }
      this.peerConnection = null;
    }
  }

  _createPeerConnection() {
    this._cleanupPeerConnection();

    try {
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      };

      this.peerConnection = new RTCPeerConnection(config);

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.socket && this.targetPeerSocketId) {
          this.socket.emit('interaction_signal_ice', {
            targetSocketId: this.targetPeerSocketId,
            sessionId: this.sessionId,
            candidate: event.candidate
          });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        if (!this.peerConnection) return;
        const state = this.peerConnection.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          this._handleDisconnect();
        }
      };

      if (this.isInitiator) {
        // Initiator creates the DataChannel
        this.dataChannel = this.peerConnection.createDataChannel('interaction_dc', {
          ordered: true
        });
        this._setupDataChannel(this.dataChannel);

        this.peerConnection.createOffer().then((offer) => {
          if (!this.peerConnection) return;
          return this.peerConnection.setLocalDescription(offer);
        }).then(() => {
          if (this.socket && this.targetPeerSocketId && this.peerConnection?.localDescription) {
            this.socket.emit('interaction_signal_offer', {
              targetSocketId: this.targetPeerSocketId,
              sessionId: this.sessionId,
              sdp: this.peerConnection.localDescription
            });
          }
        }).catch((err) => {
          console.error('Error creating WebRTC offer for DataChannel:', err);
          this._useFallbackTransport();
        });
      } else {
        // Responder receives DataChannel
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this._setupDataChannel(this.dataChannel);
        };
      }
    } catch (err) {
      console.error('Failed to create RTCPeerConnection, falling back to Socket:', err);
      this._useFallbackTransport();
    }
  }

  _setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.usingFallback = false;
      this.reconnectAttempts = 0;
      this._updateStatus('connected');
    };

    channel.onclose = () => {
      if (!this._isDestroyed) {
        this._handleDisconnect();
      }
    };

    channel.onerror = (err) => {
      console.error('WebRTC DataChannel error:', err);
      this._handleDisconnect();
    };

    channel.onmessage = (event) => {
      if (typeof this.onMessage === 'function') {
        this.onMessage(event.data);
      }
    };
  }

  _setupSocketListeners() {
    if (!this.socket) return;

    // Dedicated interaction signaling handlers scoped by targetPeerSocketId and sessionId
    this._onOffer = async ({ fromSocketId, sessionId, sdp }) => {
      if (this._isDestroyed || fromSocketId !== this.targetPeerSocketId) return;
      if (this.sessionId && sessionId && this.sessionId !== sessionId) return;

      if (!this.peerConnection) this._createPeerConnection();

      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.socket.emit('interaction_signal_answer', {
          targetSocketId: fromSocketId,
          sessionId: this.sessionId,
          sdp: this.peerConnection.localDescription
        });
      } catch (err) {
        console.error('Failed handling interaction WebRTC offer:', err);
        this._useFallbackTransport();
      }
    };

    this._onAnswer = async ({ fromSocketId, sessionId, sdp }) => {
      if (this._isDestroyed || fromSocketId !== this.targetPeerSocketId || !this.peerConnection) return;
      if (this.sessionId && sessionId && this.sessionId !== sessionId) return;

      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('Failed handling interaction WebRTC answer:', err);
        this._useFallbackTransport();
      }
    };

    this._onIceCandidate = async ({ fromSocketId, sessionId, candidate }) => {
      if (this._isDestroyed || fromSocketId !== this.targetPeerSocketId || !this.peerConnection) return;
      if (this.sessionId && sessionId && this.sessionId !== sessionId) return;

      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Failed adding ICE candidate:', err);
      }
    };

    // Socket fallback event listener
    this._onSocketInteraction = ({ fromSocketId, event }) => {
      if (this._isDestroyed) return;
      if (fromSocketId === this.targetPeerSocketId && typeof this.onMessage === 'function') {
        this.onMessage(event);
      }
    };

    this.socket.on('interaction_signal_offer', this._onOffer);
    this.socket.on('interaction_signal_answer', this._onAnswer);
    this.socket.on('interaction_signal_ice', this._onIceCandidate);
    this.socket.on('interaction_signal_candidate', this._onIceCandidate);
    this.socket.on('interaction_event', this._onSocketInteraction);
    this.socket.on('interaction_event_direct', this._onSocketInteraction);
  }

  _useFallbackTransport() {
    this.usingFallback = true;
    this._updateStatus('fallback');
  }

  _handleDisconnect() {
    if (this._isDestroyed) return;
    this._updateStatus('disconnected');

    // Attempt reconnection or fallback
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 4000);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (!this._isDestroyed) {
          this.connect();
        }
      }, delay);
    } else {
      // Switch permanently to WebSocket fallback
      this._useFallbackTransport();
    }
  }

  /**
   * Send interaction packet over WebRTC DataChannel (or WebSocket fallback)
   * @param {object} eventPacket 
   */
  send(eventPacket) {
    if (this._isDestroyed) return false;

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const data = InteractionSerializer.serialize(eventPacket, 'json');
      this.dataChannel.send(data);
      return true;
    }

    // Fallback to socket
    if (this.socket && this.targetPeerSocketId) {
      this.socket.emit('interaction_event', {
        targetSocketId: this.targetPeerSocketId,
        sessionId: this.sessionId,
        event: eventPacket
      });
      this.socket.emit('send_interaction_event', {
        targetSocketId: this.targetPeerSocketId,
        sessionId: this.sessionId,
        event: eventPacket
      });
      return true;
    }

    return false;
  }

  _updateStatus(newStatus) {
    this.status = newStatus;
    if (typeof this.onTransportStatus === 'function') {
      try {
        this.onTransportStatus(newStatus, { fallback: this.usingFallback });
      } catch (e) { }
    }
  }

  destroy() {
    this._isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._cleanupPeerConnection();

    if (this.socket) {
      if (this._onOffer) this.socket.off('interaction_signal_offer', this._onOffer);
      if (this._onAnswer) this.socket.off('interaction_signal_answer', this._onAnswer);
      if (this._onIceCandidate) this.socket.off('interaction_signal_ice', this._onIceCandidate);
      if (this._onSocketInteraction) this.socket.off('interaction_event_direct', this._onSocketInteraction);
    }
  }
}
