import test from 'node:test';
import assert from 'node:assert/strict';
import {InteractionEventReceiver} from '../src/interaction/InteractionEventReceiver.js';
import {createCoalescedTask} from '../src/coalesced-task.js';

const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const session=()=>({token:'token',isAuthorized:()=>true,getState:()=> 'Active',touch(){}});
const event=(sequence,eventType='PointerMove')=>({sequence,eventType,token:'token',payload:{x:sequence/1000,y:.5},timestamp:Date.now()});

test('a slow native target receives the latest cursor position without replaying obsolete moves or skipping input barriers',async()=>{
  const first=deferred(),applied=[],acks=[];
  const receiver=new InteractionEventReceiver({session:session(),validator:{validate:()=>({valid:true})},target:{async executeEvent(e){applied.push(e);if(e.sequence===0)await first.promise;return {success:true,nativeAck:'OK'};}},onApplied:e=>acks.push(e.sequence)});
  receiver.receive(event(0));await Promise.resolve();
  for(let i=1;i<80;i++)receiver.receive(event(i));
  receiver.receive(event(80,'PointerDown'));
  for(let i=81;i<160;i++)receiver.receive(event(i));
  receiver.receive(event(160,'PointerUp'));receiver.receive(event(161,'KeyPressed'));receiver.receive(event(162,'KeyReleased'));
  assert.deepEqual(applied.map(e=>e.sequence),[0]);first.resolve();await receiver.executionQueue;
  assert.deepEqual(applied.map(e=>e.sequence),[0,79,80,159,160,161,162]);
  assert.equal(applied[1].payload.x,.079);assert.deepEqual(acks,[0,79,80,159,160,161,162]);assert.equal(receiver.stats.totalCoalesced,156);
});

test('revoking a session discards queued pointer, button and keyboard input',async()=>{
  const first=deferred(),calls=[],acks=[],s=session();let authorized=true;s.isAuthorized=()=>authorized;
  const receiver=new InteractionEventReceiver({session:s,validator:{validate:()=>({valid:true})},target:{async executeEvent(e){calls.push(e.sequence);await first.promise;return {success:true};}},onApplied:e=>acks.push(e.sequence)});
  receiver.receive(event(0));await Promise.resolve();receiver.receive(event(1));receiver.receive(event(2,'PointerDown'));receiver.receive(event(3,'KeyPressed'));
  authorized=false;s.token=null;receiver.resetSequence();first.resolve();await receiver.executionQueue;
  assert.deepEqual(calls,[0]);assert.deepEqual(acks,[]);assert.equal(receiver.pendingNativeEvents.length,0);
});

test('overlapping refreshes retain one final fresh pass and recover after failure',async()=>{
  let calls=0;const gate=deferred();const run=createCoalescedTask(async()=>{calls++;if(calls===1)await gate.promise;});
  const initial=run();await Promise.resolve();for(let i=0;i<100;i++)assert.equal(run(),initial);gate.resolve();await initial;assert.equal(calls,2);
  run.dispose();await run();assert.equal(calls,2);
  let attempts=0;const recover=createCoalescedTask(async()=>{if(++attempts===1)throw Error('Temporary network failure');});
  await assert.rejects(recover());await recover();assert.equal(attempts,2);
});
