import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedRoute } from '../src/rtc/ice.js';
import { ScreenAdaptation } from '../src/rtc/media.js';
test('selected pair beats unselected relay; interval bitrate/loss/FPS reflect measured counters',async()=>{
  let timestamp=1000,bytes=1000,received=100,lost=0;
  const pc={getStats:async()=>new Map([
    ['transport',{type:'transport',selectedCandidatePairId:'actual'}],
    ['actual',{id:'actual',type:'candidate-pair',timestamp,localCandidateId:'local',remoteCandidateId:'remote',bytesSent:bytes,bytesReceived:bytes,currentRoundTripTime:.05}],
    ['relay-pair',{id:'relay-pair',type:'candidate-pair',nominated:true,state:'succeeded',localCandidateId:'relay'}],
    ['relay',{candidateType:'relay'}],['local',{candidateType:'host',protocol:'udp'}],['remote',{candidateType:'host'}],
    ['video',{id:'video',type:'inbound-rtp',kind:'video',timestamp,bytesReceived:bytes,packetsReceived:received,packetsLost:lost,framesPerSecond:30,frameWidth:1920,frameHeight:1080,framesDropped:2,jitter:.012}]
  ])};
  assert.equal((await selectedRoute(pc)).route,'Direct');
  timestamp+=2000;bytes+=200000;received+=95;lost+=5;
  const stats=await selectedRoute(pc);assert.equal(stats.sendKbps,800);assert.equal(stats.rttMs,50);assert.equal(stats.media[0].lossPercent,5);assert.equal(stats.media[0].fps,30);assert.equal(stats.media[0].jitterMs,12);
  assert.equal(await selectedRoute({getStats:async()=>new Map([['relay-pair',{type:'candidate-pair',nominated:true,state:'succeeded',localCandidateId:'relay'}],['relay',{candidateType:'relay'}]])}),null,'A gathered/nominated relay does not prove it is selected');
  const unknown=await selectedRoute({getStats:async()=>new Map([['transport',{type:'transport',selectedCandidatePairId:'pair'}],['pair',{type:'candidate-pair',localCandidateId:'local',remoteCandidateId:'missing'}],['local',{candidateType:'host'}]])});
  assert.equal(unknown.route,'Unknown','Missing candidate metadata must not be reported as Direct or STUN');
});
test('screen adaptation tolerates a transient spike, reacts to sustained trouble and recovers gradually',async()=>{
  const updates=[];const sender={getParameters:()=>({encodings:[{}]}),setParameters:async p=>updates.push(p.encodings[0].maxBitrate)};
  const adaptation=new ScreenAdaptation(sender);await adaptation.initialize();
  const healthy={rttMs:30,availableOutgoingKbps:10000,media:[{kind:'video',direction:'send',lossPercent:0}]};
  const congested={...healthy,rttMs:450};
  await adaptation.sample(congested);await adaptation.sample(healthy);assert.deepEqual(updates,[6000000]);
  for(let i=0;i<3;i++)await adaptation.sample(congested);assert.ok(updates.at(-1)<6000000);const reduced=updates.at(-1);
  for(let i=0;i<8;i++)await adaptation.sample(healthy);assert.ok(updates.at(-1)>reduced && updates.at(-1)<=6000000);
});
