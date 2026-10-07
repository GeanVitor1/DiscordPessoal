import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url)),Database=require('better-sqlite3');
test('pre-registry legacy SQLite schema gains authentication without dropping rows or assigning an owner',async()=>{
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'meuapp-legacy-')),'legacy.db'),legacy=new Database(file);
  legacy.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL,discriminator INTEGER NOT NULL,avatar TEXT,banner TEXT,banner_color TEXT DEFAULT '#5865F2',bio TEXT DEFAULT '',status TEXT DEFAULT 'online',custom_status TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE servers(id TEXT PRIMARY KEY,name TEXT NOT NULL,icon TEXT,banner TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE channels(id TEXT PRIMARY KEY,server_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,topic TEXT DEFAULT '');
    CREATE TABLE messages(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,sender_id TEXT NOT NULL,content TEXT,attachment TEXT,timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,username,discriminator) VALUES('legacy-user','Legacy',1234);
    INSERT INTO servers(id,name) VALUES('legacy-server','Legacy server');
    INSERT INTO channels(id,server_id,name,type) VALUES('legacy-channel','legacy-server','geral','text');
    INSERT INTO messages(id,channel_id,sender_id,content) VALUES('legacy-message','legacy-channel','legacy-user','Mensagem original preservada');
  `);legacy.close();
  process.env.DATABASE_URL='';process.env.SQLITE_PATH=file;
  const {db}=await import('../server/src/db.js');const {runMigrations}=await import('../server/src/migrations/index.js');
  try {
    await runMigrations(db);await runMigrations(db);
    assert.equal((await db.queryOne('SELECT content FROM messages WHERE id=$1',['legacy-message'])).content,'Mensagem original preservada');
    const server=await db.queryOne('SELECT * FROM servers WHERE id=$1',['legacy-server']);assert.equal(server.owner_id,null);assert.equal(server.is_public,0);assert.equal(server.name,'Legacy server');
    assert.equal(Number((await db.queryOne('SELECT count(*) AS n FROM users')).n),1);
    assert.equal(Number((await db.queryOne('SELECT count(*) AS n FROM schema_migrations')).n),8);
    assert.equal(Number((await db.queryOne('SELECT count(*) AS n FROM auth_accounts')).n),0,'legacy IDs do not silently acquire credentials');
  }finally{await db.close();}
});
