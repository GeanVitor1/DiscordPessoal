import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {io}=createRequire(new URL('../client/package.json',import.meta.url))('socket.io-client');
const Database=createRequire(new URL('../server/package.json',import.meta.url))('better-sqlite3');
test('invitation sharing, bounded joins, replies, edits, search and soft deletion respect authenticated access',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-conversation-')),sqlite=path.join(temp,'data.db'),port=16100+Math.floor(Math.random()*500),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/src/server.js'],{env:{...process.env,SQLITE_PATH:sqlite,DATABASE_URL:'',HOST:'127.0.0.1',PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const sockets=[];let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);t.after(()=>{sockets.forEach(s=>s.close());child.kill();});
  async function request(method,url,token,body){const r=await fetch(base+url,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:r.status,data};}
  for(let i=0;i<100;i++){try{if((await request('GET','/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error(logs);}
  const accounts=[];for(const handle of ['host','friend','stranger','fourth']){const r=await request('POST','/api/auth/register',null,{handle,password:'Feature-test-password-123'});assert.equal(r.status,201);accounts.push(r.data);}
  const [a,b,c,d]=accounts;
  async function socket(account){const s=io(base,{auth:{token:account.token},transports:['websocket'],autoConnect:false});sockets.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);s.connect();});return s;}
  const sa=await socket(a),sb=await socket(b);
  const once=(s,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timeout '+event)),5000);s.once(event,m=>{clearTimeout(timer);resolve(m);});});
  await request('POST','/api/friends/requests',a.token,{handle:'friend'});await request('PUT',`/api/friends/${a.user.id}/accept`,b.token);
  const s=(await request('POST','/api/servers',a.token,{name:'Friends server'})).data,ch=s.channels.find(x=>x.type==='text');
  assert.equal((await request('POST',`/api/servers/${s.id}/invites`,c.token,{})).status,403);
  assert.equal((await request('POST',`/api/servers/${s.id}/invites`,a.token,{expiresIn:-1,maxUses:0})).status,400);
  const invite=(await request('POST',`/api/servers/${s.id}/invites`,a.token,{expiresIn:0,maxUses:1})).data;
  assert.equal((await request('GET',`/api/invites/${invite.code}`)).status,401);
  const preview=(await request('GET',`/api/invites/${invite.code}`,b.token)).data;assert.equal(preview.server.name,s.name);assert.equal(preview.members,1);assert.equal(preview.alreadyMember,false);
  assert.equal((await request('POST',`/api/invites/${invite.code}/share`,a.token,{userId:c.user.id})).status,403);
  const arrival=once(sb,'dm_message');assert.equal((await request('POST',`/api/invites/${invite.code}/share`,a.token,{userId:b.user.id,senderId:c.user.id})).status,201);
  const card=await arrival;assert.equal(card.inviteCode,invite.code);assert.equal(card.sender.id,a.user.id);
  const dm=card.conversationId;assert.equal((await request('GET',`/api/dms/${dm}/messages`,b.token)).data[0].inviteCode,invite.code);
  assert.equal((await request('POST',`/api/invites/${invite.code}/join`,a.token)).status,200,'existing member does not consume invite');
  const contenders=await Promise.all([request('POST',`/api/invites/${invite.code}/join`,b.token),request('POST',`/api/invites/${invite.code}/join`,c.token)]);assert.deepEqual(contenders.map(x=>x.status).sort(),[200,404]);
  // Use a fresh invite to guarantee the friend has access independently of the race winner.
  const open=(await request('POST',`/api/servers/${s.id}/invites`,a.token,{expiresIn:86400,maxUses:0})).data;
  await request('POST',`/api/invites/${open.code}/join`,b.token);await request('POST',`/api/invites/${open.code}/join`,b.token);
  assert.equal((await request('GET',`/api/servers/${s.id}/invites`,a.token)).data.find(i=>i.code===open.code).uses,contenders[0].status===200?0:1);
  const owned=(await request('POST',`/api/servers/${s.id}/invites`,b.token,{expiresIn:3600,maxUses:5})).data;
  assert.ok(owned.code,'members can invite their friends');
  assert.equal((await request('DELETE',`/api/servers/${s.id}/invites/${open.code}`,b.token)).status,403);
  assert.equal((await request('DELETE',`/api/servers/${s.id}/invites/${owned.code}`,a.token)).status,204,'owner can revoke member invite');
  assert.equal((await request('GET',`/api/invites/${owned.code}`,b.token)).status,404);
  const ack=await sa.timeout(5000).emitWithAck('send_message',{channelId:ch.id,content:'Original 100% message',senderId:c.user.id});assert.equal(ack.ok,true);const original=ack.id;
  assert.equal((await request('GET',`/api/channels/${ch.id}/search?q=100%25`,b.token)).data.length,1,'percent is literal');
  assert.equal((await request('GET',`/api/channels/${ch.id}/search?q=%25`,d.token)).status,403);
  const reply=await sb.timeout(5000).emitWithAck('send_message',{channelId:ch.id,content:'Reply',replyTo:original});assert.equal(reply.ok,true);
  const other=(await request('POST',`/api/servers/${s.id}/channels`,a.token,{name:'other',type:'text'})).data;
  assert.ok((await sa.timeout(5000).emitWithAck('send_message',{channelId:other.id,content:'Cross channel',replyTo:original})).error);
  assert.equal((await request('PUT',`/api/channels/${ch.id}/messages/${original}`,b.token,{content:'Stolen',senderId:a.user.id})).status,403);
  const update=once(sb,'message_updated');assert.equal((await request('PUT',`/api/channels/${ch.id}/messages/${original}`,a.token,{content:'Edited message'})).status,200);assert.equal((await update).content,'Edited message');
  assert.equal((await request('GET',`/api/channels/${ch.id}/messages`,b.token)).data.find(m=>m.id===reply.id).reply.content,'Edited message');
  assert.equal((await request('GET',`/api/channels/${ch.id}/messages?before=${reply.id}`,a.token)).data.some(m=>m.id===original),true);
  assert.equal((await request('GET',`/api/channels/${ch.id}/messages?before=missing`,a.token)).status,400);
  assert.equal((await request('DELETE',`/api/channels/${ch.id}/messages/${original}`,b.token)).status,403);
  const deleted=once(sb,'message_deleted');assert.equal((await request('DELETE',`/api/channels/${ch.id}/messages/${original}`,a.token)).status,200);assert.ok((await deleted).deletedAt);
  const history=(await request('GET',`/api/channels/${ch.id}/messages`,b.token)).data;assert.equal(history.find(m=>m.id===original).content,'');assert.equal(history.find(m=>m.id===reply.id).reply.content,'Mensagem excluída');
  assert.equal((await request('GET',`/api/channels/${ch.id}/search?q=Edited`,b.token)).data.length,0);
  assert.ok((await sb.timeout(5000).emitWithAck('send_message',{channelId:ch.id,content:'Deleted reply',replyTo:original})).error);
  const sent=await sa.timeout(5000).emitWithAck('dm_send',{conversationId:dm,content:'Private original'});assert.equal(sent.ok,true);
  const dmReply=await sb.timeout(5000).emitWithAck('dm_send',{conversationId:dm,content:'Private answer',replyTo:sent.id});assert.equal(dmReply.ok,true);
  assert.ok((await sb.timeout(5000).emitWithAck('dm_send',{conversationId:dm,content:'Invalid context',replyTo:reply.id})).error);
  assert.equal((await request('PUT',`/api/dms/${dm}/messages/${sent.id}`,b.token,{content:'Stolen'})).status,403);
  assert.equal((await request('PUT',`/api/dms/${dm}/messages/${sent.id}`,a.token,{content:'Private edited'})).status,200);
  assert.equal((await request('GET',`/api/dms/${dm}/messages`,b.token)).data.find(m=>m.id===dmReply.id).reply.content,'Private edited');
  assert.equal((await request('DELETE',`/api/dms/${dm}/messages/${sent.id}`,a.token)).status,200);
  assert.equal((await request('GET',`/api/dms/${dm}/messages`,b.token)).data.find(m=>m.id===dmReply.id).reply.content,'Mensagem excluída');
  await request('PUT',`/api/blocks/${a.user.id}`,b.token);
  assert.equal((await request('POST',`/api/invites/${open.code}/share`,a.token,{userId:b.user.id})).status,403);
  assert.equal((await request('PUT',`/api/dms/${dm}/messages/${dmReply.id}`,b.token,{content:'Blocked edit'})).status,403);
  const database=new Database(sqlite);assert.equal(database.prepare('SELECT content FROM messages WHERE id=?').get(original).content,'Edited message','soft deletion preserves stored data');
  database.transaction(()=>{for(let n=0;n<105;n++) {const timestamp=new Date(Date.UTC(2020,0,1,0,0,n)).toISOString();database.prepare('INSERT INTO messages(id,channel_id,sender_id,content,timestamp) VALUES(?,?,?,?,?)').run(`old-channel-${n}`,ch.id,a.user.id,'Older channel',timestamp);database.prepare('INSERT INTO dm_messages(id,conversation_id,sender_id,content,timestamp) VALUES(?,?,?,?,?)').run(`old-dm-${n}`,dm,a.user.id,'Older DM',timestamp);}})();database.close();
  for(const [kind,id] of [['channels',ch.id],['dms',dm]]){const recent=(await request('GET',`/api/${kind}/${id}/messages`,a.token)).data;assert.equal(recent.length,100);const older=(await request('GET',`/api/${kind}/${id}/messages?before=${recent[0].id}`,a.token)).data;assert.ok(older.length>0);assert.equal(new Set([...recent,...older].map(m=>m.id)).size,recent.length+older.length,'pagination has no duplicates');assert.ok(older.some(m=>m.id===`old-${kind==='dms'?'dm':'channel'}-0`));}
  assert.equal((await request('GET',`/api/dms/${dm}/messages/old-dm-0`,b.token)).data.content,'Older DM');
  assert.equal((await request('GET',`/api/dms/${dm}/messages/old-dm-0`,d.token)).status,403);
});
