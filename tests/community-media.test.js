import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {io}=createRequire(new URL('../client/package.json',import.meta.url))('socket.io-client');

test('soundboard grants audio only to current voice participants and event reminders reach interested members',{timeout:45000},async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-community-media-')),port=21300+Math.floor(Math.random()*400),base=`http://127.0.0.1:${port}`,sockets=[];
 const child=spawn(process.execPath,['server/src/server.js'],{windowsHide:true,env:{...process.env,DATABASE_URL:'',SQLITE_PATH:path.join(temp,'db'),HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});let logs='',uploaded;
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 t.after(async()=>{sockets.forEach(s=>s.close());child.kill();if(uploaded)await fs.unlink(path.resolve('server/uploads',uploaded));});
 const request=async(method,url,account,body)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await r.json();}catch{}return {status:r.status,data};};
 for(let i=0;i<100;i++){try{if((await request('GET','/api/health')).status===200)break;}catch{}if(child.exitCode!==null || i===99)throw Error(logs);await new Promise(r=>setTimeout(r,50));}
 const a=(await request('POST','/api/auth/register',null,{handle:'mediaowner',password:'Media-test-password-123'})).data,b=(await request('POST','/api/auth/register',null,{handle:'mediapeer',password:'Media-test-password-123'})).data,c=(await request('POST','/api/auth/register',null,{handle:'outsider',password:'Media-test-password-123'})).data;
 const server=(await request('POST','/api/servers',a,{name:'Media fixture'})).data,voice=server.channels.find(c=>c.type==='voice');
 const invite=(await request('POST',`/api/servers/${server.id}/invites`,a,{maxUses:1,expiresIn:3600})).data;assert.equal((await request('POST',`/api/invites/${invite.code}/join`,b,{})).status,200);
 async function connect(account){const s=io(base,{auth:{token:account.token},transports:['websocket'],autoConnect:false});sockets.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);s.connect();});return s;}
 const sa=await connect(a),sb=await connect(b);for(const s of [sa,sb])assert.equal((await s.timeout(5000).emitWithAck('join_voice_channel',{channelId:voice.id})).ok,true);
 const wav=Buffer.alloc(46);wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
 const form=new FormData();form.append('file',new Blob([wav],{type:'audio/wav'}),'fixture.wav');const upload=await fetch(base+'/api/upload',{method:'POST',headers:{Authorization:'Bearer '+a.token},body:form});assert.equal(upload.status,200);const {url}=await upload.json();uploaded=url.match(/^\/uploads\/([\w.-]+)$/)?.[1];assert.ok(uploaded);
 const asset=await request('POST','/api/assets',a,{kind:'sound',name:'Silent fixture',serverId:server.id,url});assert.equal(asset.status,201);
 assert.equal((await request('POST','/api/soundboard/play',c,{socketId:sa.id,assetId:asset.data.id})).status,403,'a forged socket cannot play audio');
 const playEvent=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No soundboard broadcast')),5000);sb.once('soundboard_play',data=>{clearTimeout(timer);resolve(data);});});
 assert.equal((await request('POST','/api/soundboard/play',a,{socketId:sa.id,assetId:asset.data.id})).status,200);const play=await playEvent;
 assert.equal((await fetch(base+play.url,{headers:{Authorization:'Bearer '+b.token}})).status,200);assert.equal((await fetch(base+play.url,{headers:{Authorization:'Bearer '+c.token}})).status,403);
 assert.equal((await request('POST','/api/soundboard/play',a,{socketId:sa.id,assetId:asset.data.id})).status,429,'repeated playback is rate limited');
 sb.emit('leave_voice_channel',{channelId:voice.id});let afterLeave;for(let i=0;i<50;i++){afterLeave=await fetch(base+play.url,{headers:{Authorization:'Bearer '+b.token}});if(afterLeave.status===403)break;await new Promise(r=>setTimeout(r,20));}assert.equal(afterLeave.status,403,'leaving voice removes playback access');
 const event=await request('POST',`/api/servers/${server.id}/events`,a,{name:'Scheduled fixture',startsAt:new Date(Date.now()+120000).toISOString(),channelId:voice.id});assert.equal(event.status,201);assert.equal((await request('PUT',`/api/events/${event.data.id}/interest`,b,{interested:true})).status,204);assert.equal((await request('PUT',`/api/events/${event.data.id}/interest`,c,{interested:true})).status,403);
 const reminder=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No scheduled reminder')),35000);sb.once('event_reminder',data=>{clearTimeout(timer);resolve(data);});});assert.equal(reminder.id,event.data.id);assert.equal(reminder.channelId,voice.id);
 assert.equal((await request('DELETE',`/api/events/${event.data.id}`,a)).status,204);assert.equal((await request('GET',`/api/servers/${server.id}/events`,b)).data.length,0);
});
