import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const bundle=path.resolve(process.argv[2] || `artifacts/server-${version}`);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-hosted-'));
const base='http://127.0.0.1:15635',database=path.join(temp,'test.db');
const child=spawn(process.execPath,['src/server.js'],{cwd:bundle,windowsHide:true,env:{...process.env,NODE_ENV:'production',DATABASE_URL:'',SQLITE_PATH:database,HOST:'127.0.0.1',PORT:'15635',SMTP_HOST:'',MAIL_FROM:''},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(child.exitCode!==null || i===99)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 const homepage=await fetch(base);assert.equal(homepage.status,200);const html=await homepage.text();assert.match(html,/id="root"/);
 const asset=html.match(/src="([^"]+\.js)"/)?.[1];assert.ok(asset);const script=await fetch(new URL(asset,base+'/'));assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
 assert.equal((await fetch(base+'/api/account/sessions')).status,401);
 const account=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'hostedfixture',password:'Hosted-fixture-123'})});assert.equal(account.status,201);const {token}=await account.json(),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const session=await fetch(base+'/api/account/sessions',{headers});assert.equal(session.status,200);assert.equal((await session.json()).length,1);
 const community=await fetch(base+'/api/servers',{headers});assert.equal(community.status,200);
 const email=await fetch(base+'/api/account/email',{method:'PUT',headers,body:JSON.stringify({password:'Hosted-fixture-123',email:'fixture@example.test'})});assert.equal(email.status,503,'unconfigured email is not reported as sent');
 const Database=createRequire(path.join(bundle,'package.json'))('better-sqlite3'),db=new Database(database,{readonly:true});const migrations=db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;assert.equal(migrations,8);db.close();
 const report={passed:true,version,checkedAt:new Date().toISOString(),productionBundle:bundle,webAndApiSameOrigin:true,compiledFrontendServed:true,authenticatedSessions:true,unconfiguredSmtpExplicitlyUnavailable:true,migrations,scope:'Prepared production bundle with installed runtime dependencies and an isolated SQLite database. PostgreSQL migrations separately exercised in PGlite; no Render deployment, real SMTP delivery or remote TLS database tested.'};
 await fs.writeFile('docs/validation/hosted-backend-1.1.0.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{child.kill();}
