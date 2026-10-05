export const DEFAULT_RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Trickle candidates can arrive before SDP; preserve them until setRemoteDescription.
const pending = new WeakMap();
export async function addRemoteCandidate(pc, candidate) {
  if (!pc || pc.signalingState === 'closed' || !candidate) return;
  if (!pc.remoteDescription) {
    const queue = pending.get(pc) || [];
    if (queue.length < 256) queue.push(candidate);
    pending.set(pc, queue);
    return;
  }
  await pc.addIceCandidate(candidate);
}

export async function setRemoteDescription(pc, description) {
  await pc.setRemoteDescription(description);
  const queue = pending.get(pc) || [];
  pending.delete(pc);
  for (const candidate of queue) await pc.addIceCandidate(candidate);
}

const previousStats = new WeakMap();
export async function selectedRoute(pc) {
  const stats = await pc.getStats();
  const transport = [...stats.values()].find(s => s.type === 'transport' && s.selectedCandidatePairId);
  const pair = transport ? stats.get(transport.selectedCandidatePairId) : [...stats.values()].find(s => s.type === 'candidate-pair' && s.selected === true && s.state === 'succeeded');
  if (!pair) return null;
  const local = stats.get(pair.localCandidateId);
  const remote = stats.get(pair.remoteCandidateId);
  const old=previousStats.get(pc);previousStats.set(pc,stats);
  const before=old?.get(pair.id),seconds=before?(pair.timestamp-before.timestamp)/1000:0;
  const rate=field=>seconds>0 && pair[field]>=before[field]?Math.round((pair[field]-before[field])*8/seconds/1000):null;
  const media=[];
  for(const s of stats.values()) {
    if(!['inbound-rtp','outbound-rtp'].includes(s.type) || s.isRemote)continue;
    const prior=old?.get(s.id),dt=prior?(s.timestamp-prior.timestamp)/1000:0;
    const feedback=[...stats.values()].find(x=>x.type==='remote-inbound-rtp' && x.localId===s.id);
    const lossReport=s.type==='inbound-rtp'?s:feedback;
    const oldLoss=lossReport && old?.get(lossReport.id);
    const received=lossReport?.packetsReceived-oldLoss?.packetsReceived,lost=lossReport?.packetsLost-oldLoss?.packetsLost;
    const codec=stats.get(s.codecId);
    media.push({kind:s.kind || s.mediaType,direction:s.type==='inbound-rtp'?'receive':'send',codec:codec?.mimeType,fmtp:codec?.sdpFmtpLine || '',bitrateKbps:dt>0?Math.max(0,Math.round(((s.bytesSent??s.bytesReceived)-(prior.bytesSent??prior.bytesReceived))*8/dt/1000)):null,lossPercent:received>=0 && lost>=0 && received+lost>0?Number((100*lost/(received+lost)).toFixed(2)):null,jitterMs:s.jitter!=null?Math.round(s.jitter*1000):null,rttMs:feedback?.roundTripTime!=null?Math.round(feedback.roundTripTime*1000):null,width:s.frameWidth,height:s.frameHeight,fps:s.framesPerSecond ?? (dt>0?(s.framesEncoded-prior.framesEncoded)/dt:null),framesDropped:s.framesDropped,qualityLimitation:s.qualityLimitationReason,concealedSamples:s.concealedSamples});
  }
  for (const item of media) {
    const report=[...stats.values()].find(s => (s.kind || s.mediaType)===item.kind && s.type===(item.direction==='send'?'outbound-rtp':'inbound-rtp') && !s.isRemote);
    Object.assign(item,{bytesSent:report?.bytesSent,bytesReceived:report?.bytesReceived,packetsSent:report?.packetsSent,packetsReceived:report?.packetsReceived,totalAudioEnergy:report?.totalAudioEnergy});
  }
  const types=[local?.candidateType,remote?.candidateType];
  const knownTypes=types.every(type=>['host','srflx','prflx','relay'].includes(type));
  const route=types.includes('relay')?'TURN':!knownTypes?'Unknown':types.some(type=>['srflx','prflx'].includes(type))?'STUN':'Direct';
  return {pairId:pair.id,route,localType:local?.candidateType,remoteType:remote?.candidateType,protocol:local?.protocol,rttMs:pair.currentRoundTripTime!=null?Math.round(pair.currentRoundTripTime*1000):null,bytesSent:pair.bytesSent,bytesReceived:pair.bytesReceived,sendKbps:rate('bytesSent'),receiveKbps:rate('bytesReceived'),availableOutgoingKbps:pair.availableOutgoingBitrate!=null?Math.round(pair.availableOutgoingBitrate/1000):null,media};
}
