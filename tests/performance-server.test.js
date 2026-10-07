import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoalescedTask} from '../server/src/coalesced-task.js';
import {deliverChannelMessage} from '../server/src/message-delivery.js';

test('presence invalidations do not create an unbounded database publication backlog',async()=>{
  let finish,calls=0;const held=new Promise(r=>finish=r),run=createCoalescedTask(async()=>{calls++;if(calls===1)await held;});
  const first=run();await Promise.resolve();for(let i=0;i<250;i++)assert.equal(run(),first);finish();await first;assert.equal(calls,2);await run();assert.equal(calls,3);
});

test('durable channel messages confirm their sender without waiting for other profiles; plain text does not query role mentions',async()=>{
  const order=[],profiles=[];let release;const held=new Promise(r=>release=r);
  const socket=id=>({data:{user:{id}},rooms:new Set(['channel_channel']),emit:(_event,m)=>order.push({type:'message',viewer:id,message:m})});
  const other=socket('other'),sender=socket('sender'),io={sockets:{sockets:new Map([['other',other],['sender',sender]])}};
  const message={id:'saved-id',channelId:'channel',serverId:'server',sender:{id:'sender',bio:'private bio'},content:'hello'};
  const promise=deliverChannelMessage({io,message,senderSocket:sender,rolesFor:()=>{throw Error('Plain messages must not query roles');},visibleServerUser:async(viewer,user)=>{profiles.push(viewer);if(viewer==='other')await held;return viewer==='sender'?user:{id:user.id};},ack:response=>order.push({type:'ack',response})});
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.deepEqual(order.map(e=>e.type),['message','ack']);assert.equal(order[0].viewer,'sender');assert.equal(order[1].response.ok,true);assert.equal(order[1].response.id,'saved-id');
  release();await promise;assert.deepEqual(profiles,['sender','other']);assert.equal(order.at(-1).message.sender.bio,undefined);
});

test('a failed downstream delivery does not report an already committed message as failed',async()=>{
  const sender={data:{user:{id:'sender'}},rooms:new Set(['channel_c']),emit(){}},other={data:{user:{id:'other'}},rooms:new Set(['channel_c']),emit(){}},acks=[];let errors=0;
  await deliverChannelMessage({io:{sockets:{sockets:new Map([['s',sender],['o',other]])}},senderSocket:sender,message:{id:'saved',channelId:'c',serverId:'server',content:'<@&role>',sender:{id:'sender'}},rolesFor:async()=>[{id:'role'}],visibleServerUser:async viewer=>{if(viewer==='other')throw Error('Temporary database outage');return {id:'sender'};},ack:r=>acks.push(r),onError:()=>errors++});
  assert.equal(acks.length,1);assert.equal(acks[0].ok,true);assert.equal(errors,1);
});
