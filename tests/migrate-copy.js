import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../server/package.json',import.meta.url)),Database=require('better-sqlite3');
const source=new Database('data/discord.db',{readonly:true,fileMustExist:true});
const tables=['users','servers','channels','messages','server_members','roles'],before={};
for(const table of tables) {
  const columns=source.prepare(`PRAGMA table_info(${table})`).all().map(c=>'"'+c.name.replaceAll('"','""')+'"');
  before[table]={columns,rows:source.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all().map(JSON.stringify)};
}
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'meuapp-migration-copy-')),copy=path.join(folder,'snapshot.db');
await source.backup(copy);source.close();
process.env.DATABASE_URL='';process.env.SQLITE_PATH=copy;
const {db}=await import('../server/src/db.js');const {runMigrations}=await import('../server/src/migrations/index.js');
await runMigrations(db);
const report={passed:true,scope:'Migrations on a read-only backup of the existing database; original database unchanged',tables:{}};
for(const table of tables) {
  const copied=new Set((await db.query(`SELECT ${before[table].columns.join(',')} FROM ${table}`)).map(JSON.stringify));
  for(const row of before[table].rows)assert.ok(copied.has(row),`Legacy row changed in ${table}`);
  report.tables[table]={originalRows:before[table].rows.length,afterRows:copied.size,allOriginalRowsPreserved:true};
}
await runMigrations(db);await db.close();
await fs.writeFile('docs/validation/migration.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
