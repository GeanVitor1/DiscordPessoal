export function preferOpus(transceiver) {
  const codecs=globalThis.RTCRtpSender?.getCapabilities?.('audio')?.codecs;
  if(!codecs || typeof transceiver.setCodecPreferences!=='function')return;
  const opus=codecs.filter(c=>c.mimeType.toLowerCase()==='audio/opus');
  if(opus.length)try{transceiver.setCodecPreferences([...opus,...codecs.filter(c=>!opus.includes(c))]);}catch{}
}
export async function configureAudio(sender) {
  if(!sender?.getParameters || !sender.setParameters)return;
  const p=sender.getParameters();if(!p.encodings?.length)return;
  for(const encoding of p.encodings){encoding.maxBitrate=64000;if('dtx' in encoding)encoding.dtx='enabled';}
  try{await sender.setParameters(p);}catch{/* Unsupported options retain the browser's negotiated defaults. */}
}
export class ScreenAdaptation {
  constructor(sender,ceiling=6000000){this.sender=sender;this.ceiling=ceiling;this.bitrate=ceiling;this.bad=0;this.good=0;}
  async sample(stats) {
    const video=stats?.media?.find(x=>x.kind==='video' && x.direction==='send');if(!video)return;
    const bad=(video.lossPercent??0)>5 || (stats.rttMs??0)>350 || (stats.availableOutgoingKbps!=null && stats.availableOutgoingKbps*1000<this.bitrate*.75);
    this.bad=bad?this.bad+1:0;this.good=bad?0:this.good+1;
    let next=this.bitrate;
    if(this.bad>=3){next=Math.max(750000,Math.round(this.bitrate*.8));this.bad=0;this.good=0;}
    else if(this.good>=8){next=Math.min(this.ceiling,Math.round(this.bitrate*1.1));this.good=0;}
    if(next===this.bitrate)return;
    const p=this.sender.getParameters();if(!p.encodings?.length)return;
    for(const e of p.encodings)e.maxBitrate=next;
    try{await this.sender.setParameters(p);this.bitrate=next;}catch{}
  }
  async initialize(){const p=this.sender.getParameters();if(!p.encodings?.length)return;for(const e of p.encodings){e.maxBitrate=this.ceiling;e.maxFramerate=30;}try{await this.sender.setParameters(p);}catch{}}
}
