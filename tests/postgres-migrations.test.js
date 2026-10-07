import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(new URL('../server/package.json',import.meta.url))('@electric-sql/pglite');
test('PostgreSQL migrations preserve pre-upgrade rows and rerun without changing them',{timeout:30000},async()=>{
 process.env.SQLITE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-pg-migration-')),'unused.db');delete process.env.DATABASE_URL;
 const {migrations,runMigrations}=await import('../server/src/migrations/index.js'),{default:unused}=await import('../server/src/db.js'),pg=new PGlite();
 const adapter=client=>({isPostgres:true,query:async(sql,values=[])=>(await client.query(sql,values)).rows,queryOne:async(sql,values=[])=>(await client.query(sql,values)).rows[0] || null,transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}),db=adapter(pg);
 try{await db.query('CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)');for(const m of migrations.filter(m=>m.id<=6))await db.transaction(async tx=>{await m.up(tx);await tx.query('INSERT INTO schema_migrations(id,name) VALUES($1,$2)',[m.id,m.name]);});
  await db.query("INSERT INTO users(id,username,discriminator) VALUES('pg-fixture','Preserved profile',9999)");await db.query("INSERT INTO messages(id,channel_id,sender_id,content) VALUES('pg-fixture-message','c-geral','pg-fixture','Preserved history')");
  const before=await db.queryOne("SELECT * FROM messages WHERE id='pg-fixture-message'");await runMigrations(db);assert.equal((await db.queryOne("SELECT * FROM messages WHERE id='pg-fixture-message'")).content,before.content);assert.equal((await db.queryOne("SELECT * FROM users WHERE id='pg-fixture'")).username,'Preserved profile');assert.equal(Number((await db.queryOne('SELECT count(*) AS n FROM schema_migrations')).n),8);
  assert.ok(await db.queryOne("SELECT id FROM roles WHERE server_id='general-hub' AND is_default=1"));await runMigrations(db);assert.equal(Number((await db.queryOne('SELECT count(*) AS n FROM schema_migrations')).n),8);assert.equal(Number((await db.queryOne("SELECT count(*) AS n FROM messages WHERE id='pg-fixture-message'")).n),1);
 }finally{await pg.close();await unused.close();}
});
