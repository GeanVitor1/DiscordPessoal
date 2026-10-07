import { addRemoteCandidate, setRemoteDescription, selectedRoute } from './ice.js';
import { preferOpus,configureAudio } from './media.js';

// One audio/video connection per participant; screen sharing remains independently subscribable.
export class VoiceMesh {
  constructor({ socket, channelId, rtcConfig, onStream, onStatus, onError, audioSettings={} }) {
    Object.assign(this, { socket, channelId, rtcConfig, onStream, onStatus, onError, audioSettings });
    this.peers = new Map();
    this.audioTrack = null;
    this.videoTrack = null;
    this.closed = false;
    this.offer = data => this.signal(data, 'offer');
    this.answer = data => this.signal(data, 'answer');
    this.candidate = data => this.signal(data, 'candidate');
    socket.on('voice_offer', this.offer);
    socket.on('voice_answer', this.answer);
    socket.on('ice_candidate', this.candidate);
  }

  ensure(id) {
    if (this.closed || id === this.socket.id) return null;
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(this.rtcConfig);
    const peer = { pc, makingOffer: false, ignoreOffer: false, settingAnswer: false, polite: this.socket.id > id, stream: new MediaStream() };
    this.peers.set(id, peer);
    peer.audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
    preferOpus(peer.audio);
    peer.video = pc.addTransceiver('video', { direction: 'sendrecv' });
    peer.audio.sender.replaceTrack(this.audioTrack).then(()=>configureAudio(peer.audio.sender,this.audioSettings)).catch(this.onError);
    peer.video.sender.replaceTrack(this.videoTrack).catch(this.onError);
    pc.ontrack = event => {
      if (!peer.stream.getTracks().some(t => t.id === event.track.id)) peer.stream.addTrack(event.track);
      this.onStream(id, new MediaStream(peer.stream.getTracks()));
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.emit('ice_candidate', { targetSocketId: id, channelId: this.channelId, candidate });
    };
    pc.onnegotiationneeded = async () => {
      // Deterministic first offer avoids simultaneous initial ICE generations.
      if (peer.polite && !pc.remoteDescription && !pc.localDescription) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (!this.closed) this.socket.emit('voice_offer', { targetSocketId: id, channelId: this.channelId, sdp: pc.localDescription });
      } catch (error) { if (!this.closed) this.onError(error); }
      finally { peer.makingOffer = false; }
    };
    pc.onconnectionstatechange = async () => {
      if (this.closed) return;
      this.onStatus(id, { state: pc.connectionState });
      if (pc.connectionState === 'connected') {
        peer.restarts=0;
        await configureAudio(peer.audio.sender,this.audioSettings);
        try { this.onStatus(id, { state: 'connected', ...await selectedRoute(pc) }); } catch { /* Stats are diagnostic only. */ }
      } else if (pc.connectionState === 'failed' && (peer.restarts || 0)<3) {
        // Media can restart ICE. Assistance has a separate, fail-closed lifecycle.
        peer.restarts=(peer.restarts || 0)+1;pc.restartIce();
      }
    };
    let polling=false;
    peer.timer=setInterval(async()=>{
      if(this.closed || polling || pc.connectionState!=='connected')return;
      polling=true;
      try {const stats=await selectedRoute(pc);if(!this.closed && this.peers.get(id)===peer)this.onStatus(id,{state:pc.connectionState,...stats});}catch{}finally{polling=false;}
    },2000);
    return peer;
  }

  async signal({ fromSocketId, channelId, sdp, candidate }, type) {
    if (this.closed || channelId !== this.channelId) return;
    const peer = this.ensure(fromSocketId);
    if (!peer) return;
    const { pc } = peer;
    try {
      if (type === 'candidate') {
        if (!peer.ignoreOffer) await addRemoteCandidate(pc, candidate);
        return;
      }
      const ready = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingAnswer);
      peer.ignoreOffer = sdp.type === 'offer' && !ready && !peer.polite;
      if (peer.ignoreOffer) return;
      peer.settingAnswer = sdp.type === 'answer';
      await setRemoteDescription(pc, sdp);
      peer.settingAnswer = false;
      if (sdp.type === 'offer') {
        await pc.setLocalDescription();
        if (!this.closed) this.socket.emit('voice_answer', { targetSocketId: fromSocketId, channelId: this.channelId, sdp: pc.localDescription });
      }
    } catch (error) { peer.settingAnswer = false; if (!this.closed) this.onError(error); }
  }

  updateAudioSettings(settings){this.audioSettings=settings;for(const p of this.peers.values())configureAudio(p.audio.sender,settings);}

  async setTracks(audioTrack, videoTrack) {
    this.audioTrack = audioTrack;
    this.videoTrack = videoTrack;
    await Promise.all([...this.peers.values()].flatMap(p => [p.audio.sender.replaceTrack(audioTrack), p.video.sender.replaceTrack(videoTrack)]));
  }

  sync(ids) {
    const wanted = new Set(ids);
    for (const id of this.peers.keys()) if (!wanted.has(id)) this.remove(id);
    for (const id of ids) this.ensure(id);
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    clearInterval(peer.timer);
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    this.onStream(id, null);
    this.onStatus(id, null);
  }

  destroy() {
    this.closed = true;
    this.socket.off('voice_offer', this.offer);
    this.socket.off('voice_answer', this.answer);
    this.socket.off('ice_candidate', this.candidate);
    for (const id of this.peers.keys()) this.remove(id);
  }
}
