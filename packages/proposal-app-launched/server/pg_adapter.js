// server/pg_adapter.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If you're using Render's External URL or any non-local URL, enable TLS quickly:
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function init() {
  await pool.query(`
    BEGIN;
    -- prevent two instances from initializing at once
    SELECT pg_advisory_xact_lock(842162345987);

    -- sequences first (no-op if they exist)
    CREATE SEQUENCE IF NOT EXISTS users_id_seq;
    CREATE SEQUENCE IF NOT EXISTS refresh_tokens_id_seq;

    -- tables without SERIAL to avoid sequence re-creation
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      failed_attempts INTEGER DEFAULT 0,
      locked_until BIGINT DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER SEQUENCE users_id_seq OWNED BY users.id;

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY DEFAULT nextval('refresh_tokens_id_seq'),
      jti TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      issued_at BIGINT,
      expires_at BIGINT,
      revoked BOOLEAN DEFAULT FALSE,
      replaced_by_jti TEXT,
      last_used_at BIGINT,
      ip TEXT,
      user_agent TEXT
    );
    ALTER SEQUENCE refresh_tokens_id_seq OWNED BY refresh_tokens.id;

    COMMIT;
  `);
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, init, query };
