// Run on the backend machine only. Filesystem/database access is the administrator authority.
import 'dotenv/config';
import crypto from 'node:crypto';
import db from '../src/db.js';
import {runMigrations} from '../src/migrations/index.js';
const [serverId,handle]=process.argv.slice(2);
if(!serverId || !handle)throw Error('Usage: node server/scripts/recover-ownership.js SERVER_ID ACCOUNT_HANDLE');
try {
  await runMigrations(db);
  await db.transaction(async tx=>{
    const server=await tx.queryOne('SELECT * FROM servers WHERE id=$1',[serverId]);
    const account=await tx.queryOne('SELECT user_id FROM auth_accounts WHERE login_name=$1',[handle.toLowerCase()]);
    if(!server || !account)throw Error('Existing server and registered account required');
    if(await tx.queryOne('SELECT user_id FROM auth_accounts WHERE user_id=$1',[server.owner_id]))throw Error('This server already has an authenticated owner; recovery is restricted to legacy owners');
    await tx.query('INSERT INTO ownership_recovery_audit(id,server_id,previous_owner,new_owner) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),serverId,server.owner_id,account.user_id]);
    await tx.query('UPDATE servers SET owner_id=$1 WHERE id=$2',[account.user_id,serverId]);
    await tx.query('INSERT INTO server_members(server_id,user_id) VALUES($1,$2) ON CONFLICT(server_id,user_id) DO NOTHING',[serverId,account.user_id]);
  });
  console.log('Legacy ownership recovered and audited. Reconnect the account.');
}finally{await db.close();}
