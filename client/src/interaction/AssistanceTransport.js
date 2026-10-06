import { RealtimeTransport } from './RealtimeTransport.js';

export class AssistanceTransport extends RealtimeTransport {
  constructor({ captureStream, onStream, ...options }) {
    super({ ...options, eventNamespace:'assistance', connectionTimeoutMs:20000 });
    this.captureStream = captureStream;
    this.onStream = onStream;
  }
  preparePeerConnection(pc) {
    if (this.isInitiator) pc.addTransceiver('video',{direction:'recvonly'});
    else for (const track of this.captureStream.getVideoTracks()) pc.addTrack(track,this.captureStream);
    pc.ontrack = ({track,streams}) => {
      if(this._isDestroyed || this.isInitiator === false || track.kind !== 'video')return;
      const stream=streams[0] || new MediaStream([track]);
      track.onended=()=>this._handleDisconnect();
      this.onStream?.(stream);
    };
  }
  _useFallbackTransport() {
    // Socket can carry input only while assistance's own video remains connected.
    if (this.peerConnection?.connectionState !== 'connected') { this._handleDisconnect(); return; }
    super._useFallbackTransport();
  }
}
