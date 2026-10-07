import crypto from 'node:crypto';
// Additive only: historic users, messages and memberships remain intact.
export async function communityMigration(db) {
  const columns = {
    users: { pronouns: "TEXT DEFAULT ''", status_emoji: "TEXT DEFAULT ''", status_expires: 'TEXT', activity: "TEXT DEFAULT ''", account_state: "TEXT NOT NULL DEFAULT 'active'", connections: "TEXT NOT NULL DEFAULT '[]'" },
    auth_accounts: { email: 'TEXT', email_verified: 'INTEGER NOT NULL DEFAULT 0', totp_secret: 'TEXT', totp_pending: 'TEXT', totp_last_step: 'BIGINT', recovery_hash: 'TEXT' },
    auth_sessions: { id: 'TEXT', created_at: 'TEXT', device: "TEXT DEFAULT ''", last_seen: 'TEXT' },
    servers: { deleted_at: 'TEXT' },
    channels: { category_id: 'TEXT', position: 'INTEGER NOT NULL DEFAULT 0', deleted_at: 'TEXT', slowmode: 'INTEGER NOT NULL DEFAULT 0', user_limit: 'INTEGER NOT NULL DEFAULT 0', permission_sync: 'INTEGER NOT NULL DEFAULT 1', nsfw: 'INTEGER NOT NULL DEFAULT 0' },
    server_members: { nickname: "TEXT DEFAULT ''", timeout_until: 'TEXT', voice_muted:'INTEGER NOT NULL DEFAULT 0', voice_deafened:'INTEGER NOT NULL DEFAULT 0' },
    roles: { hoist: 'INTEGER NOT NULL DEFAULT 0', is_default: 'INTEGER NOT NULL DEFAULT 0' },
    dm_conversations: { kind: "TEXT NOT NULL DEFAULT 'direct'", name: "TEXT DEFAULT ''", icon: "TEXT DEFAULT ''", owner_id: 'TEXT' },
    dm_messages: { attachment: 'TEXT', metadata: "TEXT NOT NULL DEFAULT '{}'" },
    messages: { metadata: "TEXT NOT NULL DEFAULT '{}'" },
    upload_records: { conversation_id: 'TEXT', feature_id: 'TEXT' },
  };
  for (const [table, fields] of Object.entries(columns)) for (const [field, type] of Object.entries(fields)) await db.query(`ALTER TABLE ${table} ADD COLUMN ${field} ${type}`);
  const tables = [
    'user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL)',
    'server_profiles (server_id TEXT NOT NULL REFERENCES servers(id), user_id TEXT NOT NULL REFERENCES users(id), value TEXT NOT NULL, PRIMARY KEY(server_id,user_id))',
    'account_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL, value TEXT, expires_ms BIGINT NOT NULL)',
    'categories (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id), name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, deleted_at TEXT)',
    'member_roles (server_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES roles(id), PRIMARY KEY(server_id,user_id,role_id))',
    "permission_overrides (scope_kind TEXT NOT NULL, scope_id TEXT NOT NULL, role_id TEXT NOT NULL, permission TEXT NOT NULL, decision INTEGER NOT NULL, PRIMARY KEY(scope_kind,scope_id,role_id,permission))",
    'server_bans (server_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(server_id,user_id))',
    'audit_entries (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL)',
    'dm_participants (conversation_id TEXT NOT NULL REFERENCES dm_conversations(id), user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(conversation_id,user_id))',
    'dm_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, owner_id TEXT REFERENCES users(id))',
    'group_members (conversation_id TEXT NOT NULL REFERENCES dm_groups(id), user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(conversation_id,user_id))',
    "group_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES dm_groups(id), sender_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, attachment TEXT, metadata TEXT NOT NULL DEFAULT '{}', timestamp TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, reply_to TEXT, invite_code TEXT)",
    'message_reactions (kind TEXT NOT NULL, message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(kind,message_id,user_id,emoji))',
    'message_pins (kind TEXT NOT NULL, context_id TEXT NOT NULL, message_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(kind,message_id))',
    'conversation_reads (kind TEXT NOT NULL, context_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL, manual_unread INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,context_id,user_id))',
    'threads (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id), message_id TEXT, name TEXT NOT NULL, owner_id TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, slowmode INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL)',
    'thread_members (thread_id TEXT NOT NULL REFERENCES threads(id), user_id TEXT NOT NULL, PRIMARY KEY(thread_id,user_id))',
    'thread_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id), sender_id TEXT NOT NULL, content TEXT NOT NULL, attachment TEXT, timestamp TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, reply_to TEXT)',
    'server_assets (id TEXT PRIMARY KEY, server_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT)',
    'scheduled_events (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT, name TEXT NOT NULL, description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT, creator_id TEXT NOT NULL, deleted_at TEXT)',
    'event_interests (event_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(event_id,user_id))',
    'polls (id TEXT PRIMARY KEY, kind TEXT NOT NULL, context_id TEXT NOT NULL, message_id TEXT, question TEXT NOT NULL, options TEXT NOT NULL, owner_id TEXT NOT NULL, closes_at TEXT)',
    'poll_votes (poll_id TEXT NOT NULL, user_id TEXT NOT NULL, option_index INTEGER NOT NULL, PRIMARY KEY(poll_id,user_id))',
    'call_records (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, initiator_id TEXT NOT NULL, state TEXT NOT NULL, started_at TEXT NOT NULL, answered_at TEXT, ended_at TEXT)',
    'call_attendees (call_id TEXT NOT NULL REFERENCES call_records(id), user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL, PRIMARY KEY(call_id,user_id))',
  ];
  for (const table of tables) await db.query(`CREATE TABLE ${table}`);
  await db.query('CREATE UNIQUE INDEX auth_sessions_id ON auth_sessions(id)');
  await db.query('CREATE UNIQUE INDEX auth_accounts_email ON auth_accounts(email)');
  await db.query('CREATE INDEX audit_server_time ON audit_entries(server_id,created_at)');
  await db.query('CREATE INDEX thread_channel ON threads(channel_id)');
  for(const s of await db.query('SELECT token_hash FROM auth_sessions'))await db.query('UPDATE auth_sessions SET id=$1,created_at=$2,last_seen=$2 WHERE token_hash=$3',[crypto.randomUUID(),new Date().toISOString(),s.token_hash]);
  await db.query('INSERT INTO member_roles(server_id,user_id,role_id) SELECT server_id,user_id,role_id FROM server_members WHERE role_id IS NOT NULL ON CONFLICT DO NOTHING');
  for (const row of await db.query('SELECT id,user_low,user_high FROM dm_conversations')) for (const user of [row.user_low,row.user_high]) await db.query('INSERT INTO dm_participants(conversation_id,user_id,state,joined_at) VALUES($1,$2,$3,$4)',[row.id,user,'accepted',new Date().toISOString()]);
  for (const row of await db.query('SELECT id FROM servers')) await db.query('INSERT INTO roles(id,server_id,name,position,permissions,is_default) VALUES($1,$2,$3,$4,$5,1)',[`everyone:${row.id}`,row.id,'@everyone',0,JSON.stringify({viewChannel:true,sendMessages:true,readHistory:true,attachFiles:true,embedLinks:true,addReactions:true,useGifs:true,useExternalEmoji:true,mentionUsers:true,useCommands:true,createThreads:true,connect:true,speak:true,video:true,stream:true,createInvite:true,useSoundboard:true,changeNickname:true})]);
}
