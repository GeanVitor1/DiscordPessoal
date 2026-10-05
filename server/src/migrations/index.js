import db from '../db.js';
import { identityMigration } from './identity.js';

export const migrations = [
  {
    id: 1,
    name: '001_initial_schema',
    up: async (database) => {
      // 1. users
      await database.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          discriminator INTEGER NOT NULL,
          avatar TEXT,
          banner TEXT DEFAULT '',
          banner_color TEXT DEFAULT '#5865F2',
          bio TEXT DEFAULT '',
          status TEXT DEFAULT 'online',
          custom_status TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. servers
      await database.query(`
        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT,
          banner TEXT DEFAULT '',
          owner_id TEXT,
          description TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. channels
      await database.query(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          topic TEXT DEFAULT '',
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
        );
      `);

      // 4. messages
      await database.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          content TEXT,
          attachment TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
        );
      `);

      // 5. roles
      await database.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          name TEXT NOT NULL,
          position INTEGER DEFAULT 0,
          permissions TEXT NOT NULL,
          color TEXT DEFAULT '#99aab5',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
        );
      `);

      // 6. server_members
      await database.query(`
        CREATE TABLE IF NOT EXISTS server_members (
          server_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role_id TEXT,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (server_id, user_id),
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE SET NULL
        );
      `);

      // 7. server_invites
      await database.query(`
        CREATE TABLE IF NOT EXISTS server_invites (
          code TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          max_uses INTEGER DEFAULT 0,
          uses INTEGER DEFAULT 0,
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
          FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Índices para alto desempenho de mensagens e canais
      await database.query(`CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, timestamp);`);
      await database.query(`CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);`);
      await database.query(`CREATE INDEX IF NOT EXISTS idx_members_server_user ON server_members(server_id, user_id);`);
    }
  },
  {
    id: 2,
    name: '002_seed_initial_hub',
    up: async (database) => {
      const existing = await database.queryOne(`SELECT count(*) as count FROM servers;`);
      const count = Number(existing?.count || 0);

      if (count === 0) {
        // Clyde Bot inicial
        await database.query(`
          INSERT INTO users (id, username, discriminator, avatar, status)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING;
        `, ['clyde-bot', 'Clyde Bot', 0, 'https://api.dicebear.com/7.x/bottts/svg?seed=Clyde', 'online']);

        // Comunidade inicial
        await database.query(`
          INSERT INTO servers (id, name, icon, owner_id, description)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING;
        `, ['general-hub', 'Comunidade Principal', '🚀', 'clyde-bot', 'Servidor inicial da comunidade']);

        // Canais
        await database.query(`
          INSERT INTO channels (id, server_id, name, type, topic) VALUES
          ($1, $2, $3, $4, $5),
          ($6, $7, $8, $9, $10),
          ($11, $12, $13, $14, $15),
          ($16, $17, $18, $19, $20);
        `, [
          'c-geral', 'general-hub', 'geral', 'text', 'Bate-papo geral da comunidade',
          'c-dev', 'general-hub', 'desenvolvimento', 'text', 'Discussão sobre código e tecnologia',
          'v-lounge', 'general-hub', 'Sala de Bate-Papo', 'voice', '',
          'v-gaming', 'general-hub', 'Jogatina 🎮', 'voice', ''
        ]);

        // Mensagem de boas-vindas
        await database.query(`
          INSERT INTO messages (id, channel_id, sender_id, content, timestamp)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP);
        `, ['msg-welcome', 'c-geral', 'clyde-bot', 'Bem-vindo ao servidor central com suporte a PostgreSQL, WebRTC e TURN relay!']);
      }
    }
  },
  {
    id: 3,
    name: '003_message_replies',
    up: async database => {
      await database.query('ALTER TABLE messages ADD COLUMN reply_to TEXT;');
      await database.query('CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to);');
    }
  },
  { id: 4, name: '004_identity_friends_private_messages', up: identityMigration },
  { id: 5, name: '005_server_assets_and_recovery_audit', up: async database => {
    await database.query('ALTER TABLE upload_records ADD COLUMN server_id TEXT REFERENCES servers(id)');
    await database.query('CREATE TABLE ownership_recovery_audit (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, previous_owner TEXT, new_owner TEXT NOT NULL, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    for (const s of await database.query('SELECT id,owner_id,banner FROM servers')) {
      const file=s.banner?.match(/^\/uploads\/([\w.-]+)$/)?.[1];
      if(file && await database.queryOne('SELECT id FROM users WHERE id=$1',[s.owner_id])) await database.query('INSERT INTO upload_records(filename,owner_id,server_id) VALUES($1,$2,$3) ON CONFLICT(filename) DO NOTHING',[file,s.owner_id,s.id]);
    }
  } },
  { id: 6, name: '006_conversation_tools_and_invites', up: async database => {
    for (const table of ['messages','dm_messages']) {
      await database.query(`ALTER TABLE ${table} ADD COLUMN edited_at TEXT`);
      await database.query(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    }
    await database.query('ALTER TABLE dm_messages ADD COLUMN reply_to TEXT');
    await database.query('ALTER TABLE dm_messages ADD COLUMN invite_code TEXT');
    await database.query('ALTER TABLE server_invites ADD COLUMN revoked_at TEXT');
    await database.query('CREATE INDEX IF NOT EXISTS idx_dm_reply ON dm_messages(reply_to)');
  } }
];

export async function runMigrations(database = db) {
  // Cria tabela de controle de migrations
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = await database.query(`SELECT id FROM schema_migrations ORDER BY id ASC;`);
  const appliedIds = new Set(appliedRows.map(r => Number(r.id)));

  for (const migration of migrations) {
    if (!appliedIds.has(migration.id)) {
      console.log(`[Migration] Aplicando migration ${migration.id}: ${migration.name}...`);
      await database.transaction(async tx => {
      await migration.up(tx);
      await tx.query(`
        INSERT INTO schema_migrations (id, name) VALUES ($1, $2);
      `, [migration.id, migration.name]);
      });
      console.log(`[Migration] Concluída com sucesso: ${migration.name}`);
    }
  }
}
