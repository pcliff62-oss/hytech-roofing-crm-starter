const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Uncomment if you ever hit TLS errors with external URLs:
  // ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    BEGIN;
    -- Prevent two instances from initializing at once
    SELECT pg_advisory_xact_lock(842162345987);

    -- Create sequences first (no-op if they already exist)
    CREATE SEQUENCE IF NOT EXISTS users_id_seq;
    CREATE SEQUENCE IF NOT EXISTS refresh_tokens_id_seq;

    -- Create tables referencing the sequences (NO SERIAL keyword)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      failed_attempts INTEGER DEFAULT 0,
      locked_until BIGINT DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Ensure the sequence is owned by the column (tidy metadata)
    ALTER SEQUENCE users_id_seq OWNED BY users.id;

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY DEFAULT nextval('refresh_tokens_id_seq'),
      jti TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
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

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, init, query };
