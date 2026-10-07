import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {base32,totp} from '../server/src/account-security.js';
const Database=createRequire(new URL('../server/package.json',import.meta.url))('better-sqlite3');
const {io}=createRequire(new URL('../client/package.json',import.meta.url))('socket.io-client');

test('TOTP matches RFC 6238 independent SHA1 test vectors',()=>{
  const secret=base32(Buffer.from('12345678901234567890'));
  for(const [time,expected]of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037']])assert.equal(totp(secret,Math.floor(time/30),8),expected);
});

test('community permissions, hierarchy, membership, bans and conversation tools cannot cross authenticated boundaries',{timeout:30000},async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-community-')),sqlite=path.join(temp,'data.db'),port=19000+Math.floor(Math.random()*900),base=`http://127.0.0.1:${port}`,sockets=[];
  const child=spawn(process.execPath,['server/src/server.js'],{env:{...process.env,SQLITE_PATH:sqlite,DATABASE_URL:'',HOST:'127.0.0.1',PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);t.after(()=>{sockets.forEach(s=>s.close());child.kill();});
  async function request(method,url,account,body){const r=await fetch(base+url,{method,headers:{...(account?.token?{Authorization:`Bearer ${account.token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await r.json();}catch{}return {status:r.status,data};}
  for(let i=0;i<100;i++){try{if((await request('GET','/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===99)throw Error(logs);}
  const accounts=[];for(const handle of ['owner','member','stranger']){const r=await request('POST','/api/auth/register',null,{handle,password:'Community-test-password-123'});assert.equal(r.status,201);accounts.push(r.data);}const[a,b,c]=accounts;
  const server=(await request('POST','/api/servers',a,{name:'Community test'})).data,text=server.channels.find(c=>c.type==='text');
  const invite=(await request('POST',`/api/servers/${server.id}/invites`,a,{expiresIn:0,maxUses:0})).data;assert.equal((await request('POST',`/api/invites/${invite.code}/join`,b,{})).status,200);
  const roster=await request('GET',`/api/servers/${server.id}/members`,a);assert.equal(roster.status,200);assert.equal(roster.data.length,2);assert.ok(roster.data.every(u=>u.status==='offline'));assert.equal((await request('GET',`/api/servers/${server.id}/members`,c)).status,403);
  assert.equal((await request('POST',`/api/servers/${server.id}/roles`,b,{name:'Forged admin',userId:a.user.id})).status,403);
  const role=(await request('POST',`/api/servers/${server.id}/roles`,a,{name:'Moderator'})).data;
  assert.equal((await request('PUT',`/api/servers/${server.id}/roles/${role.id}`,a,{name:'Moderator',color:'#ffcc00',position:5,permissions:{manageChannels:true,manageRoles:true,manageMessages:true}})).status,204);
  assert.equal((await request('PUT',`/api/servers/${server.id}/members/${b.user.id}`,a,{roles:[role.id],nickname:'Apelido'})).status,204);
  assert.equal((await request('POST',`/api/servers/${server.id}/channels`,b,{name:'delegated',type:'text'})).status,201);
  assert.equal((await request('PUT',`/api/servers/${server.id}/roles/${role.id}`,b,{name:'Escalated',permissions:{administrator:true}})).status,403);
  const junior=(await request('POST',`/api/servers/${server.id}/roles`,b,{name:'Junior'})).data;
  assert.equal((await request('PUT',`/api/servers/${server.id}/order`,b,{kind:'roles',ids:[junior.id]})).status,204,'delegated manager can reorder a lower role subset');
  assert.equal((await request('PUT',`/api/servers/${server.id}/order`,b,{kind:'roles',ids:[junior.id,role.id]})).status,403,'own and higher roles remain protected');
  const category=(await request('POST',`/api/servers/${server.id}/categories`,a,{name:'Private'})).data;
  assert.equal((await request('PATCH',`/api/servers/${server.id}/channels/${text.id}`,a,{category_id:category.id,permission_sync:1})).status,200);
  assert.equal((await request('PUT',`/api/servers/${server.id}/overrides`,a,{scopeKind:'category',scopeId:category.id,roleId:`everyone:${server.id}`,decisions:{administrator:1}})).status,403,'server permissions cannot be edited as channel overrides');
  assert.equal((await request('PUT',`/api/servers/${server.id}/overrides`,a,{scopeKind:'category',scopeId:category.id,roleId:`everyone:${server.id}`,decisions:{viewChannel:0}})).status,204);
  assert.equal((await request('GET',`/api/channels/${text.id}/messages`,b)).status,403);
  assert.equal((await request('GET','/api/servers',b)).data.find(s=>s.id===server.id).channels.some(c=>c.id===text.id),false);
  assert.equal((await request('PUT',`/api/servers/${server.id}/overrides`,a,{scopeKind:'category',scopeId:category.id,roleId:role.id,decisions:{viewChannel:1}})).status,204);
  assert.equal((await request('GET',`/api/channels/${text.id}/messages`,b)).status,200);
  const socket=io(base,{auth:{token:a.token},transports:['websocket'],autoConnect:false});sockets.push(socket);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});
  const sent=await socket.timeout(5000).emitWithAck('send_message',{channelId:text.id,content:'Persistent searchable message',senderId:c.user.id});assert.equal(sent.ok,true);
  assert.equal((await request('POST',`/api/conversation/channels/${text.id}/messages/${sent.id}/reactions`,b,{emoji:'👍'})).status,204);
  assert.equal((await request('PUT',`/api/conversation/channels/${text.id}/messages/${sent.id}/pin`,a,{pinned:true})).status,204);
  const annotations=(await request('GET',`/api/conversation/channels/${text.id}/annotations`,b)).data;assert.equal(annotations.pins.length,1);assert.equal(annotations.reactions[0].user_id,b.user.id);
  assert.equal((await request('GET',`/api/conversation/channels/${text.id}/annotations`,c)).status,403);
  const poll=(await request('POST',`/api/conversation/channels/${text.id}/polls`,b,{question:'When?',options:['Today','Tomorrow']})).data;assert.equal((await request('PUT',`/api/polls/${poll.id}/vote`,c,{option:0})).status,403);assert.equal((await request('PUT',`/api/polls/${poll.id}/vote`,b,{option:0})).status,204);
  const thread=(await request('POST',`/api/channels/${text.id}/threads`,b,{name:'Discussion',messageId:sent.id})).data;assert.ok(thread.id);assert.equal((await request('POST',`/api/threads/${thread.id}/messages`,c,{content:'intrusion'})).status,403);assert.equal((await request('POST',`/api/threads/${thread.id}/messages`,b,{content:'Thread text'})).status,201);assert.equal((await request('PUT',`/api/threads/${thread.id}`,b,{archived:true})).status,204);assert.equal((await request('POST',`/api/threads/${thread.id}/messages`,b,{content:'archived'})).status,409);
  assert.equal((await request('DELETE',`/api/channels/${text.id}/messages/${sent.id}`,b)).status,200,'delegated moderator can soft-delete messages');
  await request('POST','/api/friends/requests',a,{handle:b.user.handle});await request('PUT',`/api/friends/${a.user.id}/accept`,b);
  const direct=(await request('POST','/api/dms',a,{userId:b.user.id})).data,call=(await request('POST',`/api/dms/${direct.id}/calls`,a,{video:false})).data;assert.ok(call.id);
  const peer=io(base,{auth:{token:b.token},transports:['websocket'],autoConnect:false});sockets.push(peer);await new Promise((resolve,reject)=>{peer.once('connect',resolve);peer.once('connect_error',reject);peer.connect();});
  assert.ok((await peer.timeout(5000).emitWithAck('join_voice_channel',{channelId:call.channel.id})).error,'recipient cannot join before consent');
  assert.equal((await request('POST',`/api/calls/${call.id}/respond`,c,{action:'accept'})).status,409);
  assert.equal((await request('POST',`/api/calls/${call.id}/respond`,b,{action:'accept'})).status,200);assert.equal((await peer.timeout(5000).emitWithAck('join_voice_channel',{channelId:call.channel.id})).ok,true);
  assert.equal((await socket.timeout(5000).emitWithAck('join_voice_channel',{channelId:call.channel.id})).ok,true);
  assert.equal((await request('POST',`/api/calls/${call.id}/end`,a,{})).status,204);assert.equal((await request('GET',`/api/dms/${direct.id}/calls`,b)).data[0].state,'ended');
  const group=(await request('POST','/api/dms/groups',a,{name:'Friends group',userIds:[b.user.id]})).data;assert.ok(group.id);assert.equal((await request('GET',`/api/dms/${group.id}/messages`,c)).status,403);
  const dmAck=await socket.timeout(5000).emitWithAck('dm_send',{conversationId:group.id,content:'Group message',senderId:c.user.id});assert.equal(dmAck.ok,true);assert.equal((await request('GET',`/api/dms/${group.id}/messages`,b)).data[0].sender.id,a.user.id);
  assert.ok((await request('GET','/api/search?q=Group%20message',b)).data.some(r=>r.type==='message' && r.contextId===group.id),'global search includes authorized groups');
  assert.equal((await request('GET','/api/search?q=Group%20message',c)).data.some(r=>r.contextId===group.id),false,'global search omits private groups');
  assert.equal((await request('PUT','/api/profile/details',b,{pronouns:'they/them',connections:[{name:'Site',url:'https://example.com'}]})).status,200);
  await request('PUT','/api/profile/details',b,{activity:'fixture game'});const profile=(await request('GET',`/api/users/${b.user.id}/profile`,b)).data;assert.equal(profile.pronouns,'they/them');assert.equal(profile.connections.length,1,'activity-only update preserves profile fields');
  assert.equal((await request('PUT','/api/profile/details',b,{statusExpires:'invalid'})).status,400);
  assert.equal((await request('PUT',`/api/servers/${server.id}/profile`,b,{displayName:'Local profile',bio:'Local bio'})).status,200);assert.equal((await request('GET',`/api/servers/${server.id}/members`,a)).data.find(u=>u.id===b.user.id).username,'Local profile');
  const policy=(await request('GET','/api/settings',c)).data;await request('PUT','/api/settings',c,{...policy,dmPolicy:'none',callPolicy:'everyone'});
  const independent=(await request('POST',`/api/users/${c.user.id}/call-conversation`,a,{})).data;assert.ok(independent.id);assert.ok((await socket.timeout(5000).emitWithAck('dm_send',{conversationId:independent.id,content:'DM policy cannot be bypassed with a call'})).error);
  const independentCall=(await request('POST',`/api/dms/${independent.id}/calls`,a,{})).data;assert.ok(independentCall.id,'call policy is independent of DM policy');assert.equal((await request('POST',`/api/calls/${independentCall.id}/respond`,c,{action:'accept'})).status,200);await request('POST',`/api/calls/${independentCall.id}/end`,a,{});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'private.png');const upload=await fetch(base+'/api/upload',{method:'POST',headers:{Authorization:`Bearer ${c.token}`},body:form}).then(r=>r.json());const asset=(await request('POST','/api/assets',c,{kind:'emoji',name:'private',url:upload.url})).data;assert.ok(asset.id);
  t.after(()=>{const filename=upload.url?.match(/^\/uploads\/([\w.-]+)$/)?.[1];if(filename)try{fs.unlinkSync(path.resolve('server/uploads',filename));}catch{}});
  assert.equal((await request('GET',`/api/assets/${asset.id}`,a)).status,403);assert.ok((await socket.timeout(5000).emitWithAck('send_message',{channelId:text.id,content:`<:private:${asset.id}>`})).error,'private emoji reference cannot authorize itself');
  const plain=await socket.timeout(5000).emitWithAck('send_message',{channelId:text.id,content:`Untrusted asset identifier ${asset.id}`});assert.equal(plain.ok,true);assert.equal((await request('GET',`/api/assets/${asset.id}`,a)).status,403,'bare identifier in a message is not asset authorization');
  assert.equal((await request('POST',`/api/threads/${thread.id}/messages`,a,{content:`<:private:${asset.id}>`})).status,409,'archived threads still reject writes');await request('PUT',`/api/threads/${thread.id}`,b,{archived:false});assert.equal((await request('POST',`/api/threads/${thread.id}/messages`,a,{content:`<:private:${asset.id}>`})).status,403,'thread writes also enforce asset scope');
  assert.equal((await request('POST',`/api/conversation/channels/${text.id}/messages/${plain.id}/reactions`,a,{emoji:`asset:${asset.id}`})).status,403,'custom reactions enforce source asset scope');
  await request('PUT',`/api/conversation/channels/${text.id}/unread`,b,{unread:true});assert.ok((await request('GET','/api/notifications/unread',b)).data.find(r=>r.channelId===text.id).unread>0);await request('PUT',`/api/conversation/channels/${text.id}/unread`,b,{unread:false});assert.equal((await request('GET','/api/notifications/unread',b)).data.find(r=>r.channelId===text.id).unread,0);
  assert.equal((await request('DELETE',`/api/dms/${group.id}/members/${b.user.id}`,a)).status,204);assert.equal((await request('GET',`/api/dms/${group.id}/messages`,b)).status,403);
  assert.equal((await request('POST',`/api/servers/${server.id}/members/${b.user.id}/ban`,a,{reason:'Fixture'})).status,204);assert.equal((await request('POST',`/api/invites/${invite.code}/join`,b,{})).status,403);assert.equal((await request('DELETE',`/api/servers/${server.id}/bans/${b.user.id}`,a)).status,204);
  const database=new Database(sqlite,{readonly:true});assert.equal(database.prepare('SELECT content FROM messages WHERE id=?').get(sent.id).content,'Persistent searchable message');assert.ok(database.prepare('SELECT count(*) AS n FROM audit_entries WHERE server_id=?').get(server.id).n>=6);database.close();
});

test('account email verification, one-use recovery, session revocation and TOTP login',{timeout:30000},async t=>{
  const outbox=[],connections=new Set(),smtp=net.createServer(socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));socket.write('220 localhost\r\n');let pending='',data=false,message='';socket.on('data',chunk=>{pending+=chunk.toString();while(pending.includes('\r\n')){const index=pending.indexOf('\r\n'),line=pending.slice(0,index);pending=pending.slice(index+2);if(data){if(line==='.'){outbox.push(message);message='';data=false;socket.write('250 OK\r\n');}else message+=line+'\n';}else if(/^EHLO|HELO/i.test(line))socket.write('250 localhost\r\n');else if(/^DATA/i.test(line)){data=true;socket.write('354 send\r\n');}else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');}else socket.write('250 OK\r\n');}});});await new Promise(r=>smtp.listen(0,'127.0.0.1',r));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-account-')),port=20100+Math.floor(Math.random()*400),base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['server/src/server.js'],{env:{...process.env,NODE_ENV:'test',SQLITE_PATH:path.join(temp,'db'),DATABASE_URL:'',HOST:'127.0.0.1',PORT:String(port),SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),MAIL_FROM:'test@localhost'},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);t.after(()=>{child.kill();for(const s of connections)s.destroy();smtp.close();});
  async function request(method,url,token,body){const r=await fetch(base+url,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await r.json();}catch{}return {status:r.status,data};}
  for(let i=0;i<100;i++){try{if((await request('GET','/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,50));if(i===99)throw Error(logs);}
  const password='Account-test-password-123',account=(await request('POST','/api/auth/register',null,{handle:'account',password})).data,other=(await request('POST','/api/auth/login',null,{handle:'account',password})).data;
  assert.equal((await request('GET','/api/account/sessions',account.token)).data.length,2);assert.equal((await request('DELETE','/api/account/other-sessions',account.token)).status,204);assert.equal((await request('GET','/api/auth/me',other.token)).status,401);
  assert.equal((await request('PUT','/api/account/email',account.token,{password,email:'account@example.test'})).status,200);
  const token=outbox.at(-1).match(/[A-Za-z0-9_-]{43}/)?.[0];assert.ok(token,outbox.at(-1));assert.equal((await request('POST','/api/account/verify-email',null,{token})).status,204);assert.equal((await request('POST','/api/account/verify-email',null,{token})).status,400);
  assert.equal((await request('POST','/api/account/recovery',null,{email:'account@example.test'})).status,200);const reset=outbox.at(-1).match(/[A-Za-z0-9_-]{43}/)?.[0],newPassword='Account-new-password-456';assert.equal((await request('POST','/api/account/reset-password',null,{token:reset,newPassword})).status,204);assert.equal((await request('GET','/api/auth/me',account.token)).status,401);assert.equal((await request('POST','/api/account/reset-password',null,{token:reset,newPassword})).status,400);
  const updated=(await request('POST','/api/auth/login',null,{handle:'account',password:newPassword})).data;
  const setup=(await request('POST','/api/account/two-factor/setup',updated.token,{password:newPassword})).data;assert.ok(setup.secret);const enabled=await request('POST','/api/account/two-factor/enable',updated.token,{code:totp(setup.secret)});assert.equal(enabled.status,200);assert.equal(enabled.data.recoveryCodes.length,10);
  assert.equal((await request('POST','/api/auth/login',null,{handle:'account',password:newPassword})).status,401);const login=await request('POST','/api/auth/login',null,{handle:'account',password:newPassword,code:enabled.data.recoveryCodes[0]});assert.equal(login.status,200);assert.equal((await request('POST','/api/auth/login',null,{handle:'account',password:newPassword,code:enabled.data.recoveryCodes[0]})).status,401);
});
