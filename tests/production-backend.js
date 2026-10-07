// Explicitly authorized deployment check. Credentials live only in this process.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import readline from 'node:readline';
import {createRequire} from 'node:module';
const {io}=createRequire(new URL('../client/package.json',import.meta.url))('socket.io-client');
const version=JSON.parse(await fs.readFile('package.json','utf8')).version,base='https://discordpessoal.onrender.com';
const password=crypto.randomBytes(32).toString('base64url'),handle='deploycheck_'+crypto.randomBytes(6).toString('hex');
let token,socket;
const report={version,url:base,passed:false,checkedAt:new Date().toISOString()};
async function request(method,route,body){const r=await fetch(base+route,{method,signal:AbortSignal.timeout(45000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});let data;try{data=await r.json();}catch{}return {status:r.status,data};}
try{
 const registration=await request('POST','/api/auth/register',{handle,password,username:`Verificação do deploy ${version}`,id:'forged-fixture-identity'});assert.equal(registration.status,201);token=registration.data.token;assert.notEqual(registration.data.user.id,'forged-fixture-identity');
 const before=await request('GET','/api/servers');assert.equal(before.status,200);const histories={};for(const s of before.data)for(const c of s.channels.filter(c=>c.type==='text')){const r=await request('GET',`/api/channels/${c.id}/messages`);if(r.status===200)histories[c.id]=r.data;}
 const backup=path.resolve(`artifacts/render-backup-${version}`);await fs.mkdir(backup,{recursive:true});await fs.writeFile(path.join(backup,'snapshot-before.json'),JSON.stringify({servers:before.data,histories},null,2));
 console.log('READY_FOR_DEPLOY: limited read-only API snapshot saved; verification credentials remain in memory.');
 const input=readline.createInterface({input:process.stdin});await new Promise(resolve=>input.once('line',resolve));input.close();
 const health=await request('GET','/api/health');assert.equal(health.status,200);assert.equal(health.data.database,'ok');report.health=health.data;
 const me=await request('GET','/api/auth/me');assert.equal(me.status,200);assert.equal(me.data.id,registration.data.user.id,'pre-upgrade session must survive additive migrations');
 assert.equal((await request('GET','/api/account/sessions')).status,200);assert.equal((await request('GET','/api/settings')).status,200);assert.equal((await request('GET',`/api/users/${me.data.id}/profile`)).status,200);
 const after=await request('GET','/api/servers');assert.equal(after.status,200);let channels=0,messages=0;for(const s of before.data){const current=after.data.find(x=>x.id===s.id);assert.ok(current);assert.equal(current.name,s.name);for(const c of s.channels){assert.ok(current.channels.some(x=>x.id===c.id && x.name===c.name));channels++;}assert.equal((await request('GET',`/api/servers/${s.id}/community`)).status,200);}
 for(const [channel,rows]of Object.entries(histories)){const r=await request('GET',`/api/channels/${channel}/messages`);assert.equal(r.status,200);for(const row of rows){const current=r.data.find(x=>x.id===row.id);assert.ok(current);assert.equal(current.content,row.content);assert.equal(current.sender.id,row.sender.id);messages++;}}
 const html=await fetch(base,{signal:AbortSignal.timeout(45000)}).then(r=>r.text()),expected=await fs.readFile('server/public/index.html','utf8');assert.equal(html,expected);
 for(const asset of [...html.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)].map(m=>m[1])){const r=await fetch(new URL(asset,base+'/'),{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);const actual=Buffer.from(await r.arrayBuffer()),local=await fs.readFile(path.resolve('server/public',asset));assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),crypto.createHash('sha256').update(local).digest('hex'));}
 socket=io(base,{auth:{token},transports:['websocket'],autoConnect:false,reconnection:false});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Production signaling timeout')),15000);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('connect_error',()=>{clearTimeout(timer);reject(Error('Production signaling rejected'));});socket.connect();});
 assert.equal((await fetch(base+'/api/account/sessions')).status,401);
 report.passed=true;report.checkedAt=new Date().toISOString();report.existingSessionRetained=true;report.newAccountAndCommunityApis=true;report.productionWebMatchesTestedBundle=true;report.authenticatedSignaling=true;report.preservedSnapshot={servers:before.data.length,channels,messages};report.fixture='One dedicated verification account; no voice joins, messages, servers, uploads or native input. Sessions revoked and test account disabled after verification. Credentials not persisted.';report.limitations=['API snapshot covers accessible servers and bounded message history, not a full database or uploads backup.','No external SMTP delivery, two physical PCs, UAC or external NAT/TURN exercised.'];
 console.log(JSON.stringify(report,null,2));
}finally{
 socket?.close();if(token){try{await request('POST','/api/account/disable',{password});}catch{}try{await request('POST','/api/auth/logout');}catch{}}
 await fs.writeFile(`docs/validation/render-live-${version}.json`,JSON.stringify(report,null,2));
}
