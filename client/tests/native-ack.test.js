import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionSession, InteractionValidator, InteractionEventReceiver, CoordinateMapper, NativeDesktopInteractionTarget, RealtimeTransport } from '../src/interaction/index.js';

test('native application is acknowledged after execution; queued releases preserve order and revocation cancels queued input', async () => {
  const session=new InteractionSession({sessionId:'native-test',hostId:'host',guestId:'guest',token:'secret'});session.grantConsent();
  const calls=[],acks=[];let finish;
  const target={executeEvent:async event=>{calls.push(event.sequence);if(event.sequence===0)await new Promise(r=>finish=r);return {success:true,nativeAck:'OK'};}};
  const receiver=new InteractionEventReceiver({session,validator:new InteractionValidator(),coordinateMapper:new CoordinateMapper(),target,onApplied:(event,result)=>acks.push({sequence:event.sequence,...result})});
  const event=sequence=>({sessionId:'native-test',participantId:'guest',token:'secret',sequence,eventType:sequence===0?'KeyPressed':'KeyReleased',payload:{key:'Control',code:'ControlLeft'}});
  receiver.receive(event(0));receiver.receive(event(1));await Promise.resolve();assert.deepEqual(calls,[0]);assert.deepEqual(acks,[]);
  finish();await receiver.executionQueue;assert.deepEqual(calls,[0,1]);assert.deepEqual(acks.map(x=>x.sequence),[0,1]);
  receiver.receive(event(2));session.revoke();receiver.resetSequence();await receiver.executionQueue;assert.deepEqual(calls,[0,1]);session.destroy();
});

test('false IPC response is rejection, never a successful native application', async () => {
  globalThis.window={desktopInteraction:{isAvailable:true,movePointer:async()=>false}};
  try {const target=new NativeDesktopInteractionTarget({sessionId:'native-test',displayId:'2'});const result=await target.executeEvent({participantId:'guest',token:'secret',sequence:182,eventType:'PointerMove',payload:{x:.5,y:.5}});assert.equal(result.success,false);assert.equal(result.code,'IPC_REJECTED');}
  finally{delete globalThis.window;}
});

test('native acknowledgements require the host peer, session and token; moves are sampled and discrete actions retained', () => {
  const handlers=new Map(),sent=[],acks=[];
  const socket={connected:true,on:(e,f)=>handlers.set(e,f),off:(e)=>handlers.delete(e),emit:(e,d)=>sent.push({e,d})};
  const guest=new RealtimeTransport({socket,sessionId:'session',targetPeerSocketId:'host',sessionToken:'secret',isInitiator:true,onAcknowledgement:a=>acks.push(a)});
  const packet={kind:'native_ack',sessionId:'session',token:'secret',sequence:182,eventType:'PointerDown',success:true,nativeAck:'OK'};
  handlers.get('interaction_ack')({fromSocketId:'intruder',sessionId:'session',ack:packet});
  handlers.get('interaction_ack')({fromSocketId:'host',sessionId:'session',ack:{...packet,token:'wrong'}});
  assert.equal(acks.length,0);
  handlers.get('interaction_ack')({fromSocketId:'host',sessionId:'session',ack:packet});assert.equal(acks.length,1);assert.equal(acks[0].sequence,182);guest.destroy();
  let now=1000;
  const host=new RealtimeTransport({socket,sessionId:'session',targetPeerSocketId:'guest',sessionToken:'secret',now:()=>now});host.usingFallback=true;
  host.sendAcknowledgement({sequence:0,eventType:'PointerMove'},{success:true,nativeAck:'OK'});
  now+=10;host.sendAcknowledgement({sequence:1,eventType:'PointerMove'},{success:true,nativeAck:'OK'});
  host.sendAcknowledgement({sequence:2,eventType:'PointerUp'},{success:true,nativeAck:'OK'});
  assert.equal(sent.filter(x=>x.e==='interaction_ack').length,2);host.destroy();assert.equal(handlers.size,0);
});
