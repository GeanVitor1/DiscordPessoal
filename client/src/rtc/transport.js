import { VoiceMesh } from './VoiceMesh.js';
// Contract: setTracks(audio,video), sync(socketIds), remove(id), destroy().
// Only this factory chooses the voice topology. A future SFU adapter must implement
// the same media/lifecycle callbacks and negotiate its own authenticated signaling.
export function createVoiceTransport(options) {return new VoiceMesh(options);}
