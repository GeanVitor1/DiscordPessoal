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
    ssl: isRemote ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pgPool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err);
  });
} else {
  const dbDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  sqliteDb = new Database(path.join(dbDir, 'discord.db'));
  sqliteDb.pragma('journal_mode = WAL');
}

/**
 * Converte placeholders do PostgreSQL ($1, $2) em SQLite (?)
 */
function toSqliteParamQuery(sql) {
  return sql.replace(/\$\d+/g, '?');
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
      const sqliteSql = toSqliteParamQuery(text);
      const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sqliteSql);
      const stmt = sqliteDb.prepare(sqliteSql);
      if (isSelect) {
        return stmt.all(...params);
      } else {
        const info = stmt.run(...params);
        return [{ ...info }];
      }
    }
  },

  async queryOne(text, params = []) {
    const rows = await this.query(text, params);
    return rows && rows.length > 0 ? rows[0] : null;
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
