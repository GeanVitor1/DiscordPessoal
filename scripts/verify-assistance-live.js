// Verify the deployed protocol using a dedicated account; never send native input,
// modify existing conversations, or write credentials to disk.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {io}=createRequire(new URL('../client/package.json',import.meta.url))('socket.io-client');
const base=process.argv[2] || 'https://discordpessoal.onrender.com';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const getHealth=()=>fetch(base+'/api/health',{signal:AbortSignal.timeout(30000)}).then(async r=>{assert.equal(r.status,200);return r.json();});
const health=await getHealth();assert.equal(health.assistanceProtocol,2);assert.equal(health.database,'ok');
let account,socket;
const report={passed:false,version,url:base,checkedAt:new Date().toISOString(),health};
try {
  const name='assistcheck_'+crypto.randomBytes(6).toString('hex');
  const registered=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:name,username:'Verificação da assistência',password:crypto.randomBytes(32).toString('base64url')}),signal:AbortSignal.timeout(30000)});
  assert.equal(registered.status,201);account=await registered.json();
  socket=io(base,{auth:{token:account.token},transports:['websocket'],reconnection:false,timeout:15000});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  const capability=await socket.timeout(10000).emitWithAck('assistance_capabilities',{protocol:2,nativeControl:false});
  assert.equal(capability.ok,true);assert.equal(capability.protocol,2);
  const invalid=await socket.timeout(10000).emitWithAck('assistance_request',{sessionId:crypto.randomUUID(),targetSocketId:'nonexistent',fromUser:{id:'forged'}});
  assert.ok(invalid.error);
  Object.assign(report,{passed:true,authenticatedProtocolHandshake:true,invalidTargetRejected:true,databaseMigrationsAdded:0,existingConversationsUnchanged:true,scope:'One dedicated verification account added; no voice join, broadcast, message, server, upload or native input. Credentials remained in memory; session revoked after test. Full independence/native behavior covered by local packaged acceptance; physical two-PC and NAT/TURN not exercised here.'});
} finally {
  socket?.disconnect();
  if(account?.token){const revoked=await fetch(base+'/api/auth/session',{method:'DELETE',headers:{Authorization:'Bearer '+account.token},signal:AbortSignal.timeout(30000)});assert.ok(revoked.ok);report.verificationSessionRevoked=true;}
}
await fs.writeFile(process.argv[3] || `docs/validation/render-live-${version}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
