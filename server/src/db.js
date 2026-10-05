import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPostgres = !!process.env.DATABASE_URL;

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
  const isRemote = !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isRemote && process.env.PG_SSL_MODE !== 'disable' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false', ...(process.env.PG_SSL_CA ? { ca: process.env.PG_SSL_CA.replace(/\\n/g, '\n') } : {}) } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pgPool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err);
  });
} else {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../../data/discord.db');
  const dbDir = path.dirname(sqlitePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

/**
 * Converte placeholders do PostgreSQL ($1, $2) em SQLite (?)
 */
function sqliteQuery(sql, params) {
  const values = [];
  const converted = sql.replace(/\$(\d+)/g, (_, n) => { values.push(params[Number(n) - 1]); return '?'; });
  const stmt = sqliteDb.prepare(converted);
  return stmt.reader ? stmt.all(...values) : [{ ...stmt.run(...values) }];
}
let queue = Promise.resolve();
function serialized(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

/**
 * Interface unificada assíncrona de banco de dados
 */
export const db = {
  isPostgres,

  async query(text, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(text, params);
      return res.rows;
    } else {
      return serialized(() => sqliteQuery(text, params));
    }
  },

  async queryOne(text, params = []) {
    const rows = await this.query(text, params);
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async transaction(fn) {
    const client = isPostgres ? await pgPool.connect() : null;
    const run = async () => {
      const query = async (sql, params = []) => client ? (await client.query(sql, params)).rows : sqliteQuery(sql, params);
      const tx = { isPostgres, query, queryOne: async (sql, params) => (await query(sql, params))[0] || null };
      await query('BEGIN');
      try { const result = await fn(tx); await query('COMMIT'); return result; }
      catch (error) { await query('ROLLBACK'); throw error; }
      finally { client?.release(); }
    };
    return isPostgres ? run() : serialized(run);
  },

  async healthCheck() {
    try {
      if (isPostgres) {
        await pgPool.query('SELECT 1');
      } else {
        sqliteDb.prepare('SELECT 1').get();
      }
      return true;
    } catch (err) {
      console.error('[Database HealthCheck Failed]', err.message);
      return false;
    }
  },

  async close() {
    if (isPostgres && pgPool) {
      await pgPool.end();
    } else if (sqliteDb) {
      sqliteDb.close();
    }
  }
};

export default db;
