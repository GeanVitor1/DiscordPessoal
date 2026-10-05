import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('health retains HTTP 503 when the database becomes unavailable',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-health-')),port=15700+Math.floor(Math.random()*100);
  const child=spawn(process.execPath,['--input-type=module','-e',"await import('./server/src/application.js');const {db}=await import('./server/src/db.js');await db.close();"],{windowsHide:true,env:{...process.env,DATABASE_URL:'',SQLITE_PATH:path.join(folder,'test.db'),PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stderr.on('data',d=>logs+=d);t.after(()=>child.kill());
  let response;
  for(let i=0;i<100;i++){try{response=await fetch(`http://127.0.0.1:${port}/api/health`);break;}catch{}if(child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,50));}
  assert.equal(response.status,503);const body=await response.json();assert.equal(body.status,'degraded');assert.equal(body.database,'error');assert.equal(body.socket,'ok');assert.equal('connectionString' in body,false);
});
