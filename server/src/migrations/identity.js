export async function identityMigration(db) {
  // Early SQLite versions created servers before the migration registry existed.
  // CREATE TABLE IF NOT EXISTS never added these later columns. Repair only the
  // missing columns; ownership remains NULL until administrative recovery.
  const existingColumns = db.isPostgres
    ? (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='servers'")).map(c=>c.column_name)
    : (await db.query('PRAGMA table_info(servers)')).map(c=>c.name);
  for (const [name,type] of [['owner_id','TEXT'],['description',"TEXT DEFAULT ''"],['updated_at','TIMESTAMP']])
    if (!existingColumns.includes(name)) await db.query(`ALTER TABLE servers ADD COLUMN ${name} ${type}`);
  const statements = [
    `CREATE TABLE auth_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), login_name TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL)`,
    `CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_ms BIGINT NOT NULL)`,
    `CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id)`,
    `CREATE TABLE friendships (user_low TEXT NOT NULL REFERENCES users(id), user_high TEXT NOT NULL REFERENCES users(id), requested_by TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('pending','accepted')), PRIMARY KEY(user_low,user_high))`,
    `CREATE TABLE user_blocks (user_id TEXT NOT NULL REFERENCES users(id), blocked_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,blocked_id))`,
    `CREATE TABLE dm_conversations (id TEXT PRIMARY KEY, user_low TEXT NOT NULL REFERENCES users(id), user_high TEXT NOT NULL REFERENCES users(id), UNIQUE(user_low,user_high))`,
    `CREATE TABLE dm_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES dm_conversations(id), sender_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX idx_dm_history ON dm_messages(conversation_id,timestamp,id)`,
    `CREATE TABLE dm_reads (conversation_id TEXT NOT NULL REFERENCES dm_conversations(id), user_id TEXT NOT NULL REFERENCES users(id), read_at TIMESTAMP NOT NULL, PRIMARY KEY(conversation_id,user_id))`,
    `CREATE TABLE upload_records (filename TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), channel_id TEXT REFERENCES channels(id), profile_user_id TEXT REFERENCES users(id))`,
    `ALTER TABLE servers ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`,
    `UPDATE servers SET is_public = 1 WHERE id = 'general-hub' AND owner_id = 'clyde-bot'`,
    `INSERT INTO server_members(server_id,user_id) SELECT id,owner_id FROM servers WHERE owner_id IN (SELECT id FROM users) ON CONFLICT(server_id,user_id) DO NOTHING`
  ];
  for (const sql of statements) await db.query(sql);
  // Preserve references to files already used by legacy messages/profiles.
  for (const m of await db.query('SELECT sender_id,channel_id,attachment FROM messages WHERE attachment IS NOT NULL')) {
    try {
      const file = JSON.parse(m.attachment)?.url?.match(/^\/uploads\/([\w.-]+)$/)?.[1];
      if (file && await db.queryOne('SELECT id FROM users WHERE id=$1', [m.sender_id]))
        await db.query('INSERT INTO upload_records(filename,owner_id,channel_id) VALUES($1,$2,$3) ON CONFLICT(filename) DO NOTHING', [file,m.sender_id,m.channel_id]);
    } catch { /* Legacy invalid attachment stays in the message history. */ }
  }
  for (const u of await db.query('SELECT id,avatar,banner FROM users')) {
    for (const url of [u.avatar,u.banner]) {
      const file = url?.match(/^\/uploads\/([\w.-]+)$/)?.[1];
      if (file) await db.query('INSERT INTO upload_records(filename,owner_id,profile_user_id) VALUES($1,$2,$2) ON CONFLICT(filename) DO NOTHING',[file,u.id]);
    }
  }
}
